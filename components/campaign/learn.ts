/*
 * Pure rules for the Validate page (run, record and learn): which prediction
 * band applies to a run, whether a measured result landed inside it, what the
 * round taught, when a re-analysis may start, and how a correction is checked.
 * Arithmetic only: no verdict beyond what the numbers say.
 * Tested in __tests__/learn.test.ts.
 */

import type { CampaignRun, Goal, PopulatedResult, Promotion, ResultHistoryItem } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { EngineError, engineMessage } from "@/lib/engine-error";
import { coverageText, formatValue } from "@/lib/num";
import { measured, type ActiveCampaign } from "@/lib/workbench";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

// --- Prediction bands ----------------------------------------------------------

export type BandCalibration = { inside: number; total: number };

/**
 * How many measured runs landed inside their predicted band: `|result - pred|`
 * within the conformal half-width. Awaiting runs and non-finite values are
 * left out. Null when the engine reported no band (nothing honest to count);
 * zero of zero when there are simply no measured runs yet.
 */
export function bandCalibration(runs: readonly CampaignRun[], band: number | null | undefined): BandCalibration | null {
  if (band == null || !Number.isFinite(band) || band < 0) return null;
  const scored = runs.filter((r) => r.result != null && Number.isFinite(r.result) && Number.isFinite(r.pred));
  return { inside: scored.filter((r) => Math.abs((r.result as number) - r.pred) <= band).length, total: scored.length };
}

/** "3 of 5 measured runs landed inside the 90% band recorded when they started." The coverage is left out when the engine did not send one. */
export function calibrationSentence(cal: BandCalibration, coverage?: number | null): string {
  const pct = coverageText(coverage);
  return `${count(cal.inside)} of ${count(cal.total)} measured ${cal.total === 1 ? "run" : "runs"} landed inside the ${pct ? `${pct} ` : ""}band recorded when ${cal.total === 1 ? "it" : "they"} started.`;
}

/** The fields of an analysis that decide which band applies to a legacy run. `proposal_provenance` is sent by the engine but not typed in lib/api yet. */
export type BandAnalysis = Pick<PopulatedResult, "conformal_q" | "conformal_coverage" | "timestamp"> & {
  proposal_provenance?: { provenance_sha256?: string | null } | null;
};

/**
 * Where a run's band comes from:
 *  - recorded: the engine stored it with the run when the run was started (R5, `prediction_at_start.interval`).
 *  - current-analysis: a legacy run (started before the engine recorded bands) that the CURRENT analysis proposed,
 *    so today's band is shown, labelled as such.
 */
export type BandSource = "recorded" | "current-analysis";

/**
 * Why a run has no band:
 *  - no-band: legacy run, and the analysis has no conformal band.
 *  - other-analysis: legacy run proposed by an earlier analysis whose band was not stored.
 *  - unknown: legacy run that does not say which analysis proposed it.
 *  - no-engine-prediction: the engine recorded no prediction for the run (an edited recipe: `pred_source` "caller"
 *    or `prediction_at_start.available` false); the number on the run is the caller's, never shown as the engine's.
 *  - interval-unavailable: the engine recorded its prediction at start but no band (`interval_unavailable_reason`).
 */
export type BandWhy = "no-band" | "other-analysis" | "unknown" | "no-engine-prediction" | "interval-unavailable";

export type RunBand =
  | { halfWidth: number; coverage: number | null; lo: number; hi: number; source: BandSource; why?: undefined; reason?: undefined }
  | { halfWidth: null; coverage: null; lo?: undefined; hi?: undefined; source?: undefined; why: BandWhy; reason: string | null };

/** The provenance hash of the analysis that proposed the current batch, or null when the engine did not send one. */
export function analysisHash(analysis: BandAnalysis | null | undefined): string | null {
  return analysis?.proposal_provenance?.provenance_sha256 ?? null;
}

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const none = (why: BandWhy, reason: string | null = null): RunBand => ({ halfWidth: null, coverage: null, why, reason });

/** The engine has no prediction of its own for this run: the recipe was not one of its proposals (R5). */
export const isCallerPrediction = (run: CampaignRun): boolean =>
  run.pred_source === "caller" || (run.prediction_at_start != null && run.prediction_at_start.available === false);

/**
 * The engine's prediction for a run, or null when it has none (caller-predicted runs). Runs started since the
 * engine records predictions use `prediction_at_start.pred`; legacy runs keep their stored `pred`.
 */
export function enginePrediction(run: CampaignRun): number | null {
  if (isCallerPrediction(run)) return null;
  const at = run.prediction_at_start;
  if (at && at.available && fin(at.pred)) return at.pred;
  return fin(run.pred) ? run.pred : null;
}

/**
 * The band that applies to a run's prediction. Runs started since the engine records predictions carry their own
 * band (`prediction_at_start.interval`, with its coverage); a caller-predicted run has none. Only legacy runs
 * (`prediction_at_start` null) fall back to the current analysis' band, and only when that analysis proposed them
 * (same provenance hash, else the same analysis timestamp).
 */
export function runBand(run: CampaignRun, analysis: BandAnalysis | null | undefined): RunBand {
  if (isCallerPrediction(run)) {
    const at = run.prediction_at_start;
    return none("no-engine-prediction", at && at.available === false ? at.reason || null : null);
  }
  const at = run.prediction_at_start;
  if (at && at.available) {
    const i = at.interval;
    if (!i || !fin(i.lo) || !fin(i.hi)) return none("interval-unavailable", at.interval_unavailable_reason || null);
    const hw = fin(i.half_width) ? i.half_width : (i.hi - i.lo) / 2;
    return { halfWidth: hw, coverage: fin(i.coverage) ? i.coverage : null, lo: i.lo, hi: i.hi, source: "recorded" };
  }
  // Legacy run: no band was recorded with it.
  const q = analysis?.conformal_q;
  if (analysis == null || q == null || !Number.isFinite(q) || q < 0) return none("no-band");
  const from = run.analysis_provenance;
  const hash = analysisHash(analysis);
  let same: boolean | null = null;
  if (from?.provenance_sha256 && hash) same = from.provenance_sha256 === hash;
  else if (from?.timestamp != null && analysis.timestamp != null) same = from.timestamp === analysis.timestamp;
  if (same == null) return none("unknown");
  if (!same) return none("other-analysis");
  const cov = analysis.conformal_coverage;
  return { halfWidth: q, coverage: cov != null && Number.isFinite(cov) ? cov : null, lo: run.pred - q, hi: run.pred + q, source: "current-analysis" };
}

/** Why a run shows no band, in plain words. */
export const BAND_MISSING: Record<BandWhy, string> = {
  "no-band": "The engine reported no prediction band for this analysis.",
  "other-analysis": "Started before the engine recorded each run's band, and proposed by an earlier analysis whose band was not stored, so only the prediction is shown.",
  unknown: "Started before the engine recorded each run's band, and the engine did not say which analysis proposed it, so no band is shown.",
  "no-engine-prediction": "The recipe was not one of the engine's proposals, so the engine recorded no prediction for it. The number stored with the run is your prediction, not the engine's.",
  "interval-unavailable": "The engine recorded its prediction when the run started, but no band.",
};

/** The reason a run has no band: the engine's own sentence when it sent one, else the plain rule above. */
export function bandMissingText(band: RunBand): string | null {
  if (!band.why) return null;
  return band.reason ? `${BAND_MISSING[band.why]} The engine says: ${band.reason}` : BAND_MISSING[band.why];
}

/** How a band is labelled wherever it is shown. */
export const BAND_SOURCE_LABEL: Record<BandSource, string> = {
  recorded: "band recorded when the run started",
  "current-analysis": "band from the current analysis (not recorded at start)",
};

/**
 * Whether a measured result sits inside the run's band (edge inclusive), or null when there is no result or no band.
 * For a recorded band the engine's own `inside_band` is used when it sent one; it is only computed for legacy runs.
 */
export function bandOutcome(run: CampaignRun, band: RunBand): "inside" | "outside" | null {
  if (run.awaiting || run.result == null || !Number.isFinite(run.result) || band.halfWidth == null) return null;
  if (band.source === "recorded" && typeof run.inside_band === "boolean") return run.inside_band ? "inside" : "outside";
  return run.result >= band.lo && run.result <= band.hi ? "inside" : "outside";
}

/** measured − predicted: the engine's `residual` when it sent one, else exact arithmetic for a legacy run; null for a caller prediction. */
export function runResidual(run: CampaignRun): number | null {
  if (run.awaiting || run.result == null || !Number.isFinite(run.result)) return null;
  if (fin(run.residual)) return run.residual;
  const pred = enginePrediction(run);
  return pred == null ? null : run.result - pred;
}

/**
 * Band check over measured runs. Only runs with a band RECORDED when they started are scored; `unscored` counts
 * every other measured run (legacy runs checked against today's band, caller predictions, runs without a band).
 */
export function roundCalibration(runs: readonly CampaignRun[], analysis: BandAnalysis | null | undefined): BandCalibration & { unscored: number; coverage: number | null } {
  const done = runs.filter((r) => !r.awaiting && r.result != null && Number.isFinite(r.result));
  const scored = done.map((r) => ({ r, band: runBand(r, analysis) })).filter((x) => x.band.source === "recorded");
  const covs = [...new Set(scored.map((x) => x.band.coverage))];
  return {
    inside: scored.filter((x) => bandOutcome(x.r, x.band) === "inside").length,
    total: scored.length,
    unscored: done.length - scored.length,
    coverage: covs.length === 1 ? (covs[0] ?? null) : null,
  };
}

// --- What the round taught -----------------------------------------------------

export type RoundLesson = {
  /** The round whose results are being recorded, as people count it. */
  round: number;
  measured: number;
  awaiting: number;
  /** The campaign goal (the engine's `goal`; absent on older engines = maximize). */
  goal: Goal;
  /** The best measured result among this round's runs (not yet folded in): the highest, or the lowest when minimizing. */
  roundBest: number | null;
  roundBestRun: string | null;
  /** The measured best in the dataset before this round's results are folded in (the engine's `best`, goal-aware). */
  priorBest: number | null;
  /** roundBest - priorBest, or null when either is missing. */
  delta: number | null;
};

/** The campaign's goal as the engine reports it; older engines send none, which means maximize. */
export const goalOf = (c: { goal?: Goal | null } | null | undefined): Goal => (c?.goal === "minimize" ? "minimize" : "maximize");

/** "highest" or "lowest": which measured value counts as best. */
export const bestWord = (goal: Goal): "highest" | "lowest" => (goal === "minimize" ? "lowest" : "highest");

/** Whether `a` is a better measured value than `b` for the goal (a comparison of two numbers, not a verdict). */
export const isBetter = (a: number, b: number, goal: Goal): boolean => (goal === "minimize" ? a < b : a > b);

export function roundLesson(c: ActiveCampaign): RoundLesson {
  const goal = goalOf(c);
  const done = measured(c).filter((r) => r.result != null && Number.isFinite(r.result));
  const top = done.reduce<CampaignRun | null>((best, r) => (best == null || isBetter(r.result as number, best.result as number, goal) ? r : best), null);
  const roundBest = top ? (top.result as number) : null;
  const priorBest = c.best != null && Number.isFinite(c.best) ? c.best : null;
  return {
    round: displayRound(c.round),
    measured: done.length,
    awaiting: c.pending.filter((r) => r.awaiting).length,
    goal,
    roundBest,
    roundBestRun: top?.id ?? null,
    priorBest,
    delta: roundBest != null && priorBest != null ? roundBest - priorBest : null,
  };
}

/** "above", "below" or "equal to": a comparison of two measured numbers, not a verdict. */
export function compareWord(delta: number): "above" | "below" | "equal to" {
  return delta > 0 ? "above" : delta < 0 ? "below" : "equal to";
}

/** The analysis is older than the recorded results: say how many, or null when it is current (or the engine did not say). */
export function syncNote(c: ActiveCampaign): string | null {
  if (c.analysis_in_sync !== false) return null;
  const n = measured(c).length;
  if (n === 0) return null; // starting runs also re-stamps the campaign; that is expected, not stale
  return `The current analysis predates ${count(n)} recorded ${n === 1 ? "result" : "results"}. Re-analyze to fold ${n === 1 ? "it" : "them"} into the model.`;
}

// --- Re-analysis ---------------------------------------------------------------

/** The next round needs at least one measured result to learn from. */
export const canPlanNext = (campaign: ActiveCampaign | null): boolean => campaign != null && measured(campaign).length > 0;

/** Why "Re-analyze" is disabled, or null when it may start. The engine refuses with 400 when nothing is measured. */
export function reanalyzeBlock(s: { campaign: ActiveCampaign | null; running: boolean; uploadActive: boolean; archived: boolean; saving: boolean }): string | null {
  if (s.archived) return "This campaign is archived, so it is read-only.";
  if (s.running) return "A re-analysis is already running.";
  if (s.uploadActive) return "An upload is being analyzed for this campaign. Re-analyze once it finishes.";
  if (s.saving) return "Wait until the results being saved are in.";
  if (!canPlanNext(s.campaign)) return "Record at least one measured result first: until then the engine has nothing new to learn from.";
  return null;
}

export type ReanalysisCopy = { message: string; retry: boolean; signIn: boolean };

/**
 * Plain copy for the job codes a re-analysis can end with (refused before queueing, or failed while running).
 * Codes not listed here fall back to the shared copy in lib/engine-error, then to the engine's own sentence.
 */
const REANALYSIS_COPY: Record<string, { message: string; retry: boolean }> = {
  conflict: {
    message: "The campaign changed while re-analyzing (a result was recorded or a sheet was uploaded), so nothing was written. Your results are safe; try again.",
    retry: true,
  },
  campaign_changed: {
    message: "The campaign changed while re-analyzing (a result was recorded or a sheet was uploaded), so nothing was written. Your results are safe; try again.",
    retry: true,
  },
  nothing_to_fold: { message: "There are no measured results to fold in yet. Record at least one result, then re-analyze.", retry: false },
  job_pending: { message: "Another analysis is already queued or running for this campaign. Wait for it to finish, then re-analyze.", retry: false },
  rate_limited: { message: "Too many re-analyses in a short time. Wait a minute, then try again.", retry: false },
  engine_busy: { message: "Another analysis is running for this workspace, so the engine turned this one away. Nothing changed. Try again in about a minute.", retry: false },
  timeout: { message: "The re-analysis ran past the engine's time limit and was stopped, so nothing was written. Try again; if it repeats, contact your administrator.", retry: true },
  fit_failed: { message: "The model could not be fitted to the data with the new results folded in, so nothing was written. Check the recent results for typing errors, then try again.", retry: true },
  analysis_failed: { message: "The re-analysis failed on the engine, so nothing was written. Try again; if it repeats, contact your administrator.", retry: true },
  worker_exited: { message: "The re-analysis stopped unexpectedly, so nothing was written. Try again; if it repeats, contact your administrator.", retry: true },
  interrupted: { message: "The analysis service restarted during the re-analysis, so nothing was written. Try again.", retry: true },
  engine_stopped: { message: "The analysis service shut down during the re-analysis, so nothing was written. Try again once it is back.", retry: true },
  no_data: { message: "This campaign has no data to re-analyze. Upload a run sheet on Harmonize first.", retry: false },
  campaign_not_found: { message: "This campaign no longer exists, or you no longer have access to it.", retry: false },
  campaign_archived: { message: "This campaign is archived, so it is read-only and cannot be re-analyzed.", retry: false },
};

/** Copy for a re-analysis that did not finish, from its job error (`{ code, message }`) or a thrown error. */
export function reanalysisErrorCopy(err: { code: string; message?: string | null } | unknown): ReanalysisCopy {
  const e =
    err instanceof EngineError
      ? { code: err.code, message: err.detail ?? null }
      : typeof err === "object" && err != null && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string; message?: string | null })
        : null;
  if (!e) return { message: "The analysis service did not respond. Your recorded results are safe; try again in a moment.", retry: true, signIn: false };
  const known = REANALYSIS_COPY[e.code];
  if (known) return { ...known, signIn: false };
  const { message, signIn } = engineMessage({ code: e.code, error: e.message ?? null });
  return { message: `${message} Nothing was written; your recorded results are safe.`, retry: !signIn, signIn };
}

/** Copy for a failed re-analysis, and whether retrying right away makes sense. */
export const reanalysisFailure = (err: unknown): ReanalysisCopy => reanalysisErrorCopy(err);

// --- Corrections ---------------------------------------------------------------

/** The engine keeps at most this many characters of a correction reason. */
export const MAX_REASON = 256;

/** A correction saved from this page in this session: what was replaced and why. */
export type SessionCorrection = { previous: number | null; value: number; reason: string };

export type ResultHistory = {
  version: number | null;
  previous: number | null;
  reason: string | null;
  /**
   * engine: the run carries its own history fields. history: the engine's result history (GET /results/history)
   * row for this version. session: what this page sent and the engine accepted. null: not known here.
   */
  source: "engine" | "history" | "session" | null;
};

/** The fields of a result-history row this needs (GET /api/campaigns/{id}/results/history). */
export type HistoryRow = Pick<ResultHistoryItem, "run_id" | "version" | "value" | "previous_value" | "reason">;

/**
 * A recorded result's version history as far as this page can know it. The
 * campaign summary carries `result_version` but not the earlier value or the
 * reason (only the write's response and the result history do), so those
 * fill them in; anything else is reported as not returned, never guessed.
 */
export function resultHistory(run: CampaignRun, session?: SessionCorrection, row?: HistoryRow | null): ResultHistory {
  const version = run.result_version ?? null;
  if (run.previous_result !== undefined || run.result_reason) {
    return { version, previous: run.previous_result ?? null, reason: run.result_reason ?? null, source: "engine" };
  }
  if (row && row.run_id === run.id && row.version === version && row.value === run.result) {
    return { version, previous: row.previous_value ?? null, reason: row.reason ?? null, source: "history" };
  }
  if (session && session.value === run.result) return { version, previous: session.previous, reason: session.reason, source: "session" };
  return { version, previous: null, reason: null, source: null };
}

/** The newest history row per run (the one describing its current version). */
export function latestHistoryRows(items: readonly HistoryRow[]): Map<string, HistoryRow> {
  const out = new Map<string, HistoryRow>();
  for (const it of items) {
    const cur = out.get(it.run_id);
    if (!cur || it.version > cur.version) out.set(it.run_id, it);
  }
  return out;
}

/** What stops a correction from being saved, or null when it may be sent. */
export function correctionProblem(current: number | null, value: number | null, reason: string): string | null {
  if (value == null) return "Enter the corrected value as a number.";
  if (current != null && value === current) return "This is the value already recorded. Enter the corrected value.";
  if (reason.trim() === "") return "Say why the value changed. The engine keeps every version with its reason.";
  if (reason.trim().length > MAX_REASON) return `Keep the reason under ${MAX_REASON} characters.`;
  return null;
}

// --- Promotion -----------------------------------------------------------------

const GATES: Record<string, { reason: string; fix: string }> = {
  surrogate_spearman: { reason: "its ranking of held-out runs is too weak", fix: "Add more measured runs." },
  feasibility_auc: { reason: "it cannot yet tell feasible recipes from infeasible ones", fix: "Add runs that include some that failed or produced nothing." },
  ece: { reason: "its prediction bands do not match how often it is right", fix: "Add more measured runs." },
  brier: { reason: "its feasibility estimates are not reliable yet", fix: "Add runs that include some that failed or produced nothing." },
};

/**
 * The promotion gate as one plain line, or null when it is cleared or the
 * engine did not report it. Names the first failing check in words (never the
 * engine's raw gate text) with one fix; more failures are counted, not listed.
 */
export function promotionLine(promotion: Promotion | undefined): string | null {
  if (!promotion || promotion.passed) return null;
  const [first, ...rest] = promotion.failures;
  const gate = first ? GATES[first.split(/[=\s]/)[0]] : undefined;
  const reason = first?.includes("unmeasured")
    ? "a required check could not be measured on this data"
    : (gate?.reason ?? "it has not met every check yet");
  const more = rest.length ? ` (${rest.length} more ${rest.length === 1 ? "check" : "checks"} also fell short)` : "";
  return `Not cleared to promote: ${reason}${more}. ${gate?.fix ?? "Add more measured runs."}`;
}
