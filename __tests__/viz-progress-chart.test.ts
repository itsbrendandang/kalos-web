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
  pending: [run("60ad5599d4", 1.75, 1.64), run("ba5d212105", 1.736, null), run("f9ce16754d", 1.732, null), run("5d19cdeb15", 1.728, null), run("f7a48e5666", 1.715, 1.5)],
};

describe("toProgressData", () => {
  it("places runs started in round r in history column r + 1, with the current analysis's band", () => {
    const d = toProgressData(defaultCampaign, analysis());
    expect(d.columns.map((c) => [c.key, c.label, c.kind])).toEqual([
      ["r0", "Upload", "history"],
      ["r1", "Round 1", "runs"],
    ]);
    expect(d.runs.every((r) => r.column === "r1" && r.band === "current-analysis")).toBe(true);
    expect(d.runs[0].lo).toBeCloseTo(1.75 - 0.2036);
    expect(d.runs[0].hi).toBeCloseTo(1.75 + 0.2036);
  });

  it("counts band hits exactly (lo <= result <= hi) and says so with the engine coverage", () => {
    const d = toProgressData(defaultCampaign, analysis());
    expect(d.hit).toEqual({ inside: 1, scored: 2, unscored: 0 });
    expect(hitRateText(d)).toBe("Band hit rate this round: 1 of 2 measured runs inside their 90% held-out band (50%, target 90%).");
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

  it("draws no interval for a run from an earlier analysis, and does not score it", () => {
    const c = { ...defaultCampaign, pending: [run("a", 1.7, 1.65, { analysis_provenance: { timestamp: TS - 100 } })] };
    const d = toProgressData(c, analysis());
    expect(d.runs[0]).toMatchObject({ band: "earlier-analysis", lo: null, hi: null, inside: null });
    expect(d.hit).toEqual({ inside: 0, scored: 0, unscored: 1 });
    expect(hitRateText(d)).toMatch(/not scored/);
  });

  it("without a conformal band, predictions carry no interval and say none was reported", () => {
    const d = toProgressData(defaultCampaign, analysis({ conformal_q: null }));
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
    expect(text).toContain("Best measured titer_g_L by round: upload 1.42, round 1 no measured best.");
    expect(text).toContain("5 started runs this round: 2 measured, 3 awaiting a result.");
    expect(text).toContain("1 of 2 measured runs");
    expect(text).toContain("Incumbent (best measured run) 1.42.");
  });

  it("describes the next batch with its interval span and coverage", () => {
    const c: ProgressCampaign = { target: "y", history: [{ round: 0, best: 1.4, n_base: 10 }], round: 0, pending: [], analysis_in_sync: true };
    expect(describeProgress(toProgressData(c, analysis()))).toMatch(/Next batch \(round 1, proposed, not run\): 2 recipes predicted 1\.51 to 1\.95 across their 90% held-out bands\./);
  });
});
