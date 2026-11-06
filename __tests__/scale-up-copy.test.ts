import { describe, expect, it } from "vitest";
import { failedCheckWords, isKnownCheck, readoutVerdict } from "@/app/library/scale-up/readout-copy";

describe("scale-up readout sentences", () => {
  it("has plain words for every check Kalos documents", () => {
    for (const c of ["required_columns", "min_distinct_scales", "non_finite_dropped_fraction", "target_not_interpolation", "target_ratio_hard_cap", "invalid_target"]) {
      expect(isKnownCheck(c)).toBe(true);
      expect(failedCheckWords(c)).not.toMatch(/_/);
    }
  });

  it("never echoes an unknown check name into the sentence", () => {
    expect(isKnownCheck("some_new_check")).toBe(false);
    expect(readoutVerdict({ kind: "gate", failedCheck: "some_new_check", detail: "x" }, 200)).toBe("Kalos could not answer: one of its checks did not pass.");
  });

  it("states each outcome in one sentence", () => {
    expect(readoutVerdict({ kind: "html", html: "<p/>" }, 2000)).toMatch(/^Kalos's answer for 2,000 L is below\./);
    expect(readoutVerdict({ kind: "html", html: "<p/>" }, null)).toMatch(/^Kalos's answer is below\./);
    expect(readoutVerdict({ kind: "gate", failedCheck: "required_columns", detail: "x" }, 200)).toBe("Kalos could not answer: the sheet is missing a column it needs.");
    expect(readoutVerdict({ kind: "busy", retryAfterSeconds: 30 }, 200)).toBe("Kalos is busy; try again in 30 s.");
    expect(readoutVerdict({ kind: "busy", retryAfterSeconds: null }, 200)).toBe("Kalos is busy; try again in a moment.");
  });

  it("never says engine on the surface", () => {
    for (const r of [{ kind: "auth" as const }, { kind: "upload" as const, message: "x" }, { kind: "unavailable" as const, message: "x" }]) {
      expect(readoutVerdict(r, null)).not.toMatch(/\bengine\b/i);
    }
  });
});
