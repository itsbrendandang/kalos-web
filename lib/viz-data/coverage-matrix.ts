/*
 * H2 design-space coverage (VIZ_SPEC_V2 4.H2). Pure: the engine's row export
 * plus the analysis' search box -> runs per bin for each pair of inputs.
 *
 * Bins are 8 equal-width bins over the engine's `feature_ranges` (the search
 * box), edges printed. Counting rows into bins is exact arithmetic (a count),
 * the only computation here; there is no smoothing, interpolation or density.
 * Inputs are the top continuous inputs in the engine's driver order, then the
 * engine's feature order; covariates (recorded, never proposed) are left out.
 * A cell the engine's rows put no run in reads 0 (the empty style), never blank.
 */
import type { DataTable } from "@/components/viz/frame";
import type { AnalyzeResult, Proposal, RowsExport } from "@/lib/api";
import { formatSetting, formatValue } from "@/lib/num";

export const COVERAGE_BINS = 8;
/** Below this many placed runs the matrix says "insufficient" (VIZ_SPEC_V2 H2). */
export const MIN_COVERAGE_ROWS = 10;
export const DEFAULT_COVERAGE_INPUTS = 4;
export const MAX_COVERAGE_INPUTS = 8;

export type CoverageAnalysis = Pick<AnalyzeResult, "features" | "feature_ranges" | "drivers" | "proposals" | "proposal_features" | "categorical_features" | "provenance">;

export type CoverageRow = { id: string | null; origin: "upload" | "round" | "unattributed"; round: number | null; values: Record<string, unknown> };

export type CoverageInput = { name: string; range: [number, number]; edges: number[] };

export type PairCounts = { x: number; y: number; counts: number[][]; ids: string[][][] };

export type CoverageMatrix = {
  inputs: CoverageInput[];
  /** All candidate inputs (for "show all"), in the same order. */
  available: string[];
  /** counts[i][b]: runs of input i in bin b (the diagonal). */
  diagonal: number[][];
  pairs: PairCounts[];
  nRows: number;
  /** Rows with every shown input numeric and inside the box. */
  nPlaced: number;
  /** Per input: values outside the search box (the engine narrowed it) and values that are not numbers. */
  outside: Record<string, number>;
  notNumeric: Record<string, number>;
  proposals: { key: string; values: Record<string, number> }[];
  maxCount: number;
  filter: "all" | "rounds";
};

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A cell value as a number: a finite number, or a string that is exactly a finite decimal number. */
export function numericValue(v: unknown): number | null {
  if (fin(v)) return v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Bin index 0..bins-1 of v over [lo, hi] (hi closed), or null outside. */
export function binOf(v: number, lo: number, hi: number, bins = COVERAGE_BINS): number | null {
  if (!(hi > lo) || v < lo || v > hi) return null;
  return Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins));
}

export function binEdges(lo: number, hi: number, bins = COVERAGE_BINS): number[] {
  return Array.from({ length: bins + 1 }, (_, i) => (i === bins ? hi : lo + ((hi - lo) * i) / bins));
}

/** Every row the export returned, tagged with where it came from. */
export function exportRows(x: RowsExport, idColumn: string | null): CoverageRow[] {
  const id = (r: Record<string, unknown>) => (idColumn && r[idColumn] != null && r[idColumn] !== "" ? String(r[idColumn]) : null);
  return [
    ...(x.original_rows?.rows ?? []).map((r): CoverageRow => ({ id: id(r), origin: "upload", round: null, values: r })),
    ...(x.folded_rows?.rows ?? []).map((r): CoverageRow => ({ id: id(r.values), origin: "round", round: fin(r.folded_in_round) ? r.folded_in_round : null, values: r.values })),
    ...(x.unattributed_rows?.rows ?? []).map((r): CoverageRow => ({ id: id(r), origin: "unattributed", round: null, values: r })),
  ];
}

/** The candidate inputs: continuous (have a search box), not covariates, driver order first then feature order. */
export function coverageInputs(a: CoverageAnalysis): string[] {
  const ranges = a.feature_ranges ?? {};
  const cov = new Set((a.drivers ?? []).filter((d) => (d as { role?: string }).role === "covariate").map((d) => d.name));
  for (const p of (a.provenance ?? []) as { name: string; role?: string }[]) if (p.role === "covariate") cov.add(p.name);
  const ok = (n: string) => Array.isArray(ranges[n]) && fin(ranges[n][0]) && fin(ranges[n][1]) && ranges[n][1] > ranges[n][0] && !cov.has(n);
  const out: string[] = [];
  for (const d of a.drivers ?? []) if (ok(d.name) && !out.includes(d.name)) out.push(d.name);
  for (const f of a.features ?? []) if (ok(f) && !out.includes(f)) out.push(f);
  return out;
}

/** The id column the engine left out as an ID (first one), for listing a cell's runs. */
export function idColumnOf(a: CoverageAnalysis): string | null {
  const p = (a.provenance ?? []).find((x) => x.status === "dropped_id" && /run|id|sample|exp/i.test(x.name)) ?? (a.provenance ?? []).find((x) => x.status === "dropped_id");
  return p?.name ?? null;
}

export function toCoverageMatrix(a: CoverageAnalysis, rows: CoverageRow[], opts: { inputs?: number; filter?: "all" | "rounds" } = {}): CoverageMatrix {
  const available = coverageInputs(a);
  const k = Math.max(0, Math.min(opts.inputs ?? DEFAULT_COVERAGE_INPUTS, MAX_COVERAGE_INPUTS, available.length));
  const ranges = a.feature_ranges ?? {};
  const inputs: CoverageInput[] = available.slice(0, k).map((name) => {
    const r = ranges[name] as [number, number];
    return { name, range: [r[0], r[1]], edges: binEdges(r[0], r[1]) };
  });
  const filter = opts.filter ?? "all";
  const use = filter === "rounds" ? rows.filter((r) => r.origin === "round") : rows;
  const outside: Record<string, number> = {};
  const notNumeric: Record<string, number> = {};
  const bins = use.map((r) =>
    inputs.map((inp) => {
      const v = numericValue(r.values[inp.name]);
      if (v == null) {
        notNumeric[inp.name] = (notNumeric[inp.name] ?? 0) + 1;
        return null;
      }
      const b = binOf(v, inp.range[0], inp.range[1]);
      if (b == null) outside[inp.name] = (outside[inp.name] ?? 0) + 1;
      return b;
    }),
  );
  const zeros = () => Array.from({ length: COVERAGE_BINS }, () => Array.from({ length: COVERAGE_BINS }, () => 0));
  const diagonal = inputs.map((_, i) => {
    const c = Array.from({ length: COVERAGE_BINS }, () => 0);
    for (const b of bins) if (b[i] != null) c[b[i] as number]++;
    return c;
  });
  const pairs: PairCounts[] = [];
  for (let y = 1; y < inputs.length; y++)
    for (let x = 0; x < y; x++) {
      const counts = zeros();
      const ids: string[][][] = Array.from({ length: COVERAGE_BINS }, () => Array.from({ length: COVERAGE_BINS }, () => [] as string[]));
      bins.forEach((b, ri) => {
        const bx = b[x];
        const by = b[y];
        if (bx == null || by == null) return;
        counts[by][bx]++;
        const id = use[ri].id;
        if (id) ids[by][bx].push(id);
      });
      pairs.push({ x, y, counts, ids });
    }
  const nPlaced = bins.filter((b) => b.every((v) => v != null)).length;
  const maxCount = Math.max(0, ...pairs.flatMap((p) => p.counts.flat()));
  const proposals = (a.proposals ?? []).map((p: Proposal, i) => ({
    key: `P${i + 1}`,
    values: Object.fromEntries(inputs.flatMap((inp) => (fin(p.recipe?.[inp.name]) ? [[inp.name, p.recipe![inp.name]]] : []))) as Record<string, number>,
  }));
  return { inputs, available, diagonal, pairs, nRows: use.length, nPlaced, outside, notNumeric, proposals, maxCount, filter };
}

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/** A bin's range as printed: "34.2–35.6", at the precision the input's range supports. */
export function binText(inp: CoverageInput, b: number): string {
  return `${formatSetting(inp.edges[b], inp.range).text}–${formatSetting(inp.edges[b + 1], inp.range).text}`;
}

export function describeCoverage(m: CoverageMatrix): string {
  const pairs = m.pairs.length;
  const empty = m.pairs.reduce((s, p) => s + p.counts.flat().filter((c) => c === 0).length, 0);
  const cells = pairs * COVERAGE_BINS * COVERAGE_BINS;
  return (
    `Runs per bin for ${count(pairs)} pair${pairs === 1 ? "" : "s"} of ${count(m.inputs.length)} inputs (${m.inputs.map((i) => i.name).join(", ")}), ` +
    `${COVERAGE_BINS} equal bins over each input's search box, ${count(m.nPlaced)} of ${count(m.nRows)} runs placed.` +
    (cells ? ` ${count(empty)} of ${count(cells)} cells have no run.` : "")
  );
}

export function coverageTable(m: CoverageMatrix): DataTable {
  const rows: (string | number)[][] = [];
  for (const p of m.pairs) {
    const X = m.inputs[p.x];
    const Y = m.inputs[p.y];
    for (let by = 0; by < COVERAGE_BINS; by++) for (let bx = 0; bx < COVERAGE_BINS; bx++) rows.push([`${X.name} × ${Y.name}`, binText(X, bx), binText(Y, by), p.counts[by][bx]]);
  }
  return { caption: "Runs per bin, every pair and bin (n)", columns: ["Pair (x × y)", "x bin", "y bin", "Runs (n)"], rows };
}
