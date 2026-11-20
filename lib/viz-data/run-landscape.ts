/*
 * Run landscape adapter (VIZ_SPEC 5 "Retained, restyled"). Pure: the engine's
 * `embedding` block (a PCA of the standardized inputs, one point per run in
 * the fit: [PC1, PC2, measured target]) -> chart props, Data table and
 * description. The coordinates are the engine's; the only arithmetic here is
 * min/max and an equal-width 5-step binning of the measured target for the
 * sequential ramp, which the legend states.
 */
import type { DataTable } from "@/components/viz/frame";
import { columnDecimals, formatValue } from "@/lib/num";

export type LandscapePoint = { index: number; pc1: number; pc2: number; target: number };

export type LandscapeProps = {
  method: string;
  /** The engine's encoding note, e.g. "standardized_continuous_one_hot_categorical", when sent. */
  encoding: string | null;
  /** Encoded dimensions the projection was computed from, when sent. */
  nFeatures: number | null;
  points: LandscapePoint[];
  /** Points the engine sent with a non-finite coordinate or target: counted, never plotted. */
  skipped: number;
  targetName: string;
  unit: string | null;
  /** Observed min and max of the measured target among the plotted runs. */
  min: number | null;
  max: number | null;
};

type EmbeddingLike = { method?: unknown; encoding?: unknown; n_features?: unknown; points?: unknown };

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The engine's embedding as chart props, or null when the engine sent none (or no points). */
export function toLandscapeProps(embedding: EmbeddingLike | null | undefined, targetName: string, unit: string | null): LandscapeProps | null {
  if (!embedding || !Array.isArray(embedding.points) || embedding.points.length === 0) return null;
  const points: LandscapePoint[] = [];
  let skipped = 0;
  embedding.points.forEach((p: unknown, index: number) => {
    const [x, y, t] = Array.isArray(p) ? p.map(finite) : [null, null, null];
    if (x == null || y == null || t == null) skipped += 1;
    else points.push({ index, pc1: x, pc2: y, target: t });
  });
  const ts = points.map((p) => p.target);
  return {
    method: typeof embedding.method === "string" && embedding.method ? embedding.method : "projection",
    encoding: typeof embedding.encoding === "string" ? embedding.encoding : null,
    nFeatures: finite(embedding.n_features),
    points,
    skipped,
    targetName,
    unit,
    min: ts.length ? Math.min(...ts) : null,
    max: ts.length ? Math.max(...ts) : null,
  };
}

/** Ramp step 1..5 for a target value: five equal-width bins over the observed [min, max]; step 3 when every run is equal. */
export function seqStep(v: number, min: number, max: number): 1 | 2 | 3 | 4 | 5 {
  if (!(max > min)) return 3;
  return Math.min(5, 1 + Math.floor(((v - min) / (max - min)) * 5)) as 1 | 2 | 3 | 4 | 5;
}

/** The lower edge of each of the five bins, for the legend. */
export function stepEdges(min: number, max: number): number[] {
  return [0, 1, 2, 3, 4, 5].map((k) => min + ((max - min) * k) / 5);
}

/**
 * Domains with the same units per pixel on both axes, so distances on screen
 * match distances in the projection ("nearby points have similar recipes").
 */
export function equalAspectDomains(points: { pc1: number; pc2: number }[], innerW: number, innerH: number): { x: [number, number]; y: [number, number] } {
  if (points.length === 0 || innerW <= 0 || innerH <= 0) return { x: [-1, 1], y: [-1, 1] };
  const xs = points.map((p) => p.pc1);
  const ys = points.map((p) => p.pc2);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 1.08;
  const spanX = Math.max(x1 - x0, 1e-9) * pad;
  const spanY = Math.max(y1 - y0, 1e-9) * pad;
  const unitsPerPx = Math.max(spanX / innerW, spanY / innerH);
  const halfW = (unitsPerPx * innerW) / 2;
  const halfH = (unitsPerPx * innerH) / 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return { x: [cx - halfW, cx + halfW], y: [cy - halfH, cy + halfH] };
}

/** Width-to-height ratio of the projection's extent (1 when degenerate), for sizing an equal-aspect plot. */
export function dataAspect(p: Pick<LandscapeProps, "points">): number {
  if (p.points.length < 2) return 1;
  const xs = p.points.map((x) => x.pc1);
  const ys = p.points.map((x) => x.pc2);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w > 0 && h > 0 ? w / h : 1;
}

/** Decimals an engine number actually carries (0.404 -> 3, 2 -> 0); the embedding's targets are rounded by the engine. */
export function decimalsPresent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const s = String(Number(v.toPrecision(12)));
  if (s.includes("e")) return 6;
  return (s.split(".")[1] ?? "").length;
}

/**
 * Decimals the target column shares, so it aligns: the finest 3-significant-figure precision any run needs
 * (no uncertainty is known for a raw run), but never more digits than the engine sent (it rounds embedding
 * targets, so a padded "0.40400" would claim precision nobody measured).
 */
export function targetDecimals(p: LandscapeProps): number {
  const col = columnDecimals(p.points.map((x) => ({ value: x.target, u: null })));
  const sent = Math.max(0, ...p.points.map((x) => decimalsPresent(x.target)));
  return Math.min(col, sent);
}

/** A measured target value at the column's shared precision. */
export const targetText = (v: number, decimals: number): string => formatValue(v, { decimals }).value;

/** A PCA coordinate: unitless, 2 decimals. */
export const coordText = (v: number): string => formatValue(v, { quantity: "score" }).value;

/** Plain-language description (also the SVG aria-label). */
export function describeLandscape(p: LandscapeProps): string {
  const n = formatValue(p.points.length, { quantity: "count" }).text;
  const unit = p.unit ? ` ${p.unit}` : "";
  const d = targetDecimals(p);
  const range = p.min != null && p.max != null ? ` Measured ${p.targetName} runs from ${targetText(p.min, d)} to ${targetText(p.max, d)}${unit}.` : "";
  const skipped = p.skipped ? ` ${formatValue(p.skipped, { quantity: "count" }).text} ${p.skipped === 1 ? "point was" : "points were"} not plotted (no finite value from the engine).` : "";
  return `${n} measured ${p.points.length === 1 ? "run" : "runs"} placed by recipe similarity (${p.method.toUpperCase()}, unitless), shaded by ${p.targetName}.${range}${skipped}`;
}

/** The Data disclosure: every plotted run, in the engine's order. */
export function landscapeTable(p: LandscapeProps): DataTable {
  const d = targetDecimals(p);
  return {
    caption: "Each run's position in the projection and its measured target",
    columns: ["Run (fit order)", "PC1", "PC2", `${p.targetName}${p.unit ? ` (${p.unit})` : ""}, measured`],
    rows: p.points.map((x) => [formatValue(x.index + 1, { quantity: "count" }).text, coordText(x.pc1), coordText(x.pc2), targetText(x.target, d)]),
  };
}
