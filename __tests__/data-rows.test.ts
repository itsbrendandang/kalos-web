import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { profileSheet } from "@/components/campaign/data/profile";
import { parseDelimited } from "@/lib/sheet-columns";
import { bestIndex, columnRoles, filterRows, groupSizes, isMeasuredOrigin, nextSort, originFromDataType, originWords, replicateGroupIndex, roundState, roundVerdict, runsOfRound, sortRows, tableRows } from "@/components/data/rows";

const csv = (text: string) => text.trim().split("\n").map((l) => l.split(","));

// Six runs: rows 1 and 4 (0-based 0 and 3) repeat one recipe, rows 2 and 5 another; one blank target.
const SHEET = csv(`
CarbonSource,Gly,SP,Titer
src_14,9.6,2.2,25.9
src_10,0.4,2.6,31.1
src_10,5.2,4.5,
src_14,9.6,2.2,28.0
src_10,0.4,2.6,12.4
src_4,3.3,3.3,40.0
`);
const profile = profileSheet(SHEET);
const TARGET = 3;
const LEVEL = 0;

describe("columnRoles", () => {
  it("names the target and the inputs, and a run-name column (a different value in every run) as a label", () => {
    const roles = columnRoles(profile, "Titer").map((c) => [c.name, c.role, c.roleWords]);
    expect(roles).toEqual([
      ["CarbonSource", "input", "Input"],
      ["Gly", "input", "Input"],
      ["SP", "input", "Input"],
      ["Titer", "target", "Target"],
    ]);
    const named = profileSheet(csv("run,SP,Titer\nr1,2.5,1\nr2,2.5,2\nr3,3.5,4"));
    expect(columnRoles(named, "Titer").map((c) => c.role)).toEqual(["label", "input", "target"]);
    // The engine's word wins: a column it used is an input whatever it looks like.
    expect(columnRoles(named, "Titer", ["run", "SP"]).map((c) => c.role)).toEqual(["input", "input", "target"]);
  });

  it("marks inputs the engine did not use as not used, and a data_type column as the origin", () => {
    const p = profileSheet(csv("data_type,Gly,SP,Titer\nreal,1.5,2,3\nsynthetic,2,3,4\nReal,3,4,5"));
    const roles = columnRoles(p, "Titer", ["SP"]).map((c) => c.role);
    expect(roles).toEqual(["origin", "not-used", "input", "target"]);
  });

  it("treats a row-number-like column as a label", () => {
    const p = profileSheet(csv(",Gly,Titer\n0,1,3\n1,2,4\n2,3,5"));
    expect(columnRoles(p, "Titer")[0]).toMatchObject({ name: "column 1", role: "label" });
  });
});

describe("origins", () => {
  it("says data_type values in plain words and shows anything else as written", () => {
    expect(originWords("real")).toBe("Measured");
    expect(originWords("Measured")).toBe("Measured");
    expect(originWords("SYNTHETIC")).toBe("Synthetic");
    expect(originWords("simulated")).toBe("Simulated");
    expect(originWords("in silico")).toBe("in silico");
    expect(originWords("  ")).toBeNull();
  });

  it("reads one origin per row from the data_type column, or null when there is none", () => {
    const p = profileSheet(csv("Data Type,Gly,Titer\nreal,1,3\nsynthetic,2,4\n,3,5"));
    expect(originFromDataType(p)).toEqual(["Measured", "Synthetic", null]);
    expect(originFromDataType(profile)).toBeNull();
  });

  it("counts a row as measured when it has no origin or is marked measured", () => {
    expect(isMeasuredOrigin(null)).toBe(true);
    expect(isMeasuredOrigin("Measured")).toBe(true);
    expect(isMeasuredOrigin("Synthetic")).toBe(false);
    expect(isMeasuredOrigin("in silico")).toBe(false);
  });
});

describe("tableRows", () => {
  const table = tableRows(profile, "Titer");

  it("gives one row per sheet row with numbers parsed, blanks null and text kept", () => {
    expect(table.rows).toHaveLength(6);
    expect(table.rows[0].cells).toEqual(["src_14", 9.6, 2.2, 25.9]);
    expect(table.rows[2].cells[TARGET]).toBeNull();
    expect(table.rows.every((r) => r.origin === null)).toBe(true);
  });

  it("marks the row with the largest target as best, once", () => {
    expect(table.rows.filter((r) => r.best).map((r) => r.index)).toEqual([5]);
    expect(bestIndex(table.rows, TARGET)).toBe(5);
    expect(bestIndex(table.rows, -1)).toBe(-1);
  });

  it("numbers replicate groups so rows sharing every input share a group", () => {
    expect(replicateGroupIndex(profile, "Titer")).toEqual([0, 1, null, 0, 1, null]);
    expect(table.rows.map((r) => r.group)).toEqual([0, 1, null, 0, 1, null]);
    expect([...groupSizes(table.rows)]).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(replicateGroupIndex(profile, undefined)).toEqual([null, null, null, null, null, null]);
  });

  it("appends rows the campaign measured with their origin, keyed by column name, and lets one of them be best", () => {
    const t = tableRows(profile, "Titer", { extra: [{ values: { Gly: 1, SP: "2.5", Titer: 55 }, origin: "Round 1" }] });
    expect(t.rows).toHaveLength(7);
    expect(t.rows[6]).toMatchObject({ index: 6, origin: "Round 1", group: null, best: true, cells: [null, 1, 2.5, 55] });
    expect(t.rows[5].best).toBe(false);
  });

  it("prefers explicit origins over the data_type column", () => {
    const p = profileSheet(csv("data_type,Gly,Titer\nreal,1,3\nsynthetic,2,4"));
    expect(tableRows(p, "Titer").rows.map((r) => r.origin)).toEqual(["Measured", "Synthetic"]);
    expect(tableRows(p, "Titer", { origins: ["Round 2", null] }).rows.map((r) => r.origin)).toEqual(["Round 2", "Synthetic"]);
  });
});

describe("sortRows", () => {
  const { rows } = tableRows(profile, "Titer");

  it("keeps sheet order without a sort", () => {
    expect(sortRows(rows, null, TARGET).map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("by the target, keeps replicates together at their group's largest value and blanks last", () => {
    const desc = sortRows(rows, { column: TARGET, direction: "descending" }, TARGET).map((r) => r.index);
    // 40.0 (row 6), then group 1 at its largest 31.1 (rows 2 then 5), then group 0 at 28.0 (rows 4 then 1), then the blank.
    expect(desc).toEqual([5, 1, 4, 3, 0, 2]);
    const asc = sortRows(rows, { column: TARGET, direction: "ascending" }, TARGET).map((r) => r.index);
    expect(asc).toEqual([0, 3, 4, 1, 5, 2]);
  });

  it("by another column, sorts rows one by one, numbers numerically and text alphabetically", () => {
    expect(sortRows(rows, { column: 2, direction: "ascending" }, TARGET).map((r) => r.index)).toEqual([0, 3, 1, 4, 5, 2]);
    expect(sortRows(rows, { column: LEVEL, direction: "descending" }, TARGET).map((r) => r.cells[LEVEL])).toEqual(["src_14", "src_14", "src_10", "src_10", "src_10", "src_4"]);
  });

  it("does not change the rows it was given", () => {
    const before = rows.map((r) => r.index);
    sortRows(rows, { column: TARGET, direction: "ascending" }, TARGET);
    expect(rows.map((r) => r.index)).toEqual(before);
  });
});

describe("filterRows", () => {
  const { rows } = tableRows(profile, "Titer", { extra: [{ values: { Titer: 1 }, origin: "Round 1" }] });

  it("matches any cell as a case-insensitive substring, and the origin", () => {
    expect(filterRows(rows, { query: "SRC_14", levels: {} }).map((r) => r.index)).toEqual([0, 3]);
    expect(filterRows(rows, { query: "31.1", levels: {} }).map((r) => r.index)).toEqual([1]);
    expect(filterRows(rows, { query: "round", levels: {} }).map((r) => r.index)).toEqual([6]);
    expect(filterRows(rows, { query: "  ", levels: {} })).toHaveLength(7);
  });

  it("keeps only the chosen level of a category column, combined with the text", () => {
    expect(filterRows(rows, { query: "", levels: { [LEVEL]: "src_10" } }).map((r) => r.index)).toEqual([1, 2, 4]);
    expect(filterRows(rows, { query: "0.4", levels: { [LEVEL]: "src_10" } }).map((r) => r.index)).toEqual([1, 4]);
    expect(filterRows(rows, { query: "", levels: { [LEVEL]: "" } })).toHaveLength(7);
  });
});

describe("nextSort", () => {
  it("starts the target descending and other columns ascending, then flips, then clears", () => {
    expect(nextSort(null, TARGET, TARGET)).toEqual({ column: TARGET, direction: "descending" });
    expect(nextSort({ column: TARGET, direction: "descending" }, TARGET, TARGET)).toEqual({ column: TARGET, direction: "ascending" });
    expect(nextSort({ column: TARGET, direction: "ascending" }, TARGET, TARGET)).toBeNull();
    expect(nextSort(null, 2, TARGET)).toEqual({ column: 2, direction: "ascending" });
    expect(nextSort({ column: 2, direction: "ascending" }, 2, TARGET)).toEqual({ column: 2, direction: "descending" });
    expect(nextSort({ column: 2, direction: "descending" }, 2, TARGET)).toBeNull();
    expect(nextSort({ column: 2, direction: "descending" }, 1, TARGET)).toEqual({ column: 1, direction: "ascending" });
  });
});

const samples = path.join(homedir(), "Desktop", "kalos-samples");
const pichia = path.join(samples, "pichia_HSA.csv");
const trichoderma = path.join(samples, "trichoderma_ambr.csv");

describe("on the sample sheets", () => {
  it.skipIf(!existsSync(pichia))("pichia_HSA: 213 rows, the best row is the largest Titer, and CarbonSource is an input", () => {
    const p = profileSheet(parseDelimited(readFileSync(pichia, "utf8")));
    const t = tableRows(p, "Titer", { engineInputs: ["CarbonSource", "Gly", "Met", "SP"] });
    expect(t.rows).toHaveLength(213);
    const ti = t.columns.findIndex((c) => c.role === "target");
    const max = Math.max(...t.rows.map((r) => (typeof r.cells[ti] === "number" ? (r.cells[ti] as number) : -Infinity)));
    expect(t.rows.find((r) => r.best)?.cells[ti]).toBe(max);
    expect(t.columns.map((c) => c.role)).toEqual(["input", "not-used", "input", "input", "input", "target"]);
    const sorted = sortRows(t.rows, { column: ti, direction: "descending" }, ti);
    expect(sorted[0].best).toBe(true);
  });

  it.skipIf(!existsSync(trichoderma))("trichoderma: the ten conditions are replicate groups that stay together when sorted by the target", () => {
    const p = profileSheet(parseDelimited(readFileSync(trichoderma, "utf8")));
    const t = tableRows(p, "mucic_acid_g_L");
    const ti = 2;
    const sorted = sortRows(t.rows, { column: ti, direction: "descending" }, ti);
    const seen: (number | null)[] = [];
    for (const r of sorted) {
      if (r.group != null && seen.includes(r.group) && seen[seen.length - 1] !== r.group) throw new Error(`group ${r.group} split`);
      seen.push(r.group);
    }
    expect(groupSizes(t.rows).size).toBe(10);
  });
});

describe("the round page", () => {
  const pending = [
    { id: "a", round: 0, result: 50, awaiting: false },
    { id: "b", round: 0, result: null, awaiting: true },
    { id: "c", round: 1, result: 70, awaiting: false },
    { id: "d", result: 1, awaiting: false },
  ];

  it("reads a human round as the engine's 0-based round plus one, and counts runs without a round in the current one", () => {
    expect(runsOfRound(pending, 1, 1).map((r) => r.id)).toEqual(["a", "b"]);
    expect(runsOfRound(pending, 1, 2).map((r) => r.id)).toEqual(["c", "d"]);
    expect(runsOfRound(pending, 1, 3)).toEqual([]);
  });

  it("tells a round with runs from a folded one and from one never recorded", () => {
    const history = [{ round: 0 }, { round: 1 }];
    expect(roundState([{}], history, 1)).toBe("runs");
    expect(roundState([], history, 1)).toBe("folded");
    expect(roundState([], history, 2)).toBe("unknown");
  });

  it("says the best measured value against the sheet's best, or that nothing is recorded", () => {
    const f = (v: number) => v.toFixed(1);
    expect(roundVerdict([{ result: null }], 63.3, f)).toBe("No results recorded yet.");
    expect(roundVerdict([{ result: 50 }, { result: 70 }, { result: null }], 63.3, f)).toBe("Best measured in this round: 70.0, above the sheet's best 63.3.");
    expect(roundVerdict([{ result: 50 }], 63.3, f)).toBe("Best measured in this round: 50.0, below the sheet's best 63.3.");
    expect(roundVerdict([{ result: 63.3 }], 63.3, f)).toBe("Best measured in this round: 63.3, level with the sheet's best 63.3.");
    expect(roundVerdict([{ result: 50 }], null, f)).toBe("Best measured in this round: 50.0.");
  });
});

describe("columnRoles with the engine's input list", () => {
  it("marks a free-text column the engine left out as not used, and a run-name column as a label", () => {
    const rows = ["run,note,SP,Titer", ...Array.from({ length: 14 }, (_, i) => `r${i},note ${i % 13},${i / 2},${i}`)];
    const p = profileSheet(csv(rows.join("\n")));
    expect(columnRoles(p, "Titer", ["SP"]).map((c) => c.role)).toEqual(["label", "not-used", "input", "target"]);
    expect(columnRoles(p, "Titer").map((c) => c.role)).toEqual(["label", "label", "input", "target"]);
  });
});
