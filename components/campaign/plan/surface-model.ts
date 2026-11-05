/*
 * Pure model for the Plan response surface (components/campaign/plan/response-surface.tsx).
 * It reads the engine's `response_surface` as the engine sends it and returns null for
 * anything it cannot draw honestly: a missing field, a grid whose shape does not match
 * its axes, a non-finite cell. The grid size is read from the arrays, never assumed.
 */

import type { PopulatedResult } from "@/lib/api";

export type SurfaceAxis = { name: string; vals: number[] };

export type SurfaceModel = {
  x: SurfaceAxis;
  y: SurfaceAxis;
  /** z[row][col]: row indexes y_vals, col indexes x_vals. Every cell is finite. */
  z: number[][];
  zMin: number;
  zMax: number;
  /** Measured runs as [x, y, target], only those with finite numbers. */
  runs: [number, number, number][];
  /** The other inputs' fixed values, when the engine reports them. */
  fixed: { name: string; value: string }[];
  /** "incumbent" when the engine says so; null otherwise. */
  sweptAt: string | null;
};

type Surface = NonNullable<PopulatedResult["response_surface"]>;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function strictlyMonotonic(vals: number[]): boolean {
  if (vals.length < 2) return false;
  const dir = Math.sign(vals[1] - vals[0]);
  if (dir === 0) return false;
  return vals.every((v, i) => i === 0 || Math.sign(v - vals[i - 1]) === dir);
}

/** The engine's surface as a drawable model, or null when it is absent or malformed. */
export function parseSurface(raw: unknown): SurfaceModel | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const rs = raw as Partial<Record<keyof Surface, unknown>>;
  if (typeof rs.x_feature !== "string" || typeof rs.y_feature !== "string") return null;
  if (rs.x_feature.length === 0 || rs.y_feature.length === 0 || rs.x_feature === rs.y_feature) return null;
  if (!Array.isArray(rs.x_vals) || !Array.isArray(rs.y_vals)) return null;
  if (!rs.x_vals.every(isNum) || !rs.y_vals.every(isNum)) return null;
  const xVals = rs.x_vals as number[];
  const yVals = rs.y_vals as number[];
  if (!strictlyMonotonic(xVals) || !strictlyMonotonic(yVals)) return null;

  if (!Array.isArray(rs.z) || rs.z.length !== yVals.length) return null;
  const z: number[][] = [];
  for (const row of rs.z) {
    if (!Array.isArray(row) || row.length !== xVals.length || !row.every(isNum)) return null;
    z.push(row as number[]);
  }
  const flat = z.flat();
  const zMin = Math.min(...flat);
  const zMax = Math.max(...flat);

  const runs: [number, number, number][] = [];
  if (Array.isArray(rs.runs)) {
    for (const r of rs.runs) {
      if (Array.isArray(r) && r.length >= 3 && isNum(r[0]) && isNum(r[1]) && isNum(r[2])) runs.push([r[0], r[1], r[2]]);
    }
  }

  const fixed: { name: string; value: string }[] = [];
  if (typeof rs.fixed_recipe === "object" && rs.fixed_recipe !== null && !Array.isArray(rs.fixed_recipe)) {
    for (const [name, value] of Object.entries(rs.fixed_recipe as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) fixed.push({ name, value: String(value) });
      else if (typeof value === "string" && value.length > 0) fixed.push({ name, value });
    }
  }

  return {
    x: { name: rs.x_feature, vals: xVals },
    y: { name: rs.y_feature, vals: yVals },
    z,
    zMin,
    zMax,
    runs,
    fixed,
    sweptAt: typeof rs.swept_at === "string" ? rs.swept_at : null,
  };
}

/**
 * Fractional grid index of `v` along `vals` (strictly monotonic): 0 at the first
 * value, n-1 at the last. Null when `v` lies outside the axis, so nothing is drawn
 * past the plotted range.
 */
export function fractionalIndex(vals: number[], v: number): number | null {
  if (!Number.isFinite(v)) return null;
  const ascending = vals[vals.length - 1] > vals[0];
  const lo = ascending ? vals[0] : vals[vals.length - 1];
  const hi = ascending ? vals[vals.length - 1] : vals[0];
  if (v < lo || v > hi) return null;
  for (let k = 0; k < vals.length - 1; k++) {
    const a = vals[k];
    const b = vals[k + 1];
    const [from, to] = a <= b ? [a, b] : [b, a];
    if (v >= from && v <= to) {
      const frac = (v - a) / (b - a);
      return k + frac;
    }
  }
  return null;
}

/**
 * Colour for a predicted value's position in [0, 1], as a CSS colour-mix of the
 * five sequential tokens (DESIGN.md "data-colour rule"). The tokens already run in
 * lightness order in each theme, so this stays monotonic in lightness.
 */
export function rampColor(t: number): string {
  const c = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
  const pos = c * 4;
  const a = Math.min(3, Math.floor(pos));
  const p = Math.round((pos - a) * 100);
  return `color-mix(in oklch, var(--chart-seq-${a + 1}) ${100 - p}%, var(--chart-seq-${a + 2}) ${p}%)`;
}

/** Position of a predicted value within the surface's range, in [0, 1]. A flat surface sits mid-ramp. */
export function valueT(model: Pick<SurfaceModel, "zMin" | "zMax">, v: number): number {
  return model.zMax > model.zMin ? (v - model.zMin) / (model.zMax - model.zMin) : 0.5;
}

/** Row and column of the highest predicted cell (ties: the first in reading order). */
export function peakCell(z: number[][]): { row: number; col: number } {
  let best = { row: 0, col: 0 };
  z.forEach((r, i) => r.forEach((v, j) => {
    if (v > z[best.row][best.col]) best = { row: i, col: j };
  }));
  return best;
}

export type PlotPoint = { id: string; x: number; y: number };

/** Points the surface can place: finite coordinates inside both axes. Others are counted, not drawn. */
export function placeable<T extends PlotPoint>(model: SurfaceModel, points: T[]): { inside: T[]; outside: T[] } {
  const inside: T[] = [];
  const outside: T[] = [];
  for (const p of points) {
    const ok = fractionalIndex(model.x.vals, p.x) != null && fractionalIndex(model.y.vals, p.y) != null;
    (ok ? inside : outside).push(p);
  }
  return { inside, outside };
}

/**
 * The text equivalent of the surface: what it covers, where it peaks, what it does
 * not show. Every number is the engine's (grid values) or a count of what is plotted.
 */
export function surfaceSummary(model: SurfaceModel, target: string, fmt: (n: number) => string, counts: { runs: number; proposals: number; outside: number }): string {
  const { x, y } = model;
  const peak = peakCell(model.z);
  const others = model.fixed.length
    ? `Other inputs are held at the best recipe so far (${model.fixed.map((f) => `${f.name} ${f.value}`).join(", ")}).`
    : model.sweptAt === "incumbent"
      ? "Other inputs are held at the best recipe so far."
      : "Other inputs are held at fixed values that are not recorded.";
  const plotted = `${counts.runs} measured ${counts.runs === 1 ? "run" : "runs"} and ${counts.proposals} proposed ${counts.proposals === 1 ? "experiment" : "experiments"} are plotted${counts.outside ? `; ${counts.outside} proposed ${counts.outside === 1 ? "experiment lies" : "experiments lie"} outside the plotted range and ${counts.outside === 1 ? "is" : "are"} not drawn` : ""}.`;
  return [
    `Predicted mean ${target} across ${x.name} from ${fmt(x.vals[0])} to ${fmt(x.vals[x.vals.length - 1])} and ${y.name} from ${fmt(y.vals[0])} to ${fmt(y.vals[y.vals.length - 1])}.`,
    `Predicted values run from ${fmt(model.zMin)} to ${fmt(model.zMax)}; the highest is at ${x.name} ${fmt(x.vals[peak.col])}, ${y.name} ${fmt(y.vals[peak.row])}.`,
    others,
    "Predicted mean only: uncertainty is not shown.",
    plotted,
  ].join(" ");
}
