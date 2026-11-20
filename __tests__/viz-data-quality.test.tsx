// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/clones-v7-analysis.json";
import { DataQualityHeatmap } from "@/components/viz/charts/data-quality-heatmap";
import type { AnalyzeResult } from "@/lib/api";
import { sourceFromAnalysis } from "@/lib/source";
import { dataQualityTable, describeDataQuality, leftOutWhy, qualityCellText, toDataQuality, type QualityAnalysis } from "@/lib/viz-data/data-quality";

afterEach(cleanup);

const a = fixture as unknown as AnalyzeResult & QualityAnalysis & { dataset: string };

describe("toDataQuality (H5)", () => {
  const q = toDataQuality(a)!;
  const row = (name: string) => q.rows.findIndex((r) => r.name === name);
  const col = (key: string) => q.columns.findIndex((c) => c.key === key);
  it("has one row per sheet column, in the engine's provenance order, with plain roles", () => {
    expect(q.rows.map((r) => r.name)).toEqual(a.provenance!.map((p) => p.name));
    expect(q.rows[row("clone")].roleText).toBe("Clone");
    expect(q.rows[row("titer_g_L")].role).toBe("target");
    expect(q.rows[row("purity_pct")].roleText).toBe("Left out: another outcome, not an input");
    expect(q.rows[row("passage")].roleText).toBe("Covariate, recorded, not fitted");
  });
  it("takes every count from data_drops.cells_by_column and prints it, 0 included", () => {
    expect(q.cells[row("feed_pct")][col("missing")]).toMatchObject({ kind: "count", n: 1 });
    expect(q.cells[row("glucose_gL")][col("non_numeric")]).toMatchObject({ kind: "count", n: 1 });
    expect(q.cells[row("pH")][col("missing")]).toMatchObject({ kind: "count", n: 0, cls: 0 });
    expect(qualityCellText(q.cells[row("pH")][col("missing")])).toBe("0");
  });
  it("a column the model left out is 'not checked' with the reason, never 0 issues", () => {
    const c = q.cells[row("purity_pct")][col("missing")];
    expect(c.kind).toBe("not-checked");
    expect(qualityCellText(c)).toBe("not checked");
    const passage = q.cells[row("passage")][col("missing")];
    expect(passage.kind === "not-checked" && passage.reason).toMatch(/recorded but not used as a model input/);
  });
  it("text in a clone or categorical column is expected, not an error", () => {
    expect(q.cells[row("clone")][col("non_numeric")]).toMatchObject({ kind: "expected", text: "text levels" });
  });
  it("adds a column per validation check that fired on a column, with the engine's messages as reasons", () => {
    const k = q.columns.findIndex((c) => c.key === "check:strain_column_detected");
    expect(k).toBeGreaterThan(0);
    expect(q.columns[k].label).toBe("Clone column detected");
    const c = q.cells[row("clone")][k];
    expect(c.kind).toBe("note");
    expect(c.kind === "note" && c.reasons[0]).toMatch(/read as the production clone/);
    // dropped_cells restates the missing / not-a-number counts and gets no column of its own.
    expect(q.columns.some((x) => x.key === "check:dropped_cells")).toBe(false);
  });
  it("keeps whole-sheet findings and the excluded-run counts for the footer", () => {
    expect(q.rowsDropped).toBe(a.n_dropped_incomplete);
    expect(q.sheetFindings.some((f) => f.check === "provenance_metadata")).toBe(true);
  });
  it("words the engine's drop statuses plainly", () => {
    expect(leftOutWhy("dropped_id")).toBe("an ID or label column");
    expect(leftOutWhy("dropped_weird_thing")).toBe("weird thing");
  });
  it("is null without provenance", () => {
    expect(toDataQuality({ ...a, provenance: [] })).toBeNull();
  });
  it("describes itself and lists every cell in the Data table", () => {
    expect(describeDataQuality(q)).toMatch(/^Data check for 11 columns of 55 rows/);
    expect(dataQualityTable(q).rows).toHaveLength(11);
  });
});

describe("DataQualityHeatmap", () => {
  it("prints a count, 'not checked' or the expected-text note in every cell, with one tab stop and a source footer", () => {
    const q = toDataQuality(a)!;
    render(<DataQualityHeatmap data={q} source={sourceFromAnalysis(a, "provenance, data_drops, validation", "derived")} width={1100} />);
    const grid = screen.getByRole("grid");
    const cells = within(grid as unknown as HTMLElement).getAllByRole("gridcell");
    expect(cells).toHaveLength(q.rows.length * q.columns.length);
    expect(cells.some((c) => /purity_pct, Missing: not checked/.test(c.getAttribute("aria-label") ?? ""))).toBe(true);
    expect(screen.getByText(/^From: .*data_drops\.cells_by_column/)).toBeTruthy();
    expect(screen.getByText(/Runs left out of the fit: \d+ for a missing or non-numeric cell/)).toBeTruthy();
  });
});
