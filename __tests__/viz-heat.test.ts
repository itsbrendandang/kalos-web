import { describe, expect, it } from "vitest";
import { classOf, countClasses, countClassOf, equalEdges, extentOf, moveCell, ordInk, rampVar, shareClassOf } from "@/lib/viz-data/heat";

describe("stepped classes (VIZ_SPEC_V2 2.7)", () => {
  it("splits a range into 5 equal-width classes with 6 printed edges", () => {
    expect(equalEdges(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(equalEdges(10, 0)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(equalEdges(NaN, 1)).toEqual([]);
  });
  it("classes are closed on the right only for the last class, and nothing outside the edges gets a class", () => {
    const e = equalEdges(0, 10);
    expect(classOf(0, e)).toBe(1);
    expect(classOf(1.99, e)).toBe(1);
    expect(classOf(2, e)).toBe(2);
    expect(classOf(10, e)).toBe(5);
    expect(classOf(10.01, e)).toBeNull();
    expect(classOf(null, e)).toBeNull();
    expect(classOf(3, [])).toBeNull();
  });
  it("a flat range is one class, never a spread", () => {
    expect(classOf(4, equalEdges(4, 4))).toBe(1);
  });
  it("extent ignores non-finite values and is null when nothing is finite", () => {
    expect(extentOf([3, null, NaN, -1, 7])).toEqual([-1, 7]);
    expect(extentOf([null, undefined])).toBeNull();
  });
});

describe("count classes", () => {
  it("gives one class per count up to 5 and integer edges above", () => {
    expect(countClasses(3)).toEqual([
      { lo: 1, hi: 1 },
      { lo: 2, hi: 2 },
      { lo: 3, hi: 3 },
    ]);
    const c = countClasses(12);
    expect(c[0].lo).toBe(1);
    expect(c[c.length - 1].hi).toBe(12);
    for (let i = 1; i < c.length; i++) expect(c[i].lo).toBe(c[i - 1].hi + 1);
    expect(countClasses(0)).toEqual([]);
  });
  it("0 is the empty style (class 0), never the palest step", () => {
    const c = countClasses(12);
    expect(countClassOf(0, c)).toBe(0);
    expect(countClassOf(1, c)).toBeGreaterThanOrEqual(1);
    expect(countClassOf(12, c)).toBe(5);
  });
  it("share classes use the printed edges 1%, 5%, 20%, 50%", () => {
    expect(shareClassOf(0)).toBe(0);
    expect(shareClassOf(0.005)).toBe(1);
    expect(shareClassOf(0.03)).toBe(2);
    expect(shareClassOf(0.1)).toBe(3);
    expect(shareClassOf(0.4)).toBe(4);
    expect(shareClassOf(1)).toBe(5);
  });
  it("cell text switches to the surface colour on the two darkest steps (contrast-tested pairs)", () => {
    expect(ordInk(3)).toBe("var(--fg)");
    expect(ordInk(4)).toBe("var(--surface)");
    expect(rampVar("ord", 9)).toBe("var(--chart-ord-5)");
  });
});

describe("roving cell focus", () => {
  it("moves with the arrows, clamps at the edges and to ragged rows", () => {
    const rows = [5, 2, 5];
    expect(moveCell({ row: 0, col: 4 }, "ArrowRight", rows)).toEqual({ row: 0, col: 4 });
    expect(moveCell({ row: 0, col: 4 }, "ArrowDown", rows)).toEqual({ row: 1, col: 1 });
    expect(moveCell({ row: 2, col: 0 }, "ArrowDown", rows)).toEqual({ row: 2, col: 0 });
    expect(moveCell({ row: 1, col: 1 }, "ArrowUp", rows)).toEqual({ row: 0, col: 1 });
    expect(moveCell({ row: 0, col: 3 }, "Home", rows)).toEqual({ row: 0, col: 0 });
    expect(moveCell({ row: 0, col: 0 }, "End", rows)).toEqual({ row: 0, col: 4 });
    expect(moveCell({ row: 0, col: 0 }, "a", rows)).toBeNull();
  });
});
