"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowUp, FileText } from "lucide-react";
import { NextStepCard } from "@/components/assist/next-step-card";
import { SopDraftDialog, type DraftPrefill } from "@/components/assist/sop-draft-dialog";
import { Sources } from "@/components/assist/sources";
import { Disclosure } from "@/components/kit/disclosure";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Input } from "@/components/ui/input";
import { useAssistIndexStatus, useNextStepCard } from "@/hooks/use-assist";
import { askAssist } from "@/lib/api";
import { AssistUnavailableError, whereItRuns, type AssistAnswer, type AssistNext } from "@/lib/assist";
import { detectProcedureAsk } from "@/lib/sop";
import { cn } from "@/lib/utils";

type Turn = { id: number; question: string; reply: { kind: "answer"; answer: AssistAnswer } | { kind: "failed"; text: string } | { kind: "pending" } };

const MAX_QUESTION = 2000;

/**
 * The question panel's body. Three honest states: the assistant is off (the
 * guide alone, and how to turn it on), the assistant answers (where the model
 * runs, the thread, the question field), or Kalos could not be reached. An
 * answer shows its sources as chips; an answer with nothing to quote shows
 * the next-step card instead.
 */
export function AssistChat({ className, showGuide = true }: { className?: string; /** False on the Ask Kalos page, which shows the next-step card itself. */ showGuide?: boolean }) {
  const { status, reason, error, loading, refresh } = useAssistIndexStatus();
  const nextStep = useNextStepCard();
  const [off, setOff] = useState(false);

  if (loading) return <LoadingSkeleton rows={2} label="Checking the assistant" className={className} />;
  if (error) {
    return <ErrorState title="Could not reach Kalos" description="The assistant could not be checked. This is a connection problem, not a missing assistant." onRetry={() => void refresh()} className={className} />;
  }
  const isOff = off || reason != null || status == null || status.provider === "none";
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {isOff ? (
        <OffState next={showGuide ? nextStep.next : null} />
      ) : (
        <>
          <p className="text-caption text-fg-muted">{whereItRuns(status)}</p>
          <Thread onOff={() => setOff(true)} fallbackNext={nextStep.next} />
        </>
      )}
    </div>
  );
}

function OffState({ next }: { next: AssistNext | null }) {
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

function Thread({ onOff, fallbackNext }: { onOff: () => void; fallbackNext: AssistNext | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const inputId = useId();
  const [draft, setDraft] = useState<{ open: boolean; prefill: DraftPrefill | null }>({ open: false, prefill: null });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!q || busy) return;
    // "Write an SOP for round 2" is a request for a draft, not a question: open the draft dialog with the round picked.
    const procedure = detectProcedureAsk(q);
    if (procedure) {
      setQuestion("");
      setDraft({ open: true, prefill: procedure });
      return;
    }
    const id = ++seq.current;
    setTurns((t) => [...t, { id, question: q, reply: { kind: "pending" } }]);
    setQuestion("");
    setBusy(true);
    try {
      const answer = await askAssist(q);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply: { kind: "answer", answer } } : x)));
    } catch (err) {
      if (err instanceof AssistUnavailableError && err.reason !== "unavailable") {
        onOff();
        return;
      }
      const text =
        err instanceof AssistUnavailableError
          ? "The model did not answer. Check that it is running, then ask again."
          : "Kalos could not be reached, so the question was not answered. Ask again in a moment.";
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, reply: { kind: "failed", text } } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {turns.length === 0 ? (
        <p className="text-body text-fg-muted">Ask about your own sheets, rounds and results. Every answer quotes where it came from, and a question your data cannot answer gets the next step instead.</p>
      ) : (
        <ol aria-label="Questions and answers" className="flex flex-col gap-6">
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
      )}
      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
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

function Reply({ turn, fallbackNext }: { turn: Turn; fallbackNext: AssistNext | null }) {
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
  return (
    <div className="flex flex-col gap-3">
      <p className="whitespace-pre-wrap text-body text-fg">{answer.answer}</p>
      <Sources sources={answer.sources} />
    </div>
  );
}
