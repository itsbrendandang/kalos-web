/*
 * H3 model mean and uncertainty, small multiples (VIZ_SPEC_V2 4.H3). Pure:
 * engine model grids -> stepped heat panels that share their class edges, so a
 * colour means the same predicted value (or the same σ) in every panel.
 *
 * Sources, all `basis: "predicted"` and never measured:
 *  - `response_surface.{z, std}`: the GP mean and posterior σ over the top two
 *    continuous drivers (21 x 21), other inputs held at `fixed_recipe`;
 *  - `slices[].{x, mean, sd, lo, hi, coverage}`: one input at a time through the same reference;
 *  - `slices_by_level[<clone column>][<label>]`: the same slices with the clone set to each level.
 * The engine returns one surface pair today; more pairs need `response_surfaces[]` (E3).
 * Grid values are drawn at the engine's grid points only: no interpolation.
 */
import type { DataTable } from "@/components/viz/frame";
import type { AnalyzeResult, ModelSlice } from "@/lib/api";
import { coverageText, formatValue } from "@/lib/num";
import { classOf, equalEdges, extentOf } from "@/lib/viz-data/heat";

export const MORE_PAIRS_NOTE = "More input pairs need engine field response_surfaces[] (one surface per driver pair); the engine returns one pair today.";

export type MultiplesAnalysis = Pick<AnalyzeResult, "response_surface" | "slices" | "slices_skipped" | "slices_by_level" | "slices_by_level_skipped" | "strain_summary" | "n" | "proposals" | "target" | "visualization_reasons">;

export type SurfacePanel = {
  xName: string;
  yName: string;
  xVals: number[];
  yVals: number[];
  /** mean[i][j] at (xVals[j], yVals[i]). */
  mean: number[][];
  sd: number[][] | null;
  sdKind: string | null;
  /** Measured runs projected onto this pair, per grid cell (nearest grid point on each axis). */
  runs: number[][];
  nRuns: number;
  fixed: Record<string, number | string> | null;
};

export type StripPanel = {
  feature: string;
  x: number[];
  mean: number[];
  sd: number[];
  lo: number[];
  hi: number[];
  coverage: number | null;
  range: [number, number] | null;
  reference: number | null;
};

export type StripRow = {
  key: string;
  /** "Best measured recipe" or the clone label. */
  label: string;
  clone: string | null;
  /** Fitted runs behind this row (analysis n, or the clone's n_fitted). */
  n: number | null;
  panels: (StripPanel | null)[];
  /** Why this row has no slices (the engine's message), or null. */
  skipped: string | null;
};

export type ModelMultiples = {
  surface: SurfacePanel | null;
  surfaceReason: string | null;
  features: string[];
  rows: StripRow[];
  meanEdges: number[];
  sdEdges: number[];
  coverage: number | null;
  cloneColumn: string | null;
  skippedInputs: { feature: string; reason: string }[];
};

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Index of the grid value nearest to v (the grid cell v falls in), or null outside the grid's span. */
export function nearestGrid(vals: readonly number[], v: number): number | null {
  if (!vals.length || !Number.isFinite(v)) return null;
  const lo = Math.min(vals[0], vals[vals.length - 1]);
  const hi = Math.max(vals[0], vals[vals.length - 1]);
  const half = vals.length > 1 ? Math.abs(vals[1] - vals[0]) / 2 : 0;
  if (v < lo - half || v > hi + half) return null;
  let best = 0;
  for (let i = 1; i < vals.length; i++) if (Math.abs(vals[i] - v) < Math.abs(vals[best] - v)) best = i;
  return best;
}

function toStrip(s: ModelSlice): StripPanel | null {
  if (!Array.isArray(s.x) || !s.x.length || !Array.isArray(s.mean) || s.mean.length !== s.x.length) return null;
  const ref = s.reference?.recipe?.[s.feature];
  return {
    feature: s.feature,
    x: s.x,
    mean: s.mean,
    sd: Array.isArray(s.sd) && s.sd.length === s.x.length ? s.sd : [],
    lo: Array.isArray(s.lo) ? s.lo : [],
    hi: Array.isArray(s.hi) ? s.hi : [],
    coverage: fin(s.coverage) ? s.coverage : null,
    range: Array.isArray(s.range) && fin(s.range[0]) && fin(s.range[1]) ? [s.range[0], s.range[1]] : null,
    reference: fin(ref) ? ref : null,
  };
}

export function toModelMultiples(d: MultiplesAnalysis): ModelMultiples | null {
  const rs = d.response_surface;
  let surface: SurfacePanel | null = null;
  if (rs && Array.isArray(rs.z) && rs.z.length && Array.isArray(rs.x_vals) && Array.isArray(rs.y_vals)) {
    const runs = rs.y_vals.map(() => rs.x_vals.map(() => 0));
    let nRuns = 0;
    for (const r of rs.runs ?? []) {
      const j = nearestGrid(rs.x_vals, r[0]);
      const i = nearestGrid(rs.y_vals, r[1]);
      if (i == null || j == null) continue;
      runs[i][j]++;
      nRuns++;
    }
    const sd = Array.isArray(rs.std) && rs.std.length === rs.z.length ? rs.std : null;
    surface = {
      xName: rs.x_feature,
      yName: rs.y_feature,
      xVals: rs.x_vals,
      yVals: rs.y_vals,
      mean: rs.z,
      sd,
      sdKind: (rs as { std_kind?: string }).std_kind ?? null,
      runs,
      nRuns,
      fixed: rs.fixed_recipe ?? null,
    };
  }
  const reasons = (d.visualization_reasons ?? {}) as Record<string, unknown>;
  const surfaceReason = surface ? null : typeof reasons.response_surface === "string" ? reasons.response_surface : null;

  const base = (d.slices ?? []).map(toStrip).filter((s): s is StripPanel => s != null);
  const summary = d.strain_summary && d.strain_summary.available ? d.strain_summary : null;
  const column = summary?.column ?? null;
  const byLevel = column ? (d.slices_by_level?.[column] ?? {}) : {};
  const skippedLevels = column ? (d.slices_by_level_skipped?.[column] ?? []) : [];
  const features = [...new Set([...base.map((s) => s.feature), ...Object.values(byLevel).flatMap((l) => l.map((s) => s.feature))])];
  const rows: StripRow[] = [];
  const panelsFor = (list: StripPanel[]) => features.map((f) => list.find((s) => s.feature === f) ?? null);
  if (base.length) {
    const ref = (d.slices ?? [])[0]?.reference;
    rows.push({ key: "reference", label: ref?.incumbent_basis === "recipe_mean" ? "Best reproducible recipe" : "Best measured recipe", clone: null, n: fin(d.n) ? d.n : null, panels: panelsFor(base), skipped: null });
  }
  if (summary && column && Object.keys(byLevel).length) {
    for (const l of summary.levels) {
      const list = (byLevel[l.label] ?? []).map(toStrip).filter((s): s is StripPanel => s != null);
      const skip = skippedLevels.find((s) => s.level === l.label);
      rows.push({
        key: `clone:${l.label}`,
        label: l.label,
        clone: l.label,
        n: fin(l.n_fitted) ? l.n_fitted : fin(l.n_runs) ? l.n_runs : null,
        panels: list.length ? panelsFor(list) : features.map(() => null),
        skipped: list.length ? null : (skip?.message ?? "the engine returned no slices for this clone"),
      });
    }
  }
  if (!surface && !rows.length) return null;
  const means = [...(surface?.mean.flat() ?? []), ...rows.flatMap((r) => r.panels.flatMap((p) => p?.mean ?? []))];
  const sds = [...(surface?.sd?.flat() ?? []), ...rows.flatMap((r) => r.panels.flatMap((p) => p?.sd ?? []))];
  const me = extentOf(means);
  const se = extentOf(sds);
  const covs = new Set(rows.flatMap((r) => r.panels.flatMap((p) => (p?.coverage != null ? [p.coverage] : []))));
  return {
    surface,
    surfaceReason,
    features,
    rows,
    meanEdges: me ? equalEdges(me[0], me[1]) : [],
    sdEdges: se ? equalEdges(se[0], se[1]) : [],
    coverage: covs.size === 1 ? [...covs][0] : null,
    cloneColumn: column,
    skippedInputs: d.slices_skipped ?? [],
  };
}

export const meanClass = (m: ModelMultiples, v: number | null | undefined) => classOf(v, m.meanEdges);
export const sdClass = (m: ModelMultiples, v: number | null | undefined) => classOf(v, m.sdEdges);

export function describeMultiples(m: ModelMultiples, target: string): string {
  const parts: string[] = [];
  if (m.surface) parts.push(`the model's predicted ${target} and its σ over ${m.surface.xName} and ${m.surface.yName}`);
  if (m.rows.length) parts.push(`one-input slices of the mean and σ for ${m.features.length} inputs${m.cloneColumn && m.rows.some((r) => r.clone) ? `, per clone of ${m.cloneColumn}` : ""}`);
  return `Model predictions, not measurements: ${parts.join("; ")}. Colours share one set of class edges across every panel.`;
}

export function multiplesTable(m: ModelMultiples): DataTable {
  const rows: (string | number)[][] = [];
  for (const r of m.rows)
    for (const p of r.panels) {
      if (!p) continue;
      p.x.forEach((x, i) => rows.push([r.label, p.feature, fmt(x), fmt(p.mean[i]), p.sd[i] != null ? fmt(p.sd[i]) : "n/a", p.lo[i] != null && p.hi[i] != null ? `[${fmt(p.lo[i])}, ${fmt(p.hi[i])}]` : "n/a"]));
    }
  const cov = coverageText(m.coverage);
  return {
    caption: `Model slices at the engine's grid points (predicted)${cov ? `; band: ${cov} model band, not held-out calibrated` : ""}`,
    columns: ["Row", "Input", "At", "Predicted mean", "σ (model)", "Band"],
    rows,
  };
}

const fmt = (v: number) => formatValue(v, { fallbackSigFigs: 4 }).value;
