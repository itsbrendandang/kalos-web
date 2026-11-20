// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/clones-v7-analysis.json";
import { RunClone } from "@/components/campaign/run-clone";
import { CloneComparisonTable } from "@/components/viz/charts/clone-comparison";
import { CloneOutcomeHeatmap } from "@/components/viz/charts/clone-outcome-heatmap";
import type { AnalyzeResult, StrainSummary } from "@/lib/api";
import { sourceFromAnalysis } from "@/lib/source";
import {
  cloneCaveat,
  cloneGlyphs,
  cloneKeyOf,
  cloneOfRecipe,
  cloneOutcomeTable,
  describeCloneOutcome,
  effectText,
  toCloneComparison,
  toCloneOutcomeGrid,
} from "@/lib/viz-data/clones";

afterEach(cleanup);

const analysis = fixture as unknown as AnalyzeResult & { dataset: string };
const summary = analysis.strain_summary as StrainSummary;
const source = sourceFromAnalysis(analysis, "strain_summary.levels", "measured");
const clone = (s: StrainSummary): Extract<StrainSummary, { available: true }> => JSON.parse(JSON.stringify(s));

describe("toCloneOutcomeGrid (SV-G1)", () => {
  const g = toCloneOutcomeGrid(summary)!;
  it("keeps the engine's label order and puts the engine's target column first", () => {
    expect(g.levels.map((l) => l.label)).toEqual(["CHO-A12", "CHO-B07", "CHO-C33", "CHO-D41"]);
    expect(g.columns[0]).toMatchObject({ key: "titer_g_L", isTarget: true, unit: "g/L", direction: "higher_is_better" });
    expect(g.columns.map((c) => c.key)).toEqual(["titer_g_L", "purity_pct", "lactate_conc_gL"]);
  });
  it("prints mean [interval] with the engine's coverage, and n in every cell", () => {
    const a12 = g.cells[0][0];
    expect(a12.n).toBe(14);
    expect(a12.text).toBe("2.1 [1.7, 2.6]");
    expect(g.coverage).toBe(0.95);
    for (const row of g.cells) for (const c of row) expect(Number.isInteger(c.n)).toBe(true);
  });
  it("a cell with fewer than 3 runs carries no colour and says why (never a ranked mean)", () => {
    const d41 = g.cells[3];
    const purity = d41.find((c) => c.outcome === "purity_pct")!;
    expect(purity.n).toBe(2);
    expect(purity.cls).toBeNull();
    expect(purity.reason).toMatch(/fewer than 3 runs/);
    // n = 3 with an engine interval is coloured.
    expect(d41.find((c) => c.outcome === "titer_g_L")!.cls).not.toBeNull();
  });
  it("colour classes span the column's intervals, so means closer than their intervals share or neighbour a shade", () => {
    const purity = g.columns.find((c) => c.key === "purity_pct")!;
    expect(purity.edges[0]).toBeCloseTo(86.6762, 3);
    expect(purity.edges[5]).toBeCloseTo(88.709, 3);
    const classes = g.cells.slice(0, 3).map((r) => r.find((c) => c.outcome === "purity_pct")!.cls);
    expect(new Set(classes).size).toBe(1);
  });
  it("states the raw-means caveat from the engine's imbalance flags only", () => {
    expect(g.caveat).toMatch(/^Raw means: clones ran at different process conditions \(feed_pct, glucose_gL\)/);
    const s = clone(summary);
    s.levels.forEach((l) => (l.flags = []));
    s.process_balance = { flag: false };
    expect(cloneCaveat(s)).toBeNull();
  });
  it("a column measured on mixed scales is split by scale, never pooled or coloured", () => {
    const s = clone(summary);
    s.levels[0].outcomes.titer_g_L = { ...s.levels[0].outcomes.titer_g_L, mean: null, ci95: null, ci_reason: "scales_mixed: per-scale summaries in by_scale, never pooled", by_scale: { ambr15: s.levels[0].outcomes.titer_g_L } };
    const cell = toCloneOutcomeGrid(s)!.cells[0][0];
    expect(cell.cls).toBeNull();
    expect(cell.text).toBe("n/a");
    expect(cell.reason).toMatch(/split by scale/);
    expect(cell.byScale).toEqual(["ambr15"]);
  });
  it("is null without a clone column (the page says why instead)", () => {
    expect(toCloneOutcomeGrid({ available: false, reason: "no clone column" })).toBeNull();
    expect(toCloneOutcomeGrid(null)).toBeNull();
  });
  it("describes itself and lists every cell in the Data table", () => {
    expect(describeCloneOutcome(g)).toMatch(/4 clones of clone, with the 95% interval and the run count in every cell\. 2 cells have fewer than 3 runs/);
    const t = cloneOutcomeTable(g);
    expect(t.rows).toHaveLength(4);
    expect(t.rows[3]).toContain(2);
  });
});

describe("CloneOutcomeHeatmap", () => {
  const g = toCloneOutcomeGrid(summary)!;
  it("draws one grid cell per clone and outcome, each labelled with its n, with one tab stop", () => {
    render(<CloneOutcomeHeatmap grid={g} source={source} width={900} />);
    const grid = screen.getByRole("grid");
    const cells = within(grid as unknown as HTMLElement).getAllByRole("gridcell");
    expect(cells).toHaveLength(12);
    for (const c of cells) expect(c.getAttribute("aria-label")).toMatch(/n = \d+/);
    expect(grid.getAttribute("tabindex")).toBe("0");
    expect(cells.every((c) => c.getAttribute("tabindex") == null)).toBe(true);
    expect(screen.getByText(/^From: Analysis of .* strain_summary\.levels\[\]\.outcomes · measured, no model/)).toBeTruthy();
  });
  it("arrow keys move the focused cell and Enter pins its details with the source field", () => {
    render(<CloneOutcomeHeatmap grid={g} source={source} width={900} />);
    const grid = screen.getByRole("grid");
    fireEvent.focus(grid);
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "Enter" });
    const tip = screen.getByRole("dialog");
    expect(tip.textContent).toMatch(/CHO-B07/);
    expect(tip.textContent).toMatch(/strain_summary\.levels\[1\]\.outcomes\.titer_g_L/);
    expect(tip.textContent).toMatch(/95% interval \(t\)/);
  });
});

describe("toCloneComparison (SV-G4)", () => {
  const c = toCloneComparison(summary)!;
  it("keeps measured, derived and predicted apart, relative to the engine's reference clone", () => {
    expect(c.reference).toBe("CHO-C33");
    const a12 = c.rows[0];
    expect(a12.measured?.basis).toBe("measured");
    expect(a12.adjusted?.basis).toBe("derived");
    expect(a12.predicted?.basis).toBe("predicted");
    expect(c.rows.find((r) => r.isReference)?.label).toBe("CHO-C33");
    expect(c.effectDomain![0]).toBeLessThanOrEqual(0);
    expect(c.effectDomain![1]).toBeGreaterThanOrEqual(0);
  });
  it("prints the adjusted effect with its interval and a sign", () => {
    expect(effectText(c.rows[0].adjusted)).toMatch(/^\u22121\.0 \[\u22121\.7, \u22120\.5\]$/);
    expect(effectText(null)).toBeNull();
  });
  it("names the policy: a detected column lets proposals choose among clones", () => {
    expect(c.policyNote).toMatch(/may choose among the clones \(policy factor; clone was detected by name, not declared\)/);
  });
  it("renders the engine's refusal verbatim where an effect or prediction is withheld", () => {
    const s = clone(summary);
    s.levels[3].adjusted_effect = { basis: "derived", estimate: null, ci95: null, refusal: { code: "clone_too_few_runs", reason: "CHO-D41 has 2 run(s) with a residual; an adjusted effect needs >=3.", what_would_fix_it: "run >=1 more recipe(s) on CHO-D41" } };
    s.levels[3].gp_at_reference = { basis: "predicted", pred: null, refusal: { code: "clone_too_few_runs", reason: "not predicted: n=2 < 3 runs on this clone" } };
    render(<CloneComparisonTable data={toCloneComparison(s)!} source={source} width={1100} />);
    expect(screen.getByText(/Not estimated: CHO-D41 has 2 run\(s\) with a residual/)).toBeTruthy();
    expect(screen.getByText(/Fix: run >=1 more recipe/)).toBeTruthy();
    expect(screen.getByText(/Refused: not predicted: n=2 < 3 runs/)).toBeTruthy();
    // The prediction column names its band's coverage and kind.
    expect(screen.getAllByText(/^90% held-out band$/).length).toBeGreaterThan(0);
  });
});

describe("clone chip (SV-G5)", () => {
  it("gives up to 8 clones a hue and a shape, then text only", () => {
    const g = cloneGlyphs(Array.from({ length: 10 }, (_, i) => `C${i}`));
    expect(g.get("C0")).toMatchObject({ color: "var(--chart-1)", shape: "circle" });
    expect(g.get("C1")!.shape).not.toBe(g.get("C0")!.shape);
    expect(g.get("C7")!.color).toBe("var(--fg-muted)");
    expect(g.get("C8")).toMatchObject({ color: null, shape: null });
  });
  it("reads the clone from a recipe only when the analysis has a clone column", () => {
    const key = cloneKeyOf(analysis)!;
    expect(key.column).toBe("clone");
    expect(cloneOfRecipe({ clone: "CHO-B07", pH: 7 }, key)).toBe("CHO-B07");
    expect(cloneOfRecipe({ pH: 7 }, key)).toBeNull();
    expect(cloneKeyOf({ strain_summary: { available: false, reason: "none" } })).toBeNull();
  });
  it("is hollow while a run awaits its result and filled once measured", () => {
    const key = cloneKeyOf(analysis)!;
    const { container, rerender } = render(<RunClone run={{ recipe: { clone: "CHO-C33" } as unknown as Record<string, number>, result: null, awaiting: true }} clone={key} />);
    expect(container.textContent).toMatch(/CHO-C33, clone, proposed or awaiting/);
    expect(container.querySelector("svg path")!.getAttribute("fill")).toBe("var(--surface)");
    rerender(<RunClone run={{ recipe: { clone: "CHO-C33" } as unknown as Record<string, number>, result: 4.2, awaiting: false }} clone={key} />);
    expect(container.textContent).toMatch(/clone, measured/);
    expect(container.querySelector("svg path")!.getAttribute("fill")).toBe("var(--chart-3)");
  });
});
