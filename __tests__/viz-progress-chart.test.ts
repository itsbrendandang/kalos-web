import { describe, expect, it } from "vitest";
import type { CampaignRun } from "@/lib/api";
import { describeProgress, hitRateText, nextRange, progressExtent, progressTable, toProgressData, type ProgressAnalysis, type ProgressCampaign } from "@/lib/viz-data/progress-chart";

const TS = 1795058474;
const run = (id: string, pred: number, result: number | null, extra: Partial<CampaignRun> = {}): CampaignRun => ({
  id,
  recipe: {},
  pred,
  std: 0.07,
  mode: "exploit",
  reason: "",
  result,
  awaiting: result == null,
  round: 0,
  analysis_provenance: { timestamp: TS },
  ...extra,
});

/** A run started since R5: the band recorded at start (pred ± 0.2036 at 90%), the engine's inside_band. */
const rec = (id: string, pred: number, result: number | null, extra: Partial<CampaignRun> = {}): CampaignRun =>
  run(id, pred, result, {
    pred_source: "engine",
    prediction_at_start: {
      available: true, basis: "predicted", pred, std: 0.07,
      interval: { lo: pred - 0.2036, hi: pred + 0.2036, half_width: 0.2036, coverage: 0.9, method: "conformal_global" }, interval_unavailable_reason: null,
    },
    residual: result == null ? null : result - pred,
    inside_band: result == null ? null : Math.abs(result - pred) <= 0.2036,
    ...extra,
  });

const analysis = (over: Partial<ProgressAnalysis> = {}): ProgressAnalysis => ({
  best: 1.422,
  noise: undefined,
  proposals: [
    { vals: [], pred: 1.75, std: 0.07, mode: "exploit", reason: "" },
    { vals: [], pred: 1.715, std: 0.06, mode: "explore", reason: "" },
  ],
  conformal_q: 0.2036,
  conformal_coverage: 0.9,
  timestamp: TS,
  engine_version: "0.1.0",
  ...over,
});

// The live "Default" campaign: round 0, two measured and three awaiting, analysis out of sync.
const defaultCampaign: ProgressCampaign = {
  target: "titer_g_L",
  history: [{ round: 0, best: 1.422, n_base: 160 }],
  n_base: 160,
  round: 0,
  analysis_in_sync: false,
  pending: [rec("60ad5599d4", 1.75, 1.64), rec("ba5d212105", 1.736, null), rec("f9ce16754d", 1.732, null), rec("5d19cdeb15", 1.728, null), rec("f7a48e5666", 1.715, 1.5)],
};

describe("toProgressData", () => {
  it("places runs started in round r in history column r + 1, with the band recorded when each started", () => {
    // The analysis' own band differs: recorded runs never borrow it.
    const d = toProgressData(defaultCampaign, analysis({ conformal_q: 0.5 }));
    expect(d.columns.map((c) => [c.key, c.label, c.kind])).toEqual([
      ["r0", "Upload", "history"],
      ["r1", "Round 1", "runs"],
    ]);
    expect(d.runs.every((r) => r.column === "r1" && r.band === "recorded" && r.coverage === 0.9)).toBe(true);
    expect(d.runs[0].lo).toBeCloseTo(1.75 - 0.2036);
    expect(d.runs[0].hi).toBeCloseTo(1.75 + 0.2036);
  });

  it("counts band hits over recorded bands (the engine's inside_band) and says so with the engine coverage", () => {
    const d = toProgressData(defaultCampaign, analysis());
    expect(d.hit).toEqual({ inside: 1, scored: 2, unscored: 0 });
    expect(hitRateText(d)).toBe("Band hit rate: 1 of 2 measured runs inside the 90% held-out band recorded when they started (50%, target 90%).");
  });

  it("legacy run: the current analysis' band (labelled), not counted in the hit rate", () => {
    const c = { ...defaultCampaign, pending: [run("a", 1.75, 1.64), rec("b", 1.715, 1.5)] };
    const d = toProgressData(c, analysis());
    expect(d.runs[0]).toMatchObject({ band: "current-analysis", inside: true });
    expect(d.legacy).toBe(1);
    expect(d.hit).toEqual({ inside: 0, scored: 1, unscored: 1 });
    expect(hitRateText(d)).toMatch(/1 measured run without a band recorded at start is not scored\./);
    expect(progressTable(d).rows.find((r) => r[1] === "Run a")?.[4]).toMatch(/\(current analysis, not recorded at start\)$/);
    expect(progressTable(d).rows.find((r) => r[1] === "Run a")?.[5]).toBe("Inside band (not counted in the hit rate)");
  });

  it("caller-predicted run: no engine prediction drawn or scored, measured result kept", () => {
    const caller = run("c", 3.9, 1.6, { pred_source: "caller", prediction_at_start: { available: false, reason: "recipe is not one of the published proposals" } });
    const d = toProgressData({ ...defaultCampaign, pending: [caller] }, analysis());
    expect(d.runs[0]).toMatchObject({ enginePred: false, band: "no-engine-prediction", lo: null, inside: null, result: 1.6 });
    expect(d.runs[0].bandReason).toMatch(/recipe is not one of the published proposals/);
    // The caller's 3.9 never stretches the axis.
    expect(progressExtent(d)![1]).toBeLessThan(2);
    expect(progressTable(d).rows.find((r) => r[1] === "Run c")?.[3]).toBe("No engine prediction");
    expect(describeProgress(d)).toContain("1 run has no engine prediction");
  });

  it("uses the analysis' target_unit (user setup wins over the header), else the header", () => {
    const a = analysis({ target: "titer_g_L", target_unit: { unit: "mg/mL", source: "user", header: "titer_g_L", note: "" } });
    expect(toProgressData(defaultCampaign, a).unit).toBe("mg/mL");
    expect(toProgressData(defaultCampaign, analysis({ target_unit: { unit: null, source: "none", header: "od600", note: "" } })).unit).toBeNull();
    expect(toProgressData({ ...defaultCampaign, target: "Titer (g/L)" }, null).unit).toBe("g/L");
  });

  it("is goal-aware: a minimize campaign reads lower is better", () => {
    const d = toProgressData({ ...defaultCampaign, goal: "minimize" }, analysis());
    expect(d.goal).toBe("minimize");
    expect(describeProgress(d)).toContain("by round, lower is better:");
  });

  it("does not show the analysis's batch as next once the round's runs are started", () => {
    const d = toProgressData(defaultCampaign, analysis());
    expect(d.batchStarted).toBe(true);
    expect(d.next).toBeNull();
  });

  it("is stale when analysis_in_sync is false, naming the recorded results the model has not seen", () => {
    const d = toProgressData(defaultCampaign, analysis());
    expect(d.stale?.nNew).toBe(2);
    expect(d.stale?.text).toMatch(/predates 2 recorded results/);
    expect(toProgressData({ ...defaultCampaign, analysis_in_sync: true }, analysis()).stale).toBeNull();
  });

  it("legacy: draws no interval for a run from an earlier analysis, and does not score it", () => {
    const c = { ...defaultCampaign, pending: [run("a", 1.7, 1.65, { analysis_provenance: { timestamp: TS - 100 } })] };
    const d = toProgressData(c, analysis());
    expect(d.runs[0]).toMatchObject({ band: "earlier-analysis", lo: null, hi: null, inside: null });
    expect(d.hit).toEqual({ inside: 0, scored: 0, unscored: 1 });
    expect(hitRateText(d)).toMatch(/not scored/);
  });

  it("legacy: without a conformal band, predictions carry no interval and say none was reported", () => {
    const legacy = { ...defaultCampaign, pending: [run("a", 1.75, 1.64), run("b", 1.7, null)] };
    const d = toProgressData(legacy, analysis({ conformal_q: null }));
    expect(d.runs.every((r) => r.band === "none-reported" && r.lo == null)).toBe(true);
    expect(progressTable(d).rows.find((r) => r[1].startsWith("Run"))?.[4]).toBe("n/a (none reported)");
  });

  it("shows the next batch past the last round when nothing is started (round 0 only)", () => {
    const e2e: ProgressCampaign = {
      target: "titer_g_L",
      history: [
        { round: 0, best: 1.422, n_base: 160 },
        { round: 1, best: 1.61, n_base: 165 },
      ],
      round: 1,
      pending: [],
      analysis_in_sync: true,
    };
    const d = toProgressData(e2e, analysis({ best: 1.61 }));
    expect(d.columns.map((c) => c.label)).toEqual(["Upload", "Round 1", "Round 2"]);
    expect(d.next?.column).toBe("next2");
    expect(d.next?.fromPreviousAnalysis).toBe(false);
    expect(d.next?.preds[0].lo).toBeCloseTo(1.75 - 0.2036);
    expect(d.incumbent).toEqual({ value: 1.61, label: "best measured run" });
    const r = nextRange(d.next)!;
    expect(r.lo).toBeCloseTo(1.715 - 0.2036);
    expect(r.hi).toBeCloseTo(1.75 + 0.2036);
    expect(r.withIntervals).toBe(true);
  });

  it("marks the next batch as from the previous analysis when out of sync", () => {
    const c: ProgressCampaign = { target: "y", history: [{ round: 0, best: 1, n_base: 10 }], round: 0, pending: [], analysis_in_sync: false };
    expect(toProgressData(c, analysis()).next?.fromPreviousAnalysis).toBe(true);
  });

  it("keeps a null best as a gap with its own Data-table note (never interpolated)", () => {
    const c: ProgressCampaign = {
      target: "Titer (g/L)",
      history: [
        { round: 0, best: 4.6, n_base: 24 },
        { round: 1, best: null, n_base: 26 },
        { round: 2, best: 5.1, n_base: 30 },
      ],
      round: 2,
      pending: [],
    };
    const d = toProgressData(c, null);
    expect(d.unit).toBe("g/L");
    expect(d.columns[1].best).toBeNull();
    const rows = progressTable(d).rows;
    expect(rows[1]).toEqual(["Round 1", "Best so far", "n/a", "n/a", "n/a", "No measured result in round 1"]);
    expect(describeProgress(d)).toMatch(/round 1 no measured best/);
  });

  it("groups runs without a round under Unassigned", () => {
    const c = { ...defaultCampaign, pending: [run("x", 1.7, null, { round: undefined })] };
    const d = toProgressData(c, analysis());
    expect(d.columns.find((col) => col.kind === "unassigned")?.label).toBe("Unassigned");
    expect(d.runs[0].column).toBe("unassigned");
  });

  it("collapses a round with more runs than the threshold", () => {
    const many = Array.from({ length: 30 }, (_, i) => run(`r${i}`, 1.5 + i / 100, null));
    const d = toProgressData({ ...defaultCampaign, pending: many }, analysis());
    expect(d.columns.find((c) => c.key === "r1")?.collapsed).toBe(true);
    expect(progressTable(d).rows.filter((r) => r[1].startsWith("Run"))).toHaveLength(30);
  });

  it("uses the replicate-aware incumbent and its label", () => {
    const a = analysis({ noise: { replicate_aware: true, best_reproducible: 1.38 } as ProgressAnalysis["noise"] });
    expect(toProgressData(defaultCampaign, a).incumbent).toEqual({ value: 1.38, label: "best reproducible recipe" });
  });

  it("the y extent includes every interval bound", () => {
    const d = toProgressData(defaultCampaign, analysis());
    const [lo, hi] = progressExtent(d)!;
    expect(lo).toBeCloseTo(1.422);
    expect(hi).toBeCloseTo(1.75 + 0.2036);
  });
});

describe("describeProgress", () => {
  it("names the rounds, the runs, the hit count and the incumbent", () => {
    const text = describeProgress(toProgressData(defaultCampaign, analysis()));
    expect(text).toContain("Best measured titer_g_L by round, higher is better: upload 1.42, round 1 no measured best.");
    expect(text).toContain("5 started runs this round: 2 measured, 3 awaiting a result.");
    expect(text).toContain("1 of 2 measured runs");
    expect(text).toContain("Incumbent (best measured run) 1.42.");
  });

  it("describes the next batch with its interval span and coverage", () => {
    const c: ProgressCampaign = { target: "y", history: [{ round: 0, best: 1.4, n_base: 10 }], round: 0, pending: [], analysis_in_sync: true };
    expect(describeProgress(toProgressData(c, analysis()))).toMatch(/Next batch \(round 1, proposed, not run\): 2 recipes predicted 1\.51 to 1\.95 across their 90% held-out bands\./);
  });
});
