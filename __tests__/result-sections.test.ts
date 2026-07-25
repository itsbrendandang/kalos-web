import { describe, expect, it } from "vitest";
import type { AnalyzeResult } from "@/lib/api";
import { missingResultSections } from "@/lib/experiments";

/** A fully-formed DONE-experiment result, matching the current AnalyzeResult
 *  schema. Individual fields are deleted per-test to simulate a persisted
 *  record from before that field existed (see the schema-growth comments on
 *  `drivers`/`oof`/`proposals`'s neighbors in lib/api.ts) - `as unknown as
 *  AnalyzeResult` stands in for that, since the *type* claims these fields
 *  are always present even though an older stored record's JSON may not
 *  have them. */
function baseResult(): AnalyzeResult {
  return {
    n: 12,
    d: 3,
    target: "titer",
    group_col: null,
    targets: ["titer"],
    features: ["temp", "ph", "feed"],
    cv_spearman: 0.6,
    best: 4.2,
    drivers: [{ name: "temp", rho: 0.5, ci95: [0.1, 0.8], significant: true }],
    proposal_features: ["temp", "ph", "feed"],
    proposals: [{ vals: [1, 2, 3], pred: 4.1, std: 0.2, mode: "exploit", reason: "near optimum" }],
    oof: [[3.9, 4.0]],
  };
}

describe("missingResultSections", () => {
  it("reports no missing sections for a fully-formed result", () => {
    expect(missingResultSections(baseResult())).toEqual([]);
  });

  it("classifies a DONE experiment's result missing `drivers` as incomplete, not crashing", () => {
    const result = baseResult() as Record<string, unknown>;
    delete result.drivers;

    expect(() => missingResultSections(result as unknown as AnalyzeResult)).not.toThrow();
    expect(missingResultSections(result as unknown as AnalyzeResult)).toEqual(["drivers"]);
  });

  it("classifies a result missing `oof` and `proposals` together", () => {
    const result = baseResult() as Record<string, unknown>;
    delete result.oof;
    delete result.proposals;

    expect(missingResultSections(result as unknown as AnalyzeResult)).toEqual(["oof", "proposals"]);
  });

  it("treats a non-array value (not just a missing key) as missing", () => {
    const result = { ...baseResult(), drivers: null } as unknown as AnalyzeResult;

    expect(missingResultSections(result)).toEqual(["drivers"]);
  });
});
