/*
 * C10 ValidationDumbbells adapter (VIZ_SPEC 5, C10): every started run, what
 * the engine predicted (with the band it RECORDED when the run started) and
 * what the lab measured. Pure and DOM-free, so the mapping, the hit rate and
 * the description are unit tested (__tests__/viz-validation-dumbbells.test.ts).
 *
 * Bands (engine R5, `prediction_at_start`):
 *  - runs started since the engine records predictions carry their own band
 *    (`prediction_at_start.interval`: lo, hi, coverage, method), labelled
 *    "band recorded when the run started";
 *  - a run whose recipe was not one of the engine's proposals (`pred_source`
 *    "caller" or `available: false`) has NO engine prediction: no band and no
 *    predicted mark, only the measured dot and the engine's reason;
 *  - legacy runs (`prediction_at_start` null) fall back to the current
 *    analysis' band, labelled as such, and only when that analysis proposed them.
 * The residual and inside/outside are the engine's (`residual`, `inside_band`)
 * when it sent them; only legacy runs are computed (exact arithmetic). The hit
 * rate counts only runs with a recorded band, and says so.
 */
import { BAND_SOURCE_LABEL, bandMissingText, bandOutcome, enginePrediction, runBand, runResidual, type BandAnalysis, type BandSource, type BandWhy } from "@/components/campaign/learn";
import type { CampaignRun, Diagnostics } from "@/lib/api";
import { displayRound } from "@/lib/campaign-stage";
import { columnDecimals, coverageText, formatDelta, formatValue, type IntervalSpec } from "@/lib/num";
import { shortId } from "@/lib/workbench";

/** What the adapter reads from the analysis: the band fields plus the replicate noise (measured precision). */
export type DumbbellAnalysis = BandAnalysis & { noise?: Pick<Diagnostics["noise"], "replicate_aware" | "noise_sd"> | null };

export type DumbbellRun = {
  id: string;
  /** The round as people count it (engine round + 1), or null when the engine did not say. */
  round: number | null;
  mode: string;
  /** The engine's prediction, or null when the engine recorded none (caller-predicted run). */
  pred: number | null;
  /** The number stored with a caller-predicted run: the user's prediction, never drawn as the engine's. */
  callerPred: number | null;
  interval: IntervalSpec | null;
  /** Where the band comes from (null without one). */
  bandSource: BandSource | null;
  /** Why there is no band for this run (null when it has one). */
  bandWhy: BandWhy | null;
  /** The reason in words, with the engine's own sentence when it sent one (null when there is a band). */
  bandReason: string | null;
  result: number | null;
  awaiting: boolean;
  /** measured - predicted (the engine's `residual` when sent), null while awaiting or without an engine prediction. */
  residual: number | null;
  /** Inside the band (edge inclusive; the engine's `inside_band` for a recorded band), null when awaiting or without a band. */
  inside: boolean | null;
  run: CampaignRun;
};

export type DumbbellGroup = { round: number | null; runs: DumbbellRun[] };

/** Measured runs scored against a band recorded at start (`total`), and measured runs left out (`unscored`). */
export type HitRate = { inside: number; total: number; unscored: number };

export type DumbbellData = {
  runs: DumbbellRun[];
  /** Grouped by round, newest round first; runs keep the engine's order inside a round. */
  groups: DumbbellGroup[];
  /** True when at least one run has a band (else no interval and no inside/outside column). */
  bandAvailable: boolean;
  /** The engine-reported coverage shared by every band shown (0.9), or null when none or mixed. */
  coverage: number | null;
  /** Hit rate over runs with a band recorded at start. Null when no run has any band. */
  hit: HitRate | null;
  measured: number;
  awaiting: number;
  /** Runs shown with the current analysis' band (legacy runs, no band recorded). */
  legacy: number;
  /** Runs without an engine prediction (the recipe was not one of its proposals). */
  callerPredicted: number;
  /** Mean of |measured - predicted| over every measured run with an engine prediction, or null with none. */
  meanAbsResidual: number | null;
  /** Shared decimals per column, so the Data table and the chart columns align. */
  decimals: { pred: number; measured: number; residual: number };
  /** Measured precision: the replicate noise SD when the fit was replicate-aware, else null (3 sf). */
  measuredU: number | null;
  bandNote: string;
};

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** The note every view of the band carries: where the bands come from. */
export function bandNoteFor(recorded: number, legacy: number): string {
  if (recorded > 0 && legacy === 0) return "Each band was recorded by the engine when the run started.";
  if (recorded === 0 && legacy > 0) return "These runs were started before the engine recorded each run's band, so they show the current analysis' band.";
  if (recorded > 0 && legacy > 0) return "Bands were recorded by the engine when each run started; runs started before that show the current analysis' band, labelled as such.";
  return "";
}

/** Measured precision from the engine's replicate noise, only when the fit was replicate-aware. */
export function measuredUncertainty(analysis: DumbbellAnalysis | null | undefined): number | null {
  const n = analysis?.noise;
  return n?.replicate_aware && finite(n.noise_sd) && n.noise_sd > 0 ? n.noise_sd : null;
}

export function toDumbbellData(pending: readonly CampaignRun[], analysis: DumbbellAnalysis | null | undefined): DumbbellData {
  const runs: DumbbellRun[] = pending
    .filter((r) => finite(r.pred) || finite(enginePrediction(r)) || (!r.awaiting && finite(r.result)))
    .map((r) => {
      const band = runBand(r, analysis);
      const pred = enginePrediction(r);
      const result = !r.awaiting && finite(r.result) ? r.result : null;
      const outcome = bandOutcome(r, band);
      return {
        id: r.id,
        round: r.round != null && Number.isFinite(r.round) ? displayRound(r.round) : null,
        mode: r.mode,
        pred,
        callerPred: pred == null && finite(r.pred) ? r.pred : null,
        interval: band.halfWidth != null ? { lo: band.lo, hi: band.hi, coverage: band.coverage, method: "conformal" as const } : null,
        bandSource: band.source ?? null,
        bandWhy: band.why ?? null,
        bandReason: bandMissingText(band),
        result,
        awaiting: result == null,
        residual: runResidual(r),
        inside: outcome == null ? null : outcome === "inside",
        run: r,
      };
    });

  const byRound = new Map<number | null, DumbbellRun[]>();
  for (const r of runs) byRound.set(r.round, [...(byRound.get(r.round) ?? []), r]);
  const groups = [...byRound.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : b - a))
    .map(([round, rs]) => ({ round, runs: rs }));

  const banded = runs.filter((r) => r.interval != null);
  const bandAvailable = banded.length > 0;
  const covs = [...new Set(banded.map((r) => r.interval!.coverage))];
  const coverage = covs.length === 1 ? (covs[0] ?? null) : null;
  const recorded = runs.filter((r) => r.bandSource === "recorded");
  const legacy = runs.filter((r) => r.bandSource === "current-analysis").length;
  const done = runs.filter((r) => r.result != null);
  const scored = done.filter((r) => r.bandSource === "recorded" && r.inside != null);
  const hit = bandAvailable ? { inside: scored.filter((r) => r.inside).length, total: scored.length, unscored: done.length - scored.length } : null;
  const residuals = done.filter((r) => r.residual != null).map((r) => Math.abs(r.residual as number));
  const measuredU = measuredUncertainty(analysis);
  const predRows = runs.filter((r) => r.pred != null).map((r) => ({ value: r.pred as number, u: r.interval ? Math.min(r.pred! - r.interval.lo, r.interval.hi - r.pred!) : null }));
  const predDecimals = columnDecimals(predRows);
  const measuredDecimals = columnDecimals(done.map((r) => ({ value: r.result as number, u: measuredU })));

  return {
    runs,
    groups,
    bandAvailable,
    coverage,
    hit,
    measured: done.length,
    awaiting: runs.length - done.length,
    legacy,
    callerPredicted: runs.filter((r) => r.pred == null).length,
    meanAbsResidual: residuals.length ? residuals.reduce((a, b) => a + b, 0) / residuals.length : null,
    // A difference is no more precise than the coarser of its two operands.
    decimals: { pred: predDecimals, measured: measuredDecimals, residual: residuals.length ? Math.min(predDecimals, measuredDecimals) : predDecimals },
    measuredU,
    bandNote: bandNoteFor(recorded.length, legacy),
  };
}

/** The value domain: every prediction, every interval end and every measured result, so nothing is clipped. */
export function dumbbellDomain(runs: readonly DumbbellRun[]): [number, number] | null {
  const vals = runs
    .flatMap((r) => [...(r.pred != null ? [r.pred] : []), ...(r.interval ? [r.interval.lo, r.interval.hi] : []), ...(r.result != null ? [r.result] : [])])
    .filter(Number.isFinite);
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

/**
 * "1 of 2 inside the 90% band recorded when they started (50%)". The percentage only with the count; the coverage
 * only when the engine sent one. Only runs with a recorded band are counted.
 */
export function hitRateText(hit: HitRate, coverage: number | null): string {
  const cov = coverageText(coverage);
  if (hit.total === 0) return "No measured run has a band recorded when it started, so the hit rate is not scored yet.";
  const pct = formatValue(hit.inside / hit.total, { quantity: "pct" }).text;
  return `${count(hit.inside)} of ${count(hit.total)} inside the ${cov ? `${cov} ` : ""}band recorded when ${hit.total === 1 ? "it" : "they"} started (${pct})`;
}

/** "2 measured runs without a recorded band are left out." or null. */
export function unscoredText(hit: HitRate): string | null {
  if (hit.unscored === 0) return null;
  return `${plural(hit.unscored, "measured run")} without a band recorded at start ${hit.unscored === 1 ? "is" : "are"} left out.`;
}

export type DumbbellFormat = { unit: string | null };

export const fmtPred = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  r.pred != null ? formatValue(r.pred, { basis: "predicted", unit, decimals: d.decimals.pred }) : formatValue(null, { basis: "predicted", unit });
export const fmtMeasured = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  formatValue(r.result, { basis: "measured", unit, decimals: d.decimals.measured });
/** measured − predicted: the engine's residual (or exact arithmetic for legacy runs), as a signed delta. */
export const fmtResidual = (d: DumbbellData, r: DumbbellRun, unit: string | null) =>
  formatDelta(r.residual, r.residual != null ? 0 : null, { basis: "measured", unit, relative: false, decimals: d.decimals.residual });
export const fmtInterval = (d: DumbbellData, r: DumbbellRun) =>
  r.interval && r.pred != null ? formatValue(r.pred, { interval: r.interval, decimals: d.decimals.pred }).interval : null;

/** The inside/outside word for a run: inside, outside, band n/a, no engine prediction, or awaiting. */
export function bandCheck(r: DumbbellRun): "inside" | "outside" | "band n/a" | "no engine prediction" | "awaiting" {
  if (r.awaiting) return "awaiting";
  if (r.pred == null) return "no engine prediction";
  if (r.inside == null) return "band n/a";
  return r.inside ? "inside" : "outside";
}

/** Why a run has no band, in plain words with the engine's own reason when it sent one. */
export const bandMissingReason = (r: DumbbellRun): string | null => r.bandReason;

/** How the run's band is labelled ("band recorded when the run started" / "band from the current analysis ..."). */
export const bandSourceLabel = (r: DumbbellRun): string | null => (r.bandSource ? BAND_SOURCE_LABEL[r.bandSource] : null);

/** The plotted values as a table (the Data disclosure, print and copy path). */
export function dumbbellTable(d: DumbbellData, { unit }: DumbbellFormat): { columns: string[]; rows: string[][] } {
  const u = unit ? ` (${unit})` : "";
  const cov = coverageText(d.coverage);
  const columns = [
    "Run",
    "Round",
    "Mode",
    `Measured${u}`,
    `Predicted${u}`,
    ...(d.bandAvailable ? [`${cov ? `${cov} ` : ""}band`, "Band from"] : []),
    "Measured − predicted",
    ...(d.bandAvailable ? ["Band check"] : []),
  ];
  const rows = d.groups.flatMap((g) =>
    g.runs.map((r) => [
      shortId(r.id),
      r.round != null ? count(r.round) : "n/a",
      r.mode,
      r.awaiting ? "Awaiting result" : fmtMeasured(d, r, null).text,
      r.pred != null ? fmtPred(d, r, null).text : "No engine prediction",
      ...(d.bandAvailable ? [fmtInterval(d, r) ?? "n/a", r.bandSource ? (r.bandSource === "recorded" ? "recorded at start" : "current analysis") : "n/a"] : []),
      r.awaiting ? "Awaiting result" : r.residual != null ? fmtResidual(d, r, null).text : "n/a",
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
  else if (!d.bandAvailable) parts.push("No run has a prediction band.");
  if (d.callerPredicted > 0) parts.push(`${plural(d.callerPredicted, "run")} ${d.callerPredicted === 1 ? "has" : "have"} no engine prediction (the recipe was not one of its proposals).`);
  const listed = d.groups.flatMap((g) => g.runs).slice(0, maxRuns);
  for (const r of listed) {
    const p = r.pred != null ? formatValue(r.pred, { basis: "predicted", unit, interval: r.interval, decimals: d.decimals.pred }) : null;
    const pred = p ? `predicted ${p.value}${p.interval ? ` ${p.interval}` : ""}` : "no engine prediction";
    const meas = r.awaiting
      ? "awaiting a result"
      : `measured ${fmtMeasured(d, r, null).value}${r.residual != null ? ` (${fmtResidual(d, r, null).value}, ${bandCheck(r)})` : ""}`;
    parts.push(`Run ${shortId(r.id)}: ${pred}, ${meas}.`);
  }
  if (d.runs.length > listed.length) parts.push(`${plural(d.runs.length - listed.length, "more run")} in the Data table.`);
  if (unit) parts.push(`Values in ${unit}.`);
  return parts.join(" ");
}
