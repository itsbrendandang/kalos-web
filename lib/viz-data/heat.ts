/*
 * Shared heatmap grammar (VIZ_SPEC_V2 2.7). Pure: no React, no DOM.
 *
 * Colour encodes one quantity in 5 stepped classes with printed class edges;
 * there are no continuous gradients. Edges are equal-width over a range the
 * caller names (an engine range, or the min and max of the values drawn: an
 * extent, never a statistic). A count of 0 is its own "empty" style, never
 * class 1, and a value the engine did not compute is "missing" (hatch plus the
 * engine's reason), never 0.
 */

export const CLASSES = 5;

export type Ramp = "ord" | "seq" | "unc";

/** The CSS variable for step `k` (1..5) of a ramp. */
export const rampVar = (ramp: Ramp, k: number): string => `var(--chart-${ramp}-${Math.min(CLASSES, Math.max(1, k))})`;

/**
 * Cell text on an ordered-ramp step: --fg on steps 1-3, --surface on steps 4-5
 * (each pair clears 4.5:1 in both themes, __tests__/contrast.test.ts).
 */
export const ordInk = (k: number): string => (k >= 4 ? "var(--surface)" : "var(--fg)");

/** Five equal-width classes over [lo, hi]: the 6 edges. A zero-width range gives one class (every edge equal). */
export function equalEdges(lo: number, hi: number, k = CLASSES): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return Array.from({ length: k + 1 }, (_, i) => (i === k ? b : a + ((b - a) * i) / k));
}

/** The 1-based class of `v` against `edges` (last class is closed on the right). Null outside or without edges. */
export function classOf(v: number | null | undefined, edges: readonly number[]): number | null {
  if (v == null || !Number.isFinite(v) || edges.length < 2) return null;
  const k = edges.length - 1;
  if (v < edges[0] || v > edges[k]) return null;
  if (edges[k] === edges[0]) return 1;
  for (let i = 1; i <= k; i++) if (v < edges[i] || i === k) return i;
  return k;
}

/** Min and max of the finite values (an extent), or null when there are none. */
export function extentOf(values: Iterable<number | null | undefined>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * Count classes (runs per cell): 0 is the empty style; counts 1..max split into
 * at most 5 integer classes with printed edges, e.g. [1], [2], [3-4], [5-7], [8-12].
 * Integer edges, so a class never claims a fractional run.
 */
export function countClasses(max: number): { lo: number; hi: number }[] {
  if (!Number.isFinite(max) || max < 1) return [];
  const m = Math.floor(max);
  if (m <= CLASSES) return Array.from({ length: m }, (_, i) => ({ lo: i + 1, hi: i + 1 }));
  const out: { lo: number; hi: number }[] = [];
  let lo = 1;
  for (let i = 1; i <= CLASSES; i++) {
    const hi = i === CLASSES ? m : Math.max(lo, Math.round(1 + ((m - 1) * i) / CLASSES));
    out.push({ lo, hi });
    lo = hi + 1;
    if (lo > m) break;
  }
  return out;
}

/** The 1-based class of a positive count; 0 for a count of 0 (the empty style). */
export function countClassOf(n: number, classes: readonly { lo: number; hi: number }[]): number {
  if (n <= 0) return 0;
  const i = classes.findIndex((c) => n >= c.lo && n <= c.hi);
  // Spread a short class list over the 5-step ramp so 2 classes are not both pale.
  const k = i < 0 ? classes.length : i + 1;
  return classes.length >= CLASSES ? k : Math.max(1, Math.round((k * CLASSES) / Math.max(1, classes.length)));
}

/** Text for a count class: "3" or "3–5" (en dash). */
export const countClassText = (c: { lo: number; hi: number }): string => (c.lo === c.hi ? String(c.lo) : `${c.lo}–${c.hi}`);

/** Share classes for a count out of N rows (data quality): fixed, printed edges. */
export const SHARE_EDGES = [0, 0.01, 0.05, 0.2, 0.5, 1] as const;

/** Class 1..5 of a share in (0, 1]; 0 for none. */
export function shareClassOf(share: number): number {
  if (!(share > 0)) return 0;
  for (let i = 1; i < SHARE_EDGES.length; i++) if (share <= SHARE_EDGES[i]) return i;
  return CLASSES;
}

/**
 * Roving-focus movement inside a rows x cols grid (one tab stop per heatmap,
 * arrow keys move, Home/End jump within a row). Cells that do not exist (a
 * ragged row) are skipped by clamping to the row length.
 */
export function moveCell(
  at: { row: number; col: number },
  key: string,
  rowLengths: readonly number[],
): { row: number; col: number } | null {
  const rows = rowLengths.length;
  if (!rows) return null;
  const clampCol = (r: number, c: number) => Math.max(0, Math.min(c, Math.max(0, rowLengths[r] - 1)));
  switch (key) {
    case "ArrowRight":
      return { row: at.row, col: clampCol(at.row, at.col + 1) };
    case "ArrowLeft":
      return { row: at.row, col: clampCol(at.row, at.col - 1) };
    case "ArrowDown": {
      const r = Math.min(rows - 1, at.row + 1);
      return { row: r, col: clampCol(r, at.col) };
    }
    case "ArrowUp": {
      const r = Math.max(0, at.row - 1);
      return { row: r, col: clampCol(r, at.col) };
    }
    case "Home":
      return { row: at.row, col: 0 };
    case "End":
      return { row: at.row, col: clampCol(at.row, Infinity) };
    default:
      return null;
  }
}
