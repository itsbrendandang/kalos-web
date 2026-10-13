import { describe, expect, it } from "vitest";
import type { Proposal } from "@/lib/api";
import { batchExceptions, orderBatch, targetIsNonNegative } from "@/components/campaign/plan-batch";

const p = (pred: number, extra: Partial<Proposal> = {}): Proposal => ({ vals: [0], pred, std: 0.1, mode: "exploit", reason: "", ...extra });

describe("orderBatch", () => {
  it("puts recipes predicted to beat the best first, each group by predicted value", () => {
    const items = orderBatch([p(4), p(7), p(2), p(9), p(5)], 5);
    expect(items.map((i) => i.proposal.pred)).toEqual([9, 7, 5, 4, 2]);
    expect(items.map((i) => i.beatsBest)).toEqual([true, true, false, false, false]);
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it("a prediction equal to the best does not beat it", () => {
    expect(orderBatch([p(5)], 5)[0].beatsBest).toBe(false);
  });
  it("keeps the engine index so started runs match, and breaks ties by it", () => {
    const items = orderBatch([p(3), p(3), p(8)], 5);
    expect(items.map((i) => i.index)).toEqual([2, 0, 1]);
  });
  it("with no incumbent nothing beats it and the order is by predicted value", () => {
    const items = orderBatch([p(1), p(3), p(2)], null);
    expect(items.some((i) => i.beatsBest)).toBe(false);
    expect(items.map((i) => i.proposal.pred)).toEqual([3, 2, 1]);
  });
});

describe("batchExceptions", () => {
  const ctx: { incumbent: number | null; band: number | null; nonNegative: boolean } = { incumbent: 5, band: 0.5, nonNegative: true };
  const run = (proposals: Proposal[], c = ctx) => batchExceptions(orderBatch(proposals, c.incumbent), c);

  it("flags a negative prediction only for a non-negative target", () => {
    expect(run([p(-0.1)]).shown.map((e) => e.kind)).toEqual(["negative"]);
    expect(run([p(-0.1)], { ...ctx, nonNegative: false }).shown).toEqual([]);
  });
  it("flags a low feasibility the engine reported, and stays silent when it sent none", () => {
    expect(run([p(4, { p_feasible: 0.2 })]).shown.map((e) => e.kind)).toEqual(["low-feasibility"]);
    expect(run([p(4, { p_feasible: 0.9 })]).shown).toEqual([]);
    expect(run([p(4, { p_feasible: null })]).shown).toEqual([]);
  });
  it("flags a gain smaller than the band, never a recipe not predicted to gain", () => {
    expect(run([p(5.3)]).shown.map((e) => e.kind)).toEqual(["gain-within-band"]);
    expect(run([p(6)]).shown).toEqual([]);
    expect(run([p(4)]).shown).toEqual([]);
    expect(run([p(5.3)], { ...ctx, band: null }).shown).toEqual([]);
  });
  it("gives each recipe only its most serious flag", () => {
    expect(run([p(-1, { p_feasible: 0.1 })]).shown).toHaveLength(1);
  });
  it("caps at 3, most serious first, and reports the total", () => {
    const out = run([p(5.1), p(5.2), p(5.3), p(-1), p(4, { p_feasible: 0.1 })]);
    expect(out.total).toBe(5);
    expect(out.shown.map((e) => e.kind)).toEqual(["negative", "low-feasibility", "gain-within-band"]);
    expect(out.shown[2].rank).toBeLessThan(5);
  });
});

describe("targetIsNonNegative", () => {
  it("needs a non-negative best and no negative measured value", () => {
    expect(targetIsNonNegative(3, [[0, 1], [2, 2]])).toBe(true);
    expect(targetIsNonNegative(3, [[-1, 1]])).toBe(false);
    expect(targetIsNonNegative(-1, [])).toBe(false);
  });
});
