"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StepDot } from "@/components/campaign/step-dot";
import { NextCard } from "@/components/kit/next-card";
import { PageHeader } from "@/components/kit/page-header";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { ExampleBadge } from "@/components/ui/badge";
import { useCampaignStage } from "@/hooks/use-campaign-stage";
import { EXPERIMENTS_ROUTE, type StageKey } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** What each stage is for, in words anyone can follow, and what you get out of it. */
const WHAT: Record<StageKey, { does: string; gives: string }> = {
  setup: { does: "Upload the runs you already have and check the sheet is usable.", gives: "A model that has learned from your own runs." },
  plan: { does: "Review the recipes the model suggests and choose which to run.", gives: "A short round of runs worth doing next." },
  run: { does: "Follow the chosen runs while they are in the lab.", gives: "A clear list of what is still waiting for a result." },
  record: { does: "Enter the measured results as they come back.", gives: "Real results the model can learn from." },
  learn: { does: "See what the round taught the model, then plan the next one.", gives: "A better model and a new round of recipes." },
};

const WORDS = { done: "Done", current: "You are here", upcoming: "Coming up" } as const;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * The five stages: the whole loop on one page. Each round repeats the same
 * five stages; this page shows where you are, what each stage does, and the
 * one thing to do next. Each stage keeps its own page for the detailed work.
 * The page title is the route's label (lib/routes.ts), so the sidebar and the
 * page always agree.
 */
export default function ExperimentsPage() {
  const { stage, status, demo, retry } = useCampaignStage();

  if (status === "offline") return <ErrorState onRetry={retry} />;
  if (!stage) return <LoadingSkeleton rows={5} label="Loading the five stages" />;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={stage.round ? `Round ${stage.round}` : "Campaign"}
        title={EXPERIMENTS_ROUTE.label}
        meta={demo ? <ExampleBadge /> : null}
        description={`${plural(stage.started, "run")} started, ${stage.awaiting} waiting for a result, ${stage.measured} measured.`}
      />

      <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} why={stage.next.why} />

      <ol aria-label="The five stages" className="glass divide-y divide-border overflow-hidden p-0">
        {stage.steps.map((s) => {
          const here = s.state === "current";
          return (
            <li key={s.key}>
              <Link href={s.href} aria-label={`${here ? "Continue" : "Open"} ${s.label}, ${WORDS[s.state]}`} className={cn("flex items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle", here && "bg-accent-soft")}>
                <StepDot state={s.state} />
                <span className="min-w-0 flex-1">
                  <span className="block text-heading text-fg">{s.label}</span>
                  <span className="block text-body text-fg-muted">{here && s.detail ? s.detail : WHAT[s.key].does}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
