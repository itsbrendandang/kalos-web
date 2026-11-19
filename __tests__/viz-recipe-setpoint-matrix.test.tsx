// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { laneFor, RecipeSetpointMatrix } from "@/components/viz/charts/recipe-setpoint-matrix";
import {
  describeSetpointMatrix,
  edgeOf,
  setpointMatrixTable,
  toSetpointMatrixModel,
  type NumericFeature,
  type RangeInput,
  type SetpointProposal,
} from "@/lib/viz-data/recipe-setpoint-matrix";

type M = Parameters<typeof toSetpointMatrixModel>[0];
const proposals: SetpointProposal[] = [
  { key: "P1", n: 1, values: { pH: 6.969, "Temp (C)": 36.1, medium: "CD-CHO", DO: 40 } },
  { key: "P2", n: 2, values: { pH: 7.59, "Temp (C)": 36.2, medium: "ProCHO", DO: 55 } },
  { key: "P3", n: 3, values: { pH: 6.5, "Temp (C)": 30.1, medium: "ProCHO", DO: 30 } },
];
const ranges: Record<string, RangeInput> = {
  pH: { min: 6.005, max: 7.594, source: "engine" },
  "Temp (C)": { min: 25, max: 35, source: "observed", n: 40 },
};
const d: M = {
  proposal_features: ["Temp (C)", "pH"],
  design_box_exclusions: [{ column: "pH", n_excluded: 4, lower: 6.2, upper: 7.594 }],
  categorical_features: ["medium"],
  response_surface: { x_feature: "pH", y_feature: "Temp (C)", x_vals: [], y_vals: [], z: [], runs: [], swept_at: "incumbent", fixed_recipe: { pH: 6.967, "Temp (C)": 36.17, medium: "CD-CHO", DO: 50 } },
  gp_shapes: {
    available: true,
    features: [
      { name: "pH", relevance: 0.9, shape: "interior_optimum", optimum_at: 7.05 },
      { name: "Temp (C)", relevance: 0.5, shape: "monotonic_up", optimum_at: 37 },
    ],
  },
};
const model = (over: Partial<M> = {}, r = ranges) => toSetpointMatrixModel({ ...d, ...over }, proposals, r);
const num = (m: ReturnType<typeof model>, name: string) => m.features.find((f) => f.name === name) as NumericFeature;

afterEach(cleanup);

describe("toSetpointMatrixModel", () => {
  it("orders proposal_features first, then the other inputs A-Z", () => {
    expect(model().features.map((f) => f.name)).toEqual(["Temp (C)", "pH", "DO", "medium"]);
  });

  it("takes the range, its source, the narrowed box, the incumbent and the GP optimum from engine fields", () => {
    const m = model();
    const ph = num(m, "pH");
    expect(ph.range).toEqual([6.005, 7.594]);
    expect(ph.rangeSource).toBe("engine");
    expect(ph.narrowed).toEqual({ lower: 6.2, upper: 7.594, nExcluded: 4 });
    expect(ph.incumbent).toBe(6.967);
    expect(ph.optimumAt).toBe(7.05);
    expect(m.incumbentLabel).toBe("incumbent");
    const t = num(m, "Temp (C)");
    expect(t.label).toBe("Temp");
    expect(t.unit).toBe("C");
    expect(t.rangeSource).toBe("observed");
    expect(t.rangeN).toBe(40);
    // A GP shape that is not an interior optimum draws no triangle.
    expect(t.optimumAt).toBeNull();
    // The domain holds the proposals outside the range tried (36.1 > 35).
    expect(t.domain[1]).toBeGreaterThanOrEqual(36.2);
  });

  it("spans the proposals when no range was reported, and says so", () => {
    const m = model();
    const dOx = num(m, "DO");
    expect(dOx.range).toBeNull();
    expect(dOx.rangeSource).toBe("proposals");
    expect(dOx.domain).toEqual([30, 55]);
    expect(edgeOf(30, dOx)).toBeNull();
  });

  it("turns categorical inputs into level chips with the proposals that pick each", () => {
    const med = model().features.find((f) => f.name === "medium");
    expect(med).toEqual({ kind: "categorical", name: "medium", label: "medium", incumbent: "CD-CHO", levels: [{ level: "CD-CHO", keys: ["P1"] }, { level: "ProCHO", keys: ["P2", "P3"] }] });
  });

  it("draws no incumbent or optimum when the engine sent none", () => {
    const m = model({ response_surface: undefined, gp_shapes: { available: false, features: [] } });
    expect(m.incumbentLabel).toBeNull();
    expect(num(m, "pH").incumbent).toBeNull();
    expect(num(m, "pH").optimumAt).toBeNull();
  });

  it("caps the inputs shown and orders by GP relevance only when there are more than 12", () => {
    const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`x${String(i).padStart(2, "0")}`, i]));
    const m = toSetpointMatrixModel({ ...d, proposal_features: [], gp_shapes: { available: true, features: [{ name: "x13", relevance: 1, shape: "flat", optimum_at: null }] } }, [{ key: "P1", n: 1, values: many }], {});
    expect(m.initial).toBe(12);
    expect(m.features[0].name).toBe("x13");
  });
});

describe("edgeOf", () => {
  const f = { range: [6, 8] as [number, number], rangeSource: "engine" as const };
  it("flags within 1% of an end, and outside the range", () => {
    expect(edgeOf(6.01, f)).toBe("low edge");
    expect(edgeOf(7.99, f)).toBe("high edge");
    expect(edgeOf(7, f)).toBeNull();
    expect(edgeOf(6.05, f)).toBeNull();
    expect(edgeOf(9, f)).toBe("above range");
    expect(edgeOf(5, f)).toBe("below range");
  });
});

describe("describeSetpointMatrix and its data table", () => {
  it("summarises every input with range precision and lists edges", () => {
    const text = describeSetpointMatrix(model());
    expect(text).toContain("Setpoints of 3 proposals on 4 inputs.");
    expect(text).toContain("pH: 6.50 to 7.59 within search range 6.01 to 7.59, P2 at high edge");
    expect(text).toContain("Temp: 30.1 to 36.2 within range tried in 40 runs 25.0 to 35.0, P1 above range, P2 above range");
    expect(text).toContain("DO: 30.0 to 55.0 (search range not reported)");
    expect(text).toContain("medium: CD-CHO P1, ProCHO P2 P3");
  });
  it("tabulates every setpoint at its range's precision with edge words", () => {
    const t = setpointMatrixTable(model());
    expect(t.columns).toEqual(["Input", "Range", "P1", "P2", "P3", "Incumbent", "GP optimum"]);
    expect(t.rows[1]).toEqual(["pH", "[6.01, 7.59] search range", "6.97", "7.59 (high edge)", "6.50", "6.97", "7.05"]);
    expect(t.rows[3]).toEqual(["medium", "categorical", "CD-CHO", "ProCHO", "ProCHO", "CD-CHO", "n/a"]);
  });
});

describe("laneFor", () => {
  it("stacks markers that would overlap, deterministically", () => {
    expect(laneFor([10, 12, 50, 14])).toEqual([0, 1, 0, 2]);
    expect(laneFor([0, 100, 200])).toEqual([0, 0, 0]);
  });
});

describe("<RecipeSetpointMatrix>", () => {
  it("renders numbered, keyboard-reachable markers and links hover to the batch strip", () => {
    const seen: (string | null)[] = [];
    render(<RecipeSetpointMatrix model={model()} width={1000} onHighlight={(k) => seen.push(k)} sourceLabel="Analysis of x.csv" />);
    const marks = screen.getAllByRole("button", { name: /^P2 / });
    expect(marks.length).toBe(3); // pH, Temp, DO
    fireEvent.focus(screen.getByRole("button", { name: /^P2 pH 7\.59, at high edge/ }));
    expect(seen).toContain("P2");
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText(/proposals\[1\]\.recipe\.pH/)).toBeTruthy();
    expect(screen.getByText("Excluded from the search box")).toBeTruthy();
    expect(screen.getByText("GP interior optimum")).toBeTruthy();
    expect(screen.getByText("search range not reported")).toBeTruthy();
    expect(screen.getByText("ProCHO")).toBeTruthy();
  });
});
