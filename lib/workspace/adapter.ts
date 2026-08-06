// The single seam between the campaign-workspace UI and data. Every
// component under components/workspace/** and app/c/** calls through here -
// none of them import lib/api.ts or lib/workspace/mock.ts directly. That
// keeps the "engine shape is still moving" risk contained to one file: when
// the in-progress multi-campaign engine endpoints land, only this module
// needs to change.
//
// Today's engine (lib/api.ts's getCampaign()) models exactly ONE active
// campaign - no multi-campaign listing, no per-round run breakdown, no run
// failure status, no SOP/evidence counts. This adapter maps what IS real
// onto the domain types in ./types and is explicit about what it cannot
// derive, rather than inventing numbers to fill the gaps (see DEMO_MODE
// gating below and the "not instrumented" fields on WorkspaceCampaignResult).
import {
  getCampaign as fetchEngineCampaign,
  getCampaignActivity as fetchEngineActivity,
  getLatest as fetchEngineLatest,
  isReliable,
  type Campaign as EngineCampaign,
  type CampaignRun as EngineRun,
  type PopulatedResult,
} from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { parseUnit } from "@/lib/utils";
import {
  computeMockActivityStats,
  getMockActivity,
  getMockCampaign,
  getMockLogStats,
  getMockTimeline,
  MOCK_CAMPAIGN_SUMMARIES,
} from "./mock";
import type { Campaign, CampaignSummary, Round, Run } from "./types";
import type {
  TimelineRound,
  WorkspaceActivityResult,
  WorkspaceLogStats,
  WorkspaceLogStatsResult,
  WorkspaceTimelineResult,
} from "./log-types";

/** The engine only ever tracks one active campaign, so it gets one fixed id.
 *  A future multi-campaign engine would replace this with real ids from its
 *  listing endpoint - this constant is the one spot that assumption lives. */
const REAL_CAMPAIGN_ID = "current";

type ActiveEngineCampaign = Extract<EngineCampaign, { has_campaign: true }>;

/** The rail's two-letter mono monogram: the first word's first two
 *  characters, uppercased - matches the design's own examples ("CHO titer
 *  uplift" -> "CH", "HEK yield screen" -> "HE", "Fc-fusion pilot" -> "FC"),
 *  not an initials-of-two-words scheme. */
export function monogram(name: string): string {
  const firstWord = name.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  if (firstWord.length === 0) return "--";
  return firstWord.slice(0, 2).toUpperCase();
}

/** Maps one engine `CampaignRun` onto the domain `Run` shape. The engine
 *  only distinguishes "awaiting a result" vs. "has a result" - it does not
 *  model run failure (a run excluded from the fit for cause), so `status`
 *  here is never "failed" until the engine adds that concept. */
function mapRun(r: EngineRun): Run {
  return {
    id: r.id,
    recipe: r.recipe,
    status: r.awaiting ? "proposed" : "measured",
    mode: r.mode,
    predicted: r.pred,
    predictedBand: r.std,
    measuredValue: r.result,
    reason: r.reason,
  };
}

function mapRealCampaign(c: ActiveEngineCampaign): Campaign {
  const openRunsByRound = c.pending.map(mapRun);
  const rounds: Round[] = c.history.map((h) => ({
    number: h.round,
    status: h.round === c.round ? "open" : "closed",
    label: `Round ${h.round}`,
    bestValue: h.best,
    // The engine does not report per-round dates yet - render nothing
    // rather than a fabricated one.
    dateISO: null,
    // The engine only exposes the *current* round's pending runs; it does
    // not break measured runs down by the round they happened in, so every
    // closed round's `runs` is honestly empty here, not a guess.
    runs: h.round === c.round ? openRunsByRound : [],
  }));

  return {
    id: REAL_CAMPAIGN_ID,
    name: c.target,
    objective: `optimise ${c.target}`,
    currentRound: c.round,
    rounds,
    proposals: openRunsByRound
      .filter((r) => r.status === "proposed")
      .map((run, i) => ({ id: run.id, rank: i + 1, run, summary: run.reason })),
  };
}

function realCampaignSummary(c: ActiveEngineCampaign): CampaignSummary {
  return {
    id: REAL_CAMPAIGN_ID,
    name: c.target,
    monogram: monogram(c.target),
    statusLine: `Round ${c.round} · ${c.n_awaiting} awaiting`,
  };
}

export type WorkspaceCampaignsResult =
  | { status: "unavailable" }
  | { status: "ok"; campaigns: CampaignSummary[]; demo: boolean };

/** Powers the campaign rail's list. Real data (the one live campaign) always
 *  wins when present; demo campaigns only ever fill a genuine gap, and only
 *  when NEXT_PUBLIC_DEMO_MODE is on - see DemoBadge usage in the rail. */
export async function listWorkspaceCampaigns(): Promise<WorkspaceCampaignsResult> {
  let engine: EngineCampaign;
  try {
    engine = await fetchEngineCampaign();
  } catch {
    return { status: "unavailable" };
  }

  if (engine.has_campaign) {
    return { status: "ok", campaigns: [realCampaignSummary(engine)], demo: false };
  }
  if (DEMO_MODE) {
    return { status: "ok", campaigns: MOCK_CAMPAIGN_SUMMARIES, demo: true };
  }
  return { status: "ok", campaigns: [], demo: false };
}

export type WorkspaceCampaignResult =
  | { status: "unavailable" }
  | { status: "not-found" }
  | { status: "ok"; campaign: Campaign; demo: boolean };

/** Powers the workspace header + tab bodies for one campaign id. */
export async function getWorkspaceCampaign(id: string): Promise<WorkspaceCampaignResult> {
  let engine: EngineCampaign;
  try {
    engine = await fetchEngineCampaign();
  } catch {
    return { status: "unavailable" };
  }

  if (engine.has_campaign && id === REAL_CAMPAIGN_ID) {
    return { status: "ok", campaign: mapRealCampaign(engine), demo: false };
  }
  if (DEMO_MODE) {
    const mock = getMockCampaign(id);
    if (mock) return { status: "ok", campaign: mock, demo: true };
  }
  return { status: "not-found" };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Powers the activity strip (design spec 1.3.D). Wired to `GET
 *  /api/campaign/activity` - a route the engine does not serve yet as of
 *  this build (confirmed against the running dev engine and the kalos repo),
 *  so every real call resolves "unavailable" today via the same
 *  fetch-throws-on-non-2xx path every other adapter call uses; the strip
 *  renders that as a section-local unavailable state (not a full-page
 *  block) rather than pretending an empty campaign has no activity. Once
 *  the engine ships the route, real data starts flowing with no UI change
 *  needed here. */
export async function getWorkspaceActivity(id: string): Promise<WorkspaceActivityResult> {
  let engine;
  try {
    engine = await fetchEngineActivity();
  } catch {
    return { status: "unavailable" };
  }

  if (engine.has_campaign && id === REAL_CAMPAIGN_ID) {
    return {
      status: "ok",
      days: engine.days,
      stats: {
        daysRunning: engine.stats.days_running,
        daysWithRuns: engine.stats.days_with_runs,
        longestPauseDays: engine.stats.longest_pause_days,
      },
      note: engine.note,
      demo: false,
    };
  }
  if (DEMO_MODE) {
    const mock = getMockActivity(id);
    if (mock) {
      return {
        status: "ok",
        days: mock.days,
        // Derived through the SAME bucketing function real data would be,
        // not a second, independently-hardcoded set of stats - see
        // lib/workspace/log-logic.ts.
        stats: computeMockActivityStats(mock.days, todayISO()),
        note: mock.note,
        demo: true,
      };
    }
  }
  // Reachable, no live campaign, demo off (or no mock for this id): an
  // honest "nothing to show" rather than a fabricated empty-but-labeled series.
  return { status: "ok", days: [], stats: null, note: null, demo: false };
}

/** Maps the engine's `history` trajectory onto timeline columns. Per-round run
 *  counts are DERIVED as the step in the cumulative `n_base` between two
 *  consecutive points - the engine reports the running total, not a per-round
 *  count, and this is the one honest way to recover it. Everything the engine
 *  genuinely does not record (round dates, how a round's recipes were chosen)
 *  stays null; the column renders those lines as nothing. */
function mapRealTimeline(c: ActiveEngineCampaign): TimelineRound[] {
  const awaiting = c.pending.filter((r) => r.awaiting);
  const predictions = awaiting.map((r) => r.pred).filter((v): v is number => typeof v === "number");
  const topPredicted = predictions.length > 0 ? Math.max(...predictions) : null;
  const topRun = topPredicted != null ? awaiting.find((r) => r.pred === topPredicted) : undefined;

  const openParts = {
    predicted: topPredicted,
    predictedBand: topRun?.std ?? null,
    awaitingCount: c.n_awaiting,
  };

  const rounds: TimelineRound[] = c.history.map((h, i) => {
    const step = h.n_base - (i > 0 ? c.history[i - 1].n_base : 0);
    const open = h.round === c.round;
    return {
      number: h.round,
      // Round 0 is the seeded base data the campaign started from, not a
      // round the lab actually ran - name it for what it is.
      label: h.round === 0 ? "Seed data" : `Round ${h.round}`,
      status: open ? "open" : "closed",
      bestValue: h.best,
      predicted: open ? openParts.predicted : null,
      predictedBand: open ? openParts.predictedBand : null,
      awaitingCount: open ? openParts.awaitingCount : null,
      dateISO: null,
      runCount: step > 0 ? step : null,
      method: null,
    };
  });

  // A round that has opened but not yet been re-analyzed has no `history`
  // point of its own. It is still a real, visible round (its proposals are
  // sitting in `pending`), so give it a column rather than dropping it.
  if (!rounds.some((r) => r.number === c.round)) {
    rounds.push({
      number: c.round,
      label: `Round ${c.round}`,
      status: "open",
      bestValue: null,
      ...openParts,
      dateISO: null,
      runCount: null,
      method: null,
    });
  }
  return rounds;
}

/** Powers the campaign timeline (design spec 1.3.C). Same seam rules as every
 *  call above: real engine data wins, demo only ever fills a genuine gap. */
export async function getWorkspaceTimeline(id: string): Promise<WorkspaceTimelineResult> {
  let engine: EngineCampaign;
  try {
    engine = await fetchEngineCampaign();
  } catch {
    return { status: "unavailable" };
  }

  if (engine.has_campaign && id === REAL_CAMPAIGN_ID) {
    // `goal` is null on purpose: the engine models a direction to optimise,
    // not a target value to reach. The target column says so.
    return { status: "ok", rounds: mapRealTimeline(engine), goal: null, demo: false };
  }
  if (DEMO_MODE) {
    const mock = getMockTimeline(id);
    if (mock) return { status: "ok", rounds: mock.rounds, goal: mock.goal, demo: true };
  }
  return { status: "ok", rounds: [], goal: null, demo: false };
}

function mapLogStats(d: PopulatedResult): WorkspaceLogStats {
  const rel = d.reliability;
  return {
    target: d.target,
    targetUnit: parseUnit(d.target),
    bestSoFar: d.best,
    band: d.conformal_q ?? null,
    // `n`/`d` are the analysis's own trained-row-count and feature-count -
    // the same "142 runs / 11 inputs" pairing the design's stat strip wants,
    // with no second engine call needed.
    runsMeasured: d.n,
    runsInputs: d.d,
    reliable: isReliable(d),
    cvSpearman: rel?.spearman ?? d.cv_spearman ?? null,
    ci95: rel?.ci95 ?? d.cv_ci95 ?? null,
    dataset: d.dataset,
    updatedAt: d.updated,
    drivers: d.drivers,
    gpMainEffects: d.gp_main_effects ?? null,
  };
}

/** Powers the verdict hero, stat strip, and "what round N taught" chart.
 *  Sourced from `GET /api/latest` (the engine's most recent `_analyze`
 *  result) - real data always wins; demo only fills a genuine gap. */
export async function getWorkspaceLogStats(id: string): Promise<WorkspaceLogStatsResult> {
  let latest;
  try {
    latest = await fetchEngineLatest();
  } catch {
    return { status: "unavailable" };
  }

  if (latest.has_data) {
    return { status: "ok", stats: mapLogStats(latest), demo: false };
  }
  if (DEMO_MODE) {
    const mock = getMockLogStats(id);
    if (mock) return { status: "ok", stats: mock, demo: true };
  }
  return { status: "ok", stats: null, demo: false };
}

export type NewestCampaignResult = { status: "unavailable" } | { status: "ok"; id: string | null };

/** Resolves the campaign `/c` should redirect to. The engine has no notion
 *  of "newest" (it tracks one campaign), so in real mode this is just "the
 *  one live campaign, if any". In demo mode it's the first mock campaign -
 *  an illustrative ordering, not a real recency sort. */
export async function getNewestCampaignId(): Promise<NewestCampaignResult> {
  const result = await listWorkspaceCampaigns();
  if (result.status === "unavailable") return { status: "unavailable" };
  return { status: "ok", id: result.campaigns[0]?.id ?? null };
}
