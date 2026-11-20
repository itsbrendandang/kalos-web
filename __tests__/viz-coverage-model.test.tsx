// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/clones-v7-analysis.json";
import rowsFixture from "./fixtures/clones-v7-export-rows.json";
import { CoverageMatrixChart } from "@/components/viz/charts/coverage-matrix";
import { ModelMultiplesChart } from "@/components/viz/charts/model-multiples";
import type { AnalyzeResult, RowsExport } from "@/lib/api";
import { sourceFromAnalysis } from "@/lib/source";
import {
  binEdges,
  binOf,
  COVERAGE_BINS,
  coverageInputs,
  coverageTable,
  describeCoverage,
  exportRows,
  idColumnOf,
  numericValue,
  toCoverageMatrix,
} from "@/lib/viz-data/coverage-matrix";
import { describeMultiples, meanClass, nearestGrid, toModelMultiples } from "@/lib/viz-data/model-multiples";

afterEach(cleanup);

const a = fixture as unknown as AnalyzeResult & { dataset: string };
const x = rowsFixture as unknown as RowsExport;

describe("coverage matrix (H2)", () => {
  const rows = exportRows(x, idColumnOf(a));
  const m = toCoverageMatrix(a, rows);
  it("bins with 8 equal-width bins over the engine's search box, edges included", () => {
    expect(binEdges(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(binOf(8, 0, 8)).toBe(COVERAGE_BINS - 1);
    expect(binOf(0, 0, 8)).toBe(0);
    expect(binOf(8.01, 0, 8)).toBeNull();
    expect(m.inputs[0].edges[0]).toBe(a.feature_ranges![m.inputs[0].name][0]);
    expect(m.inputs[0].edges[COVERAGE_BINS]).toBe(a.feature_ranges![m.inputs[0].name][1]);
  });
  it("orders inputs by the engine's drivers and leaves covariates out", () => {
    expect(m.inputs.map((i) => i.name)).toEqual(coverageInputs(a).slice(0, 4));
    expect(coverageInputs(a)).not.toContain("passage");
    expect(coverageInputs(a)[0]).toBe(a.drivers.find((d) => a.feature_ranges?.[d.name])!.name);
  });
  it("reads numbers and numeric text only, and counts what it could not place", () => {
    expect(numericValue("5.35")).toBe(5.35);
    expect(numericValue("ERR")).toBeNull();
    expect(numericValue("<LOD")).toBeNull();
    expect(numericValue(" 1e-3 ")).toBe(0.001);
    expect(m.notNumeric.glucose_gL).toBe(1);
  });
  it("every pair's counts add up to the rows with both inputs placed, and the diagonal to each input's placed rows", () => {
    for (const p of m.pairs) {
      const total = p.counts.flat().reduce((s, n) => s + n, 0);
      expect(total).toBeLessThanOrEqual(m.nRows);
      expect(total).toBeGreaterThanOrEqual(m.nPlaced);
    }
    const n0 = m.diagonal[0].reduce((s, n) => s + n, 0);
    expect(n0).toBe(m.nRows - (m.notNumeric[m.inputs[0].name] ?? 0) - (m.outside[m.inputs[0].name] ?? 0));
  });
  it("filters to the rows Kalos rounds added", () => {
    const r = toCoverageMatrix(a, rows, { filter: "rounds" });
    expect(r.nRows).toBe(rows.filter((x) => x.origin === "round").length);
    expect(r.nRows).toBeGreaterThan(0);
  });
  it("describes itself and lists every bin of every pair in the Data table", () => {
    expect(describeCoverage(m)).toMatch(/^Runs per bin for 6 pairs of 4 inputs/);
    expect(coverageTable(m).rows).toHaveLength(6 * COVERAGE_BINS * COVERAGE_BINS);
  });
  it("prints n in every pair cell, 0 included, with one tab stop per pair", () => {
    render(<CoverageMatrixChart data={m} source={sourceFromAnalysis(a, "export/rows", "measured")} width={1100} />);
    const grids = screen.getAllByRole("grid");
    expect(grids).toHaveLength(6);
    for (const g of grids) {
      const cells = within(g as unknown as HTMLElement).getAllByRole("gridcell");
      expect(cells).toHaveLength(64);
      for (const c of cells) expect(c.textContent).toMatch(/^\d+$/);
      expect(g.getAttribute("tabindex")).toBe("0");
    }
  });
});

describe("model mean and uncertainty small multiples (H3)", () => {
  const m = toModelMultiples(a)!;
  it("reads the engine's one surface pair with its σ grid and projects the measured runs into grid cells", () => {
    expect(m.surface!.xName).toBe(a.response_surface!.x_feature);
    expect(m.surface!.sd).not.toBeNull();
    expect(m.surface!.nRuns).toBe(a.response_surface!.runs.length);
    expect(m.surface!.runs.flat().reduce((s, n) => s + n, 0)).toBe(m.surface!.nRuns);
  });
  it("nearestGrid picks a grid point, never a value between grid points", () => {
    expect(nearestGrid([0, 1, 2], 1.4)).toBe(1);
    expect(nearestGrid([0, 1, 2], 1.6)).toBe(2);
    expect(nearestGrid([0, 1, 2], 2.6)).toBeNull();
  });
  it("has one strip row for the reference recipe and one per clone, sharing colour classes with the surface", () => {
    expect(m.rows[0].label).toBe("Best measured recipe");
    expect(m.rows.slice(1).map((r) => r.clone)).toEqual(["CHO-A12", "CHO-B07", "CHO-C33", "CHO-D41"]);
    const all = [...m.surface!.mean.flat(), ...m.rows.flatMap((r) => r.panels.flatMap((p) => p?.mean ?? []))];
    expect(m.meanEdges[0]).toBe(Math.min(...all));
    expect(m.meanEdges[5]).toBe(Math.max(...all));
    for (const v of all) expect(meanClass(m, v)).not.toBeNull();
  });
  it("a clone the engine did not slice keeps its row with the engine's message", () => {
    const b = JSON.parse(JSON.stringify(a));
    b.slices_by_level.clone["CHO-D41"] = [];
    b.slices_by_level_skipped.clone = [{ level: "CHO-D41", reason: "clone_too_few_runs", n_runs: 2, message: "slice not shown: n=2 < 3 runs on this clone" }];
    const r = toModelMultiples(b)!.rows.find((x) => x.clone === "CHO-D41")!;
    expect(r.skipped).toBe("slice not shown: n=2 < 3 runs on this clone");
  });
  it("is labelled a model prediction and names the missing engine field for more pairs", () => {
    expect(describeMultiples(m, "titer_g_L")).toMatch(/^Model predictions, not measurements/);
    render(<ModelMultiplesChart data={m} target="titer_g_L" unit="g/L" proposals={[]} source={sourceFromAnalysis(a, "response_surface", "predicted")} width={1100} />);
    expect(screen.getByText(/More input pairs need engine field response_surfaces\[\]/)).toBeTruthy();
    expect(screen.getByText(/not held-out calibrated/)).toBeTruthy();
    // One tab stop per heatmap panel: the two surfaces plus each strip panel.
    const grids = screen.getAllByRole("grid");
    expect(grids.length).toBe(2 + m.rows.reduce((s, r) => s + r.panels.filter(Boolean).length, 0));
  });
});
