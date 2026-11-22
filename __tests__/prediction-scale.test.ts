import { describe, expect, it } from "vitest";
import { predictionScale, recipeRange, scaleOver } from "@/components/campaign/prediction-scale";

describe("predictionScale", () => {
  it("spans every band and the incumbent, padded 5% each side", () => {
    const s = predictionScale([4, 5], 0.5, 3)!;
    // Raw span 3 (3 to 5.5), padded by 0.125.
    expect(s.lo).toBeCloseTo(2.875);
    expect(s.hi).toBeCloseTo(5.625);
    expect(s.at(3)).toBeGreaterThan(0);
    expect(s.at(5.5)).toBeLessThan(100);
  });

  it("puts a value proportionally and clamps outside the range", () => {
    const s = predictionScale([0, 10], null, null)!;
    expect(s.at((s.lo + s.hi) / 2)).toBeCloseTo(50);
    expect(s.at(-100)).toBe(0);
    expect(s.at(100)).toBe(100);
  });

  it("ignores a missing, zero or non-finite band", () => {
    for (const band of [null, 0, Number.NaN]) {
      const s = predictionScale([2, 4], band, null)!;
      expect(s.lo).toBeCloseTo(1.9);
      expect(s.hi).toBeCloseTo(4.1);
    }
  });

  it("gives a single point a visible width instead of dividing by zero", () => {
    const s = predictionScale([5], null, 5)!;
    expect(s.hi).toBeGreaterThan(s.lo);
    expect(s.at(5)).toBeCloseTo(50);
    const z = predictionScale([0], null, null)!;
    expect([z.lo, z.hi]).toEqual([-1, 1]);
  });

  it("returns null when there is nothing finite to draw", () => {
    expect(predictionScale([], 0.4, null)).toBeNull();
    expect(predictionScale([Number.NaN], 0.4, Number.NaN)).toBeNull();
  });
});

describe("recipeRange", () => {
  const iv = (coverage: number, lo: number, hi: number) => ({ available: true, coverage, lo, hi });

  it("prefers the engine's own interval at the requested coverage", () => {
    expect(recipeRange(7.4, [iv(0.9, 6.6, 8.2), iv(0.95, 6.5, 8.3)], 0.5, 0.9)).toEqual({ lo: 6.6, hi: 8.2, coverage: 0.9, source: "interval" });
  });

  it("falls back to the +/- band when the interval is missing or unavailable", () => {
    expect(recipeRange(7, undefined, 0.5, 0.9)).toEqual({ lo: 6.5, hi: 7.5, coverage: 0.9, source: "band" });
    expect(recipeRange(7, [{ available: false, coverage: 0.9 }], 0.5, null)).toEqual({ lo: 6.5, hi: 7.5, coverage: null, source: "band" });
    expect(recipeRange(7, [iv(0.95, 6, 8)], 0.5, 0.9)?.source).toBe("band");
  });

  it("rejects a malformed interval and returns null with nothing to draw", () => {
    expect(recipeRange(7, [iv(0.9, 8, 6)], null, null)).toBeNull();
    expect(recipeRange(7, [iv(0.9, Number.NaN, 6)], 0, null)).toBeNull();
  });
});

describe("scaleOver", () => {
  it("ignores non-finite values", () => {
    const s = scaleOver([1, Number.NaN, 3])!;
    expect([s.lo, s.hi]).toEqual([0.9, 3.1]);
    expect(scaleOver([Number.NaN])).toBeNull();
  });
});
