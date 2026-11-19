import { describe, expect, it } from "vitest";
import { engineBatch } from "@/components/campaign/plan-batch";
import { recipeFlags } from "@/components/campaign/plan-view";
import { setupNotes, unitHint, type PredictAnalysis } from "@/components/predict/predict-view";
import { targetUnitOf, type AnalyzeResult, type Proposal } from "@/lib/api";
import {
  bandLegend,
  bandName,
  batchStripTable,
  chanceLabel,
  chanceText,
  describeBatchStrip,
  distanceText,
  eiText,
  gainFormatted,
  goalOf,
  improvementIncumbent,
  intervalLevels,
  intervalMode,
  levelRefusal,
  predFormatted,
  proposalBand,
  quantilesText,
  toBatchStripModel,
  type StripAnalysis,
} from "@/lib/viz-data/batch-interval-strip";
import fixture from "./fixtures/predict-v2-analysis.json";

/*
 * The Predict page's per-proposal intervals, model-based improvement fields,
 * distance to the nearest measured run, goal direction and setup refusal,
 * against a real engine v2 analysis (captured from the live engine on the
 * synthetic bioprocess sheet: interval_levels [0.9, 0.95], 5 proposals).
 */

const MINUS = "\u2212";
const d = fixture as unknown as AnalyzeResult & StripAnalysis;
const model = (over: Partial<StripAnalysis> = {}, coverage?: number | null) => toBatchStripModel({ ...d, ...over }, { target: "titer_g_L", unit: targetUnitOf(d), coverage });

/** The fixture with the 0.95 level refused batch-wide and on every proposal, as the engine sends it. */
function refused95(): StripAnalysis {
  const reason = "14 held-out scores cannot certify 95% coverage: the finite-sample rank exceeds n";
  const fix = "record at least 5 more run(s) with measured results, then re-analyze";
  const im = d.interval_method!;
  return {
    ...d,
    interval_method: {
      ...im,
      levels: [im.levels[0], { coverage: 0.95, available: false, code: "too_few_calibration_points", reason, what_would_fix_it: fix, n_calibration: 14, rank: 15, min_n: 19 }],
    },
    proposals: d.proposals.map((p) => ({
      ...p,
      intervals: [p.intervals![0], { coverage: 0.95, method: "conformal_normalized", available: false, lo: null, hi: null, code: "too_few_calibration_points", reason, what_would_fix_it: fix }],
    })),
  };
}

describe("per-proposal intervals (engine R4)", () => {
  it("defaults to the engine's first level and uses each proposal's own entry at exactly that coverage", () => {
    const m = model();
    expect(m.intervals.kind).toBe("per-proposal");
    expect(m.coverage).toBe(0.9);
    expect(m.halfWidth).toBeNull();
    const p0 = d.proposals[0];
    expect(m.rows[0].lo).toBe(p0.intervals![0].lo);
    expect(m.rows[0].hi).toBe(p0.intervals![0].hi);
    expect(m.rows[0].interval).toMatchObject({ kind: "value", source: "per-proposal", coverage: 0.9 });
    // Each recipe gets its own width (not one global half-width).
    const widths = m.rows.map((r) => r.hi! - r.lo!);
    expect(new Set(widths.map((w) => w.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("switches every row to the chosen level, labelled with that level's coverage and method", () => {
    const m = model({}, 0.95);
    expect(m.coverage).toBe(0.95);
    expect(m.rows[0].lo).toBe(d.proposals[0].intervals![1].lo);
    expect(predFormatted(m.rows[0], m).text).toBe("1.75\u00A0g/L [1.52, 1.98] 95%");
    expect(bandName(m)).toBe("95% held-out band, per recipe");
    expect(bandLegend(m)).toBe("95% band: held-out conformal, scaled per recipe; approximate coverage");
  });

  it("falls back to the first level for a coverage the engine did not compute", () => {
    expect(intervalMode(d, 0.8)).toMatchObject({ kind: "per-proposal", coverage: 0.9 });
  });

  it("reads each level's availability and in-sample coverage from interval_method", () => {
    const levels = intervalLevels(d);
    expect(levels.map((l) => l.coverage)).toEqual([0.9, 0.95]);
    expect(levels[0]).toMatchObject({ available: true, nCalibration: 160, nInside: 145, empirical: 0.9062 });
    expect(levels[0].bySigma).toEqual([
      { key: "low_sigma", n: 80, coverage: 0.8875 },
      { key: "high_sigma", n: 80, coverage: 0.925 },
    ]);
  });

  it("draws NO band for a refused level and carries the engine's reason and fix (no silent GP fallback)", () => {
    const m = toBatchStripModel(refused95(), { target: "titer_g_L", unit: "g/L", coverage: 0.95 });
    expect(m.rows.every((r) => r.lo == null && r.hi == null)).toBe(true);
    expect(m.rows[0].interval).toMatchObject({ kind: "refused", coverage: 0.95, code: "too_few_calibration_points" });
    expect(m.rows[0].interval.kind === "refused" && m.rows[0].interval.fix).toMatch(/record at least 5 more/);
    // The GP band is still there, but only as model-based context, never as lo/hi.
    expect(m.rows[0].gp).not.toBeNull();
    expect(levelRefusal(m)?.reason).toMatch(/cannot certify/);
    expect(predFormatted(m.rows[0], m).interval).toBeNull();
    expect(gainFormatted(m.rows[0], m)?.interval).toBeNull();
    expect(describeBatchStrip(m)).toContain("no band: the engine refused the 95% level");
    expect(batchStripTable(m).rows[0][3]).toMatch(/^Refused \(14 held-out scores/);
  });

  it("refuses one proposal on its own (degenerate sigma) without touching the others", () => {
    const one = { ...d, proposals: d.proposals.map((p, i) => (i === 1 ? { ...p, intervals: [{ coverage: 0.9, method: "conformal_normalized", available: false, lo: null, hi: null, code: "degenerate_proposal_sigma", reason: "sigma is zero" }] } : p)) };
    const m = toBatchStripModel(one, { target: "t", unit: null });
    expect(m.rows[0].interval.kind).toBe("value");
    expect(m.rows[1].interval).toMatchObject({ kind: "refused", reason: "sigma is zero" });
  });

  it("says when the engine sent no entry at the chosen coverage for a proposal", () => {
    expect(proposalBand({ pred: 1, intervals: [] }, intervalMode(d))).toEqual({ kind: "none", reason: "the engine sent no interval at this coverage for this proposal" });
  });

  it("keeps the legacy global conformal band for analyses without intervals", () => {
    const legacy: StripAnalysis = { ...d, interval_levels: undefined, interval_method: undefined, proposals: d.proposals.map((p) => ({ ...p, intervals: undefined, gp_intervals: undefined }) as Proposal) };
    const m = toBatchStripModel(legacy, { target: "t", unit: "g/L" });
    expect(m.intervals).toEqual({ kind: "global", coverage: 0.9, halfWidth: 0.2036 });
    expect(m.rows[0].lo).toBeCloseTo(1.75 - 0.2036);
    expect(bandName(m)).toBe("90% held-out band");
  });
});

describe("model-based improvement fields and distance", () => {
  const m = model();
  const r = m.rows[0];

  it("prints EI, the chance to beat the named incumbent and the quantiles through lib/num", () => {
    expect(eiText(r, "g/L")).toBe("0.328\u00A0g/L");
    expect(chanceText(r)).toBe(">99%");
    expect(chanceLabel(r.pImprove, m.goal)).toBe("Chance the model's mean beats the best measured");
    expect(improvementIncumbent(r.pImprove, "g/L")).toBe("best measured run 1.42\u00A0g/L");
    expect(quantilesText(r.quantiles, "g/L")).toBe("p05 1.63 · p25 1.70 · p50 1.75 · p75 1.80 · p95 1.87 g/L");
  });

  it("shows the distance with the engine's median spacing as an exact ratio, and no verdict", () => {
    expect(m.nnMedian).toBe(0.7416);
    expect(distanceText(r.nnDistance, m.nnMedian)).toEqual({ value: "0.60", ratio: "0.81× typical spacing" });
    expect(distanceText(0, 0.74)).toEqual({ value: "0", ratio: "a measured recipe" });
    expect(distanceText(null, 0.74)).toEqual({ value: "n/a", ratio: null });
  });

  it("lists the model-based columns in the Data table, labelled so", () => {
    const t = batchStripTable(m);
    expect(t.columns).toContain("Expected improvement (g/L), model-based");
    expect(t.columns).toContain("Chance the model's mean beats the best measured, model-based");
    expect(t.columns).toContain("Distance to nearest measured run");
    expect(t.rows[0]).toContain("0.60 (0.81× typical spacing)");
  });
});

describe("goal direction", () => {
  const minimize: StripAnalysis = {
    ...d,
    goal: "minimize",
    best: 1.8,
    proposals: d.proposals.map((p) => ({ ...p, p_improve: p.p_improve && { ...p.p_improve, maximize: false }, expected_improvement: p.expected_improvement && { ...p.expected_improvement, maximize: false } })),
  };

  it("takes the gain as best − predicted and shifts the band the same way when minimizing", () => {
    const m = toBatchStripModel(minimize, { target: "t", unit: "g/L" });
    expect(goalOf(minimize)).toBe("minimize");
    const r = m.rows[0]; // pred 1.75, band [1.5951, 1.9051], best 1.8
    const g = gainFormatted(r, m)!;
    expect(g.value).toBe("+0.05");
    // [1.8 − 1.9051, 1.8 − 1.5951]
    expect(g.interval).toBe(`[${MINUS}0.11, 0.20]`);
    expect(chanceLabel(r.pImprove, m.goal)).toBe("Chance the model's mean goes below the best measured");
    expect(describeBatchStrip(m)).toMatch(/predicted below it\. /);
  });

  it("orders 'beats best' and the gain-within-band check in the goal direction", () => {
    expect(engineBatch(minimize.proposals, 1.8, "minimize").map((b) => b.beatsBest)).toEqual(minimize.proposals.map((p) => p.pred < 1.8));
    const p = minimize.proposals[0];
    const flags = recipeFlags(p, { pH: 7 }, { incumbent: 1.8, band: null, nonNegative: true, ranges: {}, goal: "minimize", interval: { lo: 1.5951, hi: 1.9051, coverage: 0.9 } });
    expect(flags.map((f) => f.kind)).toEqual(["gain-within-band"]);
    expect(flags[0].detail).toBe("Predicted to beat the best by 0.05, but its 90% band also reaches above the best.");
    // A refused band (interval null) runs no band check at all.
    expect(recipeFlags(p, { pH: 7 }, { incumbent: 1.8, band: 0.5, nonNegative: true, ranges: {}, goal: "minimize", interval: null })).toEqual([]);
  });
});

describe("setup and target unit on Predict", () => {
  it("reads a setup refusal with the engine's code, reason and fix", () => {
    const n = setupNotes({
      goal: "maximize",
      setup: { status: "refused", goal: "maximize", refusal: { code: "infeasible_constraints", reason: "no recipe satisfies the bounds and constraints together", what_would_fix_it: "loosen the glucose + glycerol constraint" } },
      proposal_notice: { code: "setup_not_applied" },
    } as unknown as PredictAnalysis);
    expect(n.refused).toEqual({ code: "infeasible_constraints", reason: "no recipe satisfies the bounds and constraints together", fix: "loosen the glucose + glycerol constraint" });
  });

  it("states a clipped bound and dropped proposals quietly, and the minimize goal", () => {
    const n = setupNotes({
      goal: "minimize",
      setup: {
        status: "applied",
        goal: "minimize",
        bounds_applied: { pH: { requested: [6.5, 7.8], observed: [6.6, 7.4], applied: [6.6, 7.4], extrapolates: true } },
        warnings: [{ code: "bound_extrapolates", feature: "pH", message: "requested bound extends past the observed data" }],
        n_proposals_dropped: 2,
      },
      proposal_notice: null,
    } as unknown as PredictAnalysis);
    expect(n.goal).toBe("minimize");
    expect(n.refused).toBeNull();
    expect(n.notes.map((x) => x.text)).toEqual([
      "The bound set for pH reaches past the measured data, so the search uses 6.60 to 7.40, its overlap with the measured range. Kalos does not extrapolate.",
      "2 proposals were dropped for breaking the setup's bounds or constraints.",
    ]);
    expect(n.notes[0].detail).toBe("requested bound extends past the observed data");
  });

  it("uses the engine's target_unit, and hints only when the engine found none", () => {
    expect(targetUnitOf(d)).toBe("g/L");
    expect(unitHint(d as unknown as PredictAnalysis)).toBeNull();
    const none = { ...d, target: "od600", target_unit: { unit: null, source: "none" as const, header: "od600", note: "" } };
    expect(targetUnitOf(none)).toBeNull();
    expect(unitHint(none as unknown as PredictAnalysis)).toMatch(/No unit is shown for od600/);
  });
});
