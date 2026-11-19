import { describe, expect, it } from "vitest";
import type { Driver, LatestResult } from "@/lib/api";
import { analysisSource, bestReached, bestTile, historyLabel, newerBest, nextTile, runsTile, topDrivers } from "@/lib/overview";

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

describe("historyLabel", () => {
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

describe("hero tiles", () => {
  const history = [
    { round: 0, best: 1.422, n_base: 160 },
    { round: 1, best: 1.61, n_base: 165 },
  ];

  it("best tile: measured best with the delta vs the previous round, named", () => {
    const t = bestTile({ best: 1.61, history, round: 1 }, { noise: undefined });
    expect(t.value).toBe(1.61);
    expect(t.label).toBe("best measured run");
    expect(t.delta).toEqual({ current: 1.61, baseline: 1.422, baselineLabel: "the uploaded sheet" });
    expect(t.single).toBeNull();
  });

  it("best tile: a replicate-aware fit headlines the best reproducible recipe, with the best single run beneath", () => {
    const noise = { replicate_aware: true, best_reproducible: 1.5 } as NonNullable<Parameters<typeof bestTile>[1]>["noise"];
    const t = bestTile({ best: 1.61, history, round: 1 }, { noise });
    expect(t).toMatchObject({ value: 1.5, label: "best reproducible recipe", single: 1.61, delta: null });
  });

  it("best tile: no best stays null (n/a), never 0", () => {
    expect(bestTile({ best: null, history: [{ round: 0, best: null, n_base: 3 }], round: 0 }, null).value).toBeNull();
  });

  const analysis = {
    best: 1.61,
    noise: undefined,
    proposals: [
      { vals: [], pred: 1.6, std: 0.04, mode: "exploit" as const, reason: "" },
      { vals: [], pred: 1.7, std: 0.04, mode: "explore" as const, reason: "" },
    ],
    conformal_q: 0.2,
    conformal_coverage: 0.9,
    timestamp: 100,
  };

  it("next tile: the proposed batch's span across its bands, with the top pick", () => {
    const t = nextTile({ target: "y", history, round: 1, pending: [], analysis_in_sync: true }, analysis);
    expect(t.kind).toBe("proposed");
    if (t.kind === "none") throw new Error("unreachable");
    expect(t.lo).toBeCloseTo(1.4);
    expect(t.hi).toBeCloseTo(1.9);
    expect(t.top.pred).toBe(1.7);
    expect(t.coverage).toBe(0.9);
  });

  it("next tile: once the round's batch is started, it reads the started runs (bands only from the current analysis)", () => {
    const pending = [{ id: "a", recipe: {}, pred: 1.65, std: 0.1, mode: "exploit" as const, reason: "", result: null, awaiting: true, round: 1, analysis_provenance: { timestamp: 100 } }];
    const t = nextTile({ target: "y", history, round: 1, pending, analysis_in_sync: false }, analysis);
    expect(t).toMatchObject({ kind: "started", n: 1, withIntervals: true, stale: true });
  });

  it("next tile: none without an analysis", () => {
    expect(nextTile({ target: "y", history, round: 1 }, null).kind).toBe("none");
  });

  it("runs tile: counts from the summary, n/a (null) for anything missing", () => {
    expect(runsTile({ n_base: 165, history, n_measured: 2, n_awaiting: 3 })).toEqual({ inModel: 165, fromUpload: 160, recorded: 2, awaiting: 3 });
    expect(runsTile(null)).toEqual({ inModel: null, fromUpload: null, recorded: null, awaiting: null });
    expect(runsTile({ n_base: 5, history: [], n_measured: 0, n_awaiting: 0 }).fromUpload).toBeNull();
  });
});
