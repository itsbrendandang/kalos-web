import { describe, expect, it } from "vitest";
import type { Proposal } from "@/lib/api";
import { batchExceptions, edgeInputs, orderBatch } from "@/components/campaign/plan-batch";
import { dataTypeCounts, formatElapsed, parseDelimited } from "@/lib/sheet-columns";

describe("sheet columns", () => {
  it("parses quoted fields, CRLF, BOM and TSV", () => {
    expect(parseDelimited('\ufeffa,"b,c"\r\n1,"x ""y"""\r\n')).toEqual([["a", "b,c"], ["1", 'x "y"']]);
    expect(parseDelimited("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("counts a data_type column, case/format-insensitively, blanks included", () => {
    const text = "run_id,Data Type,y\nA,Real,1\nB,Synthetic,2\nC,Synthetic,3\nD,,4\n";
    const c = dataTypeCounts(text)!;
    expect(c.column).toBe("Data Type");
    expect(c.total).toBe(4);
    expect(c.counts).toEqual([{ value: "Synthetic", n: 2 }, { value: "(blank)", n: 1 }, { value: "Real", n: 1 }]);
  });
  it("returns null without such a column", () => {
    expect(dataTypeCounts("a,b\n1,2\n")).toBeNull();
    expect(dataTypeCounts("a\n")).toBeNull();
  });
  it("formats elapsed time", () => {
    expect([0, 5, 65, 600, -3].map(formatElapsed)).toEqual(["0:00", "0:05", "1:05", "10:00", "0:00"]);
  });
});

describe("edge-of-range flag", () => {
  const ranges: Record<string, [number, number]> = { pH: [6, 8], temp: [30, 40] };
  it("flags setpoints within 2% of either end, not interior ones", () => {
    expect(edgeInputs({ pH: 7.98, temp: 35 }, ranges)).toEqual(["pH"]);
    expect(edgeInputs({ pH: 6.0, temp: 30.1 }, ranges)).toEqual(["pH", "temp"]);
    expect(edgeInputs({ pH: 7, temp: 35 }, ranges)).toEqual([]);
  });
  it("says nothing without ranges, for unknown inputs, or for a zero-width range", () => {
    expect(edgeInputs({ pH: 8 }, undefined)).toEqual([]);
    expect(edgeInputs({ other: 1 }, ranges)).toEqual([]);
    expect(edgeInputs({ pH: 7 }, { pH: [7, 7] })).toEqual([]);
  });
  it("adds a lowest-priority at-edge exception to the batch", () => {
    const p = (vals: number[], pred = 4): Proposal => ({ vals, pred, std: 0.1, mode: "exploit", reason: "" });
    const items = orderBatch([p([7.99]), p([7])], 5);
    const out = batchExceptions(items, { incumbent: 5, band: null, nonNegative: false, ranges, features: ["pH"] });
    expect(out.shown.map((e) => e.kind)).toEqual(["at-edge"]);
    expect(out.shown[0].text).toMatch(/edge of the range tried for pH/);
    expect(batchExceptions(items, { incumbent: 5, band: null, nonNegative: false }).shown).toEqual([]);
  });
});
