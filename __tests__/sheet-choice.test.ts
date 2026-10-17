import { afterEach, describe, expect, it, vi } from "vitest";
import { runFile } from "@/lib/api";
import { sheetSelector, sheetsFrom } from "@/lib/sheet-choice";
import { initialSetupState, setupReducer } from "@/lib/setup-attempt";

describe("runFile sends an optional worksheet", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (body: unknown, status = 200) => {
    const m = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", m);
    return m;
  };
  const form = (m: ReturnType<typeof vi.fn>, i = 0) => (m.mock.calls[i][1] as RequestInit).body as FormData;

  it("appends `sheet` when given and omits it otherwise (older engines never see the field)", async () => {
    const m = stub({ n: 1 });
    const file = new File(["x"], "w.xlsx");
    await runFile(file, undefined, undefined, "Runs 2");
    expect(form(m).get("sheet")).toBe("Runs 2");
    expect(form(m).get("file")).toBeInstanceOf(File);
    await runFile(file, "y");
    expect(form(m, 1).has("sheet")).toBe(false);
  });

  it("returns the engine's specific 400 message and sheet list untouched", async () => {
    stub({ error: "Sheet 'X' not found", code: "sheet_not_found", sheets: ["A", "B"], sheet_used: null }, 400);
    const d = await runFile(new File(["x"], "w.xlsx"), undefined, undefined, "X");
    expect(d).toMatchObject({ error: "Sheet 'X' not found", code: "sheet_not_found", sheets: ["A", "B"] });
  });
});

describe("sheetsFrom is defensive about the engine fields", () => {
  it("needs two or more non-empty string names", () => {
    expect(sheetsFrom({ sheets: ["A", "B"] })).toEqual(["A", "B"]);
    expect(sheetsFrom({ sheets: ["Only"] })).toEqual([]);
    expect(sheetsFrom({ sheets: "A,B" })).toEqual([]);
    expect(sheetsFrom({ sheets: [1, null, "A", " "] })).toEqual([]);
    expect(sheetsFrom({})).toEqual([]);
    expect(sheetsFrom(null)).toEqual([]);
    expect(sheetsFrom(undefined)).toEqual([]);
  });
});

describe("sheetSelector decides which file a sheet choice re-submits", () => {
  const held = new File(["h"], "held.xlsx");
  const rejected = new File(["r"], "new.xlsx");

  it("is absent without a multi-sheet listing (old engine, CSV, single sheet)", () => {
    expect(sheetSelector({ heldFile: held, heldSheets: [], sheetUsed: null, failed: null })).toBeNull();
    expect(sheetSelector({ heldFile: held, heldSheets: ["A"], sheetUsed: "A", failed: null })).toBeNull();
    expect(sheetSelector({ heldFile: null, heldSheets: ["A", "B"], sheetUsed: "A", failed: null })).toBeNull(); // after a reload there is no file to re-submit
    expect(sheetSelector({ heldFile: held, heldSheets: [], sheetUsed: null, failed: { file: rejected, sheets: [] } })).toBeNull();
  });
  it("after a success it offers the sheets with the one read, targeting the held file", () => {
    expect(sheetSelector({ heldFile: held, heldSheets: ["A", "B"], sheetUsed: "B", failed: null })).toEqual({ sheets: ["A", "B"], current: "B", target: held });
    expect(sheetSelector({ heldFile: held, heldSheets: ["A", "B"], sheetUsed: "Ghost", failed: null })?.current).toBeNull();
  });
  it("after a failure it targets the REJECTED file with no current sheet", () => {
    const sel = sheetSelector({ heldFile: held, heldSheets: ["A", "B"], sheetUsed: "A", failed: { file: rejected, sheets: ["P", "Q"] } });
    expect(sel).toEqual({ sheets: ["P", "Q"], current: null, target: rejected });
  });
});

describe("the attempt state carries the sheet list", () => {
  it("keeps sheets for a success and for a failure, and drops them on the next success without any", () => {
    const wb = new File(["x"], "w.xlsx");
    const ok = setupReducer(initialSetupState, { type: "success", file: wb, sheets: ["A", "B"], sheetUsed: "A" });
    expect(ok).toMatchObject({ sheets: ["A", "B"], sheetUsed: "A" });
    const failed = setupReducer(ok, { type: "failure", file: new File(["y"], "v.xlsx"), error: "bad", sheets: ["P", "Q"] });
    expect(failed.failed?.sheets).toEqual(["P", "Q"]);
    expect(failed.sheets).toEqual(["A", "B"]); // the held file's own listing is untouched
    expect(setupReducer(failed, { type: "success", file: new File(["c"], "c.csv") })).toMatchObject({ sheets: [], sheetUsed: null });
  });
});
