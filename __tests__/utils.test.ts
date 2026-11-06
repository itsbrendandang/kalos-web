import { describe, expect, it } from "vitest";
import { parseUnit, cn } from "@/lib/utils";

describe("parseUnit", () => {
  it('extracts the unit from "Titer (g/L)"', () => {
    expect(parseUnit("Titer (g/L)")).toBe("g/L");
  });

  it('returns empty string for "pH" (no parens)', () => {
    expect(parseUnit("pH")).toBe("");
  });

  it('extracts unit from "Lipase conc. (mg/L)"', () => {
    expect(parseUnit("Lipase conc. (mg/L)")).toBe("mg/L");
  });

  it('ignores parens not at the end', () => {
    expect(parseUnit("Titer (g/L) extra")).toBe("");
  });

  it('ignores nested/odd paren patterns', () => {
    expect(parseUnit("a ((b))")).toBe("");
  });

  it('handles a single-char unit', () => {
    expect(parseUnit("foo (x)")).toBe("x");
  });

  it('handles unit with spaces inside parens', () => {
    expect(parseUnit("name (mg / L)")).toBe("mg / L");
  });

  it('ignores trailing whitespace after parens', () => {
    expect(parseUnit("name (g/L) ")).toBe("g/L");
  });
});

describe("cn", () => {
  it('returns a string combining truthy inputs', () => {
    const result = cn("foo", "bar");
    expect(typeof result).toBe("string");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("drops falsey values", () => {
    const result = cn("foo", false, "", null as unknown as string, "bar");
    expect(typeof result).toBe("string");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });

  it("returns a string when called with no args", () => {
    expect(typeof cn()).toBe("string");
  });
});
