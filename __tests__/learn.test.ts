import { describe, expect, it } from "vitest";
import type { CampaignRun, Promotion } from "@/lib/api";
import {
  bandCalibration,
  bandOutcome,
  calibrationSentence,
  canPlanNext,
  compareWord,
  comparisonScale,
  correctionProblem,
  MAX_REASON,
  promotionLine,
  reanalysisFailure,
  reanalyzeBlock,
  resultHistory,
  roundCalibration,
  roundLesson,
  runBand,
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
    expect(calibrationSentence({ inside: 3, total: 5 }, 0.9)).toBe("3 of 5 measured runs landed inside their predicted band (90%).");
  });
  it("omits the coverage rather than guessing it", () => {
    expect(calibrationSentence({ inside: 3, total: 5 })).toBe("3 of 5 measured runs landed inside their predicted band.");
  });
});

describe("runBand: which band applies to a run", () => {
  it("is the current analysis' band for a run it proposed, with the engine's coverage", () => {
    expect(runBand(run(1.75, null, fromCurrent), analysis())).toEqual({ halfWidth: 0.2, coverage: 0.9 });
  });
  it("falls back to the analysis timestamp when either side has no hash", () => {
    const r = run(1.75, null, { analysis_provenance: { timestamp: 1000 } });
    expect(runBand(r, analysis()).halfWidth).toBe(0.2);
    expect(runBand(r, analysis({ timestamp: 2000 })).why).toBe("other-analysis");
  });
  it("shows no band for a run an earlier analysis proposed (its band was not stored)", () => {
    expect(runBand(run(1.75, null, fromEarlier), analysis())).toEqual({ halfWidth: null, coverage: null, why: "other-analysis" });
  });
  it("shows no band when the run does not say where it came from", () => {
    expect(runBand(run(1.75, null), analysis()).why).toBe("unknown");
  });
  it("shows no band when the analysis has none, and never invents a coverage", () => {
    expect(runBand(run(1.75, null, fromCurrent), analysis({ conformal_q: null })).why).toBe("no-band");
    expect(runBand(run(1.75, null, fromCurrent), null).why).toBe("no-band");
    expect(runBand(run(1.75, null, fromCurrent), analysis({ conformal_coverage: undefined }))).toEqual({ halfWidth: 0.2, coverage: null });
  });
});

describe("bandOutcome", () => {
  const band = { halfWidth: 0.2, coverage: 0.9 } as const;
  it("is inside at the edge and outside beyond it", () => {
    expect(bandOutcome(run(1.75, 1.95, fromCurrent), band)).toBe("inside");
    expect(bandOutcome(run(1.715, 1.5, fromCurrent), band)).toBe("outside");
  });
  it("is null when awaiting or without a band", () => {
    expect(bandOutcome(run(1.75, null), band)).toBeNull();
    expect(bandOutcome(run(1.75, 1.7), { halfWidth: null, coverage: null, why: "unknown" })).toBeNull();
  });
});

describe("roundCalibration", () => {
  it("scores only measured runs with a known band and counts the rest as unscored", () => {
    const runs = [run(1.75, 1.64, fromCurrent), run(1.715, 1.5, fromCurrent), run(1.7, 1.7, fromEarlier), run(1.7, null, fromCurrent)];
    expect(roundCalibration(runs, analysis())).toEqual({ inside: 1, total: 2, unscored: 1 });
  });
  it("is null without a band", () => {
    expect(roundCalibration([run(1, 1, fromCurrent)], analysis({ conformal_q: null }))).toBeNull();
  });
});

describe("comparisonScale", () => {
  it("covers every prediction band and measured value on round ticks", () => {
    const s = comparisonScale([{ pred: 1.75, halfWidth: 0.2, result: 1.64 }, { pred: 1.715, halfWidth: 0.2, result: 1.5 }])!;
    expect(s.lo).toBeLessThanOrEqual(1.5);
    expect(s.hi).toBeGreaterThanOrEqual(1.95);
    expect(s.ticks[0]).toBe(s.lo);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.hi);
    expect(s.ticks.length).toBeGreaterThanOrEqual(3);
  });
  it("gives a flat set a readable span, and nothing finite no scale", () => {
    const s = comparisonScale([{ pred: 2, halfWidth: null, result: 2 }])!;
    expect(s.lo).toBeLessThan(2);
    expect(s.hi).toBeGreaterThan(2);
    expect(comparisonScale([])).toBeNull();
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

describe("reanalysisFailure", () => {
  it("engine busy: wait a minute, no instant retry", () => {
    const f = reanalysisFailure(new EngineError(503, "engine_busy"));
    expect(f.retry).toBe(false);
    expect(f.message).toMatch(/about a minute/);
  });
  it("conflict: nothing saved, retry", () => {
    const f = reanalysisFailure(new EngineError(409, "conflict"));
    expect(f.retry).toBe(true);
    expect(f.message).toMatch(/nothing was saved/);
  });
  it("other failures use the shared copy and never show the raw code", () => {
    const f = reanalysisFailure(new EngineError(400, "target_constant"));
    expect(f.message).toMatch(/never changes/);
    expect(f.message).not.toMatch(/target_constant/);
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
    expect(correctionProblem(1.62, 1.64, "x".repeat(MAX_REASON + 1))).toMatch(/under 256/);
    expect(correctionProblem(1.62, 1.64, "dilution error")).toBeNull();
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
