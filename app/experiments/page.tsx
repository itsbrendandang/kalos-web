"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StepDot } from "@/components/campaign/step-dot";
import { NextCard } from "@/components/kit/next-card";
import { PageHeader } from "@/components/kit/page-header";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { ExampleBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useCampaignStage } from "@/hooks/use-campaign-stage";
import type { StageKey } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** What each stage is for, in words anyone can follow, and what you get out of it. */
const WHAT: Record<StageKey, { does: string; gives: string }> = {
  setup: { does: "Upload the runs you already have and check the data is usable.", gives: "A model fitted to your own history." },
  plan: { does: "Review the experiments the model suggests and choose which to run.", gives: "A short batch worth running next." },
  run: { does: "Track the chosen experiments while they are in the lab.", gives: "A clear list of what is outstanding." },
  record: { does: "Enter the measured results as they come back.", gives: "Real outcomes the model can learn from." },
  learn: { does: "See what the round taught the model, then plan the next one.", gives: "A better model and a new batch." },
};

const WORDS = { done: "Done", current: "You are here", upcoming: "Coming up" } as const;

/**
 * Experiments: the whole loop on one page. Each round repeats the same five
 * stages; this page shows where you are, what each stage does, and the one thing
 * to do next. Each stage keeps its own page for the detailed work.
 */
export default function ExperimentsPage() {
  const { stage, status, demo, retry } = useCampaignStage();

  if (status === "offline") return <ErrorState onRetry={retry} />;
  if (!stage) return <LoadingSkeleton rows={5} label="Loading experiments" />;

  const counts = [
    { label: "Round", value: stage.round ?? "Not started" },
    { label: "Started", value: stage.started },
    { label: "Awaiting results", value: stage.awaiting },
    { label: "Measured", value: stage.measured },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Experiments"
        title="Design, run and learn from your experiments"
        meta={demo ? <ExampleBadge /> : null}
        description="Each round follows the same five steps. Kalos proposes what to try, you run it in the lab, you enter the results, and the model learns before suggesting the next batch."
      />

      <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />

      <dl className="glass grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="flex flex-col gap-0.5 px-5 py-4">
            <dt className="text-caption text-fg-muted">{c.label}</dt>
            <dd className="text-title tabular-nums text-fg">{c.value}</dd>
          </div>
        ))}
      </dl>

      <ol aria-label="The five stages" className="flex flex-col gap-3">
        {stage.steps.map((s, i) => {
          const here = s.state === "current";
          return (
            <li key={s.key} className={cn("glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6", here && "ring-2 ring-accent")}>
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-subtle text-label tabular-nums text-fg-muted" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-heading text-fg">
                    {s.label}
                    <span className="flex items-center gap-1.5 text-label font-normal text-fg-muted">
                      <StepDot state={s.state} />
                      {WORDS[s.state]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-body text-fg-muted">{WHAT[s.key].does}</p>
                  <p className="text-caption text-fg-muted">You get: {WHAT[s.key].gives}</p>
                  {s.detail ? <p className="mt-1 text-body text-fg">{s.detail}</p> : null}
                </div>
              </div>
              <Link href={s.href} className={buttonVariants({ variant: here ? "default" : "outline", className: "shrink-0 self-start sm:self-center" })} aria-label={`${here ? "Continue" : "Open"} ${s.label}`}>
                {here ? "Continue" : "Open"}
                <ArrowRight />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
