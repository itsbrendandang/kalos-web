import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataTypeCounts, dataTypeCountsFromRows, scanSheet } from "@/lib/sheet-columns";
import { readXlsxRows } from "@/lib/xlsx-rows";

// Fixtures: mixed-types / two-sheets / all-real generated with openpyxl (inline strings);
// shared-strings.xlsx hand-built with zipfile to cover shared strings, rich text and deflate.
const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const fileOf = (name: string) => new File([fx(name)], name);
const ab = (name: string) => {
  const b = fx(name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("readXlsxRows", () => {
  it("reads cells, numbers as written, XML entities and empty cells", async () => {
    const x = await readXlsxRows(ab("mixed-types.xlsx"));
    expect(x?.sheets).toEqual(["Runs"]);
    expect(x?.rows[0]).toEqual(["run_id", "pH", "Temp_C", "data_type", "titer"]);
    expect(x?.rows[1]).toEqual(["r1", "6.5", "30", "Real", "1.2"]);
    expect(x?.rows[5][3]).toBe(""); // blank data_type cell keeps its column position
    expect(x?.rows[6][2]).toBe("R & D <x>");
  });
  it("lists every sheet and honours a sheet name; the default is the first", async () => {
    const first = await readXlsxRows(ab("two-sheets.xlsx"));
    expect(first).toMatchObject({ sheets: ["Notes", "Runs"], sheetUsed: "Notes" });
    const runs = await readXlsxRows(ab("two-sheets.xlsx"), "Runs");
    expect(runs?.sheetUsed).toBe("Runs");
    expect(runs?.rows[0]).toEqual(["pH", "Data Type", "y"]);
    expect(await readXlsxRows(ab("two-sheets.xlsx"), "Nope")).toBeNull();
  });
  it("reads an Excel-saved workbook with shared strings (the repo's browser fixture)", async () => {
    const x = await readXlsxRows(ab("shared-strings.xlsx"));
    expect(x?.rows[0]).toEqual(["name", "data_type", "y"]);
    expect(x?.rows[1]).toEqual(["alpha & beta", "Real", "1"]);
  });
  it("returns null (never throws) for anything that is not an xlsx", async () => {
    expect(await readXlsxRows(new TextEncoder().encode("a,b\n1,2").buffer as ArrayBuffer)).toBeNull();
    expect(await readXlsxRows(new ArrayBuffer(0))).toBeNull();
  });
});

describe("one row-type detector for CSV and Excel", () => {
  it("gives identical counts for the same table whichever format it came from", async () => {
    const csv = "run_id,pH,Temp_C,data_type,titer\nr1,6.5,30,Real,1.2\nr2,7.0,32,Real,1.8\nr3,7.2,34,Synthetic,2.9\nr4,6.8,31,synthetic,2.0\nr5,7.1,33,,1.5\nr6,6.9,x,Real,1.1\n";
    const fromCsv = dataTypeCounts(csv);
    const fromXlsx = dataTypeCountsFromRows((await readXlsxRows(ab("mixed-types.xlsx")))!.rows);
    expect(fromXlsx).toEqual(fromCsv);
    expect(fromXlsx).toMatchObject({ column: "data_type", total: 6 });
    expect(fromXlsx?.counts[0]).toEqual({ value: "Real", n: 3 });
    expect(fromXlsx?.counts.map((c) => c.value).sort()).toEqual(["(blank)", "Real", "Synthetic", "synthetic"]);
  });
});

describe("scanSheet on Excel", () => {
  it("scans an .xlsx (columns + row types) instead of reporting 'could not be checked'", async () => {
    const s = await scanSheet(fileOf("mixed-types.xlsx"));
    expect(s.scanned).toBe(true);
    expect(s.columns).toEqual(["run_id", "pH", "Temp_C", "data_type", "titer"]);
    expect(s.dataType?.counts.find((c) => c.value === "Synthetic")?.n).toBe(1);
  });
  it("scans the chosen worksheet of a multi-sheet workbook", async () => {
    expect((await scanSheet(fileOf("two-sheets.xlsx"))).dataType).toBeNull(); // first sheet is the notes sheet
    const s = await scanSheet(fileOf("two-sheets.xlsx"), "Runs");
    expect(s.dataType?.column).toBe("Data Type");
    expect(s.dataType?.counts).toEqual([{ value: "Real", n: 3 }, { value: "Measured", n: 1 }]);
  });
  it("an all-real sheet reports counts without a mix; unreadable and legacy .xls stay honestly unscanned", async () => {
    const s = await scanSheet(fileOf("all-real.xlsx"));
    expect(s.dataType?.counts).toEqual([{ value: "Real", n: 3 }]);
    expect(await scanSheet(new File(["garbage"], "bad.xlsx"))).toEqual({ columns: [], dataType: null, scanned: false });
    expect(await scanSheet(new File([fx("all-real.xlsx")], "old.xls"))).toEqual({ columns: [], dataType: null, scanned: false });
  });
});
