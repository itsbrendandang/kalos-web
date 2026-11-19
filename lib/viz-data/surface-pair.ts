/*
 * C5 SurfacePair adapter (VIZ_SPEC section 5): the engine's `response_surface`
 * (already validated by parseSurface) -> chart props, the contour bands, the
 * description and the Data table. Pure, no React.
 *
 * Honesty rules held here:
 * - The mean is a MODEL prediction across two inputs with every other input
 *   held at the engine's `fixed_recipe`; it never stands in for a proposal's
 *   own prediction (proposals' other inputs differ).
 * - The uncertainty map is the engine's `std` grid or nothing. It is never
 *   synthesized (no client-side sigma, no interpolation of a missing grid).
 * - Band thresholds are round numbers from d3 `ticks` on the engine grid's own
 *   min and max (exact arithmetic on engine values), at most five bands.
 */
import { ticks } from "d3-array";
import { contours } from "d3-contour";
import { formatSetting, formatValue, parseUnit } from "@/lib/num";
import { fractionalIndex, peakCell, placeable, type PlotPoint, type SurfaceModel } from "@/components/campaign/plan/surface-model";

export type SurfaceAxisData = { name: string; unit: string | null; values: number[] };

export type SurfacePairData = {
  x: SurfaceAxisData;
  y: SurfaceAxisData;
  /** mean[row][col]: row indexes y.values, col indexes x.values. */
  mean: number[][];
  sd: number[][] | null;
  /** Measured runs [x, y, target] inside both axes (projected onto the two axes). */
  runs: [number, number, number][];
  proposals: { key: string; x: number; y: number }[];
  /** Proposal ids the plot cannot place (outside the swept range). Counted, not drawn. */
  outside: string[];
  fixed: { sweptAt: string | null; basis: string | null; recipe: { name: string; value: number | string }[] };
  /** The held recipe's own setting on both axes, when inside the plotted range. */
  incumbent: { x: number; y: number } | null;
};

export const NO_SD_NOTE = "Uncertainty map not returned by this engine build.";
export const FLAT_NOTE = "Model predicts no meaningful variation across these two inputs.";
export const RUNS_CAVEAT = "projected: other inputs differ";

const inside = (vals: number[], v: number) => fractionalIndex(vals, v) != null;

/** Parsed engine surface + the page's numbered proposals (P1..Pn, as the batch rows number them) -> chart data. */
export function toSurfacePair(model: SurfaceModel, proposals: PlotPoint[] = []): SurfacePairData {
  const { inside: inP, outside: outP } = placeable(model, proposals);
  const runs = model.runs.filter(([x, y]) => inside(model.x.vals, x) && inside(model.y.vals, y));
  const hx = model.heldAt.x;
  const hy = model.heldAt.y;
  const incumbent = hx != null && hy != null && inside(model.x.vals, hx) && inside(model.y.vals, hy) ? { x: hx, y: hy } : null;
  return {
    x: { name: model.x.name, unit: parseUnit(model.x.name).unit, values: model.x.vals },
    y: { name: model.y.name, unit: parseUnit(model.y.name).unit, values: model.y.vals },
    mean: model.z,
    sd: model.std,
    runs,
    proposals: inP.map((p) => ({ key: p.id, x: p.x, y: p.y })),
    outside: outP.map((p) => p.id),
    fixed: { sweptAt: model.sweptAt, basis: model.incumbentBasis, recipe: model.fixed },
    incumbent,
  };
}

export function gridExtent(grid: number[][]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of grid) for (const v of r) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** The smallest step the grid's values are displayed at (3 significant figures of its largest magnitude). */
export function displayStep(lo: number, hi: number): number {
  const m = Math.max(Math.abs(lo), Math.abs(hi));
  if (m === 0) return 0;
  const f = formatValue(m);
  if (f.decimals > 0) return 10 ** -f.decimals;
  return 10 ** Math.max(0, Math.floor(Math.log10(m)) - 2);
}

/** True when the grid's spread is below one display precision step: a single band, with the flat caption. */
export function isFlat(lo: number, hi: number): boolean {
  return !(hi - lo >= displayStep(lo, hi)) || hi === lo;
}

/**
 * Interior band boundaries: round d3 ticks strictly inside (min, max), at most
 * four of them (five bands, one per ramp step). Empty for a flat grid.
 */
export function bandThresholds(lo: number, hi: number, maxBands = 5): number[] {
  if (isFlat(lo, hi)) return [];
  for (let count = maxBands; count >= 1; count--) {
    const t = ticks(lo, hi, count).filter((v) => v > lo && v < hi);
    if (t.length + 1 <= maxBands) return t;
  }
  return [];
}

/** Ramp step (1..5) for band k of n, spread so the lowest and highest bands use the ramp ends. */
export function bandStep(k: number, n: number): number {
  if (n <= 1) return 3;
  return 1 + Math.round((k * 4) / (n - 1));
}

/** Legend labels for the bands: "< 0.4", "0.4 – 0.8", "≥ 1.2", formatted with shared decimals. */
export function bandLabels(thresholds: number[], fmt: (v: number) => string, lo: number, hi: number): string[] {
  if (!thresholds.length) return [`${fmt(lo)} – ${fmt(hi)}`];
  return [
    `< ${fmt(thresholds[0])}`,
    ...thresholds.slice(1).map((t, i) => `${fmt(thresholds[i])} – ${fmt(t)}`),
    `≥ ${fmt(thresholds[thresholds.length - 1])}`,
  ];
}

export type Ring = [number, number][];
/** One band's region (value >= threshold) as polygons of rings, in grid coordinates ([0, nx] x [0, ny]). */
export type BandGeometry = { threshold: number; polygons: Ring[][] };

/** d3-contour on the engine grid at each interior threshold. Grid point (col, row) sits at (col + 0.5, row + 0.5). */
export function contourBands(grid: number[][], thresholds: number[]): BandGeometry[] {
  const ny = grid.length;
  const nx = grid[0]?.length ?? 0;
  if (!nx || !ny || !thresholds.length) return [];
  const values = grid.flat();
  const gen = contours().size([nx, ny]).thresholds(thresholds);
  return gen(values).map((g) => ({ threshold: g.value, polygons: g.coordinates as unknown as Ring[][] }));
}

/** A grid coordinate (d3-contour space) -> the axis value, linear between engine grid points, extrapolated half a cell at the edges. */
export function gridToValue(vals: number[], c: number): number {
  const idx = c - 0.5;
  const n = vals.length;
  if (n === 1) return vals[0];
  const k = Math.max(0, Math.min(n - 2, Math.floor(idx)));
  return vals[k] + (idx - k) * (vals[k + 1] - vals[k]);
}

/** Nearest engine grid index to an axis value. */
export function nearestIndex(vals: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < vals.length; i++) if (Math.abs(vals[i] - v) < Math.abs(vals[best] - v)) best = i;
  return best;
}

const axisRange = (vals: number[]): [number, number] => [Math.min(...vals), Math.max(...vals)];

/** An axis setting at the precision its swept range supports. */
export function fmtAxis(axis: SurfaceAxisData, v: number): string {
  return formatSetting(v, axisRange(axis.values)).value;
}

/** A predicted mean, precision from the engine's sigma at that cell when it sent one, else 3 significant figures. */
export function fmtMean(v: number, sd: number | null, unit: string | null): string {
  return formatValue(v, { basis: "predicted", unit, uncertainty: sd }).text;
}

export function fmtSd(v: number, unit: string | null): string {
  return formatValue(v, { unit, fallbackSigFigs: 2 }).text;
}

const BASIS_WORD: Record<string, string> = { single: "best single run", recipe_mean: "best recipe mean" };

/** What the other inputs are held at, from `swept_at` / `fixed_recipe` / `incumbent_basis`. */
export function heldText(data: Pick<SurfacePairData, "fixed">): string {
  const { sweptAt, basis, recipe } = data.fixed;
  const where = sweptAt === "incumbent" ? `the incumbent recipe${basis ? ` (${BASIS_WORD[basis] ?? basis})` : ""}` : sweptAt ? `the ${sweptAt} recipe` : "fixed values";
  if (!recipe.length) return sweptAt ? `Other inputs held at ${where}.` : "Other inputs held at fixed values the engine did not report.";
  const list = recipe.map((r) => `${r.name} ${typeof r.value === "number" ? formatSetting(r.value).value : r.value}`).join(", ");
  return `Other inputs held at ${where}: ${list}.`;
}

/** Pure aria description of the pair. */
export function describeSurfacePair(data: SurfacePairData, target: string, unit: string | null = null): string {
  const { x, y } = data;
  const [lo, hi] = gridExtent(data.mean);
  const peak = peakCell(data.mean);
  const span = (a: SurfaceAxisData) => `${a.name} ${fmtAxis(a, a.values[0])} to ${fmtAxis(a, a.values[a.values.length - 1])}`;
  const parts = [
    `Model-predicted ${target} across ${span(x)} and ${span(y)}.`,
    heldText(data),
    isFlat(lo, hi)
      ? FLAT_NOTE
      : `Predicted mean runs from ${fmtMean(lo, null, unit)} to ${fmtMean(hi, null, unit)}; the highest is at ${x.name} ${fmtAxis(x, x.values[peak.col])}, ${y.name} ${fmtAxis(y, y.values[peak.row])}.`,
  ];
  if (data.sd) {
    const [slo, shi] = gridExtent(data.sd);
    parts.push(`Model uncertainty (σ) runs from ${fmtSd(slo, unit)} to ${fmtSd(shi, unit)}.`);
  } else parts.push(NO_SD_NOTE);
  const n = data.runs.length;
  const p = data.proposals.length;
  parts.push(
    `${n} measured ${n === 1 ? "run" : "runs"} ${RUNS_CAVEAT}; ${p} proposed ${p === 1 ? "experiment" : "experiments"} plotted${data.proposals.length ? ` (${data.proposals.map((q) => q.key).join(", ")})` : ""}${data.outside.length ? `; ${data.outside.join(", ")} outside the plotted range, not drawn` : ""}.`,
  );
  if (data.incumbent) parts.push(`The incumbent recipe is at ${x.name} ${fmtAxis(x, data.incumbent.x)}, ${y.name} ${fmtAxis(y, data.incumbent.y)}.`);
  return parts.join(" ");
}

/** The Data disclosure: the engine grid in long form (x, y, predicted mean, sigma when sent). */
export function surfaceTable(data: SurfacePairData, unit: string | null = null): { columns: string[]; rows: string[][] } {
  const u = unit ? ` (${unit})` : "";
  const columns = [data.x.name, data.y.name, `Predicted mean${u}`, ...(data.sd ? [`Model σ${u}`] : [])];
  const rows: string[][] = [];
  data.mean.forEach((row, r) =>
    row.forEach((v, c) => {
      const sd = data.sd?.[r]?.[c] ?? null;
      rows.push([fmtAxis(data.x, data.x.values[c]), fmtAxis(data.y, data.y.values[r]), fmtMean(v, sd, null), ...(data.sd ? [sd != null ? fmtSd(sd, null) : "n/a"] : [])]);
    }),
  );
  return { columns, rows };
}
