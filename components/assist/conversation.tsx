"use client";

import { OffState, QuestionForm, TurnList } from "@/components/assist/assist-chat";
import { NextStepFromEngine } from "@/components/assist/next-step-card";
import { ProposedRecipes } from "@/components/campaign/proposed-recipes";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { ExampleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useAssistIndexStatus, useAssistThread, useNextStepCard } from "@/hooks/use-assist";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { reliabilityVerdict } from "@/lib/api";
import { starterPrompts } from "@/lib/assist-embed";
import { displayRound } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { aimLine } from "@/lib/objective";
import { topDrivers } from "@/lib/overview";
import { trustPlain } from "@/lib/plain";
import { whereItRuns } from "@/lib/assist";
import { campaignView } from "@/lib/workbench";
import { whyLine } from "@/lib/why";

/**
 * Overview in Simple view: a conversation. Kalos opens with the plain
 * verdict and its why-line, the one next step, and the proposed recipes as a
 * small card; starter questions sit under that; questions and answers follow
 * in the same thread, each answer with its sources and a link to the full
 * page. The thread is the same one the Ask Kalos panel shows.
 */
export function Conversation() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const guide = useNextStepCard();
  const { status, reason, loading: statusLoading } = useAssistIndexStatus();
  const { ask, busy, off, turns } = useAssistThread();

  if (view.state === "error" || latest.status === "error") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Overview" />
        <ErrorState
          title="Could not reach Kalos"
          description="The campaign could not be loaded. This is a connection problem, not an empty campaign."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </div>
    );
  }
  if (view.state === "loading" || !latest.data) return <LoadingSkeleton rows={5} label="Loading the campaign" />;

  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const analysis = !demo && latest.data.has_data ? latest.data : null;
  const target = active?.target ?? analysis?.target ?? null;
  const verdict = analysis ? reliabilityVerdict(analysis) : null;
  const trust = verdict ? trustPlain(verdict) : null;
  const round = active ? displayRound(active.round) : analysis ? 1 : null;
  const best = active?.best ?? analysis?.best ?? null;
  const runs = active?.n_base ?? analysis?.n ?? null;
  const top = analysis ? topDrivers(analysis.drivers, 1)[0]?.name ?? null : null;
  const planning = analysis != null && guide.next?.action_route === "/campaign/plan" && analysis.proposals.length > 0;
  const assistantOff = off || reason != null || (status != null && status.provider === "none");
  const prompts = starterPrompts({
    next: guide.next,
    target,
    topInput: top,
    trusted: verdict ? verdict.state === "reliable" : null,
    round,
    hasBestRun: best != null,
    hasProposals: (analysis?.proposals.length ?? 0) > 0,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={round ? `Round ${round}` : undefined}
        title={target ? aimLine(target) : "Start a campaign"}
        description={best != null ? `Best measured so far: ${formatNumber(best)}, from ${formatNumber(runs, "count")} runs. Measured, not predicted.` : undefined}
        meta={demo ? <ExampleBadge /> : null}
      />

      <section aria-label="From Kalos" className="flex flex-col gap-6">
        <p className="text-caption text-fg-muted">Kalos</p>
        {trust && verdict ? (
          <Verdict tone={trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral"} why={whyLine(verdict.state)} detail={<p>{trust.gloss}</p>} detailLabel="How the model was scored">
            {trust.word}. {trust.sentence}
          </Verdict>
        ) : null}
        <NextStepFromEngine />
        {planning && analysis && target ? (
          <div className="rounded-2xl border border-border p-4">
            <ProposedRecipes analysis={analysis} target={target} round={round} compact />
          </div>
        ) : null}
      </section>

      {assistantOff ? (
        <OffState next={null} />
      ) : (
        <>
          {turns.length === 0 && !statusLoading ? (
            <section aria-label="Questions to start with" className="flex flex-col gap-2">
              <p className="text-caption text-fg-muted">Ask Kalos</p>
              <ul className="flex flex-wrap gap-2">
                {prompts.map((p) => (
                  <li key={p}>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void ask(p)}>
                      {p}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <TurnList fallbackNext={guide.next} />
          <div className="flex flex-col gap-2">
            <QuestionForm />
            {status ? <p className="text-caption text-fg-muted">{whereItRuns(status)}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
