/*
 * Pure rules for the Validate page (run, record and learn): which prediction
 * band applies to a run, whether a measured result landed inside it, what the
 * round taught, when a re-analysis may start, and how a correction is checked.
 * Arithmetic only: no verdict beyond what the numbers say.
 * Tested in __tests__/learn.test.ts.
 */

import type { CampaignRun, PopulatedResult, Promotion } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { EngineError, errorMessage } from "@/lib/engine-error";
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

/** "3 of 5 measured runs landed inside their predicted 90% band." The coverage is left out when the engine did not send one. */
export function calibrationSentence(cal: BandCalibration, coverage?: number | null): string {
  const pct = coverageText(coverage);
  return `${count(cal.inside)} of ${count(cal.total)} measured runs landed inside their predicted ${pct ? `${pct} ` : ""}band.`;
}

/** The fields of an analysis that decide which band applies to a run. `proposal_provenance` is sent by the engine but not typed in lib/api yet. */
export type BandAnalysis = Pick<PopulatedResult, "conformal_q" | "conformal_coverage" | "timestamp"> & {
  proposal_provenance?: { provenance_sha256?: string | null } | null;
};

export type RunBand =
  | { halfWidth: number; coverage: number | null; why?: undefined }
  /** no-band: the analysis has no conformal band. other-analysis: the run was proposed by an earlier analysis whose band is not stored. unknown: the run does not say which analysis proposed it. */
  | { halfWidth: null; coverage: null; why: "no-band" | "other-analysis" | "unknown" };

/** The provenance hash of the analysis that proposed the current batch, or null when the engine did not send one. */
export function analysisHash(analysis: BandAnalysis | null | undefined): string | null {
  return analysis?.proposal_provenance?.provenance_sha256 ?? null;
}

/**
 * The conformal band that applies to a run's prediction. The current
 * analysis' band only applies to runs that analysis proposed (same provenance
 * hash, else the same analysis timestamp); a run proposed by an earlier
 * analysis keeps its prediction but its band is not stored, so none is shown.
 */
export function runBand(run: CampaignRun, analysis: BandAnalysis | null | undefined): RunBand {
  const q = analysis?.conformal_q;
  if (analysis == null || q == null || !Number.isFinite(q) || q < 0) return { halfWidth: null, coverage: null, why: "no-band" };
  const from = run.analysis_provenance;
  const hash = analysisHash(analysis);
  let same: boolean | null = null;
  if (from?.provenance_sha256 && hash) same = from.provenance_sha256 === hash;
  else if (from?.timestamp != null && analysis.timestamp != null) same = from.timestamp === analysis.timestamp;
  if (same == null) return { halfWidth: null, coverage: null, why: "unknown" };
  if (!same) return { halfWidth: null, coverage: null, why: "other-analysis" };
  const cov = analysis.conformal_coverage;
  return { halfWidth: q, coverage: cov != null && Number.isFinite(cov) ? cov : null };
}

/** Why a run shows no band, in plain words. */
export const BAND_MISSING: Record<NonNullable<RunBand["why"]>, string> = {
  "no-band": "The engine reported no prediction band for this analysis.",
  "other-analysis": "Proposed by an earlier analysis; its band was not stored, so only the prediction is shown.",
  unknown: "The engine did not say which analysis proposed this run, so no band is shown.",
};

/** Whether a measured result sits inside the run's band (edge inclusive), or null when there is no result or no band. */
export function bandOutcome(run: CampaignRun, band: RunBand): "inside" | "outside" | null {
  if (run.awaiting || run.result == null || !Number.isFinite(run.result) || band.halfWidth == null || !Number.isFinite(run.pred)) return null;
  return Math.abs(run.result - run.pred) <= band.halfWidth ? "inside" : "outside";
}

/** Band check over the measured runs that have a known band; `unscored` counts measured runs without one. */
export function roundCalibration(runs: readonly CampaignRun[], analysis: BandAnalysis | null | undefined): (BandCalibration & { unscored: number }) | null {
  if (analysis?.conformal_q == null || !Number.isFinite(analysis.conformal_q)) return null;
  const done = runs.filter((r) => !r.awaiting && r.result != null && Number.isFinite(r.result));
  const banded = done.filter((r) => runBand(r, analysis).halfWidth != null);
  const cal = bandCalibration(banded, analysis.conformal_q);
  return cal ? { ...cal, unscored: done.length - banded.length } : null;
}

// --- What the round taught -----------------------------------------------------

export type RoundLesson = {
  /** The round whose results are being recorded, as people count it. */
  round: number;
  measured: number;
  awaiting: number;
  /** The highest measured result among this round's runs (not yet folded in), or null. */
  roundBest: number | null;
  roundBestRun: string | null;
  /** The measured best in the dataset before this round's results are folded in. */
  priorBest: number | null;
  /** roundBest - priorBest, or null when either is missing. */
  delta: number | null;
};

export function roundLesson(c: ActiveCampaign): RoundLesson {
  const done = measured(c).filter((r) => r.result != null && Number.isFinite(r.result));
  const top = done.reduce<CampaignRun | null>((best, r) => (best == null || (r.result as number) > (best.result as number) ? r : best), null);
  const roundBest = top ? (top.result as number) : null;
  const priorBest = c.best != null && Number.isFinite(c.best) ? c.best : null;
  return {
    round: displayRound(c.round),
    measured: done.length,
    awaiting: c.pending.filter((r) => r.awaiting).length,
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

/** Copy for a failed re-analysis, and whether retrying right away makes sense. */
export function reanalysisFailure(err: unknown): { message: string; retry: boolean; signIn: boolean } {
  const code = err instanceof EngineError ? err.code : null;
  if (code === "engine_busy") {
    return { message: "Another analysis is running for this workspace, so the engine turned this one away. Nothing changed. Try again in about a minute.", retry: false, signIn: false };
  }
  if (code === "conflict" || code === "campaign_changed") {
    return { message: "The campaign changed while the model was re-fitting (a result or an upload landed), so nothing was saved. Your results are safe; try again.", retry: true, signIn: false };
  }
  const { message, signIn } = errorMessage(err);
  return { message: `${message} Your recorded results are safe.`, retry: !signIn, signIn };
}

// --- Corrections ---------------------------------------------------------------

/** The engine keeps at most this many characters of a correction reason. */
export const MAX_REASON = 256;

/** A correction saved from this page in this session: what was replaced and why. */
export type SessionCorrection = { previous: number | null; value: number; reason: string };

export type ResultHistory = {
  version: number | null;
  previous: number | null;
  reason: string | null;
  /** engine: the run carries its own history fields. session: what this page sent and the engine accepted. null: not known here. */
  source: "engine" | "session" | null;
};

/**
 * A recorded result's version history as far as this page can know it. The
 * campaign summary carries `result_version` but not the earlier value or the
 * reason (only the write's response does), so a correction made here in this
 * session fills them in; anything else is reported as not returned, never
 * guessed.
 */
export function resultHistory(run: CampaignRun, session?: SessionCorrection): ResultHistory {
  const version = run.result_version ?? null;
  if (run.previous_result !== undefined || run.result_reason) {
    return { version, previous: run.previous_result ?? null, reason: run.result_reason ?? null, source: "engine" };
  }
  if (session && session.value === run.result) return { version, previous: session.previous, reason: session.reason, source: "session" };
  return { version, previous: null, reason: null, source: null };
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
