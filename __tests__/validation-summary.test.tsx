// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ValidationSummary, sentence } from "@/components/campaign/validation-summary";
import type { ValidationFinding, ValidationReport } from "@/lib/validation";

afterEach(cleanup);

/*
 * First-time study, F13: a finding that counts affected rows shows those rows (with their values when the
 * sheet is in the browser) or does not speak of them; the warning count and the finding count agree.
 */

const f = (o: Partial<ValidationFinding>): ValidationFinding => ({ check: "outliers", severity: "warning", message: "x", column: "SP", rows: [], detail: null, ...o });
const report = (findings: ValidationFinding[], counts = { error: 0, warning: findings.filter((x) => x.severity === "warning").length, info: findings.filter((x) => x.severity === "info").length }): ValidationReport => ({
  schema_version: 1,
  status: counts.error ? "fail" : counts.warning ? "pass_with_warnings" : "pass",
  mode: "warn",
  n_rows: 235,
  n_columns: 6,
  checks_run: ["outliers", "provenance_metadata"],
  counts,
  findings,
  conversions: [],
});

function open(summary: HTMLElement) {
  const details = summary.closest("details")!;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

describe("sheet check findings", () => {
  it("names the rows it counts, with their values, and says how many Kalos did not name", () => {
    const rows = Array.from({ length: 20 }, (_, i) => i * 2);
    const r = report([f({ rows, detail: { n_rows_affected: 43 } })]);
    render(<ValidationSummary report={r} valueAt={(c, i) => (c === "SP" ? String(10 + i) : null)} />);
    expect(screen.getByText("SP - 43 runs affected, 20 of them named")).toBeTruthy();
    expect(screen.queryByText(/showing 20 of/)).toBeNull();
    open(screen.getByText("Show the 20 rows named"));
    const list = screen.getByText("Row 1").closest("ul")!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(within(list).getAllByRole("listitem")[1].textContent).toBe("Row 3: 12");
    expect(screen.getByText(/the other 23 are counted but not named/)).toBeTruthy();
  });

  it("counts warnings and notes apart, so the verdict's count is the count of findings listed", () => {
    const findings = [f({}), f({ check: "provenance_metadata", column: null }), f({ check: "provenance_metadata", column: null, severity: "info" }), f({ check: "missingness", severity: "info", column: "Notes" })];
    const r = report(findings);
    expect(sentence(r)).toBe("This run sheet is usable, with 2 warnings and 2 notes to review.");
    render(<ValidationSummary report={r} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the other 1 finding" }));
    expect(screen.queryByRole("button", { name: /Show the other/ })).toBeNull();
    expect(sentence(report([f({ severity: "info" })]))).toBe("This run sheet passed all 2 checks, with 1 note.");
  });

  it("the engine's check names stay out of the labels", () => {
    render(<ValidationSummary report={report([f({})])} />);
    open(screen.getByText("What was checked"));
    expect(screen.queryByText("outliers")).toBeNull();
    expect(screen.getByText(/Kalos warns about what it finds and still reads the sheet/)).toBeTruthy();
    expect(screen.queryByText(/warn mode/)).toBeNull();
  });
});
