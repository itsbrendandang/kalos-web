// Pure reading of the engine's model fields for "The model". Every value here is an engine field, passed
// through or re-read (the predicted mean and its posterior sd on the surface grid, the ARD relevance share,
// the shape label, the calibration counts). Nothing is estimated in the browser.
import { parseSurface, fractionalIndex } from "@/components/campaign/plan/surface-model";
import type { AnalyzeResult, Calibration } from "@/lib/api";

export type ShapeRow = {
  name: string;
  /** Normalised ARD relevance, 0 to 1, summing to 1 across the features. Length encodes it. */
  share: number;
  shape: string;
  sentence: string;
  optimumAt: number | null;
  /** The engine's flag: a rank correlation would have missed this shape. */
  missedBySpearman: boolean;
  rho: number;
};

const SHAPE_SENTENCE: Record<string, (target: string, at: number | null) => string> = {
  flat: () => "Little effect across the range tested.",
  monotonic_up: (t) => `Higher values went with higher ${t} across the range tested.`,
  monotonic_down: (t) => `Higher values went with lower ${t} across the range tested.`,
  interior_optimum: (t, at) => (at != null ? `Peaks inside the range, near ${Number(at.toPrecision(3))}; too much or too little is lower.` : `Peaks inside the range for ${t}.`),
  interior_minimum: (t, at) => (at != null ? `Lowest inside the range, near ${Number(at.toPrecision(3))}.` : `Lowest inside the range for ${t}.`),
};

/**
 * One row per input the model's shape reading covered, most relevant first. Empty when the engine
 * did not produce a shape reading (`gp_shapes.available` false), with nothing invented in its place.
 */
export function driverRows(gp: AnalyzeResult["gp_shapes"] | undefined, target: string): ShapeRow[] {
  if (!gp || !gp.available || !Array.isArray(gp.features)) return [];
  return gp.features
    .filter((f) => typeof f.relevance === "number" && Number.isFinite(f.relevance))
    .map((f) => {
      const word = SHAPE_SENTENCE[f.shape];
      return {
        name: f.name,
        share: f.relevance,
        shape: f.shape,
        sentence: word ? word(target, f.optimum_at ?? null) : "Shape not classified by the engine.",
        optimumAt: f.optimum_at ?? null,
        missedBySpearman: f.missed_by_spearman === true,
        rho: f.spearman_rho,
      };
    })
    .sort((a, b) => b.share - a.share);
}

export type Slice = {
  xName: string;
  yName: string;
  /** The held value of the second input, and the grid row it falls on. */
  yHeld: number | null;
  yGrid: number;
  xs: number[];
  mean: number[];
  /** Mean minus and plus one posterior sd. Null when the engine did not send the sd grid. */
  lo: number[] | null;
  hi: number[] | null;
  /** The widest half-width of the band on this slice (one posterior sd at its largest). Null without a band. */
  bandHalf: number | null;
  /** Measured runs whose second input is within half a grid step of the held value: [x, target]. */
  runsNear: [number, number][];
  yRange: [number, number];
};

const isFiniteGrid = (g: unknown, rows: number, cols: number): g is number[][] =>
  Array.isArray(g) && g.length === rows && g.every((r) => Array.isArray(r) && r.length === cols && r.every((v) => typeof v === "number" && Number.isFinite(v)));

/**
 * The response surface cut along its first input, with the second held at the incumbent value the engine
 * swept at. The mean is the engine's posterior mean; the band is mean ± one posterior sd when the sd grid is present.
 * Null when the surface is absent or malformed.
 */
export function surfaceSlice(raw: unknown): Slice | null {
  const model = parseSurface(raw);
  if (!model) return null;
  const rs = raw as { std?: unknown; fixed_recipe?: Record<string, unknown> };
  const { x, y, z, runs } = model;
  const held = rs.fixed_recipe?.[y.name];
  const heldNum = typeof held === "number" && Number.isFinite(held) ? held : null;
  // The row of the grid nearest the held value; the middle row when the engine did not say what it held.
  const rowFloat = heldNum != null ? fractionalIndex(y.vals, heldNum) : null;
  const yGrid = rowFloat != null ? Math.round(rowFloat) : Math.floor((y.vals.length - 1) / 2);
  const yHeld = heldNum != null ? heldNum : null;
  const step = y.vals.length > 1 ? Math.abs(y.vals[y.vals.length - 1] - y.vals[0]) / (y.vals.length - 1) : 0;
  const mean = z[yGrid];
  const std = isFiniteGrid(rs.std, y.vals.length, x.vals.length) ? rs.std[yGrid] : null;
  const runsNear: [number, number][] = runs
    .filter(([, ry]) => yHeld != null && Math.abs(ry - yHeld) <= step / 2)
    .map(([rx, , t]) => [rx, t]);
  const bandLo = std ? mean.map((m, i) => m - std[i]) : null;
  const bandHi = std ? mean.map((m, i) => m + std[i]) : null;
  const all = [...mean, ...(bandLo ?? []), ...(bandHi ?? []), ...runsNear.map((r) => r[1])];
  return {
    xName: x.name,
    yName: y.name,
    yHeld,
    yGrid,
    xs: x.vals,
    mean,
    lo: bandLo,
    hi: bandHi,
    runsNear,
    bandHalf: std ? Math.max(...std) : null,
    yRange: [Math.min(...all), Math.max(...all)],
  };
}

/** One sentence on how the engine's own uncertainty bands did on held-out runs, or the engine's reason when it could not check. */
export function calibrationLine(cal: Calibration | null | undefined): string {
  if (!cal) return "The engine did not report whether its uncertainty bands held on held-out runs.";
  if (!cal.available || cal.levels.length === 0) return cal.reason ?? "The engine could not check its uncertainty bands on held-out runs.";
  const level = cal.levels.reduce((best, l) => (Math.abs(l.nominal - 0.9) < Math.abs(best.nominal - 0.9) ? l : best), cal.levels[0]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const width = cal.z_std == null ? "" : cal.z_std > 1.15 ? " The bands look too narrow for the held-out errors." : cal.z_std < 0.85 ? " The bands look wider than the held-out errors need." : " The bands look about the right width.";
  return `Of held-out runs, ${pct(level.empirical)} fell inside the model's ${pct(level.nominal)} band, against the ${pct(level.nominal)} it aims for.${width}`;
}
