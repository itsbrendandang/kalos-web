// Pure maths for "Your data": what the browser can say about a dropped run sheet
// before (and independently of) the engine. No React and no DOM here, so every
// number on the Your data view is unit-tested (__tests__/data-profile.test.ts).
//
// Only facts from the sheet itself. Nothing is inferred about the process.

/** A cell that parses as a finite number (blank cells are handled separately). */
export function toNumber(raw: string): number | undefined {
  const s = raw.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

export type ColumnKind = "numeric" | "category" | "text" | "empty";

export type ColumnProfile = {
  /** Header as written, or `column N` (1-based position) when the header cell is blank. */
  name: string;
  /** True when the sheet had no header for this column. */
  headerless: boolean;
  kind: ColumnKind;
  /** Cells with a value (not blank). */
  filled: number;
  /** Blank cells. */
  missing: number;
  /** Distinct non-blank values. */
  distinct: number;
  /** Non-blank cells that are not numbers (only meaningful for numeric-looking columns). */
  nonNumeric: number;
  /** One entry per data row: the parsed number, or null for a blank or non-numeric cell. Numeric columns only. */
  numbers: (number | null)[];
  /** Raw non-blank text, one entry per data row ("" for blank). Categories and text. */
  raw: string[];
  /** Level counts, most common first. Category columns only. */
  levels: { value: string; n: number }[];
};

export type SheetProfile = {
  /** Data rows (the header is not counted). */
  n: number;
  columns: ColumnProfile[];
  /** Data rows that repeat an earlier row exactly (all cells equal). */
  duplicateRows: number;
  /** Pairs of columns whose cells are identical row by row. */
  duplicateColumns: { a: string; b: string }[];
};

/** A column with at most this many distinct text values is a category; more is free text. */
export const MAX_CATEGORY_LEVELS = 12;

/** The shortest interior stretch with no runs, as a share of the input's range, that is named as untested. */
export const UNTESTED_SHARE = 0.1;

export function profileSheet(rows: readonly (readonly string[])[]): SheetProfile {
  const [header = [], ...body] = rows;
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const cell = (r: readonly string[], c: number) => (r[c] ?? "").trim();
  const columns: ColumnProfile[] = [];
  for (let c = 0; c < width; c++) {
    const h = (header[c] ?? "").trim();
    const raw = body.map((r) => cell(r, c));
    const filledRaw = raw.filter((v) => v !== "");
    const numbers = raw.map((v) => (v === "" ? null : toNumber(v) ?? null));
    const nonNumeric = filledRaw.filter((v) => toNumber(v) === undefined).length;
    const distinct = new Set(filledRaw).size;
    let kind: ColumnKind;
    if (filledRaw.length === 0) kind = "empty";
    else if (nonNumeric === 0) kind = "numeric";
    else if (distinct <= MAX_CATEGORY_LEVELS) kind = "category";
    else kind = "text";
    const tally = new Map<string, number>();
    for (const v of filledRaw) tally.set(v, (tally.get(v) ?? 0) + 1);
    columns.push({
      name: h || `column ${c + 1}`,
      headerless: h === "",
      kind,
      filled: filledRaw.length,
      missing: raw.length - filledRaw.length,
      distinct,
      nonNumeric,
      numbers: kind === "numeric" ? numbers : numbers.map(() => null),
      raw,
      levels: kind === "category" ? [...tally].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value)) : [],
    });
  }
  const rowKeys = body.map((r) => JSON.stringify(columns.map((_, c) => cell(r, c))));
  return {
    n: body.length,
    columns,
    duplicateRows: rowKeys.length - new Set(rowKeys).size,
    duplicateColumns: duplicateColumnPairs(columns),
  };
}

/** Pairs of non-empty columns with identical cells in every row (same blanks included). */
export function duplicateColumnPairs(columns: readonly ColumnProfile[]): { a: string; b: string }[] {
  const out: { a: string; b: string }[] = [];
  const live = columns.filter((c) => c.kind !== "empty");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.raw.length === b.raw.length && a.raw.every((v, k) => v === b.raw[k])) out.push({ a: a.name, b: b.name });
    }
  }
  return out;
}

/** Columns whose every row holds a different value (for example a row number). Needs at least three filled rows. */
export function isUniquePerRow(col: ColumnProfile, n: number): boolean {
  return n >= 3 && col.filled === n && col.distinct === n;
}

export type Summary = { n: number; mean: number; sd: number; min: number; max: number; median: number };

/** Count, mean, sample standard deviation, range and median of finite values. Null for no values. */
export function summarize(values: readonly number[]): Summary | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...v].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], median };
}

export type Histogram = { edges: number[]; counts: number[] };

/** Equal-width bins over [min, max]; the top edge is inclusive. One bin when every value is equal. */
export function histogram(values: readonly number[], bins?: number): Histogram | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const k = lo === hi ? 1 : Math.max(1, bins ?? Math.min(15, Math.max(4, Math.round(Math.sqrt(v.length)))));
  const width = lo === hi ? 1 : (hi - lo) / k;
  const edges = Array.from({ length: k + 1 }, (_, i) => lo + i * width);
  const counts = new Array<number>(k).fill(0);
  for (const x of v) {
    const i = lo === hi ? 0 : Math.min(k - 1, Math.floor((x - lo) / width));
    counts[i] += 1;
  }
  return { edges, counts };
}

export type Gap = { from: number; to: number; width: number; share: number };

/**
 * Stretches between neighbouring distinct values that are wider than `UNTESTED_SHARE` of the input's range.
 * These are the parts of the range no run covered. Empty when the range is zero.
 */
export function untestedGaps(values: readonly number[]): { min: number; max: number; gaps: Gap[] } | null {
  const v = [...new Set(values.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
  if (v.length < 2) return null;
  const range = v[v.length - 1] - v[0];
  const gaps: Gap[] = [];
  for (let i = 1; i < v.length; i++) {
    const width = v[i] - v[i - 1];
    const share = width / range;
    if (share > UNTESTED_SHARE) gaps.push({ from: v[i - 1], to: v[i], width, share });
  }
  return { min: v[0], max: v[v.length - 1], gaps };
}

export type ReplicateGroup = { rows: number[]; targets: number[] };

/**
 * Runs that share every input value (numeric and category columns only, minus `exclude`: the target and the
 * unique-per-row columns). Groups of two or more are replicates of one recipe. Rows with a blank input are not grouped.
 */
export function replicateGroups(profile: SheetProfile, exclude: ReadonlySet<string>, target?: string): ReplicateGroup[] {
  const inputs = profile.columns.filter((c) => (c.kind === "numeric" || c.kind === "category") && !exclude.has(c.name) && c.name !== target && !isUniquePerRow(c, profile.n));
  if (inputs.length === 0 || !target) return [];
  const tcol = profile.columns.find((c) => c.name === target);
  if (!tcol) return [];
  const groups = new Map<string, ReplicateGroup>();
  for (let r = 0; r < profile.n; r++) {
    if (inputs.some((c) => c.raw[r] === "")) continue;
    const key = JSON.stringify(inputs.map((c) => c.raw[r]));
    const g = groups.get(key) ?? { rows: [], targets: [] };
    g.rows.push(r);
    const t = tcol.numbers[r];
    if (t != null) g.targets.push(t);
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.rows.length >= 2);
}

export type ReplicateSpread = { groups: number; runs: number; medianSd: number | null };

/** How many replicate groups there are, how many runs they hold, and the median within-group sd of the target. */
export function replicateSpread(groups: readonly ReplicateGroup[]): ReplicateSpread {
  const sds = groups.map((g) => summarize(g.targets)).filter((s): s is Summary => s != null && s.n >= 2).map((s) => s.sd);
  const sorted = [...sds].sort((a, b) => a - b);
  const medianSd = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  return { groups: groups.length, runs: groups.reduce((s, g) => s + g.rows.length, 0), medianSd };
}
