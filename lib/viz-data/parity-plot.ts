/*
 * C6 ParityPlot adapter (VIZ_SPEC 5, C6). Pure: the engine's out-of-fold
 * pairs and its conformal band -> points, the y = x +/- q band, the hit count,
 * the Data table and the description.
 *
 * Pair order: the engine writes `"oof": [[actual, pred], ...]`
 * (kalos/portal/analysis.py, `zip(oof_a, oof_p)`), i.e. [measured, predicted].
 * Verified on the live payload too: the first column holds the sheet's exact
 * zeros and its maximum equals `best`, the second holds negative model
 * outputs. `__tests__/viz-parity-plot.test.ts` pins this.
 *
 * Arithmetic here is exact: the residual (pred - measured), |residual| <= q
 * for the hit count, min/max for the domain and the spread ratio. Nothing is
 * fitted, smoothed or re-derived.
 */
import type { DataTable } from "@/components/viz/frame";
import { reliabilityVerdict, type AnalyzeResult } from "@/lib/api";
import { columnDecimals, coverageText, formatCorr, formatValue, precisionFromUncertainty } from "@/lib/num";
import { DENSE_PARITY_POINTS, FLAT_PREDICTION_RATIO, MIN_PARITY_POINTS } from "@/lib/viz-thresholds";

export type ParityInput = Pick<AnalyzeResult, "oof" | "conformal_q" | "conformal_coverage" | "cv_spearman" | "cv_ci95" | "reliability">;

export type ParityPoint = { index: number; measured: number; predicted: number; residual: number; inside: boolean | null };

export type ParityState = { kind: "ready" } | { kind: "not-scored"; reason: string } | { kind: "insufficient"; text: string } | { kind: "empty"; text: string };

export type ParityData = {
  state: ParityState;
  points: ParityPoint[];
  band: { halfWidth: number; coverage: number | null } | null;
  rho: { value: number | null; ci: [number, number] | null };
  /** Exact count of pairs with |pred - measured| <= q. Null without a band. */
  inside: { count: number; total: number } | null;
  /** Prediction range over measured range, when below FLAT_PREDICTION_RATIO. */
  flat: { ratio: number } | null;
  dense: boolean;
  /** Identical x and y domain: union of both, padded 5%. */
  domain: [number, number];
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function toParity(d: ParityInput): ParityData {
  const v = reliabilityVerdict(d);
  const q = isNum(d.conformal_q) && d.conformal_q > 0 ? d.conformal_q : null;
  const band = q != null ? { halfWidth: q, coverage: isNum(d.conformal_coverage) ? d.conformal_coverage : null } : null;
  const points: ParityPoint[] = [];
  (Array.isArray(d.oof) ? d.oof : []).forEach((pair, index) => {
    const [measured, predicted] = Array.isArray(pair) ? pair : [];
    if (!isNum(measured) || !isNum(predicted)) return;
    const residual = predicted - measured;
    points.push({ index, measured, predicted, residual, inside: q != null ? Math.abs(residual) <= q : null });
  });
  const rho = { value: v.rho, ci: v.ci };
  let state: ParityState = { kind: "ready" };
  if (points.length === 0 && v.rho == null) state = { kind: "not-scored", reason: v.reason };
  else if (points.length === 0) state = { kind: "empty", text: "The engine sent no held-out predictions with this analysis." };
  else if (points.length < MIN_PARITY_POINTS)
    state = { kind: "insufficient", text: `Needs at least ${MIN_PARITY_POINTS} held-out predictions; the engine produced ${points.length}.` };

  const ms = points.map((p) => p.measured);
  const ps = points.map((p) => p.predicted);
  const all = [...ms, ...ps];
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 1;
  const span = hi - lo;
  const pad = span > 0 ? span * 0.05 : Math.abs(hi) * 0.05 || 1;
  lo -= pad;
  hi += pad;
  const measSpread = ms.length ? Math.max(...ms) - Math.min(...ms) : 0;
  const predSpread = ps.length ? Math.max(...ps) - Math.min(...ps) : 0;
  const ratio = measSpread > 0 ? predSpread / measSpread : null;
  return {
    state,
    points,
    band,
    rho,
    inside: band && points.length ? { count: points.filter((p) => p.inside).length, total: points.length } : null,
    flat: ratio != null && ratio < FLAT_PREDICTION_RATIO ? { ratio } : null,
    dense: points.length > DENSE_PARITY_POINTS,
    domain: [lo, hi],
  };
}

/** "152 of 165 held-out runs inside the band (92%, target 90%)": exact count, the target from the engine. */
export function insideText(p: ParityData): string | null {
  if (!p.inside || !p.band) return null;
  const c = (v: number) => formatValue(v, { quantity: "count" }).text;
  const pct = formatValue(p.inside.count / p.inside.total, { quantity: "pct" }).text;
  const target = coverageText(p.band.coverage);
  return `${c(p.inside.count)} of ${c(p.inside.total)} held-out runs inside the band (${pct}${target ? `, target ${target}` : ""})`;
}

/** The band in words: "90% held-out band (y = x ± 0.23)", or that none was reported. */
export function bandText(p: ParityData, unit: string | null = null): string {
  if (!p.band) return "No held-out band reported";
  const cov = coverageText(p.band.coverage);
  return `${cov ? `${cov} ` : ""}held-out band (y = x ± ${formatValue(p.band.halfWidth, { unit }).text})`;
}

export function describeParity(p: ParityData, target: string, unit: string | null = null): string {
  if (p.state.kind !== "ready") return `Held-out predicted versus measured ${target}: ${p.state.kind === "not-scored" ? p.state.reason : p.state.text}`;
  const parts = [`Held-out predicted versus measured ${target} for ${formatValue(p.points.length, { quantity: "count" }).text} runs the model did not see when it predicted them.`];
  parts.push(p.rho.value != null ? `Rank agreement ${formatCorr(p.rho.value, p.rho.ci).text}.` : "Rank agreement not reported.");
  parts.push(`${bandText(p, unit)}.`);
  const inside = insideText(p);
  if (inside) parts.push(`${inside}.`);
  if (p.flat) parts.push(flatNote(p));
  return parts.join(" ");
}

export function flatNote(p: ParityData): string {
  if (!p.flat) return "";
  return `Predictions cluster near the mean: they span ${formatValue(p.flat.ratio, { quantity: "pct" }).text} of the measured range, so the model is not separating runs yet.`;
}

/** Every pair as a row: measured first (it outranks the prediction), then predicted, the error and the band check. */
export function parityTable(p: ParityData, unit: string | null = null): DataTable {
  const measDecimals = Math.min(4, columnDecimals(p.points.map((x) => ({ value: x.measured, u: null }))));
  const predDecimals = p.band ? Math.max(0, -precisionFromUncertainty(p.band.halfWidth)) : Math.min(4, columnDecimals(p.points.map((x) => ({ value: x.predicted, u: null }))));
  const u = unit ? ` (${unit})` : "";
  const cov = p.band ? coverageText(p.band.coverage) : null;
  return {
    columns: ["Held-out run", `Measured${u}`, `Predicted${u}`, `Error${u}`, p.band ? `Inside ${cov ? `${cov} ` : ""}band` : "Band"],
    rows: p.points.map((x) => [
      `oof[${x.index}]`,
      formatValue(x.measured, { decimals: measDecimals }).value,
      formatValue(x.predicted, { decimals: predDecimals }).value,
      formatValue(x.residual, { decimals: predDecimals, sign: true }).value,
      x.inside == null ? "n/a" : x.inside ? "inside" : "outside",
    ]),
  };
}
