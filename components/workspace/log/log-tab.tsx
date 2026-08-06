"use client";

import { useCallback, useEffect, useState } from "react";
import { DemoBadge, Loading } from "@/components/page-header";
import { useWorkspaceCampaign } from "@/lib/workspace/campaign-context";
import {
  approveWorkspaceBatch,
  closeWorkspaceLoop,
  getWorkspaceLogStats,
  getWorkspaceTimeline,
  logWorkspaceRunResult,
  type MutationResult,
} from "@/lib/workspace/adapter";
import type { WorkspaceLogStatsResult, WorkspaceTimelineResult } from "@/lib/workspace/log-types";
import type { Campaign, Proposal } from "@/lib/workspace/types";
import { targetNoun } from "@/lib/workspace/log-copy";
import { bookedProposalIds } from "@/lib/workspace/proposal-logic";
import { formatAge } from "@/lib/workspace/log-logic";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { SectionLabel } from "./primitives";
import { AwaitingRunsCard } from "./awaiting-runs-card";
import { CampaignTimeline } from "./campaign-timeline";
import { ProposalsCard } from "./proposals-card";
import { RoundDivider } from "./round-divider";
import { StatPlane, StatStrip, StatStripMessage } from "./stat-strip";
import { VerdictHero } from "./verdict-hero";

type Loadable<T> = { status: "loading" } | T;

/**
 * The Log tab body: the campaign's DECISION surface, and only that.
 *
 * Ordering rule, top to bottom: the verdict, the ask, then the evidence the
 * ask rests on. The batch waiting on a human is the reason anyone opens this
 * tab, so it sits directly under the headline rather than below a screen and
 * a half of history - the hero already carries the numbers that decide it
 * ("these six should move your best from X to about Y"), so nothing needed to
 * approve is below the approve bar.
 *
 * The retrospective blocks that used to live here - the activity strip and
 * "what round N taught" - are on the Brief tab
 * (components/workspace/brief/brief-tab.tsx), together with the full-detail
 * campaign timeline. This tab reads only what it renders, so the activity
 * series is fetched there and not here.
 */
export function LogTab() {
  const { campaignId, result, reload, reloadCampaigns, dataVersion } = useWorkspaceCampaign();
  const campaign: Campaign | null = result.status === "ok" ? result.campaign : null;
  const campaignIsDemo = result.status === "ok" && result.demo;

  const [logStats, setLogStats] = useState<Loadable<WorkspaceLogStatsResult>>({ status: "loading" });
  const [timeline, setTimeline] = useState<Loadable<WorkspaceTimelineResult>>({ status: "loading" });

  const [reloadKey, setReloadKey] = useState(0);

  // No synchronous reset-to-loading in here: the initial state is already
  // "loading", and a later campaignId change is allowed to keep showing the
  // previous campaign's blocks until the new ones resolve - the same rule (and
  // the same reason) as WorkspaceShell's own refetch-on-id-change effect.
  // Setting state synchronously in an effect body would also trip
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    let cancelled = false;
    getWorkspaceLogStats(campaignId).then((r) => {
      if (!cancelled) setLogStats(r);
    });
    getWorkspaceTimeline(campaignId).then((r) => {
      if (!cancelled) setTimeline(r);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, reloadKey, dataVersion]);

  /** Manual retry. This one DOES reset to loading, because it runs from a
   *  click - the reader asked for a refetch and should see it happening. */
  const load = useCallback(() => {
    setLogStats({ status: "loading" });
    setTimeline({ status: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  /** What every write here awaits before reporting success: the campaign is
   *  re-read from the engine (which also bumps `dataVersion`, re-running the
   *  fetch effect above for the analysis and the timeline), and so is the
   *  rail's status line. Nothing in this tab is adjusted locally to
   *  anticipate a result. */
  const refreshAll = useCallback(
    () => Promise.all([reload(), reloadCampaigns()]),
    [reload, reloadCampaigns],
  );

  const handleApprove = useCallback(
    async (toBook: Proposal[]): Promise<MutationResult> => {
      const outcome = await approveWorkspaceBatch(toBook);
      if (outcome.status === "ok") await refreshAll();
      return outcome;
    },
    [refreshAll],
  );

  const handleLogResult = useCallback(
    async (runId: string, value: number): Promise<MutationResult> => {
      const outcome = await logWorkspaceRunResult(runId, value);
      if (outcome.status === "ok") await refreshAll();
      return outcome;
    },
    [refreshAll],
  );

  const handleCloseLoop = useCallback(async (): Promise<MutationResult> => {
    const outcome = await closeWorkspaceLoop();
    if (outcome.status === "ok") await refreshAll();
    return outcome;
  }, [refreshAll]);

  if (!campaign) return null;

  const awaitingRuns = campaign.awaitingRuns.length;
  // The batch still waiting on a human: proposals the engine recommended that
  // nobody has booked into the lab yet.
  const awaitingDecision = campaign.proposals.length - bookedProposalIds(campaign.proposals, campaign.awaitingRuns).size;
  const stats = logStats.status === "ok" ? logStats.stats : null;
  const statsAreDemo = logStats.status === "ok" && logStats.demo;
  const timelineIsDemo = timeline.status === "ok" && timeline.demo;

  // Runs excluded from the fit for cause. The engine does not model run
  // failure yet, so this is empty today - see the proposals card's banner.
  const excludedRuns = campaign.rounds.flatMap((r) => r.runs).filter((r) => r.status === "failed");

  return (
    <div className="flex justify-center px-8 pt-12 pb-16">
      <div className="flex w-full max-w-[860px] flex-none flex-col gap-10">
        {/* One badge for the whole tab: if ANY block below is showing seeded
            demo data, the reader is told once, up front, before they read a
            single number. */}
        {(statsAreDemo || timelineIsDemo || campaignIsDemo) && (
          <div className="-mb-6">
            <DemoBadge />
          </div>
        )}

        {logStats.status === "loading" && <Loading label="Loading the latest analysis" />}

        {logStats.status === "unavailable" && (
          <section>
            <h2 className="max-w-[28ch] font-serif text-[36px] leading-[1.2] font-semibold tracking-[-0.015em] text-pretty text-fg">
              The engine is not answering right now.
            </h2>
            <p className="mt-[18px] max-w-[60ch] font-serif text-[16.5px] leading-[1.6] text-pretty text-muted">
              Nothing below is a verdict about this campaign - it is a failed request. Retry once the engine is back.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-5 rounded-[10px] border border-border bg-card px-[13px] py-1.5 text-[12px] font-semibold text-fg transition-colors hover:bg-blue-soft"
            >
              Try again
            </button>
          </section>
        )}

        {logStats.status === "ok" && stats == null && (
          <section>
            <h2 className="max-w-[28ch] font-serif text-[36px] leading-[1.2] font-semibold tracking-[-0.015em] text-pretty text-fg">
              Nothing has been analysed for this campaign yet.
            </h2>
            <p className="mt-[18px] max-w-[60ch] font-serif text-[16.5px] leading-[1.6] text-pretty text-muted">
              Upload a run table and the verdict, the reliability band, and the batch below all fill in from it.
            </p>
          </section>
        )}

        {/* Design spec 1.3.A. */}
        {logStats.status === "ok" && stats != null && (
          <VerdictHero stats={stats} proposals={campaign.proposals.map((p) => p.run)} />
        )}

        {/* Design spec 1.3.E - a section rule on the canvas, not a plane. It
            names the open round and who the batch is waiting on, so it reads
            as the proposals card's own header. */}
        <RoundDivider
          roundNumber={campaign.currentRound}
          agentAge={stats?.updatedAt != null ? formatAge(stats.updatedAt) : null}
          awaitingDecisionCount={awaitingDecision}
        />

        {/* Design spec 1.3.F. The action this tab exists for. */}
        <ProposalsCard
          proposals={campaign.proposals}
          bookedRuns={campaign.awaitingRuns}
          excludedRuns={excludedRuns}
          roundNumber={campaign.currentRound}
          bestSoFar={stats?.bestSoFar ?? null}
          targetUnit={stats?.targetUnit ?? ""}
          onApprove={handleApprove}
          canApprove={!campaignIsDemo}
        />

        {/* The loop's other half: recipes already booked into the open round,
            each waiting on a measured value, and the fold that closes it.
            Renders nothing at all when the lab is holding nothing. */}
        <AwaitingRunsCard
          awaitingRuns={campaign.awaitingRuns}
          measuredRuns={campaign.measuredRuns}
          roundNumber={campaign.currentRound}
          targetUnit={stats?.targetUnit ?? ""}
          onLogResult={handleLogResult}
          onCloseLoop={handleCloseLoop}
          canWrite={!campaignIsDemo}
        />

        {/* Design spec 1.3.B. The standing numbers and the trajectory they sit
            on, as one card: what the campaign is worth right now and how it
            got there. Below the batch, because the hero already states the
            move the batch is predicted to make - this is the detail a reader
            checks, not the number they decide on. */}
        {stats != null ? (
          <StatStrip stats={stats} awaitingRuns={awaitingRuns} />
        ) : (
          <StatStripMessage>
            {logStats.status === "unavailable"
              ? "Best, band, and run counts all come from the latest analysis, which could not be read."
              : "Best, band, and run counts appear once an analysis has run."}
          </StatStripMessage>
        )}

        <StatPlane>
          {timeline.status === "loading" && (
            <div className="border-t border-border pt-[22px]">
              <Loading label="Loading the campaign timeline" />
            </div>
          )}
          {timeline.status === "unavailable" && (
            <section className="border-t border-border pt-[22px]">
              <SectionLabel>Campaign timeline</SectionLabel>
              <NotInstrumentedNote className="mt-2">
                The engine did not answer, so the round trajectory could not be read. This is a failed request, not an
                empty campaign.
              </NotInstrumentedNote>
            </section>
          )}
          {timeline.status === "ok" && (
            <CampaignTimeline
              compact
              rounds={timeline.rounds}
              goal={timeline.goal}
              targetNoun={targetNoun(stats?.target ?? campaign.name)}
            />
          )}
        </StatPlane>
      </div>
    </div>
  );
}
