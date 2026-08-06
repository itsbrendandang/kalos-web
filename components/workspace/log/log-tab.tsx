"use client";

import { useCallback, useEffect, useState } from "react";
import { DemoBadge, Loading } from "@/components/page-header";
import { useWorkspaceCampaign } from "@/lib/workspace/campaign-context";
import { getWorkspaceActivity, getWorkspaceLogStats, getWorkspaceTimeline } from "@/lib/workspace/adapter";
import type {
  WorkspaceActivityResult,
  WorkspaceLogStatsResult,
  WorkspaceTimelineResult,
} from "@/lib/workspace/log-types";
import type { Campaign } from "@/lib/workspace/types";
import { targetNoun } from "@/lib/workspace/log-copy";
import { formatAge } from "@/lib/workspace/log-logic";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { SectionLabel } from "./primitives";
import { ActivityStrip, ActivityStripMessage } from "./activity-strip";
import { CampaignTimeline } from "./campaign-timeline";
import { DriverChart } from "./driver-chart";
import { ProposalsCard } from "./proposals-card";
import { RoundDivider } from "./round-divider";
import { StatPlane, StatStrip, StatStripMessage } from "./stat-strip";
import { VerdictHero } from "./verdict-hero";

type Loadable<T> = { status: "loading" } | T;

/** The Log tab body (design spec section 1.3). Owns the two Log-only adapter
 *  reads - the latest analysis and the activity series - and composes every
 *  block below them. The campaign itself comes from context (the shell
 *  already resolved it), so this component never re-fetches it. */
export function LogTab() {
  const { campaignId, result } = useWorkspaceCampaign();
  const campaign: Campaign | null = result.status === "ok" ? result.campaign : null;
  const campaignIsDemo = result.status === "ok" && result.demo;

  const [logStats, setLogStats] = useState<Loadable<WorkspaceLogStatsResult>>({ status: "loading" });
  const [activity, setActivity] = useState<Loadable<WorkspaceActivityResult>>({ status: "loading" });
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
    getWorkspaceActivity(campaignId).then((r) => {
      if (!cancelled) setActivity(r);
    });
    getWorkspaceTimeline(campaignId).then((r) => {
      if (!cancelled) setTimeline(r);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, reloadKey]);

  /** Manual retry. This one DOES reset to loading, because it runs from a
   *  click - the reader asked for a refetch and should see it happening. */
  const load = useCallback(() => {
    setLogStats({ status: "loading" });
    setActivity({ status: "loading" });
    setTimeline({ status: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  if (!campaign) return null;

  const awaitingRuns = campaign.proposals.length;
  const stats = logStats.status === "ok" ? logStats.stats : null;
  const statsAreDemo = logStats.status === "ok" && logStats.demo;
  const timelineIsDemo = timeline.status === "ok" && timeline.demo;
  const activityIsDemo = activity.status === "ok" && activity.demo;

  // Every date the Log tab reasons about is a plain UTC "YYYY-MM-DD", the same
  // form the engine's activity series uses. Read once per render so the
  // activity grid and its stats can never straddle a midnight.
  const todayISO = new Date().toISOString().slice(0, 10);

  // The round the fit last learned from: the highest-numbered CLOSED round.
  // An open round has not read out, so nothing has been taught by it yet.
  const lastClosedRound =
    timeline.status === "ok"
      ? (timeline.rounds
          .filter((r) => r.status === "closed")
          .map((r) => r.number)
          .sort((a, b) => b - a)[0] ?? null)
      : null;

  // Runs excluded from the fit for cause. The engine does not model run
  // failure yet, so this is empty today - see the proposals card's banner.
  const excludedRuns = campaign.rounds.flatMap((r) => r.runs).filter((r) => r.status === "failed");

  return (
    <div className="flex justify-center px-8 pt-12 pb-16">
      <div className="flex w-full max-w-[860px] flex-none flex-col gap-10">
        {/* One badge for the whole tab: if ANY block below is showing seeded
            demo data, the reader is told once, up front, before they read a
            single number. */}
        {(statsAreDemo || timelineIsDemo || activityIsDemo || campaignIsDemo) && (
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
              Upload a run table and the verdict, the reliability band, and the drivers below all fill in from it.
            </p>
          </section>
        )}

        {logStats.status === "ok" && stats != null && (
          <VerdictHero stats={stats} proposals={campaign.proposals.map((p) => p.run)} />
        )}

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
              rounds={timeline.rounds}
              goal={timeline.goal}
              targetNoun={targetNoun(stats?.target ?? campaign.name)}
            />
          )}

          {/* Design spec 1.3.D. Lives inside this same plane, directly under
              the timeline; everything after it is a SIBLING of <StatPlane>. */}
          {activity.status === "loading" && (
            <div className="mt-7 border-t border-border pt-[22px]">
              <Loading label="Loading activity" />
            </div>
          )}
          {activity.status === "unavailable" && (
            <ActivityStripMessage>
              The engine did not answer, so the run cadence could not be read. This is a failed request, not a quiet
              campaign.
            </ActivityStripMessage>
          )}
          {activity.status === "ok" && (
            <ActivityStrip
              days={activity.days}
              stats={activity.stats}
              note={activity.note}
              todayISO={todayISO}
            />
          )}
        </StatPlane>

        {/* Design spec 1.3.E - a section rule on the canvas, not a plane. */}
        <RoundDivider
          roundNumber={campaign.currentRound}
          agentAge={stats?.updatedAt != null ? formatAge(stats.updatedAt) : null}
          awaitingCount={awaitingRuns}
        />

        {/* Design spec 1.3.F. */}
        <ProposalsCard
          proposals={campaign.proposals}
          excludedRuns={excludedRuns}
          roundNumber={campaign.currentRound}
          bestSoFar={stats?.bestSoFar ?? null}
          targetUnit={stats?.targetUnit ?? ""}
        />

        {/* Design spec 1.3.G. Needs the analysis, so it renders only once the
            analysis is actually in hand - no empty axes in the meantime. */}
        {stats != null && <DriverChart stats={stats} roundNumber={lastClosedRound} />}
      </div>
    </div>
  );
}
