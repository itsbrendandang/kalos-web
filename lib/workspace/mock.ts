// Demo-mode seed data for the campaign workspace, gated behind
// NEXT_PUBLIC_DEMO_MODE (see lib/demo.ts and adapter.ts's usage). Content is
// the same illustrative campaign the design handoff itself uses (CHO titer
// uplift and its three siblings) so a demo run of the workspace matches what
// the design spec shows, rather than inventing unrelated placeholder copy.
// Real engine data always wins when present - see adapter.ts - this module
// is only ever consulted when there is no live campaign.
import type { Campaign, CampaignSummary, Round } from "./types";
import type { ActivityDay, TimelineRound, WorkspaceLogStats } from "./log-types";
import { computeActivityStats } from "./log-logic";

export const MOCK_CAMPAIGN_SUMMARIES: CampaignSummary[] = [
  { id: "cho-titer-uplift", name: "CHO titer uplift", monogram: "CH", statusLine: "Round 4 · awaiting you" },
  { id: "hek-yield-screen", name: "HEK yield screen", monogram: "HE", statusLine: "Round 2 · agent fitting" },
  { id: "media-cost-down", name: "Media cost-down", monogram: "ME", statusLine: "Round 6 · assay pending" },
  { id: "fc-fusion-pilot", name: "Fc-fusion pilot", monogram: "FC", statusLine: "Completed · report ready" },
];

const CHO_ROUNDS: Round[] = [
  { number: 1, status: "closed", label: "Round 1", bestValue: 4.1, dateISO: "2026-05-12", runs: [] },
  { number: 2, status: "closed", label: "Round 2", bestValue: 5.7, dateISO: "2026-06-03", runs: [] },
  { number: 3, status: "closed", label: "Round 3", bestValue: 6.4, dateISO: "2026-07-21", runs: [] },
  {
    number: 4,
    status: "open",
    label: "Round 4",
    bestValue: 7.3,
    dateISO: null,
    runs: [
      {
        id: "p-1",
        recipe: { glucose_gL: 7.2, feed_start_day: 2 },
        status: "proposed",
        mode: "exploit",
        predicted: 7.3,
        predictedBand: 0.4,
        measuredValue: null,
        reason: "Glucose up, feed earlier",
      },
      {
        id: "p-2",
        recipe: { glucose_gL: 6.8, feed_start_day: 2 },
        status: "proposed",
        mode: "exploit",
        predicted: 7.0,
        predictedBand: 0.5,
        measuredValue: null,
        reason: "Feed earlier, glucose held",
      },
      {
        id: "p-3",
        recipe: { glucose_gL: 5.4, feed_start_day: 4 },
        status: "proposed",
        mode: "explore",
        predicted: 6.1,
        predictedBand: 1.1,
        measuredValue: null,
        reason: "Untested corner, buys information",
      },
    ],
  },
];

const MOCK_CAMPAIGNS: Record<string, Campaign> = {
  "cho-titer-uplift": {
    id: "cho-titer-uplift",
    name: "CHO titer uplift",
    objective: "maximise titer (g/L)",
    currentRound: 4,
    rounds: CHO_ROUNDS,
    proposals: CHO_ROUNDS[3].runs.map((run, i) => ({
      id: run.id,
      rank: i + 1,
      run,
      summary: run.reason,
    })),
    // A demo campaign has no engine behind it, so nothing can have been
    // booked into a lab or measured against it. Empty here is the honest
    // value, not a gap waiting to be filled with illustrative runs.
    awaitingRuns: [],
    measuredRuns: [],
  },
  "hek-yield-screen": {
    id: "hek-yield-screen",
    name: "HEK yield screen",
    objective: "maximise yield (mg/L)",
    currentRound: 2,
    rounds: [
      { number: 1, status: "closed", label: "Round 1", bestValue: 210, dateISO: "2026-06-01", runs: [] },
      { number: 2, status: "open", label: "Round 2", bestValue: null, dateISO: null, runs: [] },
    ],
    proposals: [],
    awaitingRuns: [],
    measuredRuns: [],
  },
  "media-cost-down": {
    id: "media-cost-down",
    name: "Media cost-down",
    objective: "minimise cost per litre ($/L)",
    currentRound: 6,
    rounds: Array.from({ length: 6 }, (_, i): Round => ({
      number: i + 1,
      status: i === 5 ? "open" : "closed",
      label: `Round ${i + 1}`,
      bestValue: i === 5 ? null : 4.8 - i * 0.3,
      dateISO: i === 5 ? null : `2026-0${i + 2}-15`,
      runs: [],
    })),
    proposals: [],
    awaitingRuns: [],
    measuredRuns: [],
  },
  "fc-fusion-pilot": {
    id: "fc-fusion-pilot",
    name: "Fc-fusion pilot",
    objective: "maximise purity (%)",
    currentRound: 3,
    rounds: [
      { number: 1, status: "closed", label: "Round 1", bestValue: 88.2, dateISO: "2026-03-04", runs: [] },
      { number: 2, status: "closed", label: "Round 2", bestValue: 92.1, dateISO: "2026-03-28", runs: [] },
      { number: 3, status: "closed", label: "Round 3", bestValue: 94.6, dateISO: "2026-04-19", runs: [] },
    ],
    proposals: [],
    awaitingRuns: [],
    measuredRuns: [],
  },
};

export function getMockCampaign(id: string): Campaign | null {
  return MOCK_CAMPAIGNS[id] ?? null;
}

// --- Log tab: activity strip + analysis (drivers / GP main effects) -------
// Only "cho-titer-uplift" gets illustrative data here, matching the design
// handoff's own illustrative numbers - the other three mock campaigns
// honestly report "not tracked" for these, same as a real campaign the
// engine hasn't analyzed yet would.

/** Hand-placed run-day pattern for the CHO campaign: two working clusters
 *  around rounds 1-2, a genuine 18-day pause (the design's activity caption
 *  calls this out), then rounds 3-4's steadier cadence. Stats are always
 *  DERIVED from this array via computeActivityStats (log-logic.ts), never
 *  hardcoded separately, so the demo path can't drift from the real one's
 *  definition of "days running" / "longest pause". */
function buildChoActivityDays(): ActivityDay[] {
  const startMs = Date.UTC(2026, 4, 12); // 2026-05-12, round 1's read-out date
  const totalDays = 86;
  const runsByOffset: Record<number, number> = {
    0: 3, 1: 4, 2: 3, 3: 2, 4: 3, 5: 2, // round 1 burst (LHS screen)
    9: 1, 10: 2, 11: 1, // a short check-in cluster
    21: 2, 22: 3, 23: 2, 24: 1, 25: 2, // round 2 (BO explore)
    // offsets 26-43: the 18-day pause - waiting on plate reads, not the model
    44: 2, 45: 1, 46: 2, 47: 1, // round 3 (BO exploit) begins
    50: 1, 51: 2, 52: 1,
    55: 1, 56: 1,
    60: 1, 61: 2, 62: 1, 63: 1,
    70: 1, 71: 1, // round 4 opens
    75: 1, 76: 1,
    80: 1, 81: 1,
    85: 1,
  };
  const days: ActivityDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
    days.push({ date, runs: runsByOffset[i] ?? 0 });
  }
  return days;
}

const CHO_ACTIVITY_DAYS = buildChoActivityDays();
const CHO_ACTIVITY_NOTE =
  "Runs folded in from the original upload have no per-row timestamp, so they aren't counted here - only runs started and measured through the campaign loop are.";

export function getMockActivity(id: string): { days: ActivityDay[]; note: string | null } | null {
  if (id !== "cho-titer-uplift") return null;
  return { days: CHO_ACTIVITY_DAYS, note: CHO_ACTIVITY_NOTE };
}

/** Convenience the adapter uses to derive stats from the mock days array
 *  with the SAME function real data goes through. */
export { computeActivityStats as computeMockActivityStats };

const CHO_LOG_STATS: WorkspaceLogStats = {
  target: "CHO titer (g/L)",
  targetUnit: "g/L",
  bestSoFar: 6.4,
  band: 0.42,
  runsMeasured: 142,
  runsInputs: 11,
  reliable: true,
  cvSpearman: 0.41,
  ci95: [0.18, 0.6],
  dataset: "bioqore_titer_v4.csv",
  updatedAt: Math.floor(Date.now() / 1000) - 3 * 3600,
  drivers: [
    { name: "feed_start_day", rho: -0.58, ci95: [-0.74, -0.31], significant: true },
    { name: "glucose_gL", rho: 0.36, ci95: [0.07, 0.59], significant: true },
    { name: "pH_setpoint", rho: 0.22, ci95: [-0.02, 0.44], significant: false },
    { name: "seed_density", rho: 0.19, ci95: [-0.06, 0.41], significant: false },
    { name: "DO_pct", rho: 0.15, ci95: [-0.1, 0.38], significant: false },
    { name: "gln_mM", rho: -0.12, ci95: [-0.35, 0.13], significant: false },
    { name: "temp_C", rho: 0.11, ci95: [-0.14, 0.34], significant: false },
    { name: "harvest_day", rho: 0.09, ci95: [-0.16, 0.32], significant: false },
    { name: "antifoam_ppm", rho: -0.06, ci95: [-0.29, 0.18], significant: false },
    { name: "seed_lot_age", rho: -0.04, ci95: [-0.27, 0.2], significant: false },
    { name: "osmolality", rho: 0.02, ci95: [-0.21, 0.25], significant: false },
  ],
  gpMainEffects: {
    available: true,
    effects: [
      { name: "feed_start_day", importance: 1.0 },
      { name: "glucose_gL", importance: 0.71 },
      { name: "pH_setpoint", importance: 0.34 },
      { name: "seed_density", importance: 0.29 },
      { name: "DO_pct", importance: 0.24 },
      { name: "temp_C", importance: 0.19 },
      { name: "gln_mM", importance: 0.17 },
      { name: "harvest_day", importance: 0.13 },
      { name: "antifoam_ppm", importance: 0.08 },
      { name: "seed_lot_age", importance: 0.05 },
      { name: "osmolality", importance: 0.02 },
    ],
  },
};

export function getMockLogStats(id: string): WorkspaceLogStats | null {
  if (id !== "cho-titer-uplift") return null;
  return CHO_LOG_STATS;
}

// --- Log tab: campaign timeline -------------------------------------------
// The CHO campaign gets the design handoff's own illustrative round history
// (method + run count + read-out date per round, and a target value). The
// other three mocks fall back to whatever their Campaign already declares, so
// they exercise the same "engine cannot break this down" rendering path a real
// campaign hits: method and run count null, no goal.

const CHO_TIMELINE: TimelineRound[] = [
  {
    number: 1,
    label: "Round 1",
    status: "closed",
    bestValue: 4.1,
    predicted: null,
    predictedBand: null,
    awaitingCount: null,
    dateISO: "2026-05-12",
    runCount: 96,
    method: "LHS screen",
  },
  {
    number: 2,
    label: "Round 2",
    status: "closed",
    bestValue: 5.7,
    predicted: null,
    predictedBand: null,
    awaitingCount: null,
    dateISO: "2026-06-03",
    runCount: 24,
    method: "BO explore",
  },
  {
    number: 3,
    label: "Round 3",
    status: "closed",
    bestValue: 6.4,
    predicted: null,
    predictedBand: null,
    awaitingCount: null,
    dateISO: "2026-07-21",
    runCount: 24,
    method: "BO exploit",
  },
  {
    number: 4,
    label: "Round 4",
    status: "open",
    // Open: nothing measured, nothing booked. The prediction and its band are
    // read straight off the round's own top proposal so this can't drift from
    // what the proposals card shows.
    bestValue: null,
    predicted: 7.3,
    predictedBand: 0.4,
    awaitingCount: CHO_ROUNDS[3].runs.length,
    dateISO: null,
    runCount: null,
    method: null,
  },
];

export function getMockTimeline(id: string): { rounds: TimelineRound[]; goal: number | null } | null {
  if (id === "cho-titer-uplift") return { rounds: CHO_TIMELINE, goal: 8.0 };
  const campaign = MOCK_CAMPAIGNS[id];
  if (!campaign) return null;
  return {
    rounds: campaign.rounds.map((r): TimelineRound => {
      const predictions = r.runs.map((run) => run.predicted).filter((v): v is number => v != null);
      const open = r.status === "open";
      return {
        number: r.number,
        label: r.label,
        status: r.status,
        bestValue: r.bestValue,
        predicted: open && predictions.length > 0 ? Math.max(...predictions) : null,
        predictedBand: null,
        awaitingCount: open ? r.runs.filter((run) => run.status === "proposed").length : null,
        dateISO: r.dateISO,
        runCount: null,
        method: null,
      };
    }),
    goal: null,
  };
}
