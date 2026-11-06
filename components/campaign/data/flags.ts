// Plain sentences for what the sheet itself shows: blanks, constant columns, a headerless or row-number-like
// column, repeated rows and identical columns. Each sentence states a fact about the file, never about the process.
import { isRowNumberLike, type ColumnProfile, type SheetProfile } from "@/components/campaign/data/profile";
import type { WhyCode } from "@/lib/why";

/** One fact about the sheet: its sentence, and the code of its "Why this matters" line (lib/why.ts). */
export type DataFlag = { key: string; text: string; why: WhyCode };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function columnFlags(c: ColumnProfile, n: number): DataFlag[] {
  const out: DataFlag[] = [];
  if (c.kind === "empty") return [{ key: `${c.name}:empty`, text: `${c.name} has no values in any run.`, why: "column_empty" }];
  if (c.missing > 0) out.push({ key: `${c.name}:missing`, text: `${c.name} is blank in ${plural(c.missing, "run")} of ${n}.`, why: "column_missing" });
  if (c.filled > 1 && c.distinct === 1) {
    const only = c.raw.find((v) => v !== "") ?? "";
    out.push({ key: `${c.name}:constant`, text: `${c.name} is ${only} in every run, so it cannot tell runs apart.`, why: "column_constant" });
  }
  if (c.headerless) out.push({ key: `${c.name}:headerless`, text: `${c.name} has no header in the sheet.`, why: "column_headerless" });
  if (isRowNumberLike(c, n)) {
    out.push({ key: `${c.name}:unique`, text: `${c.name} is different in every run, so it may be a run number or label rather than an input.`, why: "column_unique" });
  }
  if ((c.kind === "text" || c.kind === "category") && c.nonNumeric > 0 && c.nonNumeric < c.filled / 2 && c.filled - c.nonNumeric > c.nonNumeric) {
    out.push({ key: `${c.name}:mixed`, text: `${c.name} is mostly numbers, but ${c.nonNumeric === 1 ? "1 entry is not a number" : `${c.nonNumeric} entries are not numbers`}, so it is not treated as a number here.`, why: "column_mixed" });
  }
  return out;
}

/** Every flag on the sheet, in column order, then the sheet-wide ones. An empty list means none were found. */
export function dataFlags(profile: SheetProfile): DataFlag[] {
  const out = profile.columns.flatMap((c) => columnFlags(c, profile.n));
  if (profile.duplicateRows > 0) {
    out.push({ key: "rows:duplicate", text: `${profile.duplicateRows === 1 ? "1 run repeats" : `${profile.duplicateRows} runs repeat`} an earlier run exactly.`, why: "rows_duplicate" });
  }
  for (const p of profile.duplicateColumns) {
    out.push({ key: `${p.a}+${p.b}:duplicate`, text: `${p.a} and ${p.b} hold identical values in every run.`, why: "columns_duplicate" });
  }
  return out;
}
