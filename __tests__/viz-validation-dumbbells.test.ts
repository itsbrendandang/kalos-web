import { describe, expect, it } from "vitest";
import type { CampaignRun } from "@/lib/api";
import {
  bandCheck,
  bandMissingReason,
  bandSourceLabel,
  describeDumbbells,
  dumbbellDomain,
  dumbbellTable,
  fmtInterval,
  fmtResidual,
  hitRateText,
  measuredUncertainty,
  paginateGroups,
  toDumbbellData,
  unscoredText,
  type DumbbellAnalysis,
} from "@/lib/viz-data/validation-dumbbells";

/*
 * C10 adapter: engine runs -> dumbbell rows. Shapes follow the live engine
 * (round 0 on the engine = round 1 for people, a band of half-width 0.2036 at
 * 90% recorded with each run when it started, `residual`/`inside_band` from the
 * engine), where 2 runs are measured (one a corrected v2) and 3 await a result.
 */
const HASH = "9836c009efd80007";
const fromCurrent = { analysis_provenance: { provenance_sha256: HASH, timestamp: 1000 } };
const fromEarlier = { analysis_provenance: { provenance_sha256: "older", timestamp: 500 } };
const analysis = (over: Partial<DumbbellAnalysis> = {}): DumbbellAnalysis => ({
  conformal_q: 0.2036, conformal_coverage: 0.9, timestamp: 1000, proposal_provenance: { provenance_sha256: HASH }, ...over,
});
/** A legacy run (started before the engine recorded predictions): `prediction_at_start` null. */
const run = (id: string, pred: number, result: number | null, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id, recipe: {}, pred, std: 0.07, mode: "exploit", reason: "", result, awaiting: result == null, round: 0, ...fromCurrent, ...over,
});
/** A run started since R5: the engine's prediction and band recorded at start, its residual and inside_band. */
const rec = (id: string, pred: number, result: number | null, over: Partial<CampaignRun> = {}, coverage = 0.9): CampaignRun =>
  run(id, pred, result, {
    pred_source: "engine",
    prediction_at_start: {
      available: true, basis: "predicted", pred, std: 0.07,
      interval: { lo: pred - 0.2036, hi: pred + 0.2036, half_width: 0.2036, coverage, method: "conformal_global" }, interval_unavailable_reason: null,
    },
    residual: result == null ? null : result - pred,
    inside_band: result == null ? null : Math.abs(result - pred) <= 0.2036,
    ...over,
  });
const callerRun = (id: string, pred: number, result: number | null): CampaignRun =>
  run(id, pred, result, { pred_source: "caller", prediction_at_start: { available: false, reason: "recipe is not one of the published proposals; the engine has no prediction recorded for it" } });

const live = [
  rec("60ad5599d4", 1.75, 1.64, { result_version: 2 }),
  rec("ba5d212105", 1.736, null),
  rec("f9ce16754d", 1.732, null),
  rec("5d19cdeb15", 1.728, null),
  rec("f7a48e5666", 1.715, 1.5),
];

describe("toDumbbellData", () => {
  // The analysis deliberately has a different band: recorded runs never borrow it.
  const d = toDumbbellData(live, analysis({ conformal_q: 0.9 }));

  it("maps every started run with the band recorded at start, the engine's residual and inside/outside", () => {
    expect(d.runs).toHaveLength(5);
    expect(d.measured).toBe(2);
    expect(d.awaiting).toBe(3);
    const [a, , , , e] = d.runs;
    expect(a.round).toBe(1); // engine round 0 is round 1 for people
    expect(a.bandSource).toBe("recorded");
    expect(a.interval).toMatchObject({ coverage: 0.9, method: "conformal" });
    expect(a.interval!.lo).toBeCloseTo(1.5464);
    expect(a.interval!.hi).toBeCloseTo(1.9536);
    expect(a.residual).toBeCloseTo(-0.11);
    expect(a.inside).toBe(true);
    expect(e.residual).toBeCloseTo(-0.215);
    expect(e.inside).toBe(false); // |-0.215| > 0.2036
    expect(d.runs[1]).toMatchObject({ awaiting: true, result: null, residual: null, inside: null });
    expect(d.bandNote).toBe("Each band was recorded by the engine when the run started.");
  });

  it("uses the engine's residual and inside_band as sent, never recomputing them", () => {
    const x = toDumbbellData([rec("a", 1.75, 1.64, { residual: -0.1101, inside_band: false })], analysis());
    expect(x.runs[0].residual).toBe(-0.1101);
    expect(x.runs[0].inside).toBe(false);
  });

  it("counts the hit rate exactly over runs with a recorded band, and says so", () => {
    expect(d.hit).toEqual({ inside: 1, total: 2, unscored: 0 });
    expect(hitRateText(d.hit!, d.coverage)).toBe("1 of 2 inside the 90% band recorded when they started (50%)");
    expect(d.meanAbsResidual).toBeCloseTo((0.11 + 0.215) / 2);
  });

  it("prints residuals as measured − predicted with a U+2212 minus and shared decimals", () => {
    expect(d.decimals).toEqual({ pred: 2, measured: 2, residual: 2 });
    expect(fmtResidual(d, d.runs[0], null).text).toBe("\u22120.11");
    expect(fmtResidual(d, d.runs[4], "g/L").text).toBe("\u22120.22\u00A0g/L");
    expect(fmtInterval(d, d.runs[0])).toBe("[1.55, 1.95]");
  });

  it("caller-predicted run: no engine prediction, no band, no residual; the measured value only, with the engine's reason", () => {
    const x = toDumbbellData([callerRun("c", 1.9, 1.7), rec("b", 1.75, 1.64)], analysis());
    expect(x.runs[0]).toMatchObject({ pred: null, callerPred: 1.9, interval: null, residual: null, inside: null, bandWhy: "no-engine-prediction" });
    expect(bandMissingReason(x.runs[0])).toMatch(/recipe is not one of the published proposals/);
    expect(bandCheck(x.runs[0])).toBe("no engine prediction");
    expect(x.callerPredicted).toBe(1);
    expect(x.hit).toEqual({ inside: 1, total: 1, unscored: 1 });
    // The caller's number never stretches the axis as if it were a prediction.
    expect(dumbbellDomain(x.runs)![1]).toBeCloseTo(1.9536);
    const t = dumbbellTable(x, { unit: null });
    expect(t.rows[0][4]).toBe("No engine prediction");
    expect(describeDumbbells(x, { target: "t", unit: null })).toContain("1 run has no engine prediction");
  });

  it("legacy run: the current analysis' band, labelled, and left out of the hit rate", () => {
    const x = toDumbbellData([run("a", 1.75, 1.64), rec("b", 1.715, 1.5)], analysis());
    expect(x.runs[0]).toMatchObject({ bandSource: "current-analysis", inside: true });
    expect(bandSourceLabel(x.runs[0])).toMatch(/current analysis/);
    expect(x.legacy).toBe(1);
    expect(x.hit).toEqual({ inside: 0, total: 1, unscored: 1 });
    expect(unscoredText(x.hit!)).toBe("1 measured run without a band recorded at start is left out.");
    expect(x.bandNote).toMatch(/runs started before that show the current analysis' band/);
    expect(dumbbellTable(x, { unit: null }).rows[0][6]).toBe("current analysis");
  });

  it("legacy run from another analysis: band n/a (never a borrowed band)", () => {
    const x = toDumbbellData([run("a", 1.7, 1.7, fromEarlier), rec("b", 1.75, 1.64)], analysis());
    expect(x.runs[0]).toMatchObject({ interval: null, bandWhy: "other-analysis", inside: null });
    expect(bandCheck(x.runs[0])).toBe("band n/a");
    expect(x.hit).toEqual({ inside: 1, total: 1, unscored: 1 });
  });

  it("with no band at all: no intervals, no hit rate, residuals still there", () => {
    const legacy = live.map((r) => ({ ...r, prediction_at_start: null, pred_source: null, residual: null, inside_band: null }));
    const x = toDumbbellData(legacy, analysis({ conformal_q: null }));
    expect(x.bandAvailable).toBe(false);
    expect(x.hit).toBeNull();
    expect(x.runs.every((r) => r.interval == null)).toBe(true);
    expect(x.runs[0].residual).toBeCloseTo(-0.11);
    expect(toDumbbellData(legacy, null).bandAvailable).toBe(false);
  });

  it("never invents a coverage", () => {
    const x = toDumbbellData([rec("a", 1.75, 1.64, {}, Number.NaN), rec("b", 1.715, 1.5, {}, Number.NaN)], analysis());
    expect(x.coverage).toBeNull();
    expect(hitRateText(x.hit!, x.coverage)).toBe("1 of 2 inside the band recorded when they started (50%)");
    // Mixed coverages: no single coverage is claimed for the chart.
    expect(toDumbbellData([rec("a", 1.75, 1.64), rec("b", 1.715, 1.5, {}, 0.95)], analysis()).coverage).toBeNull();
  });

  it("groups by round, newest first, with a missing round last", () => {
    const x = toDumbbellData([run("a", 1, 1, { round: 0 }), run("b", 1, null, { round: 2 }), run("c", 1, null, { round: undefined }), run("d", 1, 1, { round: 1 })], analysis());
    expect(x.groups.map((g) => g.round)).toEqual([3, 2, 1, null]);
  });

  it("uses the replicate noise for measured precision only when the fit was replicate-aware", () => {
    expect(measuredUncertainty(analysis({ noise: { replicate_aware: true, noise_sd: 0.031 } }))).toBe(0.031);
    expect(measuredUncertainty(analysis({ noise: { replicate_aware: false, noise_sd: 0.031 } }))).toBeNull();
    expect(measuredUncertainty(analysis())).toBeNull();
  });
});

describe("dumbbellDomain", () => {
  it("includes every interval end and measured result, so nothing is clipped", () => {
    const [lo, hi] = dumbbellDomain(toDumbbellData(live, analysis()).runs)!;
    expect(lo).toBe(1.5);
    expect(hi).toBeCloseTo(1.9536);
  });
  it("pads a single value and is null with nothing to place", () => {
    const [lo, hi] = dumbbellDomain(toDumbbellData([run("a", 2, null, { analysis_provenance: null })], analysis()).runs)!;
    expect(lo).toBeLessThan(2);
    expect(hi).toBeGreaterThan(2);
    expect(dumbbellDomain([])).toBeNull();
  });
});

describe("paginateGroups", () => {
  it("keeps whole rounds together, newest first, under the cap", () => {
    const groups = [3, 2, 1].map((round) => ({ round, runs: Array.from({ length: 30 }, (_, i) => toDumbbellData([run(`r${round}-${i}`, 1, null)], analysis()).runs[0]) }));
    const pages = paginateGroups(groups, 50);
    expect(pages.map((p) => p.map((g) => g.round))).toEqual([[3], [2], [1]]);
    expect(paginateGroups(groups.slice(0, 1), 50)).toHaveLength(1);
  });
});

describe("describeDumbbells / dumbbellTable", () => {
  const d = toDumbbellData(live, analysis());
  it("describes the chart in plain words with the exact counts", () => {
    const text = describeDumbbells(d, { target: "titer_g_L", unit: null });
    expect(text).toContain("Predicted against measured titer_g_L for 5 started runs in round 1: 2 measured, 3 awaiting a result.");
    expect(text).toContain("1 of 2 inside the 90% band recorded when they started (50%).");
    expect(text).toContain("Run 60ad559: predicted 1.75 [1.55, 1.95], measured 1.64 (\u22120.11, inside).");
    expect(text).toContain("Run ba5d212: predicted 1.74 [1.53, 1.94], awaiting a result.");
    expect(text).not.toMatch(/95%|±/);
  });
  it("says so when nothing has started or there is no band", () => {
    expect(describeDumbbells(toDumbbellData([], analysis()), { target: "titer", unit: null })).toBe("No runs started yet for titer.");
    expect(describeDumbbells(toDumbbellData([run("a", 1.75, 1.64)], null), { target: "t", unit: null })).toContain("No run has a prediction band.");
  });
  it("tabulates every plotted value, measured before predicted, with the engine's coverage in the header", () => {
    const t = dumbbellTable(d, { unit: "g/L" });
    expect(t.columns).toEqual(["Run", "Round", "Mode", "Measured (g/L)", "Predicted (g/L)", "90% band", "Band from", "Measured − predicted", "Band check"]);
    expect(t.rows[0]).toEqual(["60ad559", "1", "exploit", "1.64", "1.75", "[1.55, 1.95]", "recorded at start", "\u22120.11", "inside"]);
    expect(t.rows[1]).toEqual(["ba5d212", "1", "exploit", "Awaiting result", "1.74", "[1.53, 1.94]", "recorded at start", "Awaiting result", "awaiting"]);
    expect(t.rows[4][8]).toBe("outside");
    const noBand = dumbbellTable(toDumbbellData([run("a", 1.75, 1.64)], null), { unit: null });
    expect(noBand.columns).toEqual(["Run", "Round", "Mode", "Measured", "Predicted", "Measured − predicted"]);
  });
});
