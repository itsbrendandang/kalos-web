/*
 * C2 BatchIntervalStrip adapter (VIZ_SPEC 5, C2): the engine's proposed batch
 * as forest rows against the incumbent. Pure, no React.
 *
 * Every number is an engine field or exact arithmetic on engine fields.
 *
 * The band comes from one of two engine sources, never from the model sigma:
 * - per-proposal (`proposals[i].intervals`, engine R4): normalized split
 *   conformal, one entry per coverage in `interval_levels`. The caller picks a
 *   coverage; each row uses its entry at exactly that coverage. A refused
 *   entry (`available: false`) draws NO band and carries the engine's reason
 *   and what would fix it. There is no silent fallback to the GP band.
 * - global (older analyses without `intervals`): `pred +/- conformal_q` at
 *   `conformal_coverage`.
 *
 * The predicted gain is taken in the goal direction (`pred - incumbent` when
 * maximizing, `incumbent - pred` when minimizing) with the band shifted by the
 * same exact arithmetic. EI, the chance to beat the incumbent and the
 * quantiles are GP-posterior numbers and are labelled model-based wherever
 * they appear. `nearest_training_distance` is shown with the engine's median
 * spacing as its scale; no threshold or verdict is invented for it.
 * `p_feasible` is shown only when the engine gated the batch on it, and a
 * measured result comes from a started run whose recipe is exactly the
 * proposal's. Rows stay in the engine's order.
 *
 * Every row with a band carries its trust caveat (lib/proposal-caveat): the
 * band's coverage was measured on held-out past runs, and at proposals it was
 * measured lower. The engine's own caveat wins; older engines get the fixed text.
 */
import type { AnalyzeResult, CampaignRun, GpInterval, ImprovementStat, Proposal, ProposalQuantiles } from "@/lib/api";
import { incumbentLabel, intervalAt, proposalIncumbent, proposalRecipe } from "@/lib/api";
import { atRangeEdge, conformalInterval, coverageText, formatProb, formatValue, type Formatted, type IntervalSpec } from "@/lib/num";
import { methodCaveat, proposalCaveat, sameCaveat, type ProposalCaveat } from "@/lib/proposal-caveat";
import { proposalTrustOf, type ProposalTrust } from "@/lib/proposal-trust";

export type FeasibilityCell = { state: "value"; p: number } | { state: "na"; reason: string; detail?: string };

export type BatchStripRun = { id: string; result: number | null; awaiting: boolean };

export type Goal = "maximize" | "minimize";

/** One coverage level the engine computed per-proposal intervals at (`interval_method.levels`, else `interval_levels`). */
export type LevelInfo = {
  coverage: number;
  available: boolean;
  code: string | null;
  reason: string | null;
  fix: string | null;
  nCalibration: number | null;
  /** In-sample OOF coverage (counted on the scores that set the quantile) with its count. */
  empirical: number | null;
  nInside: number | null;
  /** Coverage on the low- and high-sigma halves of the calibration set (the informative check). */
  bySigma: { key: string; n: number; coverage: number | null }[];
};

/** Which band the batch shows. */
export type IntervalMode =
  | {
      kind: "per-proposal";
      /** The chosen coverage (one of `levels`). */
      coverage: number;
      levels: LevelInfo[];
      /** The chosen level's batch-wide entry, when `interval_method.levels` has one. */
      level: LevelInfo | null;
      /** The engine's own method string (`interval_method.method`). */
      method: string | null;
      /** `interval_method.coverage_guarantee`, verbatim (for a disclosure). */
      guarantee: string | null;
      /** `interval_method.empirical_oof_coverage_note`, verbatim. */
      empiricalNote: string | null;
      nCalibration: number | null;
    }
  | { kind: "global"; coverage: number | null; halfWidth: number }
  | { kind: "none" };

/** One proposal's band at the chosen coverage. */
export type RowBand =
  | { kind: "value"; lo: number; hi: number; coverage: number | null; source: "per-proposal" | "global" }
  | { kind: "refused"; coverage: number; code: string | null; reason: string; fix: string | null }
  | { kind: "none"; reason: string };

export type BatchStripRow = {
  /** "P1": the id the table, the comparison and the setpoint matrix use. */
  key: string;
  /** 1-based position in the engine's order. */
  n: number;
  /** Index in the engine's `proposals`. */
  index: number;
  mode: "explore" | "exploit";
  /** The engine verdict's label for this proposal (model-guided or exploration); null on older analyses. */
  trust: ProposalTrust | null;
  pred: number;
  lo: number | null;
  hi: number | null;
  /** The band behind lo/hi, or why there is none. */
  interval: RowBand;
  /** The trust caveat for this row's band; null when the row shows no band. */
  caveat: ProposalCaveat | null;
  sigma: number;
  feasibility: FeasibilityCell;
  /** Model-based (GP posterior) context; null when the engine sent none. */
  ei: ImprovementStat | null;
  pImprove: ImprovementStat | null;
  quantiles: ProposalQuantiles | null;
  /** The GP posterior band at the chosen coverage (model-based, never a substitute for the conformal band). */
  gp: GpInterval | null;
  /** `nearest_training_distance` (0 = a measured recipe), null when absent. */
  nnDistance: number | null;
  /** A started run with exactly this recipe, if any. */
  run: BatchStripRun | null;
  /**
   * Was the started run's measured result inside the band recorded for it when it started, at the chosen coverage?
   * The engine's `inside_band` or `prediction_at_start.intervals`; null (n/a) when no band at this coverage was
   * recorded at start. Never judged against the current analysis' band (not the band the run was started with).
   */
  band: "inside" | "outside" | null;
  /** Why `band` is n/a for a measured run, else null. */
  bandNa: string | null;
  /** Inputs within 1% of an end of the engine's `feature_ranges`. */
  edge: string[];
  flags: ("edge" | "outside-band")[];
};

export type BatchStripModel = {
  target: string;
  unit: string | null;
  goal: Goal;
  rows: BatchStripRow[];
  incumbent: { value: number; label: string } | null;
  intervals: IntervalMode;
  /** The coverage of the band shown (the chosen level, or `conformal_coverage`); null without a band. */
  coverage: number | null;
  /** The global conformal half-width; null in per-proposal mode or without a band. */
  halfWidth: number | null;
  /** The trust caveat for the bands shown (the first row's); null when no row shows a band. */
  caveat: ProposalCaveat | null;
  /** Every distinct caveat among the rows (more than one when the engine's method differs per row). */
  caveats: ProposalCaveat[];
  /** `training_nn_distance_median`: the scale for `nnDistance`. */
  nnMedian: number | null;
  gating: "gated" | "ungated" | "absent";
  gatingReason: string | null;
  hasRuns: boolean;
  /** Any row carries model-based improvement fields (EI / chance to beat). */
  hasImprovement: boolean;
  domain: [number, number] | null;
};

export type StripAnalysis = Pick<AnalyzeResult, "proposals" | "proposal_features" | "conformal_q" | "conformal_coverage" | "best" | "noise" | "feature_ranges" | "proposal_gating"> &
  Partial<Pick<AnalyzeResult, "interval_levels" | "interval_method" | "training_nn_distance_median" | "goal" | "setup" | "conformal_caveat" | "proposal_trust">>;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** The optimization direction of an analysis: its `goal`, else the applied setup's, else maximize (the engine default). */
export function goalOf(d: Partial<Pick<AnalyzeResult, "goal" | "setup">>): Goal {
  return (d.goal ?? d.setup?.goal) === "minimize" ? "minimize" : "maximize";
}

/** The coverage levels the engine computed per-proposal intervals at, with each level's availability. */
export function intervalLevels(d: Partial<Pick<AnalyzeResult, "interval_levels" | "interval_method">>): LevelInfo[] {
  const raw = Array.isArray(d.interval_levels) ? d.interval_levels.filter(finite) : [];
  const fromMethod = Array.isArray(d.interval_method?.levels) ? d.interval_method.levels : [];
  return raw.map((coverage) => {
    const l = intervalAt(fromMethod, coverage);
    const bySigma = l?.coverage_by_sigma_half && typeof l.coverage_by_sigma_half === "object" ? Object.entries(l.coverage_by_sigma_half) : [];
    return {
      coverage,
      available: l ? l.available !== false : true,
      code: str(l?.code),
      reason: str(l?.reason),
      fix: str(l?.what_would_fix_it),
      nCalibration: finite(l?.n_calibration) ? l.n_calibration : null,
      empirical: finite(l?.empirical_oof_coverage) ? l.empirical_oof_coverage : null,
      nInside: finite(l?.n_inside) ? l.n_inside : null,
      bySigma: bySigma.filter(([, v]) => v && finite(v.n)).map(([key, v]) => ({ key, n: v.n, coverage: finite(v.coverage) ? v.coverage : null })),
    };
  });
}

/**
 * The band mode for an analysis at a chosen coverage: per-proposal when the
 * engine sent `interval_levels` (the chosen coverage if it is one of them,
 * else the first level), the global conformal band for older analyses, or none.
 */
export function intervalMode(d: StripAnalysis, chosen?: number | null): IntervalMode {
  const levels = intervalLevels(d);
  if (levels.length) {
    const level = (chosen != null ? levels.find((l) => Math.abs(l.coverage - chosen) < 1e-9) : null) ?? levels[0];
    const m = d.interval_method;
    return {
      kind: "per-proposal",
      coverage: level.coverage,
      levels,
      level,
      method: str(m?.method),
      guarantee: str(m?.coverage_guarantee),
      empiricalNote: str(m?.empirical_oof_coverage_note),
      nCalibration: finite(m?.n_calibration) ? m.n_calibration : null,
    };
  }
  if (finite(d.conformal_q) && d.conformal_q > 0) return { kind: "global", coverage: finite(d.conformal_coverage) ? d.conformal_coverage : null, halfWidth: d.conformal_q };
  return { kind: "none" };
}

/** One proposal's band under a mode. A refused per-proposal entry stays refused: no fallback to another band. */
export function proposalBand(p: Pick<Proposal, "pred" | "intervals">, mode: IntervalMode): RowBand {
  if (mode.kind === "none") return { kind: "none", reason: "the engine reported no prediction band" };
  if (mode.kind === "global") {
    const iv = conformalInterval(p.pred, mode.halfWidth, mode.coverage);
    return iv ? { kind: "value", lo: iv.lo, hi: iv.hi, coverage: mode.coverage, source: "global" } : { kind: "none", reason: "the engine reported no prediction for this recipe" };
  }
  const e = intervalAt(p.intervals, mode.coverage);
  if (!e) return { kind: "none", reason: "the engine sent no interval at this coverage for this proposal" };
  if (e.available === false || !finite(e.lo) || !finite(e.hi)) {
    return {
      kind: "refused",
      coverage: mode.coverage,
      code: str(e.code) ?? mode.level?.code ?? null,
      reason: str(e.reason) ?? mode.level?.reason ?? "the engine did not issue this interval",
      fix: str(e.what_would_fix_it) ?? mode.level?.fix ?? null,
    };
  }
  return { kind: "value", lo: e.lo, hi: e.hi, coverage: e.coverage, source: "per-proposal" };
}

/** Predicted gain over the incumbent in the goal direction: `pred - incumbent` (maximize) or `incumbent - pred` (minimize). */
export const goalGain = (pred: number, incumbent: number, goal: Goal): number => (goal === "minimize" ? incumbent - pred : pred - incumbent);

/** The band shifted into gain units, in the goal direction (exact arithmetic, bounds kept ordered). */
export function gainBand(lo: number, hi: number, incumbent: number, goal: Goal): [number, number] {
  return goal === "minimize" ? [incumbent - hi, incumbent - lo] : [lo - incumbent, hi - incumbent];
}

/** True when the prediction is better than the incumbent in the goal direction. */
export const beats = (pred: number, incumbent: number | null, goal: Goal): boolean => incumbent != null && goalGain(pred, incumbent, goal) > 0;

/** Exact recipe equality: same inputs, same values (numbers or categorical labels). */
export function sameRecipe(a: Record<string, number | string>, b: Record<string, number | string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && a[k] === b[k]);
}

/** The started run for a proposal's recipe: one with a result first, else one awaiting. */
export function matchRun(recipe: Record<string, number | string>, runs: readonly CampaignRun[]): BatchStripRun | null {
  const pick = matchCampaignRun(recipe, runs);
  return pick ? { id: pick.id, result: finite(pick.result) ? pick.result : null, awaiting: pick.awaiting } : null;
}

function matchCampaignRun(recipe: Record<string, number | string>, runs: readonly CampaignRun[]): CampaignRun | null {
  const same = runs.filter((r) => sameRecipe(recipe, r.recipe as Record<string, number | string>));
  return same.find((r) => finite(r.result)) ?? same[0] ?? null;
}

/**
 * Inside or outside the band recorded for a started run when it started, at `coverage`: the run's
 * `prediction_at_start.intervals` entry at that coverage (edge inclusive), else, when the band it recorded
 * (`prediction_at_start.interval`) is at that coverage, the engine's `inside_band` (or that band's bounds). Anything
 * else is n/a with the reason: the current analysis' band is never used (it is not the band the run was started with).
 */
export function startedRunBand(run: CampaignRun | null, coverage: number | null): { band: "inside" | "outside" | null; na: string | null } {
  if (!run || run.awaiting || !finite(run.result)) return { band: null, na: null };
  const at = run.prediction_at_start;
  const covText = coverageText(coverage);
  if (!at || at.available !== true) return { band: null, na: "no band was recorded when this run started" };
  if (coverage != null) {
    const e = intervalAt(at.intervals, coverage);
    if (e && e.available !== false && finite(e.lo) && finite(e.hi)) return { band: run.result >= e.lo && run.result <= e.hi ? "inside" : "outside", na: null };
    const i = at.interval;
    if (i && finite(i.coverage) && Math.abs(i.coverage - coverage) < 1e-9) {
      if (typeof run.inside_band === "boolean") return { band: run.inside_band ? "inside" : "outside", na: null };
      if (finite(i.lo) && finite(i.hi)) return { band: run.result >= i.lo && run.result <= i.hi ? "inside" : "outside", na: null };
    }
  }
  return { band: null, na: `no ${covText ? `${covText} ` : ""}band was recorded when this run started` };
}

function feasibility(p: Proposal, gating: StripAnalysis["proposal_gating"]): FeasibilityCell {
  if (!gating) return { state: "na", reason: "the engine did not report feasibility gating" };
  if (!gating.gated) return { state: "na", reason: "batch was not feasibility-gated", detail: gating.reason };
  return finite(p.p_feasible) ? { state: "value", p: p.p_feasible } : { state: "na", reason: "the engine returned no probability for this recipe" };
}

/** The shared x domain: every interval (or point), the incumbent and any measured result, padded 10% (never stretched). */
export function stripDomain(rows: Pick<BatchStripRow, "pred" | "lo" | "hi" | "run">[], incumbent: number | null): [number, number] | null {
  const pts: number[] = [];
  for (const r of rows) {
    if (finite(r.lo) && finite(r.hi)) pts.push(r.lo, r.hi);
    if (finite(r.pred)) pts.push(r.pred);
    if (r.run && finite(r.run.result)) pts.push(r.run.result);
  }
  if (finite(incumbent)) pts.push(incumbent);
  if (pts.length === 0) return null;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.1 : Math.abs(lo) * 0.1 || 1;
  return [lo - pad, hi + pad];
}

const stat = (s: ImprovementStat | null | undefined): ImprovementStat | null => (s && typeof s === "object" ? s : null);

export function toBatchStripModel(
  d: StripAnalysis,
  opts: { target: string; unit: string | null; runs?: readonly CampaignRun[]; coverage?: number | null },
): BatchStripModel {
  const inc = proposalIncumbent(d);
  const goal = goalOf(d);
  const intervals = intervalMode(d, opts.coverage);
  const runs = opts.runs ?? [];
  const ranges = d.feature_ranges ?? {};
  const coverage = intervals.kind === "per-proposal" ? intervals.coverage : intervals.kind === "global" ? intervals.coverage : null;
  const fallbackCaveat = intervals.kind === "per-proposal" ? methodCaveat(d.interval_method, intervals.coverage) : null;
  const rows: BatchStripRow[] = (d.proposals ?? []).map((p, index) => {
    const recipe = proposalRecipe(p, d.proposal_features ?? []) as Record<string, number | string>;
    const interval = proposalBand(p, intervals);
    const lo = interval.kind === "value" ? interval.lo : null;
    const hi = interval.kind === "value" ? interval.hi : null;
    const started = runs.length ? matchCampaignRun(recipe, runs) : null;
    const run = started ? { id: started.id, result: finite(started.result) ? started.result : null, awaiting: started.awaiting } : null;
    const { band, na: bandNa } = startedRunBand(started, coverage);
    const caveat =
      interval.kind !== "value"
        ? null
        : intervals.kind === "per-proposal"
          ? proposalCaveat(intervalAt(p.intervals, intervals.coverage), fallbackCaveat, intervals.coverage)
          : proposalCaveat(d.conformal_caveat ?? null, null, coverage);
    const edge = Object.entries(recipe)
      .filter(([k, v]) => finite(v) && Array.isArray(ranges[k]) && atRangeEdge(v, ranges[k]))
      .map(([k]) => k);
    const flags: BatchStripRow["flags"] = [];
    if (edge.length) flags.push("edge");
    if (band === "outside") flags.push("outside-band");
    const gp = intervals.kind === "per-proposal" ? intervalAt(p.gp_intervals, intervals.coverage) : null;
    return {
      key: `P${index + 1}`,
      n: index + 1,
      index,
      mode: p.mode,
      trust: proposalTrustOf(p, d.proposal_trust),
      pred: p.pred,
      lo,
      hi,
      interval,
      caveat,
      sigma: p.std,
      feasibility: feasibility(p, d.proposal_gating),
      ei: stat(p.expected_improvement),
      pImprove: stat(p.p_improve),
      quantiles: p.quantiles && typeof p.quantiles === "object" ? p.quantiles : null,
      gp: gp && gp.available !== false && finite(gp.lo) && finite(gp.hi) ? gp : null,
      nnDistance: finite(p.nearest_training_distance) ? p.nearest_training_distance : null,
      run,
      band,
      bandNa,
      edge,
      flags,
    };
  });
  const caveats: ProposalCaveat[] = [];
  for (const r of rows) if (r.caveat && !caveats.some((c) => sameCaveat(c, r.caveat!))) caveats.push(r.caveat);
  return {
    target: opts.target,
    unit: opts.unit,
    goal,
    rows,
    incumbent: finite(inc) ? { value: inc, label: incumbentLabel(d) } : null,
    intervals,
    coverage,
    halfWidth: intervals.kind === "global" ? intervals.halfWidth : null,
    caveat: caveats[0] ?? null,
    caveats,
    nnMedian: finite(d.training_nn_distance_median) && d.training_nn_distance_median > 0 ? d.training_nn_distance_median : null,
    gating: d.proposal_gating ? (d.proposal_gating.gated ? "gated" : "ungated") : "absent",
    gatingReason: d.proposal_gating?.reason ?? null,
    hasRuns: rows.some((r) => r.run != null),
    hasImprovement: rows.some((r) => r.ei != null || r.pImprove != null),
    domain: stripDomain(rows, finite(inc) ? inc : null),
  };
}

// --- Labels -----------------------------------------------------------------------

/** How the per-proposal band is built, in plain words (the engine's own guarantee text sits in a disclosure). */
export const PER_PROPOSAL_METHOD = "held-out conformal, scaled per recipe; approximate coverage";

/** The words every model-based (GP posterior) number carries. */
export const MODEL_BASED = "model-based (GP posterior), not checked on held-out runs";

/** "90% held-out band" from the engine's coverage, or "held-out band" when it said none. */
export const coverageLabel = (coverage: number | null): string => {
  const c = coverageText(coverage);
  return c ? `${c} held-out band` : "held-out band";
};

/** True when the model shows a band (some row may still be refused in per-proposal mode). */
export const hasBandMode = (m: Pick<BatchStripModel, "intervals">): boolean => m.intervals.kind !== "none";

/** The band's name for headers and legends: "90% held-out band, per recipe" or the global "90% held-out band". */
export function bandName(m: Pick<BatchStripModel, "intervals" | "coverage">): string {
  if (m.intervals.kind === "per-proposal") return `${coverageLabel(m.coverage)}, per recipe`;
  return coverageLabel(m.coverage);
}

/** The full legend wording, method included. */
export function bandLegend(m: Pick<BatchStripModel, "intervals" | "coverage">): string {
  if (m.intervals.kind === "per-proposal") return `${coverageText(m.coverage) ?? ""} band: ${PER_PROPOSAL_METHOD}`.trim();
  if (m.intervals.kind === "global") return coverageLabel(m.coverage);
  return "no interval reported";
}

/** The refusal for the chosen level, when the engine refused it batch-wide. */
export function levelRefusal(m: Pick<BatchStripModel, "intervals">): LevelInfo | null {
  return m.intervals.kind === "per-proposal" && m.intervals.level && !m.intervals.level.available ? m.intervals.level : null;
}

/** "best measured run" for the engine's incumbent_basis codes; other codes as sent. */
export function incumbentBasisText(basis: string | null | undefined): string {
  if (basis === "best_measured_single") return "best measured run";
  if (basis === "best_reproducible" || basis === "best_recipe_mean" || basis === "recipe_mean") return "best reproducible recipe";
  return basis ? basis.replace(/_/g, " ") : "the incumbent";
}

/**
 * "Chance the model's mean beats the best measured" or, when minimizing, "... goes below ...": the engine's
 * p_improve is P(latent mean beyond the incumbent) under the GP posterior, not the chance a run measures better.
 */
export function chanceLabel(s: Pick<ImprovementStat, "maximize" | "incumbent_basis"> | null, goal: Goal): string {
  const max = s ? s.maximize !== false : goal !== "minimize";
  const basis = s?.incumbent_basis;
  const inc = basis && /reproducible|recipe_mean/.test(basis) ? "the best reproducible recipe" : "the best measured";
  return `Chance the model's mean ${max ? "beats" : "goes below"} ${inc}`;
}

// --- Formatting (through lib/num only) ----------------------------------------

export const rowInterval = (r: Pick<BatchStripRow, "lo" | "hi">, coverage: number | null): IntervalSpec | null =>
  finite(r.lo) && finite(r.hi) ? { lo: r.lo, hi: r.hi, coverage, method: "conformal" } : null;

/** "1.61 [1.39, 1.84] 90%": the prediction at the precision its band supports. */
export function predFormatted(r: BatchStripRow, m: Pick<BatchStripModel, "coverage" | "unit">): Formatted {
  return formatValue(r.pred, { basis: "predicted", unit: m.unit, interval: rowInterval(r, m.coverage) });
}

/**
 * Predicted gain over the incumbent in the goal direction, with the band
 * shifted by the same amount (exact arithmetic, VIZ_SPEC 2.5). Null without an incumbent.
 */
export function gainFormatted(r: BatchStripRow, m: Pick<BatchStripModel, "coverage" | "unit" | "incumbent"> & { goal?: Goal }): Formatted | null {
  if (!m.incumbent) return null;
  const goal = m.goal ?? "maximize";
  const g = goalGain(r.pred, m.incumbent.value, goal);
  const b = finite(r.lo) && finite(r.hi) ? gainBand(r.lo, r.hi, m.incumbent.value, goal) : null;
  const iv = b ? { lo: b[0], hi: b[1], coverage: m.coverage, method: "conformal" as const } : null;
  return formatValue(g, { basis: "predicted", unit: m.unit, interval: iv, sign: true });
}

/** "Predicted gain" or, when minimizing, "Predicted gain (best − predicted)": names the arithmetic. */
export const gainLabel = (goal: Goal): string => (goal === "minimize" ? "Predicted gain (best − predicted, lower is better)" : "Predicted gain");

/** The model sigma as text, for when there is no held-out band: never turned into an interval. */
export const sigmaText = (r: BatchStripRow, unit: string | null): string => `σ ${formatValue(r.sigma, { unit }).text} (model, not checked on held-out runs)`;

export function measuredFormatted(r: BatchStripRow, unit: string | null): Formatted | null {
  return r.run && finite(r.run.result) ? formatValue(r.run.result, { basis: "measured", unit }) : null;
}

export const feasibilityText = (f: FeasibilityCell): string => (f.state === "value" ? formatProb(f.p).text : "n/a");

/** Why a row has no band, in a short phrase: "95% band refused: <reason>" or the none reason. */
export function bandStateText(r: Pick<BatchStripRow, "interval">): string | null {
  const b = r.interval;
  if (b.kind === "value") return null;
  if (b.kind === "refused") return `${coverageText(b.coverage) ?? ""} band refused: ${b.reason}`.trim();
  return b.reason;
}

/** The model's expected improvement: "0.328 g/L" (model-based). */
export const eiText = (r: Pick<BatchStripRow, "ei">, unit: string | null): string => (r.ei && finite(r.ei.value) ? formatValue(r.ei.value, { basis: "predicted", unit }).text : "n/a");

/** The model's chance to beat the incumbent: ">99%" (model-based). */
export const chanceText = (r: Pick<BatchStripRow, "pImprove">): string => (r.pImprove && finite(r.pImprove.value) ? formatProb(r.pImprove.value).text : "n/a");

/** The incumbent the engine compared EI / p_improve against: "best measured run 1.42 g/L". */
export function improvementIncumbent(s: ImprovementStat | null, unit: string | null): string | null {
  if (!s) return null;
  const v = finite(s.incumbent) ? ` ${formatValue(s.incumbent, { basis: "measured", unit }).text}` : "";
  return `${incumbentBasisText(s.incumbent_basis)}${v}`;
}

/** "p05 1.63 · p25 1.70 · p50 1.75 · p75 1.80 · p95 1.87" at one shared precision (model-based). */
export function quantilesText(q: ProposalQuantiles | null, unit: string | null): string | null {
  if (!q) return null;
  const keys = ["p05", "p25", "p50", "p75", "p95"] as const;
  const vals = keys.map((k) => q[k]);
  if (!vals.every(finite)) return null;
  const spread = Math.min(vals[2] - vals[1], vals[3] - vals[2]);
  const decimals = formatValue(vals[2], { uncertainty: spread > 0 ? spread : null }).decimals;
  const body = keys.map((k, i) => `${k} ${formatValue(vals[i], { decimals }).value}`).join(" · ");
  return unit ? `${body} ${unit}` : body;
}

/** "0.60" and, with the engine's median spacing, "0.81× typical spacing" (an exact ratio; no verdict). */
export function distanceText(d: number | null, median: number | null): { value: string; ratio: string | null } {
  if (!finite(d)) return { value: "n/a", ratio: null };
  if (d === 0) return { value: "0", ratio: "a measured recipe" };
  const value = formatValue(d, { fallbackSigFigs: 2 }).value;
  return { value, ratio: finite(median) && median > 0 ? `${formatValue(d / median, { quantity: "ratio" }).text} typical spacing` : null };
}

/** How the distance is measured, for a tooltip or disclosure. */
export const DISTANCE_METHOD =
  "Distance from the recipe to the nearest measured run: each input scaled by its design-box width, plus 1 for each categorical input at a different level, combined as a Euclidean distance. 0 means a recipe that was measured.";

// --- Description and data table -------------------------------------------------

export function describeBatchStrip(m: BatchStripModel): string {
  if (m.rows.length === 0) return `The engine proposed no recipes for ${m.target}.`;
  const n = m.rows.length;
  const refused = levelRefusal(m);
  const bandPart = refused
    ? `, no band: the engine refused the ${coverageText(refused.coverage)} level`
    : hasBandMode(m)
      ? ` with the ${bandName(m)}`
      : ", no interval reported";
  const head = `Proposed batch of ${n} ${n === 1 ? "recipe" : "recipes"}, predicted ${m.target}${m.unit ? ` (${m.unit})` : ""}${bandPart}, in the engine's order:`;
  const rows = m.rows.map((r) => {
    const f = predFormatted(r, m);
    const measured = measuredFormatted(r, m.unit);
    const tail = measured ? `, measured ${measured.text}${r.band ? ` (${r.band} the band recorded at start)` : ""}` : r.run?.awaiting ? ", awaiting result" : "";
    return `${r.key} ${r.mode}${r.trust?.kind === "exploration" ? ` (${r.trust.label})` : ""} ${f.value}${f.interval ? ` ${f.interval}` : ""}${tail}`;
  });
  const better = m.goal === "minimize" ? "below" : "above";
  const inc = m.incumbent
    ? ` ${m.incumbent.label[0].toUpperCase()}${m.incumbent.label.slice(1)} ${formatValue(m.incumbent.value, { basis: "measured", unit: m.unit }).text}; ${m.rows.filter((r) => beats(r.pred, m.incumbent!.value, m.goal)).length} of ${n} predicted ${better} it.`
    : " No incumbent to compare with.";
  const caveat = m.caveats.length ? ` ${m.caveats.map((c) => c.text).join(" ")}` : "";
  return `${head} ${rows.join("; ")}.${inc}${caveat}`;
}

export function batchStripTable(m: BatchStripModel): { columns: string[]; rows: string[][] } {
  const u = m.unit ? ` (${m.unit})` : "";
  const per = m.intervals.kind === "per-proposal";
  const chance = chanceLabel(m.rows.find((r) => r.pImprove)?.pImprove ?? null, m.goal);
  const columns = [
    "Proposal",
    "Mode",
    ...(m.rows.some((r) => r.trust) ? ["Model trust"] : []),
    `Predicted${u}`,
    hasBandMode(m) ? bandName(m) : "Band",
    `Model σ${u}`,
    m.incumbent ? `${gainLabel(m.goal)} vs ${m.incumbent.label}${u}` : gainLabel(m.goal),
    "Gain band",
    "P(feasible)",
    ...(m.hasImprovement ? [`Expected improvement${u}, model-based`, `${chance}, model-based`] : []),
    ...(per ? [`Quantiles p05 to p95${u}, model-based`] : []),
    ...(m.rows.some((r) => r.nnDistance != null) ? ["Distance to nearest measured run"] : []),
    ...(m.caveat ? ["Band caveat"] : []),
    ...(m.hasRuns ? [`Measured${u}`, "Inside the band recorded at start"] : []),
  ];
  const rows = m.rows.map((r) => {
    const p = formatValue(r.pred, { interval: rowInterval(r, m.coverage) });
    const g = gainFormatted(r, m);
    const measured = measuredFormatted(r, null);
    const dist = distanceText(r.nnDistance, m.nnMedian);
    return [
      r.key,
      r.mode,
      ...(m.rows.some((x) => x.trust) ? [r.trust?.label ?? "n/a"] : []),
      p.value,
      p.interval ?? (r.interval.kind === "refused" ? `Refused (${r.interval.reason})` : "n/a (no band reported)"),
      formatValue(r.sigma).value,
      g ? g.value : "n/a",
      g?.interval ?? "n/a",
      r.feasibility.state === "value" ? feasibilityText(r.feasibility) : `n/a (${r.feasibility.reason})`,
      ...(m.hasImprovement ? [eiText(r, null), chanceText(r)] : []),
      ...(per ? [quantilesText(r.quantiles, null) ?? "n/a"] : []),
      ...(m.rows.some((x) => x.nnDistance != null) ? [dist.ratio ? `${dist.value} (${dist.ratio})` : dist.value] : []),
      ...(m.caveat ? [r.caveat?.text ?? "n/a (no band)"] : []),
      ...(m.hasRuns ? [measured ? measured.value : r.run ? "Awaiting result" : "not started", r.band ?? (r.bandNa ? `n/a (${r.bandNa})` : "n/a")] : []),
    ];
  });
  return { columns, rows };
}
