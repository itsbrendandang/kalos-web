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
  /**
   * Numeric columns whose values barely move: one distinct value, a range under 1% of the median, or at most two
   * distinct values in ten or more runs. Such an input cannot show an association with the target in this sheet.
   */
  nearlyConstant: boolean;
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

/** The most levels a non-numeric column may have and still be a category (see `isCategory`). */
export const MAX_CATEGORY_LEVELS = 30;

/**
 * A non-numeric column is a category when it has at most 30 distinct values and no more than half as many
 * distinct values as runs (at least 2). Otherwise it is label-like text: a run name, a note, a date.
 */
export function isCategory(distinct: number, n: number): boolean {
  return distinct <= MAX_CATEGORY_LEVELS && distinct <= Math.max(2, n / 2);
}

/** The `nearlyConstant` rule on a numeric column's values (see `ColumnProfile.nearlyConstant`). */
export function isNearlyConstant(values: readonly number[]): boolean {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return false;
  const distinct = new Set(v).size;
  if (distinct === 1) return true;
  if (distinct <= 2 && v.length >= 10) return true;
  const s = summarize(v)!;
  return (s.max - s.min) / Math.max(Math.abs(s.median), 1e-9) < 0.01;
}

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
    else if (isCategory(distinct, body.length)) kind = "category";
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
      nearlyConstant: kind === "numeric" && isNearlyConstant(numbers.filter((x): x is number => x != null)),
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

/**
 * A row-number-like column: whole numbers, a different value in every run, and no gaps (0..n-1 or 1..n).
 * Continuous inputs and short integer inputs that merely differ are not row numbers. Needs at least three runs.
 */
export function isRowNumberLike(col: ColumnProfile, n: number): boolean {
  if (n < 3 || col.kind !== "numeric" || col.filled !== n || col.distinct !== n) return false;
  const v = col.numbers.filter((x): x is number => x != null);
  if (!v.every(Number.isInteger)) return false;
  return Math.max(...v) - Math.min(...v) === n - 1;
}

export type Summary = { n: number; mean: number; sd: number; min: number; max: number; median: number };

/** Count, mean, sample standard deviation, range and median of finite values. Null for no values. */
export function summarize(values: readonly number[]): Summary | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sorted = [...v].sort((a, b) => a - b);
  // Identical values have no spread; the subtraction above would otherwise leave floating-point dust (1e-14) that prints as a number.
  const sd = n > 1 && sorted[0] !== sorted[n - 1] ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], median };
}

export type Histogram = { edges: number[]; counts: number[] };

/** The round step (1, 2, 2.5 or 5 times a power of ten) that `niceTicks` uses to cover [lo, hi] with about `count` ticks. */
export function niceStep(lo: number, hi: number, count: number): number {
  const raw = (hi - lo) / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw * (1 - 1e-9)) ?? 10 * pow;
}

/** Sturges' bin count, `ceil(log2(n) + 1)`, clamped to 4..15. */
export function sturgesBins(n: number): number {
  return Math.min(15, Math.max(4, Math.ceil(Math.log2(Math.max(1, n)) + 1)));
}

/**
 * Equal-width bins on round edges: about `bins` of them (Sturges' rule when not given), with the width snapped to
 * the nice step from `niceTicks`, the first edge at or below the smallest value and the last at or above the
 * largest. The top edge is inclusive. One bin when every value is equal.
 */
export function histogram(values: readonly number[], bins?: number): Histogram | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (lo === hi) return { edges: [lo, lo + 1], counts: [v.length] };
  const k = Math.max(1, bins ?? sturgesBins(v.length));
  const step = niceStep(lo, hi, k);
  const round = (x: number) => Number(x.toPrecision(12));
  const first = round(Math.floor(lo / step + 1e-9) * step);
  const edges: number[] = [first];
  while (edges[edges.length - 1] < hi - step * 1e-9) edges.push(round(first + edges.length * step));
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const x of v) {
    const i = Math.min(counts.length - 1, Math.floor((x - first) / step + 1e-9));
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

export type ReplicateGroup = {
  rows: number[];
  targets: number[];
  /** Columns the engine did not use in which these rows differ (empty when they agree on every column). */
  differsIn: string[];
};

/**
 * Runs that share every input value. With `inputs` (the engine's own input list) replicates are judged on those
 * columns only, as the engine sees them: rows that agree on every used input but differ in an unused column are
 * still one group, and `differsIn` names the unused columns they differ in. Without `inputs` every numeric and
 * category column counts (minus `exclude`, the target and the row-number-like columns). Groups of two or more
 * rows are replicates of one recipe. Rows with a blank input are not grouped.
 */
export function replicateGroups(profile: SheetProfile, exclude: ReadonlySet<string>, target?: string, inputs?: readonly string[]): ReplicateGroup[] {
  const candidates = profile.columns.filter((c) => (c.kind === "numeric" || c.kind === "category") && !exclude.has(c.name) && c.name !== target && !isRowNumberLike(c, profile.n));
  const used = inputs ? candidates.filter((c) => inputs.includes(c.name)) : candidates;
  // Any filled column the engine did not use can tell the rows of a group apart, text columns included.
  const unused = inputs ? profile.columns.filter((c) => c.kind !== "empty" && !exclude.has(c.name) && c.name !== target && !inputs.includes(c.name) && !isRowNumberLike(c, profile.n)) : [];
  if (used.length === 0 || !target) return [];
  const tcol = profile.columns.find((c) => c.name === target);
  if (!tcol) return [];
  const groups = new Map<string, ReplicateGroup>();
  for (let r = 0; r < profile.n; r++) {
    if (used.some((c) => c.raw[r] === "")) continue;
    const key = JSON.stringify(used.map((c) => c.raw[r]));
    const g = groups.get(key) ?? { rows: [], targets: [], differsIn: [] };
    g.rows.push(r);
    const t = tcol.numbers[r];
    if (t != null) g.targets.push(t);
    groups.set(key, g);
  }
  const out = [...groups.values()].filter((g) => g.rows.length >= 2);
  for (const g of out) g.differsIn = unused.filter((c) => new Set(g.rows.map((r) => c.raw[r])).size > 1).map((c) => c.name);
  return out;
}

export type ReplicateSpread = { groups: number; runs: number; medianSd: number | null };

/** How many replicate groups there are, how many runs they hold, and the median within-group sd of the target. */
export function replicateSpread(groups: readonly ReplicateGroup[]): ReplicateSpread {
  const sds = groups.map((g) => summarize(g.targets)).filter((s): s is Summary => s != null && s.n >= 2).map((s) => s.sd);
  const sorted = [...sds].sort((a, b) => a - b);
  const medianSd = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  // Runs counts only the runs that have a target value: a replicate with a blank target is not evidence of spread.
  return { groups: groups.length, runs: groups.reduce((s, g) => s + g.targets.length, 0), medianSd };
}

/** The sheet's cells back as rows (header first) from a profile, so a subset of rows can be profiled again. */
export function rowsOf(profile: SheetProfile): string[][] {
  const header = profile.columns.map((c) => (c.headerless ? "" : c.name));
  const body = Array.from({ length: profile.n }, (_, r) => profile.columns.map((c) => c.raw[r] ?? ""));
  return [header, ...body];
}

/** The `data_type` column of a sheet (`data type`, `data-type` too, any case), or undefined. */
export function dataTypeColumn(profile: SheetProfile): ColumnProfile | undefined {
  return profile.columns.find((c) => /^data[\s_-]?type$/i.test(c.name));
}

/** A `data_type` value that marks a measured run (case-insensitive `real` or `measured`). */
export function isMeasuredDataType(value: string): boolean {
  return /^(real|measured)$/i.test(value.trim());
}

export type MeasuredSplit = {
  /** The profile of the measured rows only. */
  profile: SheetProfile;
  /** True for each original row that is kept. */
  kept: boolean[];
  /** Rows left out, by their `data_type` value as written, most common first. */
  leftOut: { value: string; n: number }[];
  column: string;
};

/**
 * When the sheet has a `data_type` column, the measured rows (`real` or `measured`) on their own, so no chart mixes
 * measured runs with simulated or synthetic ones. A blank value is not measured. Null when there is no such column
 * or nothing is left out.
 */
export function measuredOnly(profile: SheetProfile): MeasuredSplit | null {
  const col = dataTypeColumn(profile);
  if (!col) return null;
  const kept = col.raw.map((v) => isMeasuredDataType(v));
  if (kept.every(Boolean)) return null;
  const tally = new Map<string, number>();
  col.raw.forEach((v, r) => {
    if (!kept[r]) tally.set(v || "(blank)", (tally.get(v || "(blank)") ?? 0) + 1);
  });
  const [header, ...body] = rowsOf(profile);
  return {
    profile: profileSheet([header, ...body.filter((_, r) => kept[r])]),
    kept,
    leftOut: [...tally].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value)),
    column: col.name,
  };
}

/** The replicate groups whose rows sit next to each other in the sheet (a block), in sheet order. */
export function consecutiveBlocks(groups: readonly ReplicateGroup[]): ReplicateGroup[] {
  return groups
    .filter((g) => g.rows.every((r, i) => i === 0 || r === g.rows[i - 1] + 1))
    .sort((a, b) => a.rows[0] - b.rows[0]);
}
