// Pure reading of the engine's model fields for "The model". Every value here is an engine field, passed
// through or re-read (the predicted mean and its posterior sd on the surface grid, the ARD relevance share,
// the shape label, the calibration counts). Nothing is estimated in the browser. The surface sentences are
// plain (`calibrationVerdict`); the technical reading (`calibrationLine`) is rendered inside a disclosure.
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
        sentence: word ? word(target, f.optimum_at ?? null) : "Kalos did not name a shape for this input.",
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

/** The likely-range check in plain words, keyed by the why-line code it carries (lib/why.ts). */
export type CalibrationVerdict = { state: "bands_ok" | "bands_narrow" | "bands_wide" | "bands_unchecked"; sentence: string };

/** Whether the likely range is about the right width, too narrow, wider than it needs to be, or unchecked; from the engine's z_std. */
export function calibrationVerdict(cal: Calibration | null | undefined): CalibrationVerdict {
  if (!cal || !cal.available || cal.levels.length === 0 || cal.z_std == null) {
    return { state: "bands_unchecked", sentence: "The likely range has not been checked on measured runs yet." };
  }
  if (cal.z_std > 1.15) return { state: "bands_narrow", sentence: "The likely range is too narrow: fewer results land inside it than it promises." };
  if (cal.z_std < 0.85) return { state: "bands_wide", sentence: "The likely range is wider than it needs to be." };
  return { state: "bands_ok", sentence: "The likely range is about the right width." };
}

export { calibrationLine } from "@/components/campaign/data/model-detail";
