import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { duplicateColumnPairs, histogram, isCategory, isNearlyConstant, isRowNumberLike, measuredOnly, profileSheet, replicateGroups, replicateSpread, rowsOf, sturgesBins, summarize, toNumber, untestedGaps } from "@/components/campaign/data/profile";

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));
const sample = (name: string) => `${homedir()}/Desktop/kalos-samples/${name}`;
const readSample = (name: string) => profileSheet(csv(readFileSync(sample(name), "utf8")));

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
  it("uses Sturges' rule, clamped to 4..15, when no bin count is given", () => {
    expect(sturgesBins(213)).toBe(9);
    expect(sturgesBins(5)).toBe(4);
    expect(sturgesBins(100000)).toBe(15);
    const h = histogram(Array.from({ length: 213 }, (_, i) => i))!;
    expect(h.counts.length).toBeGreaterThanOrEqual(8);
    expect(h.counts.length).toBeLessThanOrEqual(11);
  });
  it("snaps the edges to round numbers that cover the range, and still counts every value once", () => {
    const h = histogram([7.3, 12.1, 25.9, 31.1, 28, 12.4, 40, 33.3])!;
    expect(h.edges[0]).toBeLessThanOrEqual(7.3);
    expect(h.edges[h.edges.length - 1]).toBeGreaterThanOrEqual(40);
    const step = h.edges[1] - h.edges[0];
    for (const e of h.edges) expect(Math.abs(e / step - Math.round(e / step))).toBeLessThan(1e-9);
    expect(h.counts.reduce((s, c) => s + c, 0)).toBe(8);
  });
  it("places a value on the top edge in the last bin and a value on the first edge in the first", () => {
    const h = histogram([0, 10, 20, 30, 40, 50])!;
    expect(h.edges[0]).toBe(0);
    expect(h.counts[0]).toBeGreaterThanOrEqual(1);
    expect(h.counts[h.counts.length - 1]).toBeGreaterThanOrEqual(1);
    expect(h.counts.reduce((s, c) => s + c, 0)).toBe(6);
  });
});

describe("column kinds", () => {
  it("calls a non-numeric column a category up to 30 levels and half the rows, otherwise text", () => {
    expect(isCategory(19, 213)).toBe(true);
    expect(isCategory(10, 20)).toBe(true);
    expect(isCategory(11, 20)).toBe(false);
    expect(isCategory(31, 1000)).toBe(false);
    expect(isCategory(2, 3)).toBe(true);
    expect(isCategory(3, 3)).toBe(false);
  });
  it("calls a numeric input nearly constant for one value, a range under 1% of the median, or two values in ten runs", () => {
    expect(isNearlyConstant([5, 5, 5])).toBe(true);
    expect(isNearlyConstant([6.978, 7.028, 7.0, 7.01])).toBe(true);
    expect(isNearlyConstant([6.9, 7.1, 7.0])).toBe(false);
    expect(isNearlyConstant(Array.from({ length: 10 }, (_, i) => (i % 2 ? 1 : 100)))).toBe(true);
    expect(isNearlyConstant([1, 100, 1, 100])).toBe(false);
    expect(isNearlyConstant([])).toBe(false);
  });
  it.skipIf(!existsSync(sample("pichia_HSA.csv")))("reads pichia CarbonSource (19 levels in 213 rows) as a category", () => {
    const p = readSample("pichia_HSA.csv");
    expect(p.columns.find((c) => c.name === "CarbonSource")).toMatchObject({ kind: "category", distinct: 19 });
  });
  it.skipIf(!existsSync(sample("trichoderma_ambr.csv")))("reads trichoderma condition (10 levels in 20 rows) as a category", () => {
    const p = readSample("trichoderma_ambr.csv");
    expect(p.columns.find((c) => c.name === "condition")).toMatchObject({ kind: "category", distinct: 10 });
  });
  it.skipIf(!existsSync(sample("cho_bioreactor_20829178.csv")))("marks CHO pH (6.978 to 7.028) nearly constant and the other inputs not", () => {
    const p = readSample("cho_bioreactor_20829178.csv");
    expect(p.columns.find((c) => c.name === "pH")?.nearlyConstant).toBe(true);
    expect(p.columns.find((c) => c.name === "DO_pct_air")?.nearlyConstant).toBe(false);
  });
});

describe("measuredOnly", () => {
  it("returns null without a data_type column or when every row is measured", () => {
    expect(measuredOnly(profileSheet(csv(`x,y\n1,2`)))).toBeNull();
    expect(measuredOnly(profileSheet(csv(`x,data_type,y\n1,Real,2\n2,measured,3`)))).toBeNull();
  });
  it("keeps only real or measured rows and names what was left out", () => {
    const p = profileSheet(csv(`x,Data Type,y\n1,Real,2\n2,Synthetic,3\n3,synthetic,4\n4,,5`));
    const m = measuredOnly(p)!;
    expect(m.kept).toEqual([true, false, false, false]);
    expect(m.profile.n).toBe(1);
    expect(m.column).toBe("Data Type");
    expect(m.leftOut).toEqual([{ value: "(blank)", n: 1 }, { value: "synthetic", n: 1 }, { value: "Synthetic", n: 1 }]);
    expect(rowsOf(p)).toEqual([["x", "Data Type", "y"], ["1", "Real", "2"], ["2", "Synthetic", "3"], ["3", "synthetic", "4"], ["4", "", "5"]]);
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
    expect(isRowNumberLike(sheet.columns[0], sheet.n)).toBe(true);
  });

  it("classifies numeric, category and text columns and counts blanks", () => {
    const by = (name: string) => sheet.columns.find((c) => c.name === name)!;
    expect(by("CarbonSource")).toMatchObject({ kind: "numeric", missing: 1, filled: 3 });
    expect(by("Titer")).toMatchObject({ kind: "numeric", missing: 1, numbers: [25.9, 31.1, null, 28] });
    expect(by("flag")).toMatchObject({ kind: "category", missing: 0, levels: [{ value: "A", n: 3 }, { value: "B", n: 1 }] });
    expect(by("note")).toMatchObject({ kind: "category", distinct: 1 });
  });

  it("calls a text column with a different value in every run free text, and counts the non-numbers in a numeric-looking one", () => {
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

  it("keeps a continuous input that differs in every run, so recipes that differ only in it are not grouped", () => {
    const p = profileSheet(csv(`t,x,y\n36.1,1,5\n36.4,1,6\n36.8,2,7\n37.0,2,8`));
    expect(replicateGroups(p, new Set(), "y")).toEqual([]);
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
