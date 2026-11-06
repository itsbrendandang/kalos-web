"use client";

import { useState } from "react";
import { Disclosure } from "@/components/kit/disclosure";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/honest-state";
import { useAssistIndexStatus } from "@/hooks/use-assist";
import { rebuildAssistIndex } from "@/lib/api";
import { indexLine, isCloudProvider, providerName, whereItRuns } from "@/lib/assist";

/** Set at build time by desktop/prepare-web.sh: Kalos is a local process on this Mac and picked its own assistant at launch. */
const LOCAL = process.env.NEXT_PUBLIC_KALOS_LOCAL === "1";

/** How the assistant came to be what it is, in plain words. */
export function pickedLine(provider: string, local: boolean = LOCAL): string {
  if (local) {
    if (provider === "ollama") return "Picked when the app started: Ollama was running on this Mac, so answers stay here.";
    if (provider === "none") return "Picked when the app started: no Ollama was found on this Mac, so the assistant is off.";
    return "Picked when the app started.";
  }
  return "Set by whoever started Kalos. It cannot be changed here.";
}

/** What to do when the assistant is off. The desktop app picks Ollama up on its next launch; a server needs the setting changed. */
function TurnOn({ local = LOCAL }: { local?: boolean }) {
  return local ? (
    <p className="text-body text-fg-muted">
      To turn it on, install Ollama from ollama.com, open Terminal and run <span className="font-mono text-code">ollama pull qwen2.5:7b</span>, then quit and reopen Kalos. The next-step guide works without it.
    </p>
  ) : (
    <p className="text-body text-fg-muted">To turn it on, install Ollama on this Mac and start Kalos with the assistant set to Ollama. The next-step guide works without it.</p>
  );
}

/**
 * Settings, "Assistant": which model answers (read-only, set when Kalos is
 * started), what is indexed with a Rebuild button, and, only when answers
 * leave the machine, a plain paragraph saying what is sent where.
 */
export function AssistantSettings() {
  const { status, reason, error, loading, refresh, set } = useAssistIndexStatus();
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildFailed, setRebuildFailed] = useState(false);

  const rebuild = async () => {
    setRebuilding(true);
    setRebuildFailed(false);
    try {
      set(await rebuildAssistIndex());
    } catch {
      setRebuildFailed(true);
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <Section title="Assistant" description="Answers questions from your own sheets, rounds and results, and says what to do next.">
      {loading ? (
        <LoadingSkeleton rows={2} label="Checking the assistant" />
      ) : error ? (
        <Verdict tone="bad">Kalos did not answer, so the assistant could not be checked.</Verdict>
      ) : reason != null || !status || status.provider === "none" ? (
        <div className="flex flex-col gap-2">
          <Verdict tone="neutral">{reason === "absent" ? "This version of Kalos has no assistant." : "The assistant is off."}</Verdict>
          {reason !== "absent" ? (
            <>
              <p className="text-body text-fg">{pickedLine("none")}</p>
              <TurnOn />
            </>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
            <dt className="text-fg-muted">Answers come from</dt>
            <dd className="flex flex-wrap items-center gap-2 text-fg">
              {providerName(status.provider)}
              {status.model ? <span className="font-mono text-code text-fg-muted">{status.model}</span> : null}
              <Badge tone={status.local ? "good" : "warn"}>{status.local ? "On this Mac" : "Sent away"}</Badge>
            </dd>
            <dt className="text-fg-muted">Where it runs</dt>
            <dd className="text-fg">{whereItRuns(status)}</dd>
            <dt className="text-fg-muted">How it was picked</dt>
            <dd className="text-fg">{pickedLine(status.provider)}</dd>
            <dt className="text-fg-muted">What is indexed</dt>
            <dd className="text-fg">{indexLine(status)}</dd>
          </dl>
          {isCloudProvider(status) ? (
            <p className="text-body text-fg" data-testid="assist-consent">
              When you ask a question, the question and the parts of your sheets, rounds and results that match it are sent to {providerName(status.provider)}. When you ask
              for a change to a procedure draft, the whole draft is sent, including anything you typed into it. Nothing is sent until you ask. If that is not acceptable for your data, ask whoever set up Kalos to switch the assistant to Ollama, which stays on this Mac.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => void rebuild()} disabled={rebuilding || status.building}>
              {rebuilding || status.building ? "Rebuilding..." : "Rebuild"}
            </Button>
            {rebuildFailed ? (
              <p role="alert" className="text-body text-fg">
                The rebuild did not finish. Try again in a moment.
              </p>
            ) : null}
          </div>
          <Disclosure summary="How this is set" className="border-t-0">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-body">
              <dt className="text-fg-muted">Provider</dt>
              <dd className="font-mono text-code text-fg">{status.provider}</dd>
              <dt className="text-fg-muted">Set by</dt>
              <dd className="text-fg">
                {LOCAL ? (
                  <>
                    The app leaves <span className="font-mono text-code">KALOS_LLM_PROVIDER</span> unset, so Kalos picks Ollama when it answers on this Mac and none otherwise.
                  </>
                ) : (
                  <>
                    When Kalos is started (<span className="font-mono text-code">KALOS_LLM_PROVIDER</span>). It cannot be changed here.
                  </>
                )}
              </dd>
              {status.retriever ? (
                <>
                  <dt className="text-fg-muted">Index type</dt>
                  <dd className="font-mono text-code text-fg">{status.retriever}</dd>
                </>
              ) : null}
            </dl>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refresh()}>
              Check again
            </Button>
          </Disclosure>
        </div>
      )}
    </Section>
  );
}
