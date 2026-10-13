import { describe, expect, it } from "vitest";
import {
  affectedRowCount,
  CHECK_IDS,
  CHECK_INFO,
  conversionSummary,
  getCheckExplanation,
  getCheckLabel,
  groupFindingsByCheck,
  isRowListTruncated,
  rowListCaption,
  severityRank,
  sortFindings,
  validationHeadline,
  type CheckId,
  type UnitConversion,
  type ValidationFinding,
  type ValidationReport,
} from "@/lib/validation";

function finding(overrides: Partial<ValidationFinding>): ValidationFinding {
  return {
    check: "units_consistency",
    severity: "warning",
    message: "test finding",
    column: null,
    rows: [],
    detail: null,
    ...overrides,
  };
}

const NINE = Array.from({ length: 9 }, (_, i) => `check_${i}`);

function report(overrides: Partial<ValidationReport>): ValidationReport {
  return {
    schema_version: 1,
    status: "pass",
    mode: "warn",
    n_rows: 48,
    n_columns: 12,
    checks_run: NINE,
    counts: { error: 0, warning: 0, info: 0 },
    findings: [],
    conversions: [],
    ...overrides,
  };
}

describe("severityRank / sortFindings", () => {
  it("ranks error below warning below info", () => {
    expect(severityRank("error")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("info"));
  });

  it("sorts a mixed list errors-first, then warnings, then info", () => {
    const input = [
      finding({ severity: "info", message: "i" }),
      finding({ severity: "error", message: "e" }),
      finding({ severity: "warning", message: "w" }),
    ];
    const sorted = sortFindings(input);
    expect(sorted.map((f) => f.severity)).toEqual(["error", "warning", "info"]);
  });

  it("is stable within a severity (preserves original order among ties)", () => {
    const input = [
      finding({ severity: "warning", message: "w1" }),
      finding({ severity: "warning", message: "w2" }),
      finding({ severity: "error", message: "e1" }),
    ];
    const sorted = sortFindings(input);
    expect(sorted.map((f) => f.message)).toEqual(["e1", "w1", "w2"]);
  });

  it("does not mutate the input array", () => {
    const input = [finding({ severity: "info" }), finding({ severity: "error" })];
    const copy = [...input];
    sortFindings(input);
    expect(input).toEqual(copy);
  });
});

describe("groupFindingsByCheck", () => {
  it("groups findings under their check id", () => {
    const findings = [
      finding({ check: "units_consistency", severity: "warning" }),
      finding({ check: "duplicate_rows", severity: "error" }),
      finding({ check: "units_consistency", severity: "info" }),
    ];
    const groups = groupFindingsByCheck(findings);
    const unitsGroup = groups.find((g) => g.check === "units_consistency");
    expect(unitsGroup?.findings).toHaveLength(2);
  });

  it("orders groups by their most severe finding (error group first, then warning, then info)", () => {
    const findings = [
      finding({ check: "outliers", severity: "info" }),
      finding({ check: "missingness", severity: "warning" }),
      finding({ check: "duplicate_rows", severity: "error" }),
    ];
    const groups = groupFindingsByCheck(findings);
    expect(groups.map((g) => g.check)).toEqual(["duplicate_rows", "missingness", "outliers"]);
  });

  it("sorts findings within a group errors-first", () => {
    const findings = [finding({ check: "outliers", severity: "info" }), finding({ check: "outliers", severity: "error" })];
    const groups = groupFindingsByCheck(findings);
    expect(groups[0].findings.map((f) => f.severity)).toEqual(["error", "info"]);
  });

  it("returns an empty array for no findings", () => {
    expect(groupFindingsByCheck([])).toEqual([]);
  });
});

describe("check labels and explanations (exhaustive over the known checks)", () => {
  it("labels the engine's informative_missingness and constant_within_group checks", () => {
    expect(getCheckLabel("informative_missingness")).not.toBe("informative_missingness");
    expect(getCheckLabel("constant_within_group")).not.toBe("constant_within_group");
  });

  it("has a non-empty label and explanation for every known check id", () => {
    for (const id of CHECK_IDS) {
      const info = CHECK_INFO[id as CheckId];
      expect(info, `missing CHECK_INFO for "${id}"`).toBeDefined();
      expect(info.label.length, `empty label for "${id}"`).toBeGreaterThan(0);
      expect(info.explanation.length, `empty explanation for "${id}"`).toBeGreaterThan(0);
    }
  });

  it("getCheckLabel/getCheckExplanation resolve every known id via the same table", () => {
    for (const id of CHECK_IDS) {
      expect(getCheckLabel(id)).toBe(CHECK_INFO[id as CheckId].label);
      expect(getCheckExplanation(id)).toBe(CHECK_INFO[id as CheckId].explanation);
    }
  });

  it("falls back honestly (raw id, empty explanation) for an unrecognized check id", () => {
    expect(getCheckLabel("some_future_check")).toBe("some_future_check");
    expect(getCheckExplanation("some_future_check")).toBe("");
  });
});

describe("affectedRowCount / isRowListTruncated / rowListCaption", () => {
  it("uses detail.n_rows_affected as the true total when present", () => {
    const f = finding({ rows: [1, 2, 3], detail: { n_rows_affected: 3 } });
    expect(affectedRowCount(f)).toBe(3);
    expect(isRowListTruncated(f)).toBe(false);
  });

  it("falls back to rows.length when detail is absent", () => {
    const f = finding({ rows: [1, 2, 3], detail: null });
    expect(affectedRowCount(f)).toBe(3);
    expect(isRowListTruncated(f)).toBe(false);
  });

  it("detects truncation when n_rows_affected exceeds the capped rows list", () => {
    const rows = Array.from({ length: 20 }, (_, i) => i);
    const f = finding({ rows, detail: { n_rows_affected: 143 } });
    expect(isRowListTruncated(f)).toBe(true);
    expect(rowListCaption(f)).toBe("showing 20 of 143 affected rows");
  });

  it("does not claim truncation when the list is complete", () => {
    const f = finding({ rows: [3, 7, 11], detail: { n_rows_affected: 3 } });
    expect(isRowListTruncated(f)).toBe(false);
    expect(rowListCaption(f)).toBe("3 affected rows");
  });

  it("uses singular phrasing for exactly one affected row", () => {
    const f = finding({ rows: [3], detail: null });
    expect(rowListCaption(f)).toBe("1 affected row");
  });

  it("returns an empty caption when there are no rows", () => {
    expect(rowListCaption(finding({ rows: [] }))).toBe("");
  });
});

describe("validationHeadline", () => {
  it("leads with the error count and a caveat on fail", () => {
    const r = report({ status: "fail", counts: { error: 2, warning: 1, info: 0 }, n_rows: 48, n_columns: 12 });
    const headline = validationHeadline(r);
    expect(headline).toContain("2 errors");
    expect(headline).toContain("48 rows");
    expect(headline).toContain("12 columns");
  });

  it("uses singular phrasing for exactly one error", () => {
    const r = report({ status: "fail", counts: { error: 1, warning: 0, info: 0 } });
    expect(validationHeadline(r)).toContain("1 error ");
  });

  it("leads with the warning count on pass_with_warnings, and states plainly that there are no errors", () => {
    const r = report({ status: "pass_with_warnings", counts: { error: 0, warning: 3, info: 5 } });
    const headline = validationHeadline(r);
    expect(headline).toContain("3 warnings");
    expect(headline).toContain("No errors");
  });

  it("reports a clean pass with the checks_run count", () => {
    const r = report({ status: "pass", checks_run: NINE, n_rows: 48, n_columns: 12 });
    const headline = validationHeadline(r);
    expect(headline).toContain("All 9 checks passed");
    expect(headline).toContain("48 rows");
  });
});

describe("conversionSummary", () => {
  it("formats a known internal unit id into its human label", () => {
    const c: UnitConversion = { column: "Temp", from_units: ["F", "C"], to_unit: "_c", cells_converted: 12 };
    expect(conversionSummary(c)).toBe("Temp: F, C -> Celsius (12 cells converted)");
  });

  it("uses singular phrasing for exactly one cell converted", () => {
    const c: UnitConversion = { column: "Temp", from_units: ["F"], to_unit: "_c", cells_converted: 1 };
    expect(conversionSummary(c)).toBe("Temp: F -> Celsius (1 cell converted)");
  });

  it("falls back to the raw to_unit for an unrecognized internal id", () => {
    const c: UnitConversion = { column: "Weight", from_units: ["lb"], to_unit: "_g", cells_converted: 4 };
    expect(conversionSummary(c)).toBe("Weight: lb -> _g (4 cells converted)");
  });

  it("prefers the engine's to_unit_label over the local fallback map", () => {
    // The engine owns the unit vocabulary and now ships the display label. If it
    // ever disagrees with our legacy map, the engine wins - one source of truth.
    const c: UnitConversion = {
      column: "Temp",
      from_units: ["F"],
      to_unit: "_c",
      to_unit_label: "degrees Celsius",
      cells_converted: 3,
    };
    expect(conversionSummary(c)).toBe("Temp: F -> degrees Celsius (3 cells converted)");
  });

  it("labels a converted concentration column, which the old map rendered raw", () => {
    // Regression: `_g_l` was absent from the hand-built map, so a scientist saw
    // the literal string "_g_l" where "g/L" belonged.
    const c: UnitConversion = {
      column: "Titer",
      from_units: ["mg/mL"],
      to_unit: "_g_l",
      cells_converted: 40,
    };
    expect(conversionSummary(c)).toBe("Titer: mg/mL -> g/L (40 cells converted)");
  });
});
