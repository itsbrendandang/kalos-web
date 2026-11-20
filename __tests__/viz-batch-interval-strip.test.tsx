// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BatchIntervalStrip } from "@/components/viz/charts/batch-interval-strip";
import type { AnalyzeResult, CampaignRun, Proposal } from "@/lib/api";
import {
  batchStripTable,
  describeBatchStrip,
  gainFormatted,
  matchRun,
  predFormatted,
  sameRecipe,
  stripDomain,
  toBatchStripModel,
  type BatchStripModel,
} from "@/lib/viz-data/batch-interval-strip";

const MINUS = "\u2212";
const prop = (pred: number, recipe: Record<string, number | string>, extra: Partial<Proposal> = {}): Proposal => ({
  vals: [],
  pred,
  std: 0.04,
  mode: "explore",
  reason: "",
  recipe: recipe as Record<string, number>,
  ...extra,
});

type Strip = Parameters<typeof toBatchStripModel>[0];
const base: Strip = {
  proposals: [prop(1.613, { pH: 6.969, temp: 36.1, medium: "CD-CHO" }, { p_feasible: 0.81 }), prop(1.75, { pH: 7.59, temp: 36.2, medium: "ProCHO" }, { mode: "exploit", p_feasible: 0.4 })],
  proposal_features: ["temp", "pH"],
  conformal_q: 0.2264,
  conformal_coverage: 0.9,
  best: 1.61,
  noise: undefined as unknown as AnalyzeResult["noise"],
  feature_ranges: { pH: [6.005, 7.594], temp: [30.039, 38.968] },
  proposal_gating: { gated: true, reason: "gated", n_infeasible: 70, feasibility_auc: 0.667, threshold: 0 },
};
const model = (over: Partial<Strip> = {}, runs: CampaignRun[] = []) => toBatchStripModel({ ...base, ...over }, { target: "titer", unit: "g/L", runs });
const run = (id: string, recipe: Record<string, number | string>, result: number | null): CampaignRun => ({
  id,
  recipe: recipe as Record<string, number>,
  pred: 1,
  std: 0.1,
  mode: "explore",
  reason: "",
  result,
  awaiting: result == null,
});
/** A run started since the engine records each run's bands: its prediction and bands at start. */
const startedRun = (
  id: string,
  recipe: Record<string, number | string>,
  result: number | null,
  at: { lo: number; hi: number; coverage?: number; intervals?: { coverage: number; lo: number; hi: number }[] },
  inside_band: boolean | null = null,
): CampaignRun => ({
  ...run(id, recipe, result),
  pred_source: "engine",
  inside_band,
  prediction_at_start: {
    available: true,
    basis: "predicted",
    pred: (at.lo + at.hi) / 2,
    std: 0.1,
    interval: { lo: at.lo, hi: at.hi, half_width: (at.hi - at.lo) / 2, coverage: at.coverage ?? 0.9, method: "conformal" },
    interval_unavailable_reason: null,
    intervals: at.intervals?.map((i) => ({ ...i, method: "conformal_normalized", available: true })),
  },
});
const R1 = { pH: 6.969, temp: 36.1, medium: "CD-CHO" };
const R2 = { pH: 7.59, temp: 36.2, medium: "ProCHO" };
const CAVEAT = "Coverage at proposed recipes is unknown for this engine version: it sent no coverage measured at proposals. This band's coverage was measured on held-out past runs; proposals are chosen for high predicted values and their coverage can be lower.";

afterEach(cleanup);

describe("toBatchStripModel", () => {
  it("keeps the engine order and builds the band only from conformal_q at the engine's coverage", () => {
    const m = model();
    expect(m.rows.map((r) => r.key)).toEqual(["P1", "P2"]);
    expect(m.rows[0].lo).toBeCloseTo(1.613 - 0.2264);
    expect(m.rows[0].hi).toBeCloseTo(1.613 + 0.2264);
    expect(m.coverage).toBe(0.9);
    expect(m.incumbent).toEqual({ value: 1.61, label: "best measured run" });
  });

  it("shows no interval without conformal_q, never one built from sigma", () => {
    const m = model({ conformal_q: null });
    expect(m.rows[0].lo).toBeNull();
    expect(m.rows[0].hi).toBeNull();
    expect(predFormatted(m.rows[0], m).interval).toBeNull();
    expect(gainFormatted(m.rows[0], m)?.interval).toBeNull();
    expect(batchStripTable(m).rows[0][3]).toBe("n/a (no band reported)");
  });

  it("formats the prediction at the band's precision with the engine's coverage", () => {
    const m = model();
    const f = predFormatted(m.rows[0], m);
    expect(f.text).toBe("1.61\u00A0g/L [1.39, 1.84] 90%");
  });

  it("computes the predicted gain exactly and shifts the band by the same amount", () => {
    const m = model();
    const g = gainFormatted(m.rows[1], m)!;
    // 1.75 - 1.61 = 0.14; band [1.5236, 1.9764] - 1.61 = [-0.0864, 0.3664]
    expect(g.value).toBe("+0.14");
    expect(g.interval).toBe(`[${MINUS}0.09, 0.37]`);
    expect(gainFormatted(m.rows[1], { ...m, incumbent: null })).toBeNull();
  });

  it("shows p_feasible only when the engine gated the batch, else n/a with the reason", () => {
    expect(model().rows[0].feasibility).toEqual({ state: "value", p: 0.81 });
    const ungated = model({ proposal_gating: { gated: false, reason: "auc too low", n_infeasible: 70, feasibility_auc: 0.6, threshold: 0 } });
    expect(ungated.rows[0].feasibility).toEqual({ state: "na", reason: "batch was not feasibility-gated", detail: "auc too low" });
    expect(model({ proposal_gating: undefined }).rows[0].feasibility.state).toBe("na");
    expect(model({ proposals: [prop(1, { pH: 7 }, { p_feasible: null })] }).rows[0].feasibility).toMatchObject({ state: "na" });
  });

  it("flags inputs within 1% of a feature_ranges end", () => {
    const m = model();
    expect(m.rows[0].edge).toEqual([]);
    expect(m.rows[1].edge).toEqual(["pH"]);
    expect(m.rows[1].flags).toEqual(["edge"]);
  });

  it("matches a started run by exact recipe and judges inside/outside only against the band recorded at start", () => {
    // r1: inside the band recorded at start. r2: inside the CURRENT band (1.75 ± 0.23) but outside the one recorded at start.
    const runs = [startedRun("r1", R1, 1.64, { lo: 1.5, hi: 1.7 }), startedRun("r2", R2, 1.8, { lo: 1.4, hi: 1.6 })];
    const m = model({}, runs);
    expect(m.hasRuns).toBe(true);
    expect(m.rows[0].run).toEqual({ id: "r1", result: 1.64, awaiting: false });
    expect(m.rows[0].band).toBe("inside");
    expect(m.rows[1].band).toBe("outside");
    expect(m.rows[1].flags).toContain("outside-band");
  });

  it("prefers the run's own interval at the chosen coverage, then the engine's inside_band at that coverage, else n/a", () => {
    const per: Partial<Strip> = {
      interval_levels: [0.9, 0.95],
      interval_method: { method: "conformal_normalized", levels: [{ coverage: 0.9, available: true }, { coverage: 0.95, available: true }] },
      proposals: base.proposals.map((p) => ({
        ...p,
        intervals: [
          { coverage: 0.9, method: "conformal_normalized", available: true, lo: p.pred - 0.1, hi: p.pred + 0.1 },
          { coverage: 0.95, method: "conformal_normalized", available: true, lo: p.pred - 0.5, hi: p.pred + 0.5 },
        ],
      })),
    };
    const at = { lo: 1.5, hi: 1.6, intervals: [{ coverage: 0.95, lo: 1.0, hi: 2.0 }] };
    const runs = [startedRun("r1", R1, 1.64, at, false)];
    const strip = (coverage: number) => toBatchStripModel({ ...base, ...per }, { target: "titer", unit: "g/L", runs, coverage });
    // 0.95: the run's own 95% interval at start [1.0, 2.0].
    expect(strip(0.95).rows[0].band).toBe("inside");
    // 0.9: no 90% entry in intervals; the recorded interval is 90%, so the engine's inside_band decides.
    expect(strip(0.9).rows[0].band).toBe("outside");
    // A legacy run (nothing recorded at start) is n/a, even though the current band contains it.
    const legacy = toBatchStripModel({ ...base, ...per }, { target: "titer", unit: "g/L", runs: [run("r0", R1, 1.613)], coverage: 0.9 });
    expect(legacy.rows[0].band).toBeNull();
    expect(legacy.rows[0].bandNa).toBe("no band was recorded when this run started");
    expect(batchStripTable(legacy).rows[0].at(-1)).toBe("n/a (no band was recorded when this run started)");
    // Recorded at 90% only, viewed at 95% with no 95% entry: n/a, not the current 95% band.
    const only90 = toBatchStripModel({ ...base, ...per }, { target: "titer", unit: "g/L", runs: [startedRun("r1", R1, 1.613, { lo: 1.5, hi: 1.7 }, true)], coverage: 0.95 });
    expect(only90.rows[0].band).toBeNull();
    expect(only90.rows[0].bandNa).toBe("no 95% band was recorded when this run started");
  });

  it("pads the domain 10% around every interval, the incumbent and any measured result", () => {
    const [lo, hi] = stripDomain([{ pred: 5, lo: 4, hi: 6, run: { id: "x", result: 8, awaiting: false } }], 3)!;
    expect(lo).toBeCloseTo(3 - 0.5);
    expect(hi).toBeCloseTo(8 + 0.5);
    expect(stripDomain([], null)).toBeNull();
    const [a, b] = stripDomain([{ pred: 5, lo: null, hi: null, run: null }], null)!;
    expect(a).toBeLessThan(5);
    expect(b).toBeGreaterThan(5);
  });
});

describe("recipe matching", () => {
  it("needs the same inputs and identical values", () => {
    expect(sameRecipe({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
    expect(sameRecipe({ a: 1 }, { a: 1.0001 })).toBe(false);
    expect(sameRecipe({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
  it("prefers a run with a result over one still awaiting", () => {
    expect(matchRun({ a: 1 }, [run("w", { a: 1 }, null), run("m", { a: 1 }, 3)])).toEqual({ id: "m", result: 3, awaiting: false });
    expect(matchRun({ a: 1 }, [run("w", { a: 1 }, null)])).toEqual({ id: "w", result: null, awaiting: true });
    expect(matchRun({ a: 2 }, [run("w", { a: 1 }, null)])).toBeNull();
  });
});

describe("describeBatchStrip", () => {
  it("names the coverage, every row in order and the incumbent", () => {
    const text = describeBatchStrip(model());
    expect(text).toBe(
      `Proposed batch of 2 recipes, predicted titer (g/L) with the 90% held-out band, in the engine's order: P1 explore 1.61 [1.39, 1.84]; P2 exploit 1.75 [1.52, 1.98]. Best measured run 1.61\u00A0g/L; 2 of 2 predicted above it. ${CAVEAT}`,
    );
  });
  it("says when there is no interval, and when the batch is empty", () => {
    expect(describeBatchStrip(model({ conformal_q: null }))).toContain("no interval reported");
    expect(describeBatchStrip(model({ proposals: [] }))).toBe("The engine proposed no recipes for titer.");
  });
  it("adds measured results with their band verdict", () => {
    const m = model({}, [startedRun("r1", R1, 1.64, { lo: 1.5, hi: 1.7 })]);
    expect(describeBatchStrip(m)).toContain("measured 1.64\u00A0g/L (inside the band recorded at start)");
  });
});

describe("<BatchIntervalStrip>", () => {
  const draw = (m: BatchStripModel, extra: Partial<Parameters<typeof BatchIntervalStrip>[0]> = {}) => render(<BatchIntervalStrip model={m} width={900} {...extra} />);

  it("renders one keyboard-reachable row per proposal with the engine's coverage in the legend", () => {
    draw(model());
    const marks = screen.getAllByRole("button", { name: /^P\d (explore|exploit): predicted/ });
    expect(marks).toHaveLength(2);
    expect(marks[0].getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("Predicted (90% held-out band)")).toBeTruthy();
    expect(screen.getByRole("group", { name: /Proposed batch of 2 recipes/ })).toBeTruthy();
  });

  it("prints the gain with its shifted band and p_feasible only for a gated batch", () => {
    draw(model());
    expect(screen.getByText("+0.14")).toBeTruthy();
    expect(screen.getByText("81%")).toBeTruthy();
    cleanup();
    draw(model({ proposal_gating: { gated: false, reason: "auc too low", n_infeasible: 1, feasibility_auc: 0.5, threshold: 0 } }));
    expect(screen.queryByText("81%")).toBeNull();
    // Ungated: no P(feasible) column; one line says why, with the engine's reason.
    expect(screen.queryByText("P(feasible)")).toBeNull();
    expect(screen.getByText(/P\(feasible\): n\/a for every proposal, the batch was not feasibility-gated \(engine: auc too low\)/)).toBeTruthy();
  });

  it("shows the model sigma, labeled uncalibrated, when the engine sent no band", () => {
    draw(model({ conformal_q: null }));
    expect(screen.getByText("Predicted (no interval reported)")).toBeTruthy();
    expect(screen.getAllByText(/σ 0\.0400 g\/L \(model, not checked on held-out runs\)/).length).toBeGreaterThan(0);
  });

  it("adds a measured column once a started run of the same recipe has a result", () => {
    draw(model({}, [startedRun("r1", R1, 1.64, { lo: 1.5, hi: 1.7 }), run("r2", R2, null)]));
    expect(screen.getByText("inside start band")).toBeTruthy();
    expect(screen.getByText("Awaiting result")).toBeTruthy();
    expect(screen.getByText("Measured result of the started run")).toBeTruthy();
  });

  it("links hover to the highlight callback and shows a tooltip with its source on focus", () => {
    const seen: (string | null)[] = [];
    draw(model(), { onHighlight: (k) => seen.push(k), sourceFor: (r) => ({ label: "Analysis of x.csv", field: `proposals[${r.index}].pred`, basis: "predicted" }) });
    const mark = screen.getAllByRole("button", { name: /^P2 exploit/ })[0];
    fireEvent.focus(mark);
    expect(seen).toContain("P2");
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText(/proposals\[1\]\.pred/)).toBeTruthy();
    expect(within(tip).getByText("90% held-out band")).toBeTruthy();
  });

  it("shows the empty state, and the not-reliable banner without hiding the strip", () => {
    draw(model({ proposals: [] }));
    expect(screen.getByText("The engine proposed no recipes for this analysis.")).toBeTruthy();
    cleanup();
    draw(model(), { warning: "Not yet reliable: treat these as exploration, not forecasts." });
    expect(screen.getByText(/Not yet reliable/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^P1/ }).length).toBe(1);
  });

  it("labels per-proposal bands with their coverage and method, and adds the model-based chance column", () => {
    const per = model({
      interval_levels: [0.9],
      interval_method: { method: "conformal_normalized", levels: [{ coverage: 0.9, available: true }] },
      proposals: base.proposals.map((p) => ({
        ...p,
        intervals: [{ coverage: 0.9, method: "conformal_normalized", available: true, lo: p.pred - 0.1, hi: p.pred + 0.2 }],
        p_improve: { value: 0.62, method: "gp_posterior_cdf", incumbent: 1.61, incumbent_basis: "best_measured_single", maximize: true, basis: "model" },
        expected_improvement: { value: 0.031, method: "analytic_ei_gp_posterior", incumbent: 1.61, incumbent_basis: "best_measured_single", maximize: true, basis: "model" },
      })),
    });
    draw(per);
    expect(screen.getByText("Predicted (90% band: held-out conformal, scaled per recipe; approximate coverage)")).toBeTruthy();
    expect(screen.getByText("Chance the model's mean beats the best measured")).toBeTruthy();
    expect(screen.getAllByText("62%").length).toBe(2);
  });
});
