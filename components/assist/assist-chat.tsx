"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, FileText } from "lucide-react";
import { AnswerEmbed } from "@/components/assist/answer-embed";
import { NextStepCard } from "@/components/assist/next-step-card";
import { SopDraftDialog, type DraftPrefill } from "@/components/assist/sop-draft-dialog";
import { Sources } from "@/components/assist/sources";
import { Disclosure } from "@/components/kit/disclosure";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Input } from "@/components/ui/input";
import { MAX_QUESTION, useAssistIndexStatus, useAssistThread, useNextStepCard, type Turn } from "@/hooks/use-assist";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { whereItRuns, type AssistNext } from "@/lib/assist";
import { embedFor, fullPageFor, type EmbedContext } from "@/lib/assist-embed";
import { detectProcedureAsk } from "@/lib/sop";
import { cn } from "@/lib/utils";

/**
 * The question panel's body. Three honest states: the assistant is off (the
 * guide alone, and how to turn it on), the assistant answers (where the model
 * runs, the thread, the question field), or Kalos could not be reached. An
 * answer shows its sources as chips; an answer with nothing to quote shows
 * the next-step card instead. The thread itself is shared (hooks/use-assist).
 */
export function AssistChat({ className, showGuide = true }: { className?: string; /** False on the Ask Kalos page, which shows the next-step card itself. */ showGuide?: boolean }) {
  const { status, reason, error, loading, refresh } = useAssistIndexStatus();
  const nextStep = useNextStepCard();
  const thread = useAssistThread();

  if (loading) return <LoadingSkeleton rows={2} label="Checking the assistant" className={className} />;
  if (error) {
    return <ErrorState title="Could not reach Kalos" description="The assistant could not be checked. This is a connection problem, not a missing assistant." onRetry={() => void refresh()} className={className} />;
  }
  const isOff = thread.off || reason != null || status == null || status.provider === "none";
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {isOff ? (
        <OffState next={showGuide ? nextStep.next : null} />
      ) : (
        <>
          <p className="text-caption text-fg-muted">{whereItRuns(status)}</p>
          <Thread fallbackNext={nextStep.next} />
        </>
      )}
    </div>
  );
}

export function OffState({ next }: { next: AssistNext | null }) {
  return (
    <div className="flex flex-col gap-6">
      {next ? <NextStepCard next={next} /> : null}
      <div className="flex flex-col gap-1">
        <p className="text-body text-fg-muted">The assistant is off, so questions cannot be answered yet. To turn it on, install Ollama on this Mac and start Kalos with the assistant set to Ollama.</p>
        <Disclosure summary="How to turn it on" className="border-t-0">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-fg">
            <li>
              Install Ollama and pull a model, for example <span className="font-mono text-code">ollama pull qwen2.5:7b</span>.
            </li>
            <li>
              Start Kalos with <span className="font-mono text-code">KALOS_LLM_PROVIDER=ollama</span>.
            </li>
            <li>Open Settings and press Rebuild under Assistant.</li>
          </ol>
        </Disclosure>
      </div>
    </div>
  );
}

function Thread({ fallbackNext }: { fallbackNext: AssistNext | null }) {
  const { turns } = useAssistThread();
  return (
    <div className="flex flex-col gap-6">
      {turns.length === 0 ? (
        <p className="text-body text-fg-muted">Ask about your own sheets, rounds and results. Every answer quotes where it came from, and a question your data cannot answer gets the next step instead.</p>
      ) : (
        <TurnList fallbackNext={fallbackNext} />
      )}
      <QuestionForm />
    </div>
  );
}

/** Every question and answer so far, in order. */
export function TurnList({ fallbackNext, className }: { fallbackNext: AssistNext | null; className?: string }) {
  const { turns } = useAssistThread();
  if (turns.length === 0) return null;
  return (
    <ol aria-label="Questions and answers" className={cn("flex flex-col gap-6", className)}>
      {turns.map((t) => (
        <li key={t.id} className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">
            <span className="sr-only">You asked: </span>
            {t.question}
          </p>
          <Reply turn={t} fallbackNext={fallbackNext} />
        </li>
      ))}
    </ol>
  );
}

/** The question field, the Ask button and the "Draft a procedure" action. A request for a procedure opens the draft dialog instead of asking. */
export function QuestionForm({ className }: { className?: string }) {
  const { ask, busy } = useAssistThread();
  const [question, setQuestion] = useState("");
  const inputId = useId();
  const [draft, setDraft] = useState<{ open: boolean; prefill: DraftPrefill | null }>({ open: false, prefill: null });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    // "Write an SOP for round 2" is a request for a draft, not a question: open the draft dialog with the round picked.
    const procedure = detectProcedureAsk(q);
    setQuestion("");
    if (procedure) {
      setDraft({ open: true, prefill: procedure });
      return;
    }
    void ask(q);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <Input id={inputId} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={MAX_QUESTION} placeholder="Ask about your data" autoComplete="off" disabled={busy} />
        <Button type="submit" size="icon" aria-label="Ask" disabled={busy || !question.trim()}>
          <ArrowUp aria-hidden />
        </Button>
      </form>
      <div>
        <Button variant="outline" size="sm" onClick={() => setDraft({ open: true, prefill: null })}>
          <FileText aria-hidden />
          Draft a procedure
        </Button>
      </div>
      <SopDraftDialog open={draft.open} onOpenChange={(open) => setDraft((d) => ({ ...d, open }))} prefill={draft.prefill} />
    </div>
  );
}

/** What the model knows about the campaign, for choosing an answer's chart and its full page. */
function useEmbedContext(): EmbedContext & { sheetSha: string | null } {
  const latest = useLatest();
  const campaign = useCampaign();
  const analysis = latest.data?.has_data ? latest.data : null;
  const active = campaign.data?.has_campaign ? campaign.data : null;
  return {
    target: analysis?.target ?? active?.target ?? null,
    inputs: [...new Set([...(analysis?.features ?? []), ...(active?.features ?? []), ...(analysis?.drivers.map((d) => d.name) ?? [])])],
    hasDrivers: (analysis?.drivers.length ?? 0) > 0,
    hasProposals: (analysis?.proposals.length ?? 0) > 0,
    sheetSha: analysis?.run?.input_sha256 ?? null,
  };
}

/** One answer: the text, its chart or table when the question named a column, its sources, and the link to the full page. */
export function Reply({ turn, fallbackNext }: { turn: Turn; fallbackNext: AssistNext | null }) {
  const ctx = useEmbedContext();
  const { reply } = turn;
  if (reply.kind === "pending") return <LoadingSkeleton rows={2} label="Working out an answer" />;
  if (reply.kind === "failed") {
    return (
      <p role="alert" className="text-body text-fg">
        {reply.text}
      </p>
    );
  }
  const { answer } = reply;
  if (answer.abstained) {
    const next = answer.next ?? fallbackNext;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-fg-muted">Nothing in your data answers that. Here is the next step instead.</p>
        {next ? <NextStepCard next={next} /> : <p className="text-body text-fg">{answer.answer}</p>}
      </div>
    );
  }
  const embed = embedFor(turn.question, ctx);
  const page = fullPageFor({ question: turn.question, answer, embed, next: fallbackNext, sheetSha: ctx.sheetSha });
  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap text-body text-fg">{answer.answer}</p>
      {embed ? <AnswerEmbed embed={embed} /> : null}
      <Sources sources={answer.sources} />
      <Link href={page.href} className="flex w-fit items-center gap-1 text-label text-accent hover:underline">
        {page.label}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
