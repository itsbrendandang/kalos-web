/*
 * Partner-sheet checks, on this device. Reads each column's numbers, flags what
 * would silently corrupt a model (censored values, decimal commas, mixed units,
 * blanks) and converts only unit pairs that are exactly convertible. It never
 * guesses: anything unclear is reported for a person to resolve.
 * Tested in __tests__/normalize.test.ts.
 */

export type Cell = { kind: "number"; value: number } | { kind: "censored"; op: "<" | ">"; limit: number } | { kind: "blank" } | { kind: "text" };

/** One cell. "<0.1" and "BLQ" are censored, never zero. A lone comma is a decimal ("1,5"), "1,234.5" is a thousands separator. */
export function parseCell(raw: string): Cell {
  const t = raw.trim();
  if (!t || /^(na|n\/a|nan|null|-|--)$/i.test(t)) return { kind: "blank" };
  if (/^(blq|bql|<\s*loq|nd|n\.d\.)$/i.test(t)) return { kind: "censored", op: "<", limit: NaN };
  const c = t.match(/^([<>])\s*=?\s*(-?[\d.,]+)$/);
  if (c) {
    const v = num(c[2]);
    return v == null ? { kind: "text" } : { kind: "censored", op: c[1] as "<" | ">", limit: v };
  }
  const v = num(t);
  return v == null ? { kind: "text" } : { kind: "number", value: v };
}
function num(s: string): number | null {
  let x = s.trim();
  if (!/^-?[\d.,]+$/.test(x) || !/\d/.test(x)) return null;
  if (x.includes(",") && x.includes(".")) x = x.lastIndexOf(",") > x.lastIndexOf(".") ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
  else if ((x.match(/,/g)?.length ?? 0) === 1 && !/^-?\d{1,3},\d{3}$/.test(x)) x = x.replace(",", ".");
  else x = x.replace(/,/g, "");
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

/** The unit written in a header: "titer (g/L)" or "titer [mg/mL]". */
export function headerUnit(h: string): { name: string; unit: string | null } {
  const m = h.match(/^(.*?)[\s_]*[([]\s*([^)\]]+?)\s*[)\]]\s*$/);
  return m ? { name: m[1].trim() || h.trim(), unit: m[2].trim() } : { name: h.trim(), unit: null };
}

const canon = (u: string) => u.toLowerCase().replace(/\s+/g, "").replace(/µ|μ/g, "u").replace(/l$/, "l");
/** Factor to multiply by to go from `from` to `to`, only for exact, unambiguous pairs. Null otherwise. */
export function convertFactor(from: string, to: string): number | null {
  const a = canon(from), b = canon(to);
  if (a === b) return 1;
  const T: Record<string, number> = { "g/l": 1, "mg/ml": 1, "mg/l": 1e-3, "ug/ml": 1e-3, "g/ml": 1e3, "ng/ml": 1e-6 };
  const C: Record<string, number> = { "1e6cells/ml": 1, "e6cells/ml": 1, "10^6cells/ml": 1, "1e5cells/ml": 0.1, "cells/ml": 1e-6 };
  const O: Record<string, number> = { "mosm/kg": 1 };
  const Tm: Record<string, number> = { h: 1, hr: 1, hours: 1, min: 1 / 60, d: 24, days: 24, day: 24 };
  for (const t of [T, C, O, Tm]) if (a in t && b in t) return t[a] / t[b];
  return null;
}

export type ColumnReport = {
  column: string;
  name: string;
  unit: string | null;
  numeric: number;
  censored: number;
  blank: number;
  text: number;
  issues: string[];
};

export function checkSheet(columns: string[], rows: string[][]): ColumnReport[] {
  return columns.map((column, i) => {
    const { name, unit } = headerUnit(column);
    let numeric = 0, censored = 0, blank = 0, text = 0, comma = 0;
    for (const r of rows) {
      const raw = r[i] ?? "";
      const c = parseCell(raw);
      if (c.kind === "number") { numeric++; if (/^-?\d+,\d{1,2}$/.test(raw.trim())) comma++; }
      else if (c.kind === "censored") censored++;
      else if (c.kind === "blank") blank++;
      else text++;
    }
    const total = rows.length || 1;
    const issues: string[] = [];
    if (censored) issues.push(`${censored} value${censored > 1 ? "s are" : " is"} below or above a detection limit (like "<0.1"). They are kept as limits, not zeros.`);
    if (comma) issues.push(`${comma} number${comma > 1 ? "s use" : " uses"} a decimal comma and was read as a decimal.`);
    if (blank / total > 0.2) issues.push(`${Math.round((blank / total) * 100)}% of rows are blank.`);
    if (numeric && text) issues.push(`${text} entr${text > 1 ? "ies are" : "y is"} text in an otherwise numeric column.`);
    return { column, name, unit, numeric, censored, blank, text, issues };
  });
}

/** Parse a whole CSV/TSV into header + rows (same delimiter rules as sheetSummary). */
export function readSheet(text: string): { columns: string[]; rows: string[][] } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const delim = (lines[0].match(/\t/g)?.length ?? 0) > (lines[0].match(/[,;]/g)?.length ?? 0) ? "\t" : (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ""; } else cur += ch; }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const columns = split(lines[0]);
  return { columns, rows: lines.slice(1).map(split) };
}

/** A partner's step names mapped to yours; kept as plain data so it can be versioned. */
export type NameMap = Record<string, string>;
export function mapName(partnerName: string, map: NameMap): string | null {
  const k = partnerName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const [from, to] of Object.entries(map)) if (from.toLowerCase().replace(/[^a-z0-9]+/g, "") === k) return to;
  return null;
}
