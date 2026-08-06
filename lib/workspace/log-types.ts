// Log-tab-only domain types, layered on top of the shared shapes in
// ./types.ts. Kept in a separate module rather than added to ./types.ts
// because the Map-tab build is running in parallel against that file - see
// the build note this module was authored under. Import the shared types
// (Campaign, Round, Run, ...) from ./types.ts as usual; this file only adds
// what the Log tab needs on top.
import type { Driver, GpMainEffects } from "@/lib/api";

/** One calendar day's measured-run count, as the activity strip renders it. */
export type ActivityDay = { date: string; runs: number };

export type ActivityStats = {
  daysRunning: number;
  daysWithRuns: number;
  longestPauseDays: number;
};

export type WorkspaceActivityResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      days: ActivityDay[];
      /** Null when there is nothing to compute stats from (no campaign, no
       *  logged runs yet) - render the honest not-instrumented state, not a
       *  fabricated "0 days". */
      stats: ActivityStats | null;
      /** The engine's own coverage caveat (e.g. "runs folded from the
       *  original upload have no timestamp and are not counted here"),
       *  surfaced verbatim when present. */
      note: string | null;
      demo: boolean;
    };

/** Everything the verdict hero, stat strip, and "what round N taught" chart
 *  need from the most recent analysis. Sourced from `getLatest()` (the
 *  engine's most recent `_analyze` result) plus a couple of fields off
 *  `getCampaign()` that the shared `Campaign`/`Round` domain types (./types.ts)
 *  don't carry - see adapter.ts's getWorkspaceLogStats. */
export type WorkspaceLogStats = {
  target: string | null;
  /** Trailing unit parsed off the target name (e.g. "g/L"), "" when none. */
  targetUnit: string;
  bestSoFar: number | null;
  /** Distribution-free +/- band from pooled out-of-fold residuals
   *  (`conformal_q`). Null when the engine hasn't scored one yet. */
  band: number | null;
  /** Total historical measured runs the current fit was trained on
   *  (`n_base`) - NOT the current round's pending-run count. */
  runsMeasured: number | null;
  /** Modeled feature count (`features.length`). */
  runsInputs: number | null;
  reliable: boolean | null;
  cvSpearman: number | null;
  ci95: [number, number] | null;
  /** Source filename of the most recent upload, when the engine has one. */
  dataset: string | null;
  /** Unix seconds the analysis was produced, for a relative "Xh ago" age. */
  updatedAt: number | null;
  drivers: Driver[];
  gpMainEffects: GpMainEffects | null;
};

/** One column of the campaign timeline. Deliberately NOT the shared `Round`
 *  (./types.ts): the timeline needs a per-round run count and method, which
 *  `Round` does not carry, and ./types.ts is owned by a parallel build. Every
 *  field the engine cannot break down by round is `null` here rather than
 *  guessed - the column then renders that line as nothing. */
export type TimelineRound = {
  number: number;
  label: string;
  status: "open" | "closed";
  /** Measured best-so-far at the end of this round. Null for a round that has
   *  not read out. */
  bestValue: number | null;
  /** The open round's top prediction, and its +/- band. Only ever populated
   *  for an open round - a prediction is not a result. */
  predicted: number | null;
  predictedBand: number | null;
  /** Proposals in the open round still waiting on a decision. */
  awaitingCount: number | null;
  dateISO: string | null;
  /** Runs booked in this round. Null when the engine reports only a running
   *  total it cannot attribute to one round. */
  runCount: number | null;
  /** "LHS screen", "BO explore", ... Null when the engine does not record how
   *  a round's recipes were chosen. */
  method: string | null;
};

export type WorkspaceTimelineResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      rounds: TimelineRound[];
      /** The campaign's target value, when one was set. The engine has no goal
       *  concept today, so this is null in real mode - the target column says
       *  so instead of inventing a number to aim at. */
      goal: number | null;
      demo: boolean;
    };

export type WorkspaceLogStatsResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      /** Null when the engine is reachable but has never analyzed anything
       *  for this campaign - an honest empty state, not a fabricated zero. */
      stats: WorkspaceLogStats | null;
      demo: boolean;
    };
