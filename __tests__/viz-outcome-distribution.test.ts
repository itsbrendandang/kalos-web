import { describe, expect, it } from "vitest";
import { outcomeDistribution } from "@/lib/viz-data/outcome-distribution";

describe("measured held-out distribution", () => {
  it("does not invent counts for missing, malformed or non-finite pairs", () => {
    expect(outcomeDistribution(undefined).n).toBe(0);
    expect(outcomeDistribution({})).toEqual({ bins: [], n: 0, excluded: 0 });
    expect(outcomeDistribution([null, [1], [1, NaN], [Infinity, 1], ["2", 2], [3, 4, 5]]).n).toBe(0);
  });
  it("bins measurements, never predictions, and includes the upper endpoint exactly once", () => {
    const result = outcomeDistribution([[0, 100], [1, 100], [2, 100], [3, 100], [4, 100], null]);
    expect(result.n).toBe(5);
    expect(result.excluded).toBe(1);
    expect(result.bins[0].lo).toBe(0);
    expect(result.bins.at(-1)?.hi).toBe(4);
    expect(result.bins.reduce((n, b) => n + b.count, 0)).toBe(5);
  });
  it("keeps constant values as one bin rather than a fabricated spread", () => {
    expect(outcomeDistribution([[2, 4], [2, 6]]).bins).toEqual([{ lo: 2, hi: 2, count: 2 }]);
  });
  it("keeps finite extremes and negative outcomes without dropping endpoints", () => {
    const result = outcomeDistribution([[-Number.MAX_VALUE, 0], [Number.MAX_VALUE, 0], [0, 0]]);
    expect(result.bins.every((b) => Number.isFinite(b.lo) && Number.isFinite(b.hi))).toBe(true);
    expect(result.bins.reduce((n, b) => n + b.count, 0)).toBe(3);
  });
});
