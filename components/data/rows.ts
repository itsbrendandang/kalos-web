// Pure maths behind the rows table on the Data pages: which column plays which role, one table row per
// sheet row (plus the campaign's measured runs when the page has them), sorting that keeps replicates
// together, filtering, the best row and the origin of each row. No React and no DOM, so every rule is
// unit-tested (__tests__/data-rows.test.ts). Nothing here says whether a run is good: "best" is the
// largest target value in the sheet, and nothing more.

import { isRowNumberLike, replicateGroups, type ColumnKind, type SheetProfile } from "@/components/campaign/data/profile";

export type ColumnRole = "input" | "target" | "label" | "not-used" | "origin";

export type TableColumn = {
  name: string;
  role: ColumnRole;
  kind: ColumnKind;
  /** The role in plain words, for the badge under the header. */
  roleWords: string;
};

export type TableRow = {
  /** 0-based position: sheet rows in sheet order, then appended rows. */
  index: number;
  cells: (string | number | null)[];
  /** "Sheet" rows carry null; rows the campaign added carry "Round n"; a `data_type` column gives "Measured", "Simulated", ... */
  origin: string | null;
  /** The replicate group this row belongs to (rows sharing every input), or null. */
  group: number | null;
  best: boolean;
};

export type SortState = { column: number; direction: "ascending" | "descending" } | null;

export const ROLE_WORDS: Record<ColumnRole, string> = {
  input: "Input",
  target: "Target",
  label: "Label",
  "not-used": "Not used",
  origin: "Origin",
};

const DATA_TYPE = /^data[\s_-]?type$/i;

/** The `data_type` column, when the sheet has one. */
export function dataTypeColumn(profile: SheetProfile): number {
  return profile.columns.findIndex((c) => DATA_TYPE.test(c.name));
}

/** A `data_type` value in plain words: "Measured", "Simulated", "Synthetic", or the value as written. */
export function originWords(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  const k = v.toLowerCase();
  if (k === "real" || k === "measured") return "Measured";
  if (k === "simulated" || k === "simulation") return "Simulated";
  if (k === "synthetic") return "Synthetic";
  return v;
}

/** True when a `data_type` value marks a measured run (the only rows a chart may show). */
export function isMeasuredOrigin(value: string | null): boolean {
  return value == null || value === "Measured";
}

/** One origin label per row from the sheet's own `data_type` column, or null when the sheet has none. */
export function originFromDataType(profile: SheetProfile): (string | null)[] | null {
  const i = dataTypeColumn(profile);
  if (i < 0) return null;
  return profile.columns[i].raw.map(originWords);
}

/** Which replicate group each row belongs to (groups of two or more rows sharing every input), or null. */
export function replicateGroupIndex(profile: SheetProfile, target: string | undefined): (number | null)[] {
  const out = new Array<number | null>(profile.n).fill(null);
  if (!target) return out;
  replicateGroups(profile, new Set(), target).forEach((g, gi) => g.rows.forEach((r) => (out[r] = gi)));
  return out;
}

/** A non-numeric column with a different value in every run (a run name or id), never an input. */
function isIdLike(c: SheetProfile["columns"][number], n: number): boolean {
  return c.kind !== "numeric" && c.kind !== "empty" && n >= 3 && c.filled === n && c.distinct === n;
}

export function columnRoles(profile: SheetProfile, target: string | undefined, engineInputs?: readonly string[]): TableColumn[] {
  const dt = dataTypeColumn(profile);
  return profile.columns.map((c, i) => {
    let role: ColumnRole;
    if (i === dt) role = "origin";
    else if (target && c.name === target) role = "target";
    else if (engineInputs?.includes(c.name)) role = "input"; // the engine's word wins over the browser's guess at the kind
    else if (isRowNumberLike(c, profile.n) || isIdLike(c, profile.n)) role = "label";
    else if (c.kind === "empty" || engineInputs) role = "not-used"; // the engine read the sheet and left this column out
    else if (c.kind === "text") role = "label";
    else role = "input";
    return { name: c.name, role, kind: c.kind, roleWords: ROLE_WORDS[role] };
  });
}

export type ExtraRow = { values: Record<string, string | number | null>; origin: string };

export type RowsTable = { columns: TableColumn[]; rows: TableRow[] };

/**
 * The table for one sheet. `origins` overrides the per-row origin (one entry per sheet row); `extra` appends
 * rows the campaign measured after the upload, keyed by column name (a column the row lacks reads blank).
 */
export function tableRows(
  profile: SheetProfile,
  target: string | undefined,
  opts: { origins?: readonly (string | null)[]; engineInputs?: readonly string[]; extra?: readonly ExtraRow[] } = {},
): RowsTable {
  const columns = columnRoles(profile, target, opts.engineInputs);
  const fromDataType = originFromDataType(profile);
  const groups = replicateGroupIndex(profile, target);
  const rows: TableRow[] = [];
  for (let r = 0; r < profile.n; r++) {
    const cells = profile.columns.map((c) => {
      if (c.kind === "numeric") return c.numbers[r];
      const v = c.raw[r];
      return v === "" ? null : v;
    });
    rows.push({ index: r, cells, origin: opts.origins?.[r] ?? fromDataType?.[r] ?? null, group: groups[r], best: false });
  }
  for (const e of opts.extra ?? []) {
    const cells = columns.map((c) => {
      const v = e.values[c.name];
      return v == null || v === "" ? null : c.kind === "numeric" && typeof v === "string" ? Number(v) : v;
    });
    rows.push({ index: rows.length, cells, origin: e.origin, group: null, best: false });
  }
  const t = columns.findIndex((c) => c.role === "target");
  const best = bestIndex(rows, t);
  if (best >= 0) rows[best] = { ...rows[best], best: true };
  return { columns, rows };
}

/** The row with the largest target value (the first one on a tie), or -1 when no row has one. */
export function bestIndex(rows: readonly TableRow[], targetColumn: number): number {
  if (targetColumn < 0) return -1;
  let best = -1;
  let max = -Infinity;
  rows.forEach((row, i) => {
    const v = row.cells[targetColumn];
    if (typeof v === "number" && Number.isFinite(v) && v > max) {
      max = v;
      best = i;
    }
  });
  return best;
}

function compareCells(a: string | number | null, b: string | number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // blanks last in either direction
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

/**
 * A sorted copy. Sorting by the target keeps each replicate group together: groups take the place of their
 * largest target value, then rows sort within the group. Any other column sorts rows one by one. Ties keep
 * sheet order; blank cells sort last whatever the direction.
 */
export function sortRows(rows: readonly TableRow[], sort: SortState, targetColumn: number): TableRow[] {
  if (!sort) return [...rows];
  const sign = sort.direction === "ascending" ? 1 : -1;
  const col = sort.column;
  const byTarget = col === targetColumn && targetColumn >= 0;
  const groupMax = new Map<number, number>();
  if (byTarget) {
    for (const r of rows) {
      const v = r.cells[col];
      if (r.group != null && typeof v === "number") groupMax.set(r.group, Math.max(groupMax.get(r.group) ?? -Infinity, v));
    }
  }
  const key = (r: TableRow): string | number | null => (byTarget && r.group != null && groupMax.has(r.group) ? groupMax.get(r.group)! : r.cells[col]);
  const dir = (c: number) => (c === 0 ? 0 : c > 0 === (sign > 0) ? 1 : -1);
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const first = compareCells(ka, kb);
    if (ka == null || kb == null) return first; // blanks last, direction aside
    const c = dir(first);
    if (c !== 0) return c;
    if (byTarget && a.group !== b.group) return (a.group ?? -1) - (b.group ?? -1);
    if (byTarget) {
      const inner = compareCells(a.cells[col], b.cells[col]);
      if (a.cells[col] == null || b.cells[col] == null) return inner;
      const ci = dir(inner);
      if (ci !== 0) return ci;
    }
    return a.index - b.index;
  });
}

/** How many rows each replicate group holds, for the "replicate x{k}" caption. */
export function groupSizes(rows: readonly TableRow[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) if (r.group != null) out.set(r.group, (out.get(r.group) ?? 0) + 1);
  return out;
}

export type Filter = { query: string; levels: Readonly<Record<number, string>> };

/** The text a cell shows, which is what the filter matches. */
export function cellText(v: string | number | null): string {
  return v == null ? "" : String(v);
}

/** Rows that match the text (case-insensitive substring over any cell and the origin) and every chosen level. */
export function filterRows(rows: readonly TableRow[], filter: Filter): TableRow[] {
  const q = filter.query.trim().toLowerCase();
  const levels = Object.entries(filter.levels).filter(([, v]) => v !== "");
  return rows.filter((r) => {
    for (const [c, v] of levels) if (cellText(r.cells[Number(c)]) !== v) return false;
    if (!q) return true;
    return r.cells.some((cell) => cellText(cell).toLowerCase().includes(q)) || (r.origin?.toLowerCase().includes(q) ?? false);
  });
}

/** The next sort after a click on a column: ascending, then descending, then off; the target starts descending. */
export function nextSort(sort: SortState, column: number, targetColumn: number): SortState {
  const first = column === targetColumn ? "descending" : "ascending";
  if (sort?.column !== column) return { column, direction: first };
  if (sort.direction === first) return { column, direction: first === "ascending" ? "descending" : "ascending" };
  return null;
}

// --- The round page (/data/round/[round]) ---------------------------------------------------------------

/**
 * The runs of one human round (1-based, as the campaign pages show it; the engine's `pending[].round` is the
 * 0-based round a run was started in). A run without a round is counted in the campaign's current round.
 */
export function runsOfRound<T extends { round?: number }>(pending: readonly T[], engineRound: number, round: number): T[] {
  return pending.filter((r) => (r.round ?? engineRound) + 1 === round);
}

export type RoundState = "runs" | "folded" | "unknown";

/** Whether a round still lists its runs, was folded into the campaign's data (history has it, pending does not), or is not recorded at all. */
export function roundState(runs: readonly unknown[], history: readonly { round: number }[], round: number): RoundState {
  if (runs.length) return "runs";
  if (history.some((h) => h.round === round)) return "folded";
  return "unknown";
}

/** The round page's one sentence: the best measured value against the sheet's own best (round 0 of the history). */
export function roundVerdict(runs: readonly { result: number | null }[], sheetBest: number | null, format: (v: number) => string): string {
  const measured = runs.map((r) => r.result).filter((v): v is number => v != null && Number.isFinite(v));
  if (measured.length === 0) return "No results recorded yet.";
  const best = Math.max(...measured);
  if (sheetBest == null || !Number.isFinite(sheetBest)) return `Best measured in this round: ${format(best)}.`;
  const rel = best > sheetBest ? "above" : best < sheetBest ? "below" : "level with";
  return `Best measured in this round: ${format(best)}, ${rel} the sheet's best ${format(sheetBest)}.`;
}
