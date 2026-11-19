/*
 * C1 ProgressChart adapter (VIZ_SPEC 5, C1): campaign summary + analysis ->
 * the plotted columns, runs, next batch, incumbent and band hit count. Pure,
 * no React, tested in __tests__/viz-progress-chart.test.ts.
 *
 * Rounds: `history[k]` is the model after round k's measured results were
 * folded in (k = 0 is the uploaded sheet). A run's `round` is the 0-based
 * round it was STARTED in, so its result belongs to history round
 * `run.round + 1` and is drawn in that column. The next batch (the current
 * analysis's proposals, not started yet) is history round `campaign.round + 1`.
 *
 * Nothing here is a statistic: the step line is the engine's `history[].best`
 * (a null best is a gap, never interpolated; it is the lowest measured value
 * when the campaign goal is minimize). A started run's interval is the band
 * the engine RECORDED when it started (`prediction_at_start.interval`); legacy
 * runs fall back to the current analysis' band (labelled), and a run without
 * an engine prediction (`pred_source` "caller") draws no predicted mark. The
 * next batch uses `pred +/- conformal_q` at `conformal_coverage`. The hit rate
 * counts only runs with a recorded band, using the engine's `inside_band`.
 */
import { bandMissingText, bandOutcome, enginePrediction, goalOf, isCallerPrediction, runBand, type BandAnalysis } from "@/components/campaign/learn";
import { incumbentLabel, proposalIncumbent, targetUnitOf, type AnalyzeResult, type CampaignRun, type Goal, type TargetUnit } from "@/lib/api";
import { coverageText, formatValue, parseUnit, type IntervalSpec } from "@/lib/num";
import { MAX_RUNS_PER_ROUND } from "@/lib/viz-thresholds";

export type ProgressCampaign = {
  target: string;
  history: { round: number; best: number | null; n_base: number }[];
  n_base?: number;
  round?: number;
  pending?: CampaignRun[];
  analysis_in_sync?: boolean;
  /** The campaign goal from the summary (`best` is the minimum when minimizing). Absent = maximize. */
  goal?: Goal;
};

export type ProgressAnalysis = Pick<AnalyzeResult, "best" | "noise" | "proposals" | "conformal_q" | "conformal_coverage" | "timestamp" | "engine_version" | "run" | "seed"> & {
  dataset?: string;
  updated?: number;
  target?: string;
  target_unit?: TargetUnit;
  proposal_provenance?: BandAnalysis["proposal_provenance"];
};

/** How a started run's interval was obtained. */
export type RunBand =
  /** The engine recorded the band when the run was started (R5). */
  | "recorded"
  /** Legacy run (no band recorded) that the current analysis proposed: today's band, labelled as such. */
  | "current-analysis"
  /** Legacy run started from an earlier analysis (or one that does not say which): no band is drawn. */
  | "earlier-analysis"
  /** Legacy run, and the engine reported no conformal band at all. */
  | "none-reported"
  /** The engine recorded its prediction at start but no band. */
  | "interval-unavailable"
  /** The recipe was not one of the engine's proposals: no engine prediction, no predicted mark. */
  | "no-engine-prediction";

export type ProgressRun = {
  id: string;
  /** Column key it is drawn in. */
  column: string;
  /** The engine's prediction; for a caller-predicted run (`enginePred` false) the caller's number, never drawn. */
  pred: number;
  /** False when the engine recorded no prediction for this run (its recipe was not proposed). */
  enginePred: boolean;
  lo: number | null;
  hi: number | null;
  /** The band's engine-reported coverage (per run), or null. */
  coverage: number | null;
  band: RunBand;
  /** Why there is no band, in words (with the engine's own reason when it sent one); null with a band. */
  bandReason: string | null;
  result: number | null;
  /** Inside its band (only when it has a band and a result; the engine's `inside_band` for a recorded band). */
  inside: boolean | null;
};

export type ProgressColumn = {
  key: string;
  /** History round this column stands for (null for "unassigned"). */
  round: number | null;
  label: string;
  kind: "history" | "runs" | "unassigned" | "next";
  /** Measured best so far after this round (history only; null = the engine reported none). */
  best: number | null;
  /** Measured rows in the model at this point (history only). */
  nBase: number | null;
  /** More runs than MAX_RUNS_PER_ROUND: drawn as min-max ranges, full set in the Data table. */
  collapsed: boolean;
};

export type ProgressNext = {
  column: string;
  preds: { pred: number; lo: number | null; hi: number | null }[];
  /** analysis_in_sync === false: the batch comes from an analysis older than the campaign. */
  fromPreviousAnalysis: boolean;
};

export type ProgressData = {
  target: string;
  unit: string | null;
  /** The campaign goal: which way "best" points. */
  goal: Goal;
  columns: ProgressColumn[];
  runs: ProgressRun[];
  next: ProgressNext | null;
  /** True when the current round's runs are already started from the analysis's batch. */
  batchStarted: boolean;
  coverage: number | null;
  halfWidth: number | null;
  incumbent: { value: number; label: string } | null;
  /** Scored: measured runs with a band recorded at start. Unscored: every other measured run. */
  hit: { inside: number; scored: number; unscored: number };
  /** Started runs drawn with the current analysis' band (legacy, no band recorded). */
  legacy: number;
  stale: { nNew: number; text: string } | null;
  /** Columns with a measured best (the trend needs two). */
  measuredRounds: number;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const roundLabel = (round: number): string => (round === 0 ? "Upload" : `Round ${round}`);

/** The target's display unit: the analysis' `target_unit` (user setup, then header) when there is an analysis, else the header. */
export function progressUnit(target: string, analysis: Pick<ProgressAnalysis, "target" | "target_unit"> | null | undefined): string | null {
  return analysis ? targetUnitOf({ target: analysis.target ?? target, target_unit: analysis.target_unit }) : parseUnit(target).unit;
}

/** Build the chart data. `analysis` may be null (not loaded or none yet): runs then carry no interval. */
export function toProgressData(c: ProgressCampaign, analysis: ProgressAnalysis | null): ProgressData {
  const q = isNum(analysis?.conformal_q) && analysis!.conformal_q! > 0 ? analysis!.conformal_q! : null;
  const coverage = isNum(analysis?.conformal_coverage) ? analysis!.conformal_coverage! : null;
  const pending = (c.pending ?? []).filter((r) => isNum(r.pred));

  const cols = new Map<string, ProgressColumn>();
  for (const h of c.history) {
    cols.set(`r${h.round}`, { key: `r${h.round}`, round: h.round, label: roundLabel(h.round), kind: "history", best: isNum(h.best) ? h.best : null, nBase: h.n_base, collapsed: false });
  }

  const runs: ProgressRun[] = pending.map((r) => {
    const histRound = isNum(r.round) ? r.round + 1 : null;
    const key = histRound == null ? "unassigned" : `r${histRound}`;
    if (!cols.has(key)) {
      cols.set(key, {
        key,
        round: histRound,
        label: histRound == null ? "Unassigned" : roundLabel(histRound),
        kind: histRound == null ? "unassigned" : "runs",
        best: null,
        nBase: null,
        collapsed: false,
      });
    }
    const b = runBand(r, analysis);
    const band: RunBand =
      b.source === "recorded"
        ? "recorded"
        : b.source === "current-analysis"
          ? "current-analysis"
          : b.why === "no-engine-prediction"
            ? "no-engine-prediction"
            : b.why === "interval-unavailable"
              ? "interval-unavailable"
              : b.why === "no-band"
                ? "none-reported"
                : "earlier-analysis";
    const result = !r.awaiting && isNum(r.result) ? r.result : null;
    const outcome = bandOutcome(r, b);
    return {
      id: r.id,
      column: key,
      pred: enginePrediction(r) ?? r.pred,
      enginePred: !isCallerPrediction(r),
      lo: b.halfWidth != null ? b.lo : null,
      hi: b.halfWidth != null ? b.hi : null,
      coverage: b.coverage,
      band,
      bandReason: bandMissingText(b),
      result,
      inside: outcome == null ? null : outcome === "inside",
    };
  });

  // The analysis's batch is "next" only while none of the current round's runs is started.
  const currentRound = isNum(c.round) ? c.round : Math.max(0, ...c.history.map((h) => h.round));
  const batchStarted = pending.some((r) => r.round === currentRound) || (pending.length > 0 && pending.every((r) => !isNum(r.round)));
  let next: ProgressNext | null = null;
  const proposals = (analysis?.proposals ?? []).filter((p) => isNum(p.pred));
  if (!batchStarted && proposals.length > 0) {
    const round = currentRound + 1;
    const key = `next${round}`;
    cols.set(key, { key, round, label: roundLabel(round), kind: "next", best: null, nBase: null, collapsed: false });
    next = {
      column: key,
      preds: proposals.map((p) => ({ pred: p.pred, lo: q != null ? p.pred - q : null, hi: q != null ? p.pred + q : null })),
      fromPreviousAnalysis: c.analysis_in_sync === false,
    };
  }

  const order = (col: ProgressColumn) => (col.kind === "next" ? 1e9 : col.kind === "unassigned" ? 1e9 - 1 : (col.round ?? 0));
  const columns = [...cols.values()].sort((a, b) => order(a) - order(b));
  for (const col of columns) col.collapsed = runs.filter((r) => r.column === col.key).length > MAX_RUNS_PER_ROUND;

  const measured = runs.filter((r) => r.result != null);
  const scored = measured.filter((r) => r.band === "recorded" && r.inside != null);
  const inc = analysis ? proposalIncumbent(analysis) : null;
  const nMeasuredPending = measured.length;

  return {
    target: c.target,
    unit: progressUnit(c.target, analysis),
    goal: goalOf(c),
    columns,
    runs,
    next,
    batchStarted,
    coverage,
    halfWidth: q,
    incumbent: analysis && isNum(inc) ? { value: inc, label: incumbentLabel(analysis) } : null,
    hit: { inside: scored.filter((r) => r.inside).length, scored: scored.length, unscored: measured.length - scored.length },
    legacy: runs.filter((r) => r.band === "current-analysis").length,
    stale:
      c.analysis_in_sync === false
        ? {
            nNew: nMeasuredPending,
            text:
              nMeasuredPending > 0
                ? `The analysis predates ${nMeasuredPending === 1 ? "1 recorded result" : `${nMeasuredPending} recorded results`}, so the model has not learned from ${nMeasuredPending === 1 ? "it" : "them"} yet. Re-analyze to update.`
                : "Runs were started after this analysis, so the campaign has moved on since it was fitted. Re-analyze once results are recorded.",
          }
        : null,
    measuredRounds: columns.filter((col) => col.best != null).length,
  };
}

/** The interval a predicted mark carries, or null (never invented). */
export function markInterval(lo: number | null, hi: number | null, coverage: number | null): IntervalSpec | null {
  return lo != null && hi != null ? { lo, hi, coverage, method: "conformal" } : null;
}

/** "90% held-out band" (coverage from the engine) or "held-out band" when it did not say. */
export function bandName(coverage: number | null): string {
  const pct = coverageText(coverage);
  return pct ? `${pct} held-out band` : "held-out band";
}

/** The coverage shared by every recorded run band, else the analysis' (for the legend). */
function runsCoverage(d: Pick<ProgressData, "runs" | "coverage">): number | null {
  const covs = [...new Set(d.runs.filter((r) => r.lo != null).map((r) => r.coverage))];
  return covs.length === 1 ? (covs[0] ?? null) : covs.length === 0 ? d.coverage : null;
}

/**
 * The hit-rate footer sentence, with exact counts. It counts only measured runs with a band the engine recorded
 * when they started, and says so. Null when there are no measured runs.
 */
export function hitRateText(d: Pick<ProgressData, "hit" | "coverage" | "runs">): string | null {
  const { inside, scored, unscored } = d.hit;
  const left = (n: number) => `${n === 1 ? "1 measured run" : `${n} measured runs`} without a band recorded at start ${n === 1 ? "is" : "are"} not scored.`;
  if (scored === 0) return unscored > 0 ? `Band hit rate: not scored. ${left(unscored)}` : null;
  const cov = runsCoverage(d);
  const pct = formatValue(inside / scored, { quantity: "pct" }).text;
  const target = coverageText(cov);
  return `Band hit rate: ${inside} of ${scored} measured ${scored === 1 ? "run" : "runs"} inside the ${bandName(cov)} recorded when ${scored === 1 ? "it" : "they"} started (${pct}${target ? `, target ${target}` : ""}).${unscored > 0 ? ` ${left(unscored)}` : ""}`;
}

/** "higher is better" / "lower is better", for the step line's direction. */
export const goalPhrase = (goal: Goal): string => (goal === "minimize" ? "lower is better" : "higher is better");

const fmt = (v: number | null, unit: string | null, interval?: IntervalSpec | null) => formatValue(v, { unit, interval, basis: "measured" });

/** The batch's overall predicted span: the lowest interval bound to the highest (exact min/max), else the preds' span. */
export function nextRange(next: ProgressNext | null): { lo: number; hi: number; withIntervals: boolean } | null {
  if (!next || next.preds.length === 0) return null;
  const withIntervals = next.preds.every((p) => p.lo != null && p.hi != null);
  const los = next.preds.map((p) => (withIntervals ? p.lo! : p.pred));
  const his = next.preds.map((p) => (withIntervals ? p.hi! : p.pred));
  return { lo: Math.min(...los), hi: Math.max(...his), withIntervals };
}

/** "1.51 to 1.95 g/L": both ends at the precision the band supports (3 sf without one). */
export function rangeText(lo: number, hi: number, unit: string | null, halfWidth: number | null): string {
  const o = { uncertainty: halfWidth, basis: "predicted" as const };
  return `${formatValue(lo, o).value} to ${formatValue(hi, { ...o, unit }).text}`;
}

/** Plain-language description (the SVG's aria-label and the figure's sr-only text). */
export function describeProgress(d: ProgressData): string {
  const u = d.unit;
  const best = d.columns
    .filter((c) => c.kind === "history" || c.kind === "runs")
    .map((c) => `${c.label === "Upload" ? "upload" : c.label.toLowerCase()} ${c.best != null ? fmt(c.best, null).text : "no measured best"}`);
  const parts = [`Best measured ${d.target} by round${u ? ` (${u})` : ""}, ${goalPhrase(d.goal)}: ${best.join(", ")}.`];
  const measuredRuns = d.runs.filter((r) => r.result != null).length;
  const awaiting = d.runs.length - measuredRuns;
  if (d.runs.length) parts.push(`${d.runs.length} started ${d.runs.length === 1 ? "run" : "runs"} this round: ${measuredRuns} measured, ${awaiting} awaiting a result.`);
  const caller = d.runs.filter((r) => !r.enginePred).length;
  if (caller) parts.push(`${caller} ${caller === 1 ? "run has" : "runs have"} no engine prediction (the recipe was not one of its proposals).`);
  const hit = hitRateText(d);
  if (hit) parts.push(hit);
  const r = nextRange(d.next);
  if (r && d.next) {
    const col = d.columns.find((c) => c.key === d.next!.column);
    const span = rangeText(r.lo, r.hi, u, d.halfWidth);
    parts.push(
      `Next batch (${col?.label.toLowerCase() ?? "next round"}, proposed, not run): ${d.next.preds.length} ${d.next.preds.length === 1 ? "recipe" : "recipes"} predicted ${span}${r.withIntervals ? ` across their ${bandName(d.coverage)}s` : ", no interval reported"}${d.next.fromPreviousAnalysis ? ", from the previous analysis" : ""}.`,
    );
  }
  if (d.incumbent) parts.push(`Incumbent (${d.incumbent.label}) ${fmt(d.incumbent.value, u).text}.`);
  return parts.join(" ");
}

/** Where a run's band comes from, in a few words (Data table, tooltips). */
export const BAND_FROM: Record<RunBand, string> = {
  recorded: "recorded when the run started",
  "current-analysis": "current analysis, not recorded at start",
  "earlier-analysis": "earlier analysis, band not stored",
  "none-reported": "none reported",
  "interval-unavailable": "engine recorded no band",
  "no-engine-prediction": "no engine prediction",
};

export type ProgressTable = { columns: string[]; rows: string[][] };

/** The Data disclosure: every plotted value through lib/num, no blanks (a state word instead). */
export function progressTable(d: ProgressData): ProgressTable {
  const u = d.unit;
  const rows: string[][] = [];
  for (const col of d.columns) {
    if (col.kind === "history") {
      rows.push([
        col.label,
        "Best so far",
        col.best != null ? fmt(col.best, u).text : "n/a",
        "n/a",
        "n/a",
        col.best == null ? `No measured result in ${col.label.toLowerCase()}` : col.nBase != null ? `${formatValue(col.nBase, { quantity: "count" }).text} measured rows in the model` : "n/a",
      ]);
    }
    for (const r of d.runs.filter((x) => x.column === col.key)) {
      const interval = markInterval(r.lo, r.hi, r.coverage);
      const p = formatValue(r.pred, { unit: u, interval, basis: "predicted" });
      rows.push([
        col.label,
        `Run ${r.id.slice(0, 7)}`,
        r.result != null ? fmt(r.result, u).text : "Awaiting result",
        r.enginePred ? p.value + (p.unit ? `\u00A0${p.unit}` : "") : "No engine prediction",
        interval ? `${p.interval}${p.coverage ? ` ${p.coverage}` : ""} (${BAND_FROM[r.band]})` : `n/a (${BAND_FROM[r.band]})`,
        r.inside == null
          ? r.result == null
            ? "Awaiting result"
            : "Not scored"
          : `${r.inside ? "Inside band" : "Outside band"}${r.band === "recorded" ? "" : " (not counted in the hit rate)"}`,
      ]);
    }
    if (d.next && col.key === d.next.column) {
      d.next.preds.forEach((p, i) => {
        const interval = markInterval(p.lo, p.hi, d.coverage);
        const f = formatValue(p.pred, { unit: u, interval, basis: "predicted" });
        rows.push([
          col.label,
          `Proposal ${i + 1}`,
          "Not run",
          f.value + (f.unit ? `\u00A0${f.unit}` : ""),
          interval ? `${f.interval}${f.coverage ? ` ${f.coverage}` : ""}` : "n/a (none reported)",
          d.next!.fromPreviousAnalysis ? "Proposed, not run (previous analysis)" : "Proposed, not run",
        ]);
      });
    }
  }
  return { columns: ["Round", "Mark", `Measured${u ? ` (${u})` : ""}`, `Predicted${u ? ` (${u})` : ""}`, "Band", "Note"], rows };
}

/** Every value the y axis must include, so no interval is clipped. */
export function progressExtent(d: ProgressData): [number, number] | null {
  const vs: number[] = [];
  for (const c of d.columns) if (c.best != null) vs.push(c.best);
  for (const r of d.runs) {
    if (r.enginePred) vs.push(r.pred);
    if (r.lo != null) vs.push(r.lo);
    if (r.hi != null) vs.push(r.hi);
    if (r.result != null) vs.push(r.result);
  }
  for (const p of d.next?.preds ?? []) {
    vs.push(p.pred);
    if (p.lo != null) vs.push(p.lo);
    if (p.hi != null) vs.push(p.hi);
  }
  if (d.incumbent) vs.push(d.incumbent.value);
  if (!vs.length) return null;
  return [Math.min(...vs), Math.max(...vs)];
}
