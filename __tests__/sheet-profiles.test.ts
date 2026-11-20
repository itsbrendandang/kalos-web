import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setupInputsFromTable } from "@/components/setup/first-run-setup";
import { columnProfiles, readSheetTable } from "@/lib/sheet-columns";

/*
 * The first-run setup reads the sheet in the browser before anything is sent: the columns to pick the target
 * from, which inputs are numeric (boundable, with their observed low/high) and which are categorical (the
 * engine refuses linear constraints with any).
 */
const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const bioprocess = [
  "run_id,pH,temperature_C,glucose_gL,medium_base,titer_g_L",
  "R001,6.214,34.675,10.014,CD-CHO,0.0",
  "R002,6.877,38.141,2.984,CD-CHO,0.404",
  "R003,7.2,,5.5,EX-CELL,1.1",
  "R004,6.0,30.2,abc,EX-CELL,0.9",
].join("\n");

describe("columnProfiles", () => {
  it("tells numeric, categorical, identifier and empty columns apart, with numeric min/max", () => {
    const table = { header: ["run_id", "pH", "temperature_C", "glucose_gL", "medium_base", "titer_g_L", "empty"], rows: bioprocess.split("\n").slice(1).map((l) => l.split(",")) };
    const by = Object.fromEntries(columnProfiles(table).map((p) => [p.name, p]));
    expect(by.run_id.kind).toBe("identifier");
    expect(by.medium_base.kind).toBe("text");
    expect(by.pH).toMatchObject({ kind: "numeric", min: 6, max: 7.2, filled: 4 });
    // A blank cell is not counted; min/max over the numbers only.
    expect(by.temperature_C).toMatchObject({ kind: "numeric", min: 30.2, max: 38.141, filled: 3 });
    // 3 of 4 filled cells numeric (75%) is below the engine's 80% numeric gate.
    expect(by.glucose_gL.kind).toBe("text");
    expect(by.titer_g_L).toMatchObject({ kind: "numeric", min: 0, max: 1.1 });
    expect(by.empty).toMatchObject({ kind: "empty", min: null, max: null });
  });
});

describe("readSheetTable", () => {
  it("reads a CSV in the browser", async () => {
    const t = await readSheetTable(new File([bioprocess], "runs.csv"));
    expect(t?.header).toEqual(["run_id", "pH", "temperature_C", "glucose_gL", "medium_base", "titer_g_L"]);
    expect(t?.rows).toHaveLength(4);
    expect(t?.sheets).toEqual([]);
  });
  it("reads an .xlsx worksheet and lists the workbook's sheets", async () => {
    const t = await readSheetTable(new File([fx("two-sheets.xlsx")], "two.xlsx"), "Runs");
    expect(t?.sheets.length).toBeGreaterThan(1);
    expect(t?.sheetUsed).toBe("Runs");
  });
  it("returns null for legacy .xls and unreadable workbooks (the engine still reads them)", async () => {
    expect(await readSheetTable(new File(["x"], "old.xls"))).toBeNull();
    expect(await readSheetTable(new File(["garbage"], "bad.xlsx"))).toBeNull();
  });
});

describe("setupInputsFromTable", () => {
  it("offers numeric columns as targets, the other numeric columns as boundable inputs, and lists categoricals", async () => {
    const t = await readSheetTable(new File([bioprocess], "runs.csv"));
    const out = setupInputsFromTable(t, "titer_g_L");
    expect(out.targets).toEqual(["pH", "temperature_C", "titer_g_L"]);
    expect(out.inputs).toEqual([
      { name: "pH", observed: [6, 7.2] },
      { name: "temperature_C", observed: [30.2, 38.141] },
    ]);
    expect(out.categoricals).toEqual(["glucose_gL", "medium_base"]);
    expect(setupInputsFromTable(null, "x")).toEqual({ inputs: [], categoricals: [], targets: [] });
  });
});
