/*
 * C10 ValidationDumbbells adapter (VIZ_SPEC 5, C10): every started run, what
 * the model predicted (with the conformal band of the analysis that proposed
 * it, when that is the current analysis) and what the lab measured. Pure and
 * DOM-free, so the mapping, the hit rate and the description are unit tested
 * (__tests__/viz-validation-dumbbells.test.ts).
 *
 * Exact arithmetic only: the residual is measured - predicted, the hit rate is
 * a count, the mean absolute residual is a plain mean of those differences.
 * The band is the CURRENT analysis' band: the engine does not store the band
 * in force when a run was started (engine request R5), so a run proposed by
 * another analysis shows "band n/a" with the reason, never a borrowed band.
 */
import { BAND_MISSING, bandOutcome, runBand, type BandAnalysis, type RunBand } from "@/components/campaign/learn";
import type { CampaignRun, Diagnostics } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { columnDecimals, conformalInterval, coverageText, formatDelta, formatValue, type IntervalSpec } from "@/lib/num";
import { shortId } from "@/lib/workbench";

/** What the adapter reads from the analysis: the band fields plus the replicate noise (measured precision). */
export type DumbbellAnalysis = BandAnalysis & { noise?: Pick<Diagnostics["noise"], "replicate_aware" | "noise_sd"> | null };

export type DumbbellRun = {
  id: string;
  /** The round as people count it (engine round + 1), or null when the engine did not say. */
  round: number | null;
  mode: string;
  pred: number;
  interval: IntervalSpec | null;
  /** Why there is no band for this run (null when it has one). */
  bandWhy: NonNullable<RunBand["why"]> | null;
  result: number | null;
  awaiting: boolean;
  /** measured - predicted, null while awaiting. */
  residual: number | null;
  /** Inside the band (edge inclusive), null when awaiting or without a band. */
  inside: boolean | null;
  run: CampaignRun;
};

export type DumbbellGroup = { round: number | null; runs: DumbbellRun[] };

export type HitRate = { inside: number; total: number; unscored: number };

export type DumbbellData = {
  runs: DumbbellRun[];
  /** Grouped by round, newest round first; runs keep the engine's order inside a round. */
  groups: DumbbellGroup[];
  /** True when the current analysis has a conformal band at all (else no interval and no inside/outside column). */
  bandAvailable: boolean;
  /** Engine-reported coverage of the band (0.9), or null. */
  coverage: number | null;
  /** Measured runs scored against a band, and those left out (no band applies). Null when there is no band at all. */
  hit: HitRate | null;
  measured: number;
  awaiting: number;
  /** Mean of |measured - predicted| over every measured run, or null with none. */
  meanAbsResidual: number | null;
  /** Shared decimals per column, so the Data table and the chart columns align. */
  decimals: { pred: number; measured: number; residual: number };
  /** Measured precision: the replicate noise SD when the fit was replicate-aware, else null (3 sf). */
  measuredU: number | null;
  bandNote: string;
};

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The note every view of the band carries: which analysis it is from and why (engine request R5). */
export const BAND_NOTE = "Bands are from the current analysis: the engine does not record the band a run was started with.";

/** Measured precision from the engine's replicate noise, only when the fit was replicate-aware. */
export function measuredUncertainty(analysis: DumbbellAnalysis | null | undefined): number | null {
  const n = analysis?.noise;
  return n?.replicate_aware && finite(n.noise_sd) && n.noise_sd > 0 ? n.noise_sd : null;
}

export function toDumbbellData(pending: readonly CampaignRun[], analysis: DumbbellAnalysis | null | undefined): DumbbellData {
  const bandAvailable = analysis != null && finite(analysis.conformal_q) && analysis.conformal_q > 0;
  const coverage = bandAvailable && finite(analysis?.conformal_coverage) ? analysis!.conformal_coverage! : null;
  const runs: DumbbellRun[] = pending
    .filter((r) => finite(r.pred))
    .map((r) => {
      const band = runBand(r, analysis);
      const result = !r.awaiting && finite(r.result) ? r.result : null;
      const outcome = bandOutcome(r, band);
      return {
        id: r.id,
        round: r.round != null && Number.isFinite(r.round) ? displayRound(r.round) : null,
        mode: r.mode,
        pred: r.pred,
        interval: band.halfWidth != null ? conformalInterval(r.pred, band.halfWidth, band.coverage) : null,
        bandWhy: band.why ?? null,
        result,
        awaiting: result == null,
        residual: result != null ? result - r.pred : null,
        inside: outcome == null ? null : outcome === "inside",
        run: r,
      };
    });

  const byRound = new Map<number | null, DumbbellRun[]>();
  for (const r of runs) byRound.set(r.round, [...(byRound.get(r.round) ?? []), r]);
  const groups = [...byRound.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
    .map(([round, rs]) => ({ round, runs: rs }));

  const done = runs.filter((r) => r.result != null);
  const scored = done.filter((r) => r.inside != null);
  const hit = bandAvailable ? { inside: scored.filter((r) => r.inside).length, total: scored.length, unscored: done.length - scored.length } : null;
  const residuals = done.map((r) => Math.abs(r.residual as number));
  const measuredU = measuredUncertainty(analysis);
  const q = bandAvailable ? (analysis!.conformal_q as number) : null;
  const predDecimals = columnDecimals(runs.map((r) => ({ value: r.pred, u: r.interval ? q : null })));
  const measuredDecimals = columnDecimals(done.map((r) => ({ value: r.result as number, u: measuredU })));

  return {
    runs,
    groups,
    bandAvailable,
    coverage,
    hit,
    measured: done.length,
    awaiting: runs.length - done.length,
    meanAbsResidual: residuals.length ? residuals.reduce((a, b) => a + b, 0) / residuals.length : null,
    // A difference is no more precise than the coarser of its two operands.
    decimals: { pred: predDecimals, measured: measuredDecimals, residual: done.length ? Math.min(predDecimals, measuredDecimals) : predDecimals },
    measuredU,
    bandNote: BAND_NOTE,
  };
}

/** The value domain: every prediction, every interval end and every measured result, so nothing is clipped. */
export function dumbbellDomain(runs: readonly DumbbellRun[]): [number, number] | null {
  const vals = runs.flatMap((r) => [r.pred, ...(r.interval ? [r.interval.lo, r.interval.hi] : []), ...(r.result != null ? [r.result] : [])]).filter(Number.isFinite);
  if (!vals.length) return null;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  return [lo, hi];
}

/** Split round groups into pages of at most `max` runs (a round is never split unless it alone exceeds `max`). */
export function paginateGroups(groups: readonly DumbbellGroup[], max: number): DumbbellGroup[][] {
  const pages: DumbbellGroup[][] = [];
  let page: DumbbellGroup[] = [];
  let n = 0;
  for (const g of groups) {
    if (n > 0 && n + g.runs.length > max) {
      pages.push(page);
      page = [];
      n = 0;
    }
    page.push(g);
    n += g.runs.length;
  }
  if (page.length) pages.push(page);
  return pages;
}

const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** "1 of 2 inside the 90% band (50%)". The percentage only when the engine sent a coverage; never without the count. */
export function hitRateText(hit: HitRate, coverage: number | null): string {
  const cov = coverageText(coverage);
  const band = cov ? `the ${cov} band` : "the band";
  if (hit.total === 0) return `No measured run has a band to check against yet.`;
  const pct = formatValue(hit.inside / hit.total, { quantity: "pct" }).text;
  return `${count(hit.inside)} of ${count(hit.total)} inside ${band} (${pct})`;
}

export type DumbbellFormat = { unit: string | null };

export const fmtPred = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  formatValue(r.pred, { basis: "predicted", unit, decimals: d.decimals.pred });
export const fmtMeasured = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  formatValue(r.result, { basis: "measured", unit, decimals: d.decimals.measured });
export const fmtResidual = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  formatDelta(r.result, r.pred, { basis: "measured", unit, relative: false, decimals: d.decimals.residual });
export const fmtInterval = (d: DumbbellData, r: DumbbellRun) =>
  r.interval ? formatValue(r.pred, { interval: r.interval, decimals: d.decimals.pred }).interval : null;

/** The inside/outside word for a run: inside, outside, band n/a, or awaiting. */
export function bandCheck(r: DumbbellRun): "inside" | "outside" | "band n/a" | "awaiting" {
  if (r.awaiting) return "awaiting";
  if (r.inside == null) return "band n/a";
  return r.inside ? "inside" : "outside";
}

/** Why a run has no band, in plain words (from the shared provenance rule). */
export const bandMissingReason = (r: DumbbellRun): string | null => (r.bandWhy ? BAND_MISSING[r.bandWhy] : null);

/** The plotted values as a table (the Data disclosure, print and copy path). */
export function dumbbellTable(d: DumbbellData, { unit }: DumbbellFormat): { columns: string[]; rows: string[][] } {
  const u = unit ? ` (${unit})` : "";
  const cov = coverageText(d.coverage);
  const columns = ["Run", "Round", "Mode", `Measured${u}`, `Predicted${u}`, ...(d.bandAvailable ? [`${cov ? `${cov} ` : ""}band`] : []), "Measured − predicted", ...(d.bandAvailable ? ["Band check"] : [])];
  const rows = d.groups.flatMap((g) =>
    g.runs.map((r) => [
      shortId(r.id),
      r.round != null ? count(r.round) : "n/a",
      r.mode,
      r.awaiting ? "Awaiting result" : fmtMeasured(d, r, null).text,
      fmtPred(d, r, null).text,
      ...(d.bandAvailable ? [fmtInterval(d, r) ?? "n/a"] : []),
      r.awaiting ? "Awaiting result" : fmtResidual(d, r, null).text,
      ...(d.bandAvailable ? [bandCheck(r)] : []),
    ]),
  );
  return { columns, rows };
}

/** Plain-language description (the chart's aria-label and screen-reader summary). */
export function describeDumbbells(d: DumbbellData, { target, unit, maxRuns = 8 }: { target: string; unit: string | null; maxRuns?: number }): string {
  if (d.runs.length === 0) return `No runs started yet for ${target}.`;
  const rounds = d.groups.map((g) => g.round).filter((r): r is number => r != null);
  const where = rounds.length === 1 ? ` in round ${count(rounds[0])}` : rounds.length > 1 ? ` across ${plural(rounds.length, "round")}` : "";
  const parts = [`Predicted against measured ${target} for ${plural(d.runs.length, "started run")}${where}: ${count(d.measured)} measured, ${count(d.awaiting)} awaiting a result.`];
  if (d.hit && d.hit.total > 0) parts.push(`${hitRateText(d.hit, d.coverage)}.`);
  else if (!d.bandAvailable) parts.push("The analysis reported no prediction band.");
  const listed = d.groups.flatMap((g) => g.runs).slice(0, maxRuns);
  for (const r of listed) {
    const p = formatValue(r.pred, { basis: "predicted", unit, interval: r.interval, decimals: d.decimals.pred });
    const pred = `predicted ${p.value}${p.interval ? ` ${p.interval}` : ""}`;
    const meas = r.awaiting ? "awaiting a result" : `measured ${fmtMeasured(d, r, null).value} (${fmtResidual(d, r, null).value}, ${bandCheck(r)})`;
    parts.push(`Run ${shortId(r.id)}: ${pred}, ${meas}.`);
  }
  if (d.runs.length > listed.length) parts.push(`${plural(d.runs.length - listed.length, "more run")} in the Data table.`);
  if (unit) parts.push(`Values in ${unit}.`);
  return parts.join(" ");
}
