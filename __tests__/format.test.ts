import { describe, expect, it } from "vitest";
import { formatBand, formatNumber, formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";

describe("formatNumber", () => {
  it("target values: 2 decimals with grouping", () => {
    expect(formatNumber(5.4249)).toBe("5.42");
    expect(formatNumber(5.425)).toBe("5.43");
    expect(formatNumber(1234.5)).toBe("1,234.50");
    expect(formatNumber(-0.5)).toBe("-0.50");
  });

  it("never prints a negative zero", () => {
    expect(formatNumber(-0.001)).toBe("0.00");
    expect(formatNumber(-0.001, "value", { sign: true })).toBe("0.00");
    expect(formatNumber(-0.004, "pct")).toBe("0%");
  });

  it("correlations: 2 decimals, signed with a plain hyphen", () => {
    expect(formatNumber(-0.4249, "corr")).toBe("-0.42");
    expect(formatNumber(0.3, "corr")).toBe("0.30");
  });

  it("percentages: integers from a fraction", () => {
    expect(formatNumber(0.9, "pct")).toBe("90%");
    expect(formatNumber(0.126, "pct")).toBe("13%");
    expect(formatNumber(0.05, "pct", { sign: true })).toBe("+5%");
  });

  it("counts: integers with grouping", () => {
    expect(formatNumber(12, "count")).toBe("12");
    expect(formatNumber(1234, "count")).toBe("1,234");
  });

  it("deltas carry an explicit sign", () => {
    expect(formatNumber(0.22, "value", { sign: true })).toBe("+0.22");
    expect(formatNumber(-0.22, "value", { sign: true })).toBe("-0.22");
  });

  it("missing or non-finite input reads n/a, never a fake zero", () => {
    expect(formatNumber(null)).toBe("n/a");
    expect(formatNumber(undefined, "pct")).toBe("n/a");
    expect(formatNumber(Number.NaN)).toBe("n/a");
    expect(formatNumber(Number.POSITIVE_INFINITY, "count")).toBe("n/a");
  });
});

describe("formatRange and formatBand", () => {
  it("formats an interval in one quantity", () => {
    expect(formatRange(0.123, 0.456, "corr")).toBe("0.12 to 0.46");
  });

  it("states the band's coverage, and omits it rather than guess", () => {
    expect(formatBand(0.312, 0.9)).toBe("± 0.31 (90% band)");
    expect(formatBand(0.312)).toBe("± 0.31 (prediction band)");
    expect(formatBand(0.312, null)).toBe("± 0.31 (prediction band)");
  });
});

describe("cn", () => {
  it("keeps a role type size next to a text color", () => {
    expect(cn("text-body text-fg")).toBe("text-body text-fg");
    expect(cn("text-body", "text-label")).toBe("text-label");
    expect(cn("text-fg", "text-fg-muted")).toBe("text-fg-muted");
  });
});

describe("icc", () => {
  it("keeps a near-one ICC from rounding to 1.00", () => {
    expect(formatNumber(0.997, "icc")).toBe("0.997");
  });
});
