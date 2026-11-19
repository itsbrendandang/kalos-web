import { describe, expect, it } from "vitest";
import type { CampaignRun } from "@/lib/api";
import {
  bandCheck,
  describeDumbbells,
  dumbbellDomain,
  dumbbellTable,
  fmtInterval,
  fmtResidual,
  hitRateText,
  measuredUncertainty,
  paginateGroups,
  toDumbbellData,
  type DumbbellAnalysis,
} from "@/lib/viz-data/validation-dumbbells";

/*
 * C10 adapter: engine runs -> dumbbell rows. Shapes follow the live default
 * campaign (round 0 on the engine = round 1 for people, conformal_q 0.2036 at
 * 90%), where 2 runs are measured (one a corrected v2) and 3 await a result.
 */
const HASH = "9836c009efd80007";
const fromCurrent = { analysis_provenance: { provenance_sha256: HASH, timestamp: 1000 } };
const fromEarlier = { analysis_provenance: { provenance_sha256: "older", timestamp: 500 } };
const analysis = (over: Partial<DumbbellAnalysis> = {}): DumbbellAnalysis => ({
  conformal_q: 0.2036, conformal_coverage: 0.9, timestamp: 1000, proposal_provenance: { provenance_sha256: HASH }, ...over,
});
const run = (id: string, pred: number, result: number | null, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id, recipe: {}, pred, std: 0.07, mode: "exploit", reason: "", result, awaiting: result == null, round: 0, ...fromCurrent, ...over,
});

const live = [
  run("60ad5599d4", 1.75, 1.64, { result_version: 2 }),
  run("ba5d212105", 1.736, null),
  run("f9ce16754d", 1.732, null),
  run("5d19cdeb15", 1.728, null),
  run("f7a48e5666", 1.715, 1.5),
];

describe("toDumbbellData", () => {
  const d = toDumbbellData(live, analysis());

  it("maps every started run with the current band, residual and inside/outside", () => {
    expect(d.runs).toHaveLength(5);
    expect(d.measured).toBe(2);
    expect(d.awaiting).toBe(3);
    const [a, , , , e] = d.runs;
    expect(a.round).toBe(1); // engine round 0 is round 1 for people
    expect(a.interval).toMatchObject({ coverage: 0.9, method: "conformal" });
    expect(a.interval!.lo).toBeCloseTo(1.5464);
    expect(a.interval!.hi).toBeCloseTo(1.9536);
    expect(a.residual).toBeCloseTo(-0.11);
    expect(a.inside).toBe(true);
    expect(e.residual).toBeCloseTo(-0.215);
    expect(e.inside).toBe(false); // |-0.215| > 0.2036
    expect(d.runs[1]).toMatchObject({ awaiting: true, result: null, residual: null, inside: null });
  });

  it("counts the hit rate exactly over measured runs that have a band", () => {
    expect(d.hit).toEqual({ inside: 1, total: 2, unscored: 0 });
    expect(hitRateText(d.hit!, d.coverage)).toBe("1 of 2 inside the 90% band (50%)");
    expect(d.meanAbsResidual).toBeCloseTo((0.11 + 0.215) / 2);
  });

  it("prints residuals as measured − predicted with a U+2212 minus and shared decimals", () => {
    expect(d.decimals).toEqual({ pred: 2, measured: 2, residual: 2 });
    expect(fmtResidual(d, d.runs[0], null).text).toBe("\u22120.11");
    expect(fmtResidual(d, d.runs[4], "g/L").text).toBe("\u22120.22\u00A0g/L");
    expect(fmtInterval(d, d.runs[0])).toBe("[1.55, 1.95]");
  });

  it("shows band n/a (never a borrowed band) for a run another analysis proposed", () => {
    const x = toDumbbellData([run("a", 1.7, 1.7, fromEarlier), run("b", 1.75, 1.64)], analysis());
    expect(x.runs[0]).toMatchObject({ interval: null, bandWhy: "other-analysis", inside: null });
    expect(bandCheck(x.runs[0])).toBe("band n/a");
    expect(x.hit).toEqual({ inside: 1, total: 1, unscored: 1 });
  });

  it("with no band at all: no intervals, no hit rate, residuals still there", () => {
    const x = toDumbbellData(live, analysis({ conformal_q: null }));
    expect(x.bandAvailable).toBe(false);
    expect(x.hit).toBeNull();
    expect(x.runs.every((r) => r.interval == null)).toBe(true);
    expect(x.runs[0].residual).toBeCloseTo(-0.11);
    expect(toDumbbellData(live, null).bandAvailable).toBe(false);
  });

  it("never invents a coverage", () => {
    const x = toDumbbellData(live, analysis({ conformal_coverage: undefined }));
    expect(x.coverage).toBeNull();
    expect(hitRateText(x.hit!, x.coverage)).toBe("1 of 2 inside the band (50%)");
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
    expect(text).toContain("1 of 2 inside the 90% band (50%).");
    expect(text).toContain("Run 60ad559: predicted 1.75 [1.55, 1.95], measured 1.64 (\u22120.11, inside).");
    expect(text).toContain("Run ba5d212: predicted 1.74 [1.53, 1.94], awaiting a result.");
    expect(text).not.toMatch(/95%|±/);
  });
  it("says so when nothing has started or there is no band", () => {
    expect(describeDumbbells(toDumbbellData([], analysis()), { target: "titer", unit: null })).toBe("No runs started yet for titer.");
    expect(describeDumbbells(toDumbbellData(live, null), { target: "t", unit: null })).toContain("The analysis reported no prediction band.");
  });
  it("tabulates every plotted value, measured before predicted, with the engine's coverage in the header", () => {
    const t = dumbbellTable(d, { unit: "g/L" });
    expect(t.columns).toEqual(["Run", "Round", "Mode", "Measured (g/L)", "Predicted (g/L)", "90% band", "Measured − predicted", "Band check"]);
    expect(t.rows[0]).toEqual(["60ad559", "1", "exploit", "1.64", "1.75", "[1.55, 1.95]", "\u22120.11", "inside"]);
    expect(t.rows[1]).toEqual(["ba5d212", "1", "exploit", "Awaiting result", "1.74", "[1.53, 1.94]", "Awaiting result", "awaiting"]);
    expect(t.rows[4][7]).toBe("outside");
    const noBand = dumbbellTable(toDumbbellData(live, null), { unit: null });
    expect(noBand.columns).toEqual(["Run", "Round", "Mode", "Measured", "Predicted", "Measured − predicted"]);
  });
});
