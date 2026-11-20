// Reads what the browser can learn about a run sheet BEFORE trusting the fit:
// its columns, and how a `data_type` column (Real / Synthetic) splits the rows.
// CSV/TSV are read as text and .xlsx through lib/xlsx-rows.ts; both feed the SAME row-type counter.
// Legacy binary .xls cannot be read here and reports nothing.
import { parseCsvHeader } from "@/lib/scale-readout";
import { readXlsxRows } from "@/lib/xlsx-rows";

/** Files larger than this are not scanned in the browser (the engine has its own checks). */
export const SCAN_MAX_BYTES = 5 * 1024 * 1024;

function delimiterOf(headerLine: string): string {
  return !headerLine.includes(",") && headerLine.includes("\t") ? "\t" : ",";
}

/** Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF/LF. Rows only; no type guessing. */
export function parseDelimited(text: string): string[][] {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const nl = t.search(/\r\n|\r|\n/);
  const d = delimiterOf(nl === -1 ? t : t.slice(0, nl));
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export type DataTypeCounts = { column: string; counts: { value: string; n: number }[]; total: number };

/** Row counts per value of a `data_type`-like column (case-insensitive, `data type` / `data-type` too), or null. */
export function dataTypeCounts(text: string): DataTypeCounts | null {
  return dataTypeCountsFromRows(parseDelimited(text));
}

/** The one row-type detector, shared by delimited text and Excel: first row is the header, the rest are runs. */
export function dataTypeCountsFromRows(rows: readonly (readonly string[])[]): DataTypeCounts | null {
  if (rows.length < 2) return null;
  const idx = rows[0].findIndex((h) => /^data[\s_-]?type$/i.test(h.trim()));
  if (idx < 0) return null;
  const tally = new Map<string, number>();
  for (const r of rows.slice(1)) {
    const v = (r[idx] ?? "").trim() || "(blank)";
    tally.set(v, (tally.get(v) ?? 0) + 1);
  }
  const counts = [...tally].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
  return { column: rows[0][idx].trim(), counts, total: rows.length - 1 };
}

export type SheetScan = { columns: string[]; dataType: DataTypeCounts | null; scanned: boolean };

/** Columns plus data_type counts for a File; never throws. Legacy .xls and oversize files come back unscanned. `sheet` picks a worksheet of an .xlsx (default: the first, as the engine does). */
export async function scanSheet(file: File, sheet?: string): Promise<SheetScan> {
  const empty: SheetScan = { columns: [], dataType: null, scanned: false };
  if (/\.xls$/i.test(file.name)) return empty;
  try {
    if (/\.xlsx$/i.test(file.name)) {
      if (file.size > SCAN_MAX_BYTES) return empty;
      const x = await readXlsxRows(await file.arrayBuffer(), sheet);
      if (!x) return empty;
      return { columns: (x.rows[0] ?? []).map((h) => h.trim()).filter(Boolean), dataType: dataTypeCountsFromRows(x.rows), scanned: true };
    }
    if (file.size > SCAN_MAX_BYTES) {
      const head = await file.slice(0, 64 * 1024).text();
      return { columns: parseCsvHeader(head), dataType: null, scanned: false };
    }
    const text = await file.text();
    return { columns: parseCsvHeader(text), dataType: dataTypeCounts(text), scanned: true };
  } catch {
    return empty;
  }
}

/**
 * The whole sheet as the browser reads it (first row = header), for the first-run setup step: the columns to
 * choose the target from and each input's observed low and high next to its bounds. Null when the file cannot
 * be read here (legacy .xls, over SCAN_MAX_BYTES, not a readable workbook); the engine still reads it on upload.
 * `sheets` lists an .xlsx file's worksheets (empty for delimited text).
 */
export type SheetTable = { header: string[]; rows: string[][]; sheets: string[]; sheetUsed: string | null };

export async function readSheetTable(file: File, sheet?: string): Promise<SheetTable | null> {
  if (/\.xls$/i.test(file.name) || file.size > SCAN_MAX_BYTES) return null;
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const x = await readXlsxRows(await file.arrayBuffer(), sheet);
      if (!x || x.rows.length === 0) return null;
      return { header: x.rows[0].map((h) => h.trim()), rows: x.rows.slice(1), sheets: x.sheets, sheetUsed: x.sheetUsed };
    }
    const all = parseDelimited(await file.text());
    if (all.length === 0) return null;
    return { header: all[0].map((h) => h.trim()), rows: all.slice(1), sheets: [], sheetUsed: null };
  } catch {
    return null;
  }
}

/**
 * What one column holds, read in the browser BEFORE the engine sees the sheet:
 *   numeric     at least 80% of its filled cells are numbers (the engine's own numeric gate); min/max over those
 *   text        repeated text values (a categorical input to the engine, unless it drops it by name)
 *   identifier  text only, with a different value in every filled row (an ID; the engine leaves these out)
 *   empty       no filled cell
 * A preview only: the engine decides the roles when it reads the sheet, and its observed range is computed over
 * the rows it fits (complete rows), so it can be narrower than the min/max here.
 */
export type ColumnProfile = { name: string; kind: "numeric" | "text" | "identifier" | "empty"; filled: number; min: number | null; max: number | null; distinct: number };

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUMERIC_SHARE = 0.8;

export function columnProfiles(table: Pick<SheetTable, "header" | "rows">): ColumnProfile[] {
  const seen = new Set<string>();
  const out: ColumnProfile[] = [];
  table.header.forEach((name, i) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    let filled = 0;
    let numeric = 0;
    let min = Infinity;
    let max = -Infinity;
    const values = new Set<string>();
    for (const r of table.rows) {
      const v = (r[i] ?? "").trim();
      if (v === "") continue;
      filled += 1;
      values.add(v);
      if (NUMBER.test(v)) {
        const n = Number(v);
        if (Number.isFinite(n)) {
          numeric += 1;
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
    }
    const kind: ColumnProfile["kind"] =
      filled === 0 ? "empty" : numeric / filled >= NUMERIC_SHARE ? "numeric" : numeric === 0 && values.size === filled && filled > 1 ? "identifier" : "text";
    out.push({ name, kind, filled, min: kind === "numeric" ? min : null, max: kind === "numeric" ? max : null, distinct: values.size });
  });
  return out;
}

/** "1:05" style elapsed time for the fit progress line. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
