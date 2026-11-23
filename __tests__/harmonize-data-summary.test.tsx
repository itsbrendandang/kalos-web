// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { YourData } from "@/components/harmonize/your-data";
import type { HarmonizeAnalysis } from "@/components/harmonize/data-facts";
import type { ValidationReport } from "@/lib/validation";

afterEach(cleanup);

const report = (status: ValidationReport["status"]): ValidationReport => ({
  schema_version: 1, status, mode: "warn", n_rows: 20, n_columns: 2,
  checks_run: ["units_consistency", "physical_bounds"],
  counts: { error: 1, warning: 2, info: 0 }, findings: [], conversions: [],
});

describe("Research data's always-visible quality summary", () => {
  it.each([
    ["pass", "This run sheet passed all 2 checks."],
    ["pass_with_warnings", "This run sheet is usable, with 2 warnings to review."],
    ["fail", "Fix 1 problem in this run sheet before you rely on it."],
  ] as const)("keeps the %s verdict and engine exclusion counts outside the tabs", (status, sentence) => {
    const analysis: HarmonizeAnalysis = {
      features: [], target: "titer", validation: report(status), n_dropped_incomplete: 3, n_censored_excluded: 5,
    };
    render(<YourData analysis={analysis} roles={{}} />);
    const summary = screen.getByRole("region", { name: "Data check and excluded rows" });
    expect(within(summary).getByText(sentence)).toBeTruthy();
    expect(within(summary).getByText("3")).toBeTruthy();
    expect(within(summary).getByText("5")).toBeTruthy();
    expect(summary.closest('[role="tabpanel"]')).toBeNull();
    expect(screen.getByRole("tab", { name: "Study & source", selected: true })).toBeTruthy();
  });

  it("does not turn missing checks or excluded-row counts into a pass or zero", () => {
    render(<YourData analysis={{ features: [], target: "titer" }} roles={{}} />);
    const summary = screen.getByRole("region", { name: "Data check and excluded rows" });
    expect(within(summary).getByText(/without a data check/)).toBeTruthy();
    expect(within(summary).getAllByText("n/a")).toHaveLength(2);
    expect(within(summary).queryByText("0")).toBeNull();
  });
});
