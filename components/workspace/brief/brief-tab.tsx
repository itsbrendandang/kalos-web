"use client";

import { useCallback, useEffect, useState } from "react";
import { DemoBadge, Loading } from "@/components/page-header";
import { useWorkspaceCampaign } from "@/lib/workspace/campaign-context";
import {
  getWorkspaceActivity,
  getWorkspaceLogStats,
  getWorkspaceTimeline,
} from "@/lib/workspace/adapter";
import type {
  WorkspaceActivityResult,
  WorkspaceLogStatsResult,
  WorkspaceTimelineResult,
} from "@/lib/workspace/log-types";
import type { Campaign } from "@/lib/workspace/types";
import { targetNoun } from "@/lib/workspace/log-copy";
import { formatAge } from "@/lib/workspace/log-logic";
import { NotInstrumentedNote } from "@/components/workspace/primitives/not-instrumented-note";
import { ActivityStrip, ActivityStripMessage } from "@/components/workspace/log/activity-strip";
import { CampaignTimeline } from "@/components/workspace/log/campaign-timeline";
import { DriverChart } from "@/components/workspace/log/driver-chart";
import { SectionLabel } from "@/components/workspace/log/primitives";

type Loadable<T> = { status: "loading" } | T;

/**
 * The Brief tab body: the campaign's RETROSPECTIVE.
 *
 * Where the Log tab answers "what do I approve next", this one answers "what
 * has this campaign taught us". It reads as one argument in two moves:
 *
 *   1. Campaign history - the full-detail timeline (read-out dates, how each
 *      round's recipes were chosen, runs per round, the pace to target, and
 *      the not-recorded note) plus the activity strip's cadence. This is the
 *      detail the Log tab's compact timeline deliberately drops.
 *   2. What the analysis learned - the two driver panels, unchanged.
 *
 * Blocks 1 and 2 are the same components the Log tab used to carry, re-parented
 * rather than rebuilt: every provenance caption and every honest gap state
 * travels with the component that owns it.
 *
 * The three reads below are this tab's own. They are the same adapter calls
 * the Log tab makes, deliberately not hoisted into a shared hook: each tab
 * fetches exactly what it renders, so the decision surface never pays for the
 * activity series it no longer shows.
 */
export function BriefTab() {
  const { campaignId, result, dataVersion } = useWorkspaceCampaign();
  const campaign: Campaign | null = result.status === "ok" ? result.campaign : null;
  const campaignIsDemo = result.status === "ok" && result.demo;

  const [logStats, setLogStats] = useState<Loadable<WorkspaceLogStatsResult>>({ status: "loading" });
  const [activity, setActivity] = useState<Loadable<WorkspaceActivityResult>>({ status: "loading" });
  const [timeline, setTimeline] = useState<Loadable<WorkspaceTimelineResult>>({ status: "loading" });

  const [reloadKey, setReloadKey] = useState(0);

  // Same refetch contract as the Log tab: no synchronous reset to loading on a
  // campaignId change, so switching campaigns keeps the previous history on
  // screen until the new one resolves rather than blanking the page.
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
  }, [campaignId, reloadKey, dataVersion]);

  /** Manual retry, from a click - so this one does reset to loading. */
  const load = useCallback(() => {
    setLogStats({ status: "loading" });
    setActivity({ status: "loading" });
    setTimeline({ status: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  if (!campaign) return null;

  const stats = logStats.status === "ok" ? logStats.stats : null;
  const statsAreDemo = logStats.status === "ok" && logStats.demo;
  const timelineIsDemo = timeline.status === "ok" && timeline.demo;
  const activityIsDemo = activity.status === "ok" && activity.demo;

  // Every date this tab reasons about is a plain UTC "YYYY-MM-DD", the same
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

  const rounds = campaign.rounds.length;
  const meta = [
    campaign.name,
    `${rounds} round${rounds === 1 ? "" : "s"} on record`,
    stats?.updatedAt != null ? `fitted ${formatAge(stats.updatedAt)}` : null,
  ].filter((s): s is string => s != null);

  return (
    <div className="flex justify-center px-8 pt-12 pb-16">
      <div className="flex w-full max-w-[860px] flex-none flex-col gap-10">
        {/* One badge for the whole tab, on the same rule the Log tab follows:
            if ANY block below is seeded, say so before a number is read. */}
        {(statsAreDemo || timelineIsDemo || activityIsDemo || campaignIsDemo) && (
          <div className="-mb-6">
            <DemoBadge />
          </div>
        )}

        <section>
          <div className="mb-3.5 font-plex-mono text-[11px] text-muted">{meta.join(" · ")}</div>
          <h2 className="max-w-[28ch] font-serif text-[36px] leading-[1.2] font-semibold tracking-[-0.015em] text-pretty text-fg">
            What this campaign has taught us so far.
          </h2>
          <p className="mt-[18px] max-w-[60ch] font-serif text-[16.5px] leading-[1.6] text-pretty text-muted">
            The Log tab decides the next batch. This is the record behind that decision: how the best result moved round
            by round, how steadily the work was actually run, and which inputs the latest analysis says moved the
            target.
          </p>
        </section>

        {/* Move one: what happened. The timeline at full detail and the run
            cadence beside it, in one card - the same two blocks, in the same
            plane, the Log tab used to open with. */}
        <section className="rounded-[16px] bg-card p-7">
          <h3 className="font-serif text-[20px] font-semibold tracking-[-0.01em] text-fg">Campaign history</h3>
          <p className="mt-1.5 text-[12px] text-muted">
            Every round on record, at full detail, and the days work was actually measured.
          </p>

          <div className="mt-[26px]">
            {timeline.status === "loading" && (
              <div className="border-t border-border pt-[22px]">
                <Loading label="Loading the campaign timeline" />
              </div>
            )}
            {timeline.status === "unavailable" && (
              <div className="border-t border-border pt-[22px]">
                <SectionLabel>Campaign timeline</SectionLabel>
                <NotInstrumentedNote className="mt-2">
                  The engine did not answer, so the round trajectory could not be read. This is a failed request, not an
                  empty campaign.
                </NotInstrumentedNote>
              </div>
            )}
            {timeline.status === "ok" && (
              <CampaignTimeline
                rounds={timeline.rounds}
                goal={timeline.goal}
                targetNoun={targetNoun(stats?.target ?? campaign.name)}
              />
            )}

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
              <ActivityStrip days={activity.days} stats={activity.stats} note={activity.note} todayISO={todayISO} />
            )}
          </div>
        </section>

        {/* Move two: what it means. Needs the analysis, so it renders only once
            the analysis is actually in hand - no empty axes in the meantime. */}
        {logStats.status === "loading" && <Loading label="Loading the latest analysis" />}

        {logStats.status === "unavailable" && (
          <section className="rounded-[16px] bg-card p-7">
            <h3 className="font-serif text-[20px] font-semibold tracking-[-0.01em] text-fg">What the analysis taught</h3>
            <NotInstrumentedNote className="mt-2">
              The engine did not answer, so the per-input findings could not be read. This is a failed request, not a
              campaign with nothing to show.
            </NotInstrumentedNote>
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
          <section className="rounded-[16px] bg-card p-7">
            <h3 className="font-serif text-[20px] font-semibold tracking-[-0.01em] text-fg">What the analysis taught</h3>
            <NotInstrumentedNote className="mt-2">
              Nothing has been analysed for this campaign yet, so there are no per-input findings to report. Upload a
              run table and this section fills in from it.
            </NotInstrumentedNote>
          </section>
        )}

        {stats != null && <DriverChart stats={stats} roundNumber={lastClosedRound} />}
      </div>
    </div>
  );
}
