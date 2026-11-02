import { describe, expect, it } from "vitest";
import { checkSheet, convertFactor, headerUnit, mapName, parseCell, readSheet } from "@/lib/normalize";

describe("parseCell", () => {
  it("keeps censored values as limits, not zeros", () => {
    expect(parseCell("<0.1")).toEqual({ kind: "censored", op: "<", limit: 0.1 });
    expect(parseCell("BLQ").kind).toBe("censored");
  });
  it("reads decimal commas and thousands separators", () => {
    expect(parseCell("1,5")).toEqual({ kind: "number", value: 1.5 });
    expect(parseCell("1,234.5")).toEqual({ kind: "number", value: 1234.5 });
    expect(parseCell("1.234,5")).toEqual({ kind: "number", value: 1234.5 });
    expect(parseCell("1,234")).toEqual({ kind: "number", value: 1234 });
  });
  it("sorts blanks and text", () => {
    expect(parseCell("N/A").kind).toBe("blank");
    expect(parseCell("pending").kind).toBe("text");
  });
});
describe("units", () => {
  it("reads a unit from the header", () => expect(headerUnit("titer (mg/mL)")).toEqual({ name: "titer", unit: "mg/mL" }));
  it("converts only exact pairs", () => {
    expect(convertFactor("mg/mL", "g/L")).toBe(1);
    expect(convertFactor("mg/L", "g/L")).toBeCloseTo(0.001);
    expect(convertFactor("1e5 cells/mL", "1e6 cells/mL")).toBeCloseTo(0.1);
    expect(convertFactor("mOsm/kg", "g/L")).toBeNull();
  });
});
describe("checkSheet", () => {
  const s = readSheet("run;titer (g/L);VCD\nA;1,5;2\nB;<0.1;3\nC;oops;\nD;2;")!;
  it("detects the semicolon delimiter and reports problems", () => {
    expect(s.columns).toEqual(["run", "titer (g/L)", "VCD"]);
    const t = checkSheet(s.columns, s.rows)[1];
    expect(t.unit).toBe("g/L");
    expect(t.censored).toBe(1);
    expect(t.issues.join(" ")).toMatch(/detection limit/);
    expect(t.issues.join(" ")).toMatch(/decimal comma/);
    expect(t.issues.join(" ")).toMatch(/text in an otherwise numeric/);
  });
});
describe("mapName", () => {
  it("maps partner step names ignoring case and punctuation", () => expect(mapName("Prot-A Capture", { "prot a capture": "Protein A capture" })).toBe("Protein A capture"));
});
