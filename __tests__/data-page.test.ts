import { describe, expect, it } from "vitest";
import { roleLabel, runSheetSentence, unknownStatuses, UNKNOWN_ROLE } from "@/app/data/roles";

const prov = (name: string, status: string) => ({ name, status, coerced_cells: 0, non_null: 10 });

describe("data page column roles", () => {
  it("names every status the engine emits in plain words", () => {
    for (const s of ["kept_feature", "target", "dropped_id", "dropped_output", "dropped_constant", "dropped_constant_on_fitted_rows", "dropped_all_blank", "dropped_non_numeric", "dropped_sparse"]) {
      expect(roleLabel(s)).not.toBe(UNKNOWN_ROLE);
      expect(roleLabel(s)).not.toMatch(/_/);
    }
  });

  it("never rewrites an unknown status into prose", () => {
    expect(roleLabel("dropped_something_new")).toBe(UNKNOWN_ROLE);
    expect(unknownStatuses([prov("a", "kept_feature"), prov("b", "dropped_something_new")]).map((c) => c.name)).toEqual(["b"]);
  });

  it("writes the run-sheet sentence with counts and the target", () => {
    expect(runSheetSentence({ dataset: "pichia_HSA.csv", n: 213, features: ["a", "b", "c", "d"], target: "Titer" })).toBe(
      "The model is working from pichia_HSA.csv: 213 runs, 4 inputs, raising Titer.",
    );
    expect(runSheetSentence({ dataset: "x.csv", n: 1, features: ["a"], target: "y" })).toBe("The model is working from x.csv: 1 run, 1 input, raising y.");
  });
});
