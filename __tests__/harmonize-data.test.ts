import { describe, expect, it } from "vitest";
import type { Job, ProvenanceEntry } from "@/lib/api";
import {
  boxRangeText,
  cellsByColumn,
  columnRows,
  designRows,
  exclusionFacts,
  headerRow,
  jobProblem,
  narrowedBoxNote,
  orientationOf,
  orientationText,
  visualizationAbsentText,
  visualizationReasons,
  type HarmonizeAnalysis,
} from "@/components/harmonize/data-facts";

const prov = (name: string, status: string, non_null = 10, coerced_cells = 0, source?: string): ProvenanceEntry => ({ name, status, non_null, coerced_cells, source });
const base: HarmonizeAnalysis = { features: [], target: "y" };

describe("columnRows (column provenance table)", () => {
  it("names each column's status in plain words, keeping the raw engine status aside", () => {
    const rows = columnRows({
      ...base,
      provenance: [
        prov("run_id", "dropped_id", 10, 10, "inferred"),
        prov("pH", "kept_feature", 10, 0, "inferred"),
        prov("temp", "kept_feature", 10, 3, "declared"),
        prov("medium", "kept_feature", 10, 10, "inferred"),
        prov("y", "target", 10, 0),
      ],
      auto_categorical: ["medium"],
      categorical_features: ["medium"],
    });
    expect(rows.map((r) => [r.name, r.status, r.label, r.source])).toEqual([
      ["run_id", "dropped", "Left out: treated as an ID", "inferred"],
      ["pH", "kept", "Input", "inferred"],
      ["temp", "coerced", "Input, some cells not numbers", "declared"],
      ["medium", "kept", "Input, categorical (detected)", "inferred"],
      ["y", "target", "Target (maximized)", null],
    ]);
    expect(rows[0].raw).toBe("dropped_id");
  });
  it("is empty without provenance, never a guessed column list", () => {
    expect(columnRows(base)).toEqual([]);
  });
  it("reads a missing count as null (n/a), not 0", () => {
    const p = { name: "x", status: "kept_feature" } as unknown as ProvenanceEntry;
    const [row] = columnRows({ ...base, provenance: [p] });
    expect(row.coerced).toBeNull();
    expect(row.nonNull).toBeNull();
  });
});

describe("exclusionFacts", () => {
  it("always lists both row counts, n/a when the engine did not report them", () => {
    const facts = exclusionFacts(base);
    expect(facts.map((f) => f.value)).toEqual([null, null]);
  });
  it("falls back to the run record's data_drops and sums a per-column blank-cell map", () => {
    const facts = exclusionFacts({
      ...base,
      run: { data_drops: { rows_dropped: 3, censored_rows_excluded: 1, cells_by_reason: { missing: 2, non_numeric: 1 } } },
      data_drops: undefined,
    });
    expect(facts.map((f) => [f.label, f.value])).toEqual([
      ["Runs left out for a blank or unreadable cell", 3],
      ["Runs left out for a censored value", 1],
      ["Blank target or input cells", 2],
      ["Cells that were not numbers", 1],
    ]);
    const withMap = exclusionFacts({ ...base, n_dropped_incomplete: 0, data_drops: { blank_cells_as_absent: { a: 2, b: 3 } as unknown as number } });
    expect(withMap.at(-1)).toEqual({ label: "Blank cells read as absent (not as zero)", value: 5 });
  });
  it("flattens unusable cells by column, largest first, skipping zeros", () => {
    expect(cellsByColumn({ ...base, data_drops: { cells_by_column: { pH: { missing: 1, non_numeric: 0 }, temp: { non_numeric: 4 } } } })).toEqual([
      { column: "temp", reason: "cells that were not numbers", n: 4 },
      { column: "pH", reason: "blank target or input cells", n: 1 },
    ]);
  });
});

describe("designRows (the search box)", () => {
  it("uses the engine's observed range, marks categorical and unreported inputs, and narrowed boxes", () => {
    const rows = designRows({
      ...base,
      features: ["pH", "medium", "rpm", "temp"],
      feature_ranges: { pH: [6, 7.5], temp: [30, 37] },
      categorical_features: ["medium"],
      design_box_exclusions: [{ column: "temp", n_excluded: 2, lower: 31, upper: 37 }],
    });
    expect(rows.map((r) => [r.name, r.kind, r.low, r.high])).toEqual([
      ["pH", "continuous", 6, 7.5],
      ["medium", "categorical", null, null],
      ["rpm", "unreported", null, null],
      ["temp", "continuous", 30, 37],
    ]);
    expect(rows[3].narrowed).toEqual({ column: "temp", n_excluded: 2, lower: 31, upper: 37 });
  });
});

describe("sheet reading fields", () => {
  it("reads the header row from the top level, else the run record", () => {
    expect(headerRow({ ...base, header_row: 2 })).toBe(2);
    expect(headerRow({ ...base, run: { header_row: 1 } })).toBe(1);
    expect(headerRow(base)).toBeNull();
  });
  it("reads orientation defensively and words it plainly", () => {
    expect(orientationOf({ ...base, orientation: { orientation: "standard", confidence: 1 } })).toEqual({ orientation: "standard", confidence: 1 });
    expect(orientationOf({ ...base, orientation: "standard" })).toBeNull();
    expect(orientationOf(base)).toBeNull();
    expect(orientationText({ orientation: "transposed", confidence: 0.9 })).toMatch(/turned it so each run is a row/);
  });
  it("explains a missing picture from the engine's reason, or as an older analysis", () => {
    const r = visualizationReasons({ ...base, visualization_reasons: { embedding: "need at least 2 features for PCA", correlation: null } });
    expect(r).toEqual({ embedding: "need at least 2 features for PCA", correlation: null });
    expect(visualizationAbsentText("embedding", r!.embedding)).toBe("The run map needs at least two inputs, and this sheet has fewer.");
    expect(visualizationAbsentText("correlation", null)).toMatch(/made before the engine returned it/);
    expect(visualizationAbsentText("correlation", "Spearman correlation computation failed")).toBe("The engine could not compute the correlation map for this sheet.");
  });
});

describe("narrowed design box (lib/num settings precision)", () => {
  it("prints both ends at the precision the narrowed range supports, with a U+2212 minus", () => {
    expect(boxRangeText(30, 40)).toBe("30.0 to 40.0");
    expect(boxRangeText(31, 37)).toBe("31.00 to 37.00");
    expect(boxRangeText(6.005, 7.594)).toBe("6.01 to 7.59");
    expect(boxRangeText(-2.5, 380)).toBe("\u22123 to 380");
    expect(boxRangeText(null, 37)).toBe("n/a to 37.0");
  });
  it("summarizes the engine's exclusions with grouped counts, or null when none", () => {
    expect(narrowedBoxNote(undefined)).toBeNull();
    expect(narrowedBoxNote([])).toBeNull();
    expect(narrowedBoxNote([{ column: "temp", n_excluded: 1204, lower: 31, upper: 37 }])).toBe(
      "Search box narrowed for 1 input: temp (31.00 to 37.00, 1,204 values left out).",
    );
    expect(narrowedBoxNote([{ column: "a", n_excluded: 1, lower: 0, upper: 1 }, { column: "b", n_excluded: 2, lower: 0, upper: 400 }])).toBe(
      "Search box narrowed for 2 inputs: a (0.00 to 1.00, 1 value left out); b (0 to 400, 2 values left out).",
    );
  });
});

describe("jobProblem", () => {
  const j = (state: Job["state"], error: Job["error"] = null) => ({ state, error }) as Job;
  it("is null for active and succeeded jobs", () => {
    expect(jobProblem(null)).toBeNull();
    expect(jobProblem(j("running"))).toBeNull();
    expect(jobProblem(j("succeeded"))).toBeNull();
  });
  it("carries the engine's code for failures, a timeout code when none, and job_cancelled for a cancel", () => {
    expect(jobProblem(j("failed", { code: "worker_exited", message: "x" }))).toEqual({ kind: "failed", code: "worker_exited", detail: "x" });
    expect(jobProblem(j("timed_out"))).toEqual({ kind: "failed", code: "timeout", detail: null });
    expect(jobProblem(j("cancelled"))).toEqual({ kind: "cancelled", code: "job_cancelled", detail: null });
  });
});
