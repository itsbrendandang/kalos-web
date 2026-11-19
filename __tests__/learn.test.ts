import { describe, expect, it } from "vitest";
import type { CampaignRun, Promotion } from "@/lib/api";
import fixture from "./fixtures/validate-v2-runs.json";
import {
  BAND_SOURCE_LABEL,
  bandCalibration,
  bandMissingText,
  bandOutcome,
  calibrationSentence,
  canPlanNext,
  compareWord,
  correctionProblem,
  enginePrediction,
  goalOf,
  isCallerPrediction,
  latestHistoryRows,
  MAX_REASON,
  promotionLine,
  reanalysisErrorCopy,
  reanalysisFailure,
  reanalyzeBlock,
  resultHistory,
  roundCalibration,
  roundLesson,
  runBand,
  runResidual,
  syncNote,
  type BandAnalysis,
} from "@/components/campaign/learn";
import { EngineError } from "@/lib/engine-error";
import type { ActiveCampaign } from "@/lib/workbench";

const run = (pred: number, result: number | null, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id: `r${pred}-${result}`, recipe: {}, pred, std: 0.1, mode: "exploit", reason: "", result, awaiting: result == null, ...over,
});

const HASH = "9836c009efd80007";
const analysis = (over: Partial<BandAnalysis> = {}): BandAnalysis => ({
  conformal_q: 0.2, conformal_coverage: 0.9, timestamp: 1000, proposal_provenance: { provenance_sha256: HASH }, ...over,
});
const fromCurrent = { analysis_provenance: { provenance_sha256: HASH, timestamp: 1000 } };
const fromEarlier = { analysis_provenance: { provenance_sha256: "older", timestamp: 500 } };

const campaign = (pending: CampaignRun[], over: Partial<ActiveCampaign> = {}): ActiveCampaign => ({
  has_campaign: true, target: "titer_g_L", features: [], n_base: 160, best: 1.42, round: 0,
  history: [{ round: 0, best: 1.42, n_base: 160 }], pending,
  n_awaiting: pending.filter((r) => r.awaiting).length, n_measured: pending.filter((r) => !r.awaiting).length, ...over,
});

describe("bandCalibration", () => {
  it("counts runs whose result is within the band of the prediction, edge inclusive", () => {
    expect(bandCalibration([run(5, 5.2), run(5, 5.5), run(5, 4.4), run(5, 6)], 0.5)).toEqual({ inside: 2, total: 4 });
  });
  it("leaves out awaiting runs", () => {
    expect(bandCalibration([run(5, 5.1), run(5, null)], 0.5)).toEqual({ inside: 1, total: 1 });
  });
  it("is null when the engine sent no band", () => {
    expect(bandCalibration([run(5, 5)], null)).toBeNull();
    expect(bandCalibration([run(5, 5)], undefined)).toBeNull();
    expect(bandCalibration([run(5, 5)], Number.NaN)).toBeNull();
  });
  it("is zero of zero with no measured runs", () => {
    expect(bandCalibration([], 0.5)).toEqual({ inside: 0, total: 0 });
    expect(bandCalibration([run(5, null)], 0.5)).toEqual({ inside: 0, total: 0 });
  });
});

describe("calibrationSentence", () => {
  it("states k of n with the engine's coverage", () => {
    expect(calibrationSentence({ inside: 3, total: 5 }, 0.9)).toBe("3 of 5 measured runs landed inside the 90% band recorded when they started.");
    expect(calibrationSentence({ inside: 1, total: 1 }, 0.8)).toBe("1 of 1 measured run landed inside the 80% band recorded when it started.");
  });
  it("omits the coverage rather than guessing it", () => {
    expect(calibrationSentence({ inside: 3, total: 5 })).toBe("3 of 5 measured runs landed inside the band recorded when they started.");
  });
});

describe("runBand: which band applies to a run", () => {
  const v2 = fixture as unknown as { corrected: CampaignRun; awaiting: CampaignRun };
  it("uses the band the engine recorded when the run started (live R5 run), with its coverage", () => {
    const b = runBand(v2.awaiting, analysis({ conformal_q: 0.5 }));
    expect(b).toMatchObject({ source: "recorded", halfWidth: 0.2036, coverage: 0.9, lo: 1.5114, hi: 1.9186 });
  });
  it("never borrows today's band for a recorded run, even when the analysis changed", () => {
    expect(runBand(v2.corrected, analysis({ conformal_q: 0.9, proposal_provenance: { provenance_sha256: "other" } })).halfWidth).toBe(0.2036);
  });
  it("has no band and no engine prediction for a caller-predicted run, with the engine's reason", () => {
    const reason = "recipe is not one of the published proposals; the engine has no prediction recorded for it";
    const r = run(1.9, null, { pred_source: "caller", prediction_at_start: { available: false, reason } });
    const b = runBand(r, analysis());
    expect(b).toEqual({ halfWidth: null, coverage: null, why: "no-engine-prediction", reason });
    expect(bandMissingText(b)).toContain(reason);
    expect(enginePrediction(r)).toBeNull();
    expect(isCallerPrediction(run(1.9, null, { pred_source: "caller" }))).toBe(true);
  });
  it("says so when the engine recorded the prediction but no band", () => {
    const r = run(1.75, null, {
      pred_source: "engine",
      prediction_at_start: { available: true, basis: "predicted", pred: 1.75, std: 0.07, interval: null, interval_unavailable_reason: "no conformal band in this analysis" },
    });
    expect(runBand(r, analysis())).toMatchObject({ halfWidth: null, why: "interval-unavailable", reason: "no conformal band in this analysis" });
    expect(enginePrediction(r)).toBe(1.75);
  });
  it("legacy run: the current analysis' band for a run it proposed, labelled as such", () => {
    expect(runBand(run(1.75, null, fromCurrent), analysis())).toMatchObject({ halfWidth: 0.2, coverage: 0.9, source: "current-analysis" });
    expect(BAND_SOURCE_LABEL["current-analysis"]).toMatch(/current analysis/);
  });
  it("legacy run: falls back to the analysis timestamp when either side has no hash", () => {
    const r = run(1.75, null, { analysis_provenance: { timestamp: 1000 } });
    expect(runBand(r, analysis()).halfWidth).toBe(0.2);
    expect(runBand(r, analysis({ timestamp: 2000 })).why).toBe("other-analysis");
  });
  it("legacy run: no band for a run an earlier analysis proposed, or one that does not say", () => {
    expect(runBand(run(1.75, null, fromEarlier), analysis())).toMatchObject({ halfWidth: null, why: "other-analysis" });
    expect(runBand(run(1.75, null), analysis()).why).toBe("unknown");
  });
  it("legacy run: no band when the analysis has none, and never invents a coverage", () => {
    expect(runBand(run(1.75, null, fromCurrent), analysis({ conformal_q: null })).why).toBe("no-band");
    expect(runBand(run(1.75, null, fromCurrent), null).why).toBe("no-band");
    expect(runBand(run(1.75, null, fromCurrent), analysis({ conformal_coverage: undefined }))).toMatchObject({ halfWidth: 0.2, coverage: null });
  });
});

describe("bandOutcome and runResidual", () => {
  const legacy = runBand(run(1.75, null, fromCurrent), analysis());
  it("legacy run: inside at the edge and outside beyond it (exact arithmetic)", () => {
    expect(bandOutcome(run(1.75, 1.95, fromCurrent), legacy)).toBe("inside");
    expect(bandOutcome(run(1.75, 1.5, fromCurrent), legacy)).toBe("outside");
  });
  it("recorded band: uses the engine's inside_band and residual instead of recomputing", () => {
    const v2 = (fixture as unknown as { corrected: CampaignRun }).corrected;
    expect(bandOutcome(v2, runBand(v2, null))).toBe("inside");
    // The engine's word wins even if arithmetic would disagree.
    const flipped = { ...v2, inside_band: false };
    expect(bandOutcome(flipped, runBand(flipped, null))).toBe("outside");
    expect(runResidual({ ...v2, residual: -0.0712 })).toBe(-0.0712);
  });
  it("is null when awaiting or without a band; no residual against a caller's number", () => {
    expect(bandOutcome(run(1.75, null), legacy)).toBeNull();
    expect(bandOutcome(run(1.75, 1.7), runBand(run(1.75, 1.7), analysis()))).toBeNull();
    expect(runResidual(run(1.75, 1.7, { pred_source: "caller" }))).toBeNull();
    expect(runResidual(run(1.75, 1.7))).toBeCloseTo(-0.05);
    expect(runResidual(run(1.75, null))).toBeNull();
  });
});

describe("roundCalibration", () => {
  const recorded = (id: string, result: number, inside: boolean): CampaignRun => ({
    ...(fixture as unknown as { corrected: CampaignRun }).corrected,
    id,
    result,
    inside_band: inside,
  });
  it("scores only runs with a band recorded at start; legacy and caller runs are unscored", () => {
    const runs = [recorded("a", 1.7, true), recorded("b", 2.4, false), run(1.75, 1.64, fromCurrent), run(1.7, 1.7, { pred_source: "caller" }), run(1.7, null, fromCurrent)];
    expect(roundCalibration(runs, analysis())).toEqual({ inside: 1, total: 2, unscored: 2, coverage: 0.9 });
  });
  it("is zero of zero with no recorded band", () => {
    expect(roundCalibration([run(1, 1, fromCurrent)], analysis({ conformal_q: null }))).toEqual({ inside: 0, total: 0, unscored: 1, coverage: null });
  });
});

describe("roundLesson", () => {
  it("compares this round's measured best with the measured best before it", () => {
    const l = roundLesson(campaign([run(1.75, 1.64, { id: "a" }), run(1.7, 1.5, { id: "b" }), run(1.7, null, { id: "c" })]));
    expect(l).toMatchObject({ round: 1, measured: 2, awaiting: 1, roundBest: 1.64, roundBestRun: "a", priorBest: 1.42 });
    expect(l.delta).toBeCloseTo(0.22);
  });
  it("has no best and no delta with nothing measured, and no delta without a prior best", () => {
    expect(roundLesson(campaign([run(1, null)]))).toMatchObject({ roundBest: null, delta: null, measured: 0 });
    expect(roundLesson(campaign([run(1, 2)], { best: null }))).toMatchObject({ roundBest: 2, priorBest: null, delta: null });
  });
  it("takes the lowest result as best when the campaign goal is minimize", () => {
    const l = roundLesson(campaign([run(1.75, 1.64, { id: "a" }), run(1.7, 1.5, { id: "b" })], { goal: "minimize", best: 1.42 }));
    expect(l).toMatchObject({ goal: "minimize", roundBest: 1.5, roundBestRun: "b" });
    expect(l.delta).toBeCloseTo(0.08);
    expect(goalOf({})).toBe("maximize");
  });
  it("says above, below or equal to (a comparison, not a verdict)", () => {
    expect([compareWord(0.1), compareWord(-0.1), compareWord(0)]).toEqual(["above", "below", "equal to"]);
  });
});

describe("syncNote", () => {
  it("says how many recorded results the analysis predates", () => {
    expect(syncNote(campaign([run(1, 2), run(1, 3), run(1, null)], { analysis_in_sync: false }))).toBe(
      "The current analysis predates 2 recorded results. Re-analyze to fold them into the model.",
    );
  });
  it("says nothing when in sync, unreported, or only runs were started", () => {
    expect(syncNote(campaign([run(1, 2)], { analysis_in_sync: true }))).toBeNull();
    expect(syncNote(campaign([run(1, 2)]))).toBeNull();
    expect(syncNote(campaign([run(1, null)], { analysis_in_sync: false }))).toBeNull();
  });
});

describe("canPlanNext / reanalyzeBlock", () => {
  const base = { running: false, uploadActive: false, archived: false, saving: false };
  it("is off without a campaign or with nothing measured", () => {
    expect(canPlanNext(null)).toBe(false);
    expect(canPlanNext(campaign([]))).toBe(false);
    expect(canPlanNext(campaign([run(5, null)]))).toBe(false);
  });
  it("is on with at least one measured result, even if others still await", () => {
    expect(canPlanNext(campaign([run(5, null), run(5, 4)]))).toBe(true);
    expect(reanalyzeBlock({ ...base, campaign: campaign([run(5, null), run(5, 4)]) })).toBeNull();
  });
  it("names why it is blocked, archived first", () => {
    const c = campaign([run(5, 4)]);
    expect(reanalyzeBlock({ ...base, campaign: campaign([run(5, null)]) })).toMatch(/Record at least one measured result/);
    expect(reanalyzeBlock({ ...base, campaign: c, uploadActive: true })).toMatch(/upload is being analyzed/);
    expect(reanalyzeBlock({ ...base, campaign: c, running: true })).toMatch(/already running/);
    expect(reanalyzeBlock({ ...base, campaign: c, saving: true })).toMatch(/being saved/);
    expect(reanalyzeBlock({ ...base, campaign: c, archived: true, running: true })).toMatch(/archived/);
  });
});

describe("reanalysisErrorCopy / reanalysisFailure", () => {
  it("engine busy and rate limits: wait, no instant retry", () => {
    const f = reanalysisFailure(new EngineError(503, "engine_busy"));
    expect(f.retry).toBe(false);
    expect(f.message).toMatch(/about a minute/);
    expect(reanalysisErrorCopy({ code: "rate_limited", message: null }).retry).toBe(false);
  });
  it("conflict (a job error): the campaign changed while re-analyzing, nothing was written, retry", () => {
    const f = reanalysisErrorCopy({ code: "conflict", message: "the campaign was written meanwhile" });
    expect(f.retry).toBe(true);
    expect(f.message).toMatch(/The campaign changed while re-analyzing/);
    expect(f.message).toMatch(/nothing was written/);
  });
  it("has plain copy for every job code, never the raw code", () => {
    for (const code of ["nothing_to_fold", "job_pending", "rate_limited", "timeout", "fit_failed", "analysis_failed", "interrupted", "worker_exited"]) {
      const f = reanalysisErrorCopy({ code, message: null });
      expect(f.message).not.toContain(code);
      expect(f.message.length).toBeGreaterThan(20);
    }
    expect(reanalysisErrorCopy({ code: "nothing_to_fold" }).message).toMatch(/Record at least one result/);
    expect(reanalysisErrorCopy({ code: "job_pending" }).message).toMatch(/already queued or running/);
    expect(reanalysisErrorCopy({ code: "fit_failed" }).message).toMatch(/nothing was written/);
  });
  it("other failures use the shared copy (or the engine's sentence) and never show the raw code", () => {
    const f = reanalysisFailure(new EngineError(400, "target_constant"));
    expect(f.message).toMatch(/never changes/);
    expect(f.message).not.toMatch(/target_constant/);
    expect(reanalysisErrorCopy({ code: "some_new_code", message: "The engine says why." }).message).toMatch(/^The engine says why\./);
    expect(reanalysisFailure(new TypeError("x")).message).toMatch(/did not respond/);
  });
});

describe("correctionProblem", () => {
  it("needs a number different from the recorded one", () => {
    expect(correctionProblem(1.62, null, "why")).toMatch(/number/);
    expect(correctionProblem(1.62, 1.62, "why")).toMatch(/already recorded/);
  });
  it("needs a reason (the engine refuses a correction without one) of bounded length", () => {
    expect(correctionProblem(1.62, 1.64, "   ")).toMatch(/Say why/);
    expect(correctionProblem(1.62, 1.64, "x".repeat(MAX_REASON + 1))).toMatch(/256 characters or fewer/);
    expect(correctionProblem(1.62, 1.64, "dilution error")).toBeNull();
  });
  it("counts and trims the reason the way the engine does (code points, Python str.strip())", () => {
    // 256 supplementary characters are 512 UTF-16 units but 256 characters to the engine.
    expect(correctionProblem(1.62, 1.64, "\u{1F9EA}".repeat(MAX_REASON))).toBeNull();
    expect(correctionProblem(1.62, 1.64, "\u{1F9EA}".repeat(MAX_REASON + 1))).toMatch(/256 characters or fewer/);
    // NEL and the \x1c-\x1f separators are blank to the engine; a BOM is not.
    for (const blank of ["\u0085", "\u001c", "\u0085\u001c "]) expect(correctionProblem(1.62, 1.64, blank)).toMatch(/Say why/);
    expect(correctionProblem(1.62, 1.64, "\ufeff")).toBeNull();
  });
});

describe("resultHistory", () => {
  it("uses the engine's own history fields when the run carries them", () => {
    const r = run(1.75, 1.64, { result_version: 2, previous_result: 1.62, result_reason: "dilution" });
    expect(resultHistory(r)).toEqual({ version: 2, previous: 1.62, reason: "dilution", source: "engine" });
  });
  it("fills in a correction made in this session, only while the value still matches", () => {
    const r = run(1.75, 1.64, { result_version: 2 });
    expect(resultHistory(r, { previous: 1.62, value: 1.64, reason: "dilution" })).toEqual({ version: 2, previous: 1.62, reason: "dilution", source: "session" });
    expect(resultHistory(r, { previous: 1.62, value: 1.7, reason: "dilution" }).source).toBeNull();
  });
  it("uses the engine's result history row for the run's current version", () => {
    const r = run(1.75, 1.68, { id: "x", result_version: 2 });
    const rows = latestHistoryRows([
      { run_id: "x", version: 1, value: 1.6, previous_value: null, reason: null },
      { run_id: "x", version: 2, value: 1.68, previous_value: 1.6, reason: "re-read plate" },
    ]);
    expect(resultHistory(r, undefined, rows.get("x"))).toEqual({ version: 2, previous: 1.6, reason: "re-read plate", source: "history" });
    // A row for an older version (the summary moved on) is not used.
    expect(resultHistory({ ...r, result_version: 3, result: 1.7 }, undefined, rows.get("x")).source).toBeNull();
  });
  it("reports unknown history as unknown, never guessed", () => {
    expect(resultHistory(run(1.75, 1.64, { result_version: 2 }))).toEqual({ version: 2, previous: null, reason: null, source: null });
  });
});

describe("promotionLine", () => {
  const promo = (passed: boolean, failures: string[]): Promotion => ({ passed, failures, metrics: {}, summary: "", meaning: "" });
  it("is null when cleared or not reported", () => {
    expect(promotionLine(undefined)).toBeNull();
    expect(promotionLine(promo(true, []))).toBeNull();
  });
  it("says the first failing check in plain words with one fix, never the raw gate text", () => {
    const line = promotionLine(promo(false, ["feasibility_auc=0.625 < min 0.65", "ece=0.2 > max 0.15"]));
    expect(line).toBe("Not cleared to promote: it cannot yet tell feasible recipes from infeasible ones (1 more check also fell short). Add runs that include some that failed or produced nothing.");
    expect(line).not.toMatch(/auc|ece|0\.65/);
  });
  it("explains an unmeasurable gate as unmeasured", () => {
    expect(promotionLine(promo(false, ["feasibility_auc missing/NaN (unmeasured)"]))).toContain("could not be measured on this data");
  });
});
