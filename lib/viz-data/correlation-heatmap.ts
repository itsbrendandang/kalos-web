/*
 * Correlation heatmap adapter (VIZ_SPEC 5 "Retained, restyled"). Pure: engine
 * `correlation` block -> chart props, its Data table and its description.
 *
 * The engine computes Spearman's rho pairwise over the runs in the fit
 * (kalos/portal/viz_utils.py `_correlation_spearman`) and sends `null` for a
 * pair with fewer than 3 usable rows or an undefined rho. Those cells stay
 * n/a here: nothing is filled in, nothing is re-computed in the browser.
 */
import type { DataTable } from "@/components/viz/frame";
import { formatCorr, formatValue } from "@/lib/num";

export type CorrelationProps = {
  /** Display labels, features first then the target (the engine's `target_mean` renamed to the target). */
  labels: string[];
  /** Symmetric rho grid; null where the engine sent no value. */
  matrix: (number | null)[][];
  /** Index of the target row/column, or null when the engine sent no target row. */
  targetIndex: number | null;
  /** Runs in the fit the correlations were computed over (`analysis.n`), or null when not reported. */
  n: number | null;
};

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The engine's correlation block as chart props, or null when the engine sent none (or an empty one). */
export function toCorrelationProps(
  correlation: { labels: readonly string[]; matrix: readonly (readonly unknown[])[] } | null | undefined,
  target: string,
  n?: number | null,
): CorrelationProps | null {
  if (!correlation || !Array.isArray(correlation.labels) || correlation.labels.length === 0) return null;
  const raw = correlation.labels;
  const k = raw.length;
  const matrix = raw.map((_, i) => raw.map((__, j) => finite(correlation.matrix?.[i]?.[j])));
  const t = raw.indexOf("target_mean");
  return {
    labels: raw.map((l) => (l === "target_mean" ? target : l)),
    matrix,
    targetIndex: t >= 0 && t < k ? t : null,
    n: finite(n),
  };
}

/** One rho as printed in a cell and the table: 2 dp, U+2212 minus, "n/a" when the engine sent nothing. */
export const corrText = (rho: number | null): string => (rho == null ? "n/a" : formatCorr(rho).value);

/** Fill strength for a cell, 0..0.6: proportional to |rho|, capped so the printed number stays legible on it. */
export const cellOpacity = (rho: number | null): number => (rho == null ? 0 : Math.min(1, Math.abs(rho)) * 0.6);

/** The off-diagonal pairs with the target, strongest |rho| first (an ordering of engine values, not a statistic). */
export function targetPairs(p: CorrelationProps): { label: string; rho: number }[] {
  if (p.targetIndex == null) return [];
  const t = p.targetIndex;
  return p.labels
    .map((label, i) => ({ label, rho: p.matrix[t][i] }))
    .filter((x, i): x is { label: string; rho: number } => i !== t && x.rho != null)
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

/** Plain-language description (also the SVG aria-label). */
export function describeCorrelation(p: CorrelationProps): string {
  const inputs = p.targetIndex == null ? p.labels.length : p.labels.length - 1;
  const what =
    p.targetIndex == null
      ? `Spearman rank correlation among ${formatValue(inputs, { quantity: "count" }).text} inputs`
      : `Spearman rank correlation among ${formatValue(inputs, { quantity: "count" }).text} inputs and ${p.labels[p.targetIndex]}`;
  const over = p.n != null ? `, over ${formatValue(p.n, { quantity: "count" }).text} runs` : "";
  const pairs = targetPairs(p).slice(0, 3);
  const strongest = pairs.length ? ` Strongest with the target: ${pairs.map((x) => `${x.label} ${corrText(x.rho)}`).join(", ")}.` : "";
  const missing = p.matrix.reduce((s, row, i) => s + row.filter((v, j) => j > i && v == null).length, 0);
  const na = missing ? ` ${formatValue(missing, { quantity: "count" }).text} ${missing === 1 ? "pair has" : "pairs have"} no value from the engine (n/a).` : "";
  return `${what}${over}.${strongest}${na}`;
}

/** The Data disclosure: the full grid, every cell as printed. */
export function correlationTable(p: CorrelationProps): DataTable {
  return {
    caption: "Spearman rho for each pair, as the engine computed it",
    columns: ["", ...p.labels],
    rows: p.labels.map((l, i) => [l, ...p.matrix[i].map(corrText)]),
  };
}
