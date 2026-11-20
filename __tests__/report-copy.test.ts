import { describe, expect, it } from "vitest";
import { OPERATING_RANGE_REASONS, auditActionWords, auditOutcomeWords, typedValue } from "@/components/report/report-copy";

describe("report copy", () => {
  it("has plain words for all 15 operating-ranges reason codes in the engine contract", () => {
    const codes = [
      "threshold_missing", "no_data", "no_analysis", "analysis_stale", "reliability_unknown", "model_not_reliable", "goal_unrecognized", "analysis_incomplete",
      "categorical_only_design", "refit_data_mismatch", "anonymized_mapping_unavailable", "design_box_degenerate", "model_fit_failed", "no_region_found", "region_too_small",
    ];
    for (const c of codes) expect(OPERATING_RANGE_REASONS[c]?.reason, c).toBeTruthy();
    // No raw routes or codes leak into the plain words.
    for (const v of Object.values(OPERATING_RANGE_REASONS)) expect(`${v.reason} ${v.fix ?? ""}`).not.toMatch(/\/api\/|_[a-z]+_|POST/);
  });

  it("names audit actions in plain words and falls back without guessing", () => {
    expect(auditActionWords("campaign.result")).toBe("Recorded or corrected a measured result");
    expect(auditActionWords("campaign.export_rows")).toBe("Exported the raw data rows");
    expect(auditActionWords("campaign.something_new")).toBe("Other engine action");
  });

  it("reads outcomes", () => {
    expect(auditOutcomeWords("ok")).toBe("Done");
    expect(auditOutcomeWords("http_409")).toBe("Not done (refused, conflicting state, HTTP 409)");
    expect(auditOutcomeWords("http_503")).toBe("Not done (engine error, HTTP 503)");
    expect(auditOutcomeWords("weird")).toBe("weird");
  });

  it("shows a typed number at the precision it was typed", () => {
    expect(typedValue(1.5, "g/L")).toBe("1.5\u00A0g/L");
    expect(typedValue(0.3)).toBe("0.3");
    expect(typedValue(12)).toBe("12");
    expect(typedValue(-0.25)).toBe("\u22120.25");
    expect(typedValue(1e-7)).toBe("<0.0001");
  });
});
