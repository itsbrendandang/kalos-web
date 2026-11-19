import { describe, expect, it } from "vitest";
import type { Driver, LatestResult } from "@/lib/api";
import { analysisSource, bestReached, bestSoFarSeries, historyLabel, newerBest, niceTicks, topDrivers } from "@/lib/overview";

const d = (name: string, rho: number, ci95: [number, number], significant: boolean): Driver => ({ name, rho, ci95, significant });

describe("topDrivers", () => {
  it("ranks by absolute correlation and keeps the engine's significance verdict", () => {
    const bars = topDrivers([d("pH", 0.2, [0.05, 0.35], true), d("Temp_C", -0.6, [-0.8, -0.3], true), d("Feed", 0.4, [-0.1, 0.7], false)], 2);
    expect(bars.map((b) => b.name)).toEqual(["Temp_C", "Feed"]);
    expect(bars[1].significant).toBe(false);
  });

  it("turns the CI into distances below and above rho", () => {
    const [bar] = topDrivers([d("pH", 0.4, [0.1, 0.6], true)]);
    expect(bar.ci[0]).toBeCloseTo(0.3);
    expect(bar.ci[1]).toBeCloseTo(0.2);
    expect([bar.lo, bar.hi]).toEqual([0.1, 0.6]);
  });
});

describe("bestSoFarSeries", () => {
  it("is the measured history, one point per round, gaps kept", () => {
    const s = bestSoFarSeries({ history: [{ round: 0, best: 4.6, n_base: 24 }, { round: 1, best: null, n_base: 26 }] });
    expect(s).toEqual([
      { round: 0, best: 4.6, runs: 24 },
      { round: 1, best: null, runs: 26 },
    ]);
  });

  it("names round 0 as the uploaded sheet", () => {
    expect(historyLabel(0)).toBe("Uploaded sheet");
    expect(historyLabel(2)).toBe("Round 2");
  });
});

describe("bestReached", () => {
  const history = [
    { round: 0, best: 4.6, n_base: 24 },
    { round: 1, best: 5.1, n_base: 29 },
    { round: 2, best: 5.1, n_base: 34 },
  ];

  it("is the first round whose measured best equals the current best", () => {
    expect(bestReached({ best: 5.1, history })).toEqual({ round: 1, runs: 29 });
  });

  it("is null without a measured best, or when the history never reports it (never guessed)", () => {
    expect(bestReached({ best: null, history })).toBeNull();
    expect(bestReached({ best: 6, history })).toBeNull();
  });
});

describe("analysisSource", () => {
  const base = { has_data: true, dataset: "runs.csv", updated: 1700000001, timestamp: 1700000000, engine_version: "0.1.0" } as unknown as LatestResult;

  it("reads dataset, time, engine version and the proposal provenance hash", () => {
    const latest = { ...base, proposal_provenance: { provenance_sha256: "abc123" } } as unknown as LatestResult;
    expect(analysisSource(latest)).toEqual({ dataset: "runs.csv", timestamp: 1700000000, engineVersion: "0.1.0", provenance: "abc123" });
  });

  it("uses a started run's hash only when it was stamped by this same analysis", () => {
    const same = [{ analysis_provenance: { provenance_sha256: "run-hash", timestamp: 1700000000 } }];
    const older = [{ analysis_provenance: { provenance_sha256: "old-hash", timestamp: 1600000000 } }];
    expect(analysisSource(base, same).provenance).toBe("run-hash");
    expect(analysisSource(base, older).provenance).toBeNull();
  });

  it("is all null without an analysis, and missing fields stay null", () => {
    expect(analysisSource({ has_data: false })).toEqual({ dataset: null, timestamp: null, engineVersion: null, provenance: null });
    expect(analysisSource(null).provenance).toBeNull();
    const bare = { has_data: true, dataset: "runs.csv", updated: 5 } as unknown as LatestResult;
    expect(analysisSource(bare)).toEqual({ dataset: "runs.csv", timestamp: 5, engineVersion: null, provenance: null });
  });
});

describe("niceTicks", () => {
  it("covers the range with round steps", () => {
    const t = niceTicks(1.03, 1.42, 4);
    expect(t[0]).toBeLessThanOrEqual(1.03);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(1.42);
    const steps = t.slice(1).map((v, i) => +(v - t[i]).toFixed(9));
    expect(new Set(steps).size).toBe(1);
    expect([0.1, 0.2, 0.25, 0.5, 1]).toContain(steps[0]);
  });

  it("gives a flat series a visible span instead of a zero-height axis", () => {
    const t = niceTicks(5, 5);
    expect(t[0]).toBeLessThan(5);
    expect(t[t.length - 1]).toBeGreaterThan(5);
  });

  it("returns no ticks for non-finite input", () => {
    expect(niceTicks(Infinity, -Infinity)).toEqual([]);
  });
});

describe("newerBest", () => {
  const run = (id: string, result: number | null, awaiting = result == null) =>
    ({ id, recipe: {}, pred: 1, std: 0.1, mode: "exploit" as const, reason: "", result, awaiting });

  it("is the highest recorded result not yet in the model, only when it beats the model's best", () => {
    expect(newerBest({ best: 1.42, pending: [run("a", 1.62), run("b", 1.5), run("c", null)] })).toEqual({ value: 1.62, runId: "a" });
    expect(newerBest({ best: 1.7, pending: [run("a", 1.62)] })).toBeNull();
  });

  it("ignores awaiting runs and is null when nothing is recorded", () => {
    expect(newerBest({ best: 1, pending: [run("a", null)] })).toBeNull();
    expect(newerBest({ best: null, pending: [run("a", 0.5)] })).toEqual({ value: 0.5, runId: "a" });
  });
});
