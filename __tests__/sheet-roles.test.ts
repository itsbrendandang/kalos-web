import { describe, expect, it } from "vitest";
import type { ProvenanceEntry } from "@/lib/api";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";

const prov = (name: string, status: string): ProvenanceEntry => ({ name, status, coerced_cells: 0, non_null: 10 });

describe("columnsFromProvenance (the engine's own column names and roles)", () => {
  it("marks inputs, target and explains dropped columns", () => {
    const cols = columnsFromProvenance([
      prov("run_id", "dropped_id"), prov("pH", "kept_feature"), prov("note", "dropped_sparse"),
      prov("temp.1", "kept_feature"), prov("titer", "target"), prov("k", "dropped_constant_on_fitted_rows"),
    ]);
    expect(cols.filter((c) => c.usedAsInput).map((c) => c.name)).toEqual(["pH", "temp.1"]);
    expect(cols.find((c) => c.isTarget)?.name).toBe("titer");
    expect(cols.find((c) => c.name === "run_id")?.note).toBe("treated as an ID");
    expect(cols.find((c) => c.name === "note")?.note).toMatch(/mostly empty/);
    expect(cols.find((c) => c.name === "pH")?.note).toBeNull();
  });
  it("is empty without provenance (older engines), so no confirmation panel can be built on guesses", () => {
    expect(columnsFromProvenance(undefined)).toEqual([]);
  });
});

describe("mergeTargets keeps the full candidate list across roles re-fits", () => {
  it("replaces the list on an inferred fit, keeps it after a roles fit", () => {
    expect(mergeTargets([], ["a", "b", "c"], false)).toEqual(["a", "b", "c"]);
    expect(mergeTargets(["a", "b", "c"], ["b"], true)).toEqual(["a", "b", "c"]);
    expect(mergeTargets([], ["b"], true)).toEqual(["b"]);
  });
});
