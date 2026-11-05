import { describe, expect, it } from "vitest";
import { duplicateColumnPairs, histogram, isUniquePerRow, profileSheet, replicateGroups, replicateSpread, summarize, toNumber, untestedGaps } from "@/components/campaign/data/profile";

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));

describe("toNumber", () => {
  it("accepts plain and signed decimals and exponents, rejects text and censored values", () => {
    expect(toNumber("3")).toBe(3);
    expect(toNumber(" -2.5 ")).toBe(-2.5);
    expect(toNumber(".5")).toBe(0.5);
    expect(toNumber("1e3")).toBe(1000);
    expect(toNumber("<LOD")).toBeUndefined();
    expect(toNumber("1,200")).toBeUndefined();
    expect(toNumber("NaN")).toBeUndefined();
    expect(toNumber("Inf")).toBeUndefined();
  });
});

describe("summarize", () => {
  it("gives count, mean, sample sd, range and median", () => {
    expect(summarize([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ n: 8, mean: 5, sd: expect.closeTo(2.138, 3), min: 2, max: 9, median: 4.5 });
  });
  it("uses the middle value for an odd count and ignores non-finite values", () => {
    expect(summarize([3, 1, NaN, 2])).toMatchObject({ n: 3, median: 2, min: 1, max: 3 });
  });
  it("returns null with no values and sd 0 for one value", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([7])).toMatchObject({ n: 1, sd: 0, median: 7 });
  });
});

describe("histogram", () => {
  it("counts every value once, the top edge included", () => {
    const h = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)!;
    expect(h.edges).toEqual([0, 2, 4, 6, 8, 10]);
    expect(h.counts).toEqual([2, 2, 2, 2, 3]);
    expect(h.counts.reduce((s, c) => s + c, 0)).toBe(11);
  });
  it("uses one bin when every value is equal, and null for none", () => {
    expect(histogram([5, 5, 5], 4)).toEqual({ edges: [5, 6], counts: [3] });
    expect(histogram([])).toBeNull();
  });
  it("picks a sensible bin count from the sample size when none is given", () => {
    const h = histogram(Array.from({ length: 213 }, (_, i) => i))!;
    expect(h.counts.length).toBe(15);
  });
});

describe("untestedGaps", () => {
  it("names the stretch between neighbouring runs that is wider than a tenth of the range", () => {
    const g = untestedGaps([0, 1, 2, 8, 9, 10])!;
    expect(g.min).toBe(0);
    expect(g.max).toBe(10);
    expect(g.gaps).toEqual([{ from: 2, to: 8, width: 6, share: 0.6 }]);
  });
  it("reports no gap when the runs are spread evenly", () => {
    expect(untestedGaps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!.gaps).toEqual([]);
  });
  it("ignores repeated values and returns null for fewer than two distinct values", () => {
    expect(untestedGaps([3, 3, 3])).toBeNull();
    expect(untestedGaps([1, 1, 9, 9])!.gaps).toEqual([{ from: 1, to: 9, width: 8, share: 1 }]);
  });
});

describe("profileSheet", () => {
  const sheet = profileSheet(
    csv(`
,CarbonSource,Gly,Titer,flag,note
0,14,9.6,25.9,A,ok
1,10,0.4,31.1,B,ok
2,,5.2,,A,ok
3,14,9.6,28.0,A,ok
`),
  );

  it("counts data rows, not the header", () => {
    expect(sheet.n).toBe(4);
  });

  it("names a blank header as its position and flags it headerless", () => {
    expect(sheet.columns[0]).toMatchObject({ name: "column 1", headerless: true, kind: "numeric", filled: 4, distinct: 4 });
    expect(isUniquePerRow(sheet.columns[0], sheet.n)).toBe(true);
  });

  it("classifies numeric, category and text columns and counts blanks", () => {
    const by = (name: string) => sheet.columns.find((c) => c.name === name)!;
    expect(by("CarbonSource")).toMatchObject({ kind: "numeric", missing: 1, filled: 3 });
    expect(by("Titer")).toMatchObject({ kind: "numeric", missing: 1, numbers: [25.9, 31.1, null, 28] });
    expect(by("flag")).toMatchObject({ kind: "category", missing: 0, levels: [{ value: "A", n: 3 }, { value: "B", n: 1 }] });
    expect(by("note")).toMatchObject({ kind: "category", distinct: 1 });
  });

  it("calls a text column with many distinct values free text, and counts the non-numbers in a numeric-looking one", () => {
    const p = profileSheet(csv(`a,b\n1,x1\n2,x2\n<LOD,x3\n4,x4\n5,x5\n6,x6\n7,x7\n8,x8\n9,x9\n10,x10\n11,x11\n12,x12\n13,x13\n14,x14`));
    expect(p.columns[1].kind).toBe("text");
    expect(p.columns[0]).toMatchObject({ kind: "text", nonNumeric: 1 });
  });

  it("marks an all-blank column empty", () => {
    const p = profileSheet(csv(`a,b\n1,\n2,\n`));
    expect(p.columns[1]).toMatchObject({ kind: "empty", filled: 0, missing: 2 });
  });

  it("finds exact duplicate rows", () => {
    const p = profileSheet(csv(`a,b\n1,2\n1,2\n3,4\n1,2`));
    expect(p.duplicateRows).toBe(2);
  });

  it("finds columns whose cells are identical row by row, and ignores empty columns", () => {
    const p = profileSheet(csv(`a,b,c,d\n1,1,2,\n2,2,3,\n3,3,4,`));
    expect(p.duplicateColumns).toEqual([{ a: "a", b: "b" }]);
    expect(duplicateColumnPairs(p.columns)).toEqual([{ a: "a", b: "b" }]);
  });
});

describe("replicateGroups", () => {
  it("groups runs that share every input value and keeps their targets", () => {
    const p = profileSheet(csv(`x,c,y\n1,A,10\n1,A,12\n2,A,20\n2,B,30\n1,A,11`));
    const groups = replicateGroups(p, new Set(), "y");
    expect(groups).toEqual([{ rows: [0, 1, 4], targets: [10, 12, 11] }]);
    expect(replicateSpread(groups)).toEqual({ groups: 1, runs: 3, medianSd: 1 });
  });

  it("finds no replicates when every recipe is unique, and never uses a row-number column as an input", () => {
    const p = profileSheet(csv(`row,x,y\n0,1,5\n1,2,6\n2,3,7\n3,4,8`));
    expect(replicateGroups(p, new Set(), "y")).toEqual([]);
  });

  it("returns nothing without a target and reports a null spread for no groups", () => {
    const p = profileSheet(csv(`x,y\n1,5\n1,6`));
    expect(replicateGroups(p, new Set(), undefined)).toEqual([]);
    expect(replicateSpread([])).toEqual({ groups: 0, runs: 0, medianSd: null });
  });

  it("does not group a row with a blank input", () => {
    const p = profileSheet(csv(`x,y\n,5\n,6`));
    expect(replicateGroups(p, new Set(), "y")).toEqual([]);
  });
});
