import { describe, expect, it } from "vitest";
import type { ProvenanceEntry } from "@/lib/api";
import { columnsFromProvenance, mergeTargets } from "@/lib/sheet-roles";

const prov = (name: string, status: string, non_null = 10, coerced_cells = 0): ProvenanceEntry => ({ name, status, coerced_cells, non_null });

describe("columnsFromProvenance (the engine's own column names and roles)", () => {
  it("marks inputs, target and names who left each other column out", () => {
    const cols = columnsFromProvenance([
      prov("run_id", "dropped_id"), prov("pH", "kept_feature"), prov("temp.1", "kept_feature"),
      prov("titer", "target"), prov("k", "dropped_constant_on_fitted_rows"),
    ]);
    expect(cols.filter((c) => c.usedAsInput).map((c) => c.name)).toEqual(["pH", "temp.1"]);
    expect(cols.find((c) => c.isTarget)?.name).toBe("titer");
    expect(cols.find((c) => c.name === "run_id")).toMatchObject({ kind: "engine_excluded", note: "treated as an ID", warning: null });
    expect(cols.find((c) => c.name === "pH")).toMatchObject({ kind: "input", note: null, warning: null });
    expect(cols.find((c) => c.name === "titer")).toMatchObject({ kind: "target", note: null });
    expect(cols.find((c) => c.name === "k")).toMatchObject({ kind: "engine_excluded", warning: "never changes in the fitted rows" });
  });
  it("is empty without provenance (older engines), so no confirmation panel can be built on guesses", () => {
    expect(columnsFromProvenance(undefined)).toEqual([]);
  });
});

describe("column exclusion notes keep four facts apart", () => {
  const sent = { target: "yield", features: ["pH", "rpm"] };

  it("engine auto-exclusion: ID/date and output names get the engine's reason, not a quality warning", () => {
    const cols = columnsFromProvenance([prov("sample_id", "dropped_id", 10, 10), prov("final_od", "dropped_output", 10, 0)]);
    expect(cols.map((c) => [c.kind, c.note, c.warning])).toEqual([
      ["engine_excluded", "treated as an ID", null],
      ["engine_excluded", "looks like a measured output", null],
    ]);
  });

  it("USER exclusion: a fully numeric column the engine reports as dropped_sparse is NOT 'mostly empty'", () => {
    // The repro: untick Temp_C (all 12 cells numeric), re-fit, the engine's fallthrough status is dropped_sparse.
    const cols = columnsFromProvenance(
      [prov("pH", "kept_feature", 12), prov("rpm", "kept_feature", 12), prov("Temp_C", "dropped_sparse", 12, 0), prov("yield", "target", 12)],
      { sentRoles: sent },
    );
    const t = cols.find((c) => c.name === "Temp_C")!;
    expect(t).toMatchObject({ kind: "user_excluded", note: "You excluded this column", warning: null });
    expect(JSON.stringify(t)).not.toMatch(/mostly empty|not numeric/);
  });

  it("the old target after switching target is explained as such, not as a data problem", () => {
    const cols = columnsFromProvenance(
      [prov("pH", "kept_feature", 12), prov("lipase_titer", "dropped_sparse", 12, 0), prov("biomass_gL", "target", 12)],
      { sentRoles: { target: "biomass_gL", features: ["pH"] }, formerTargets: ["lipase_titer"] },
    );
    expect(cols.find((c) => c.name === "lipase_titer")).toMatchObject({ kind: "user_excluded", note: "Was the target, so it is not an input", warning: null });
  });

  it("a column the engine itself left out of the inferred fit is not credited to the user after a roles re-fit", () => {
    // Roles fits use the generic profile, so `biomass_gL` (an output by name) comes back as an unremarkable "not chosen".
    const baseline = [prov("pH", "kept_feature", 12), prov("Temp_C", "kept_feature", 12), prov("biomass_gL", "dropped_output", 12), prov("run_id", "dropped_id", 12), prov("yield", "target", 12)];
    const refit = [prov("pH", "kept_feature", 12), prov("Temp_C", "dropped_sparse", 12), prov("biomass_gL", "dropped_sparse", 12), prov("run_id", "dropped_id", 12), prov("yield", "target", 12)];
    const cols = columnsFromProvenance(refit, { sentRoles: { target: "yield", features: ["pH"] }, baseline });
    const by = Object.fromEntries(cols.map((c) => [c.name, [c.kind, c.note]]));
    expect(by.Temp_C).toEqual(["user_excluded", "You excluded this column"]); // the engine had kept it; the user unticked it
    expect(by.biomass_gL).toEqual(["engine_excluded", "looks like a measured output"]);
    expect(by.run_id).toEqual(["engine_excluded", "treated as an ID"]);
  });

  it("a column the engine left out as sparse in the inferred fit stays the engine's call", () => {
    const [c] = columnsFromProvenance([prov("misc", "dropped_sparse", 12)], {
      sentRoles: { target: "y", features: ["pH"] },
      baseline: [prov("misc", "dropped_sparse", 12)],
    });
    expect(c).toMatchObject({ kind: "engine_excluded", note: "Left out by Kalos" });
  });

  it("without explicit roles (engine inferred), dropped_sparse is the engine's call and says nothing specific", () => {
    const [c] = columnsFromProvenance([prov("misc", "dropped_sparse", 12, 0)]);
    expect(c).toMatchObject({ kind: "engine_excluded", note: "Left out by Kalos", warning: null });
  });

  it("data-quality warnings come only from the provenance counts: empty, mostly text, mostly empty", () => {
    const cols = columnsFromProvenance(
      [
        prov("full", "kept_feature", 20),
        prov("blank", "dropped_all_blank", 0),
        prov("texty", "dropped_sparse", 10, 6),
        prov("thin", "dropped_sparse", 4, 0),
        prov("ok_text", "dropped_sparse", 20, 2),
      ],
      { sentRoles: { target: "x", features: ["full"] } },
    );
    const w = Object.fromEntries(cols.map((c) => [c.name, c.warning]));
    expect(w.blank).toBe("has no values");
    expect(w.texty).toBe("mostly not numbers (6 of 10 filled cells)");
    expect(w.thin).toBe("mostly empty (4 filled of at least 20 rows)");
    expect(w.ok_text).toBeNull(); // 90% numeric and fully filled: no finding
    // a warning does not change WHO excluded it
    expect(cols.find((c) => c.name === "texty")?.kind).toBe("user_excluded");
  });

  it("constant statuses are engine findings about the data and surface as warnings", () => {
    const [c] = columnsFromProvenance([prov("k", "dropped_constant", 12)]);
    expect(c).toMatchObject({ kind: "engine_excluded", warning: "never changes" });
  });

  it("a column the user left ticked but the engine still dropped is the engine's decision, not the user's", () => {
    const [c] = columnsFromProvenance([prov("pH", "dropped_constant_on_fitted_rows", 12)], { sentRoles: { target: "y", features: ["pH"] } });
    expect(c.kind).toBe("engine_excluded");
  });

  it("an engine-declared id exclusion (source declared) is the user's instruction", () => {
    const [c] = columnsFromProvenance([{ ...prov("batch", "dropped_id", 12), source: "declared" }]);
    expect(c).toMatchObject({ kind: "user_excluded", note: "You excluded this column" });
  });

  it("unknown dropped_* statuses keep a readable raw reason", () => {
    const [c] = columnsFromProvenance([prov("z", "dropped_weird_thing", 12)]);
    expect(c).toMatchObject({ kind: "engine_excluded", note: "weird thing" });
  });
});

describe("mergeTargets keeps the full candidate list across roles re-fits", () => {
  it("replaces the list on an inferred fit, keeps it after a roles fit", () => {
    expect(mergeTargets([], ["a", "b", "c"], false)).toEqual(["a", "b", "c"]);
    expect(mergeTargets(["a", "b", "c"], ["b"], true)).toEqual(["a", "b", "c"]);
    expect(mergeTargets([], ["b"], true)).toEqual(["b"]);
  });
});
