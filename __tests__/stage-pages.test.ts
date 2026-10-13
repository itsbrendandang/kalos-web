import { describe, expect, it } from "vitest";
import type { CampaignRun } from "@/lib/api";
import type { ValidationFinding } from "@/lib/validation";
import { capFindings, changedRows, clampPage, inlineRecipeKeys, nextSort, sanityReason, sortRuns } from "@/components/campaign/stage-logic";

const finding = (severity: ValidationFinding["severity"], message: string): ValidationFinding => ({ check: "outliers", severity, message, column: null, rows: [] });
const run = (id: string, over: Partial<CampaignRun> = {}): CampaignRun => ({
  id, recipe: { a: 1, b: 2 }, pred: 1, std: 0.1, mode: "exploit", reason: "", result: null, awaiting: true, ...over,
});

describe("Setup finding cap", () => {
  it("shows 3, worst first, and counts the rest", () => {
    const all = [finding("info", "i"), finding("warning", "w1"), finding("error", "e"), finding("warning", "w2"), finding("info", "i2")];
    const { shown, hidden } = capFindings(all);
    expect(shown.map((f) => f.message)).toEqual(["e", "w1", "w2"]);
    expect(hidden).toBe(2);
  });
  it("hides nothing at or under the cap", () => {
    expect(capFindings([finding("info", "a"), finding("info", "b"), finding("info", "c")]).hidden).toBe(0);
    expect(capFindings([]).shown).toEqual([]);
  });
  it("an unlimited cap shows everything", () => {
    expect(capFindings(Array.from({ length: 7 }, () => finding("info", "x")), Infinity)).toMatchObject({ hidden: 0 });
  });
});

describe("Record sanity check", () => {
  it("flags negatives", () => expect(sanityReason(-0.1, 10)).toMatch(/negative/));
  it("flags more than 5x the best, not exactly 5x", () => {
    expect(sanityReason(50.1, 10)).toMatch(/5x/);
    expect(sanityReason(50, 10)).toBeNull();
  });
  it("only checks negatives when the best is missing or not positive", () => {
    expect(sanityReason(1e6, null)).toBeNull();
    expect(sanityReason(1e6, 0)).toBeNull();
    expect(sanityReason(-1, null)).toMatch(/negative/);
  });
});

describe("Record save set", () => {
  const runs = [run("a"), run("b"), run("c", { awaiting: false, result: 4 }), run("d", { awaiting: false, result: 5 })];
  it("includes only entered awaiting rows and changed logged rows", () => {
    const drafts = { a: "3.5", b: "", c: "4", d: "6" };
    expect(changedRows(runs, drafts)).toEqual([{ id: "a", value: 3.5 }, { id: "d", value: 6 }]);
  });
  it("skips invalid text and untouched rows", () => {
    expect(changedRows(runs, { a: "abc", b: "1e999" })).toEqual([]);
    expect(changedRows(runs, {})).toEqual([]);
  });
});

describe("Run table helpers", () => {
  const runs = [run("b", { pred: 2, result: 9, awaiting: false }), run("a", { pred: 3 }), run("c", { pred: 1, result: 4, awaiting: false })];
  it("sorts both ways with missing measurements last", () => {
    expect(sortRuns(runs, { key: "result", direction: "ascending" }).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortRuns(runs, { key: "result", direction: "descending" }).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(sortRuns(runs, null)).toBe(runs);
  });
  it("cycles ascending, descending, off", () => {
    const asc = nextSort(null, "pred");
    expect(asc).toEqual({ key: "pred", direction: "ascending" });
    expect(nextSort(asc, "pred")).toEqual({ key: "pred", direction: "descending" });
    expect(nextSort(nextSort(asc, "pred"), "pred")).toBeNull();
    expect(nextSort(asc, "id")?.key).toBe("id");
  });
  it("clamps the page into range", () => {
    expect(clampPage(5, 25)).toBe(2);
    expect(clampPage(1, 0)).toBe(0);
    expect(clampPage(-1, 25)).toBe(0);
  });
  it("shows top drivers present in the recipe, else the first inputs", () => {
    expect(inlineRecipeKeys({ a: 1, b: 2, c: 3, d: 4 }, ["z", "c", "a"])).toEqual(["c", "a"]);
    expect(inlineRecipeKeys({ a: 1, b: 2, c: 3, d: 4 }, [])).toEqual(["a", "b", "c"]);
  });
});
