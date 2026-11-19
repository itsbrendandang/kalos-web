/*
 * C2 BatchIntervalStrip adapter (VIZ_SPEC 5, C2): the engine's proposed batch
 * as forest rows against the incumbent. Pure, no React.
 *
 * Every number is an engine field or exact arithmetic on engine fields:
 * the band is `pred +/- conformal_q` at `conformal_coverage` (never built from
 * the model sigma), the predicted gain is `pred - incumbent` with the band
 * shifted by the same amount, `p_feasible` is shown only when the engine
 * gated the batch on it, and a measured result comes from a started run whose
 * recipe is exactly the proposal's. Rows stay in the engine's order.
 */
import type { AnalyzeResult, CampaignRun, Proposal } from "@/lib/api";
import { incumbentLabel, proposalIncumbent, proposalRecipe } from "@/lib/api";
import { atRangeEdge, conformalInterval, coverageText, formatProb, formatValue, type Formatted, type IntervalSpec } from "@/lib/num";

export type FeasibilityCell = { state: "value"; p: number } | { state: "na"; reason: string; detail?: string };

export type BatchStripRun = { id: string; result: number | null; awaiting: boolean };

export type BatchStripRow = {
  /** "P1": the id the table, the comparison and the setpoint matrix use. */
  key: string;
  /** 1-based position in the engine's order. */
  n: number;
  /** Index in the engine's `proposals`. */
  index: number;
  mode: "explore" | "exploit";
  pred: number;
  lo: number | null;
  hi: number | null;
  sigma: number;
  feasibility: FeasibilityCell;
  /** A started run with exactly this recipe, if any. */
  run: BatchStripRun | null;
  /** Exact count: is the measured result inside [lo, hi]? Null without a result or a band. */
  band: "inside" | "outside" | null;
  /** Inputs within 1% of an end of the engine's `feature_ranges`. */
  edge: string[];
  flags: ("edge" | "outside-band")[];
};

export type BatchStripModel = {
  target: string;
  unit: string | null;
  rows: BatchStripRow[];
  incumbent: { value: number; label: string } | null;
  coverage: number | null;
  halfWidth: number | null;
  gating: "gated" | "ungated" | "absent";
  gatingReason: string | null;
  hasRuns: boolean;
  domain: [number, number] | null;
};

type StripAnalysis = Pick<AnalyzeResult, "proposals" | "proposal_features" | "conformal_q" | "conformal_coverage" | "best" | "noise" | "feature_ranges" | "proposal_gating">;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Exact recipe equality: same inputs, same values (numbers or categorical labels). */
export function sameRecipe(a: Record<string, number | string>, b: Record<string, number | string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => k in b && a[k] === b[k]);
}

/** The started run for a proposal's recipe: one with a result first, else one awaiting. */
export function matchRun(recipe: Record<string, number | string>, runs: readonly CampaignRun[]): BatchStripRun | null {
  const same = runs.filter((r) => sameRecipe(recipe, r.recipe as Record<string, number | string>));
  const pick = same.find((r) => finite(r.result)) ?? same[0];
  return pick ? { id: pick.id, result: finite(pick.result) ? pick.result : null, awaiting: pick.awaiting } : null;
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

export function toBatchStripModel(
  d: StripAnalysis,
  opts: { target: string; unit: string | null; runs?: readonly CampaignRun[] },
): BatchStripModel {
  const inc = proposalIncumbent(d);
  const halfWidth = finite(d.conformal_q) && d.conformal_q > 0 ? d.conformal_q : null;
  const coverage = finite(d.conformal_coverage) ? d.conformal_coverage : null;
  const runs = opts.runs ?? [];
  const ranges = d.feature_ranges ?? {};
  const rows: BatchStripRow[] = (d.proposals ?? []).map((p, index) => {
    const recipe = proposalRecipe(p, d.proposal_features ?? []) as Record<string, number | string>;
    const iv = conformalInterval(p.pred, halfWidth, coverage);
    const run = runs.length ? matchRun(recipe, runs) : null;
    const band = run && finite(run.result) && iv ? (run.result >= iv.lo && run.result <= iv.hi ? "inside" : "outside") : null;
    const edge = Object.entries(recipe)
      .filter(([k, v]) => finite(v) && Array.isArray(ranges[k]) && atRangeEdge(v, ranges[k]))
      .map(([k]) => k);
    const flags: BatchStripRow["flags"] = [];
    if (edge.length) flags.push("edge");
    if (band === "outside") flags.push("outside-band");
    return {
      key: `P${index + 1}`,
      n: index + 1,
      index,
      mode: p.mode,
      pred: p.pred,
      lo: iv?.lo ?? null,
      hi: iv?.hi ?? null,
      sigma: p.std,
      feasibility: feasibility(p, d.proposal_gating),
      run,
      band,
      edge,
      flags,
    };
  });
  return {
    target: opts.target,
    unit: opts.unit,
    rows,
    incumbent: finite(inc) ? { value: inc, label: incumbentLabel(d) } : null,
    coverage,
    halfWidth,
    gating: d.proposal_gating ? (d.proposal_gating.gated ? "gated" : "ungated") : "absent",
    gatingReason: d.proposal_gating?.reason ?? null,
    hasRuns: rows.some((r) => r.run != null),
    domain: stripDomain(rows, finite(inc) ? inc : null),
  };
}

// --- Formatting (through lib/num only) ----------------------------------------

export const rowInterval = (r: Pick<BatchStripRow, "lo" | "hi">, coverage: number | null): IntervalSpec | null =>
  finite(r.lo) && finite(r.hi) ? { lo: r.lo, hi: r.hi, coverage, method: "conformal" } : null;

/** "1.61 [1.39, 1.84] 90%": the prediction at the precision its band supports. */
export function predFormatted(r: BatchStripRow, m: Pick<BatchStripModel, "coverage" | "unit">): Formatted {
  return formatValue(r.pred, { basis: "predicted", unit: m.unit, interval: rowInterval(r, m.coverage) });
}

/**
 * Predicted gain over the incumbent: `pred - incumbent`, with the band shifted
 * by the same amount (exact arithmetic, VIZ_SPEC 2.5). Null without an incumbent.
 */
export function gainFormatted(r: BatchStripRow, m: Pick<BatchStripModel, "coverage" | "unit" | "incumbent" | "halfWidth">): Formatted | null {
  if (!m.incumbent) return null;
  const g = r.pred - m.incumbent.value;
  const iv = finite(r.lo) && finite(r.hi) ? { lo: r.lo - m.incumbent.value, hi: r.hi - m.incumbent.value, coverage: m.coverage, method: "conformal" as const } : null;
  return formatValue(g, { basis: "predicted", unit: m.unit, interval: iv, sign: true });
}

/** The model sigma as text, for when there is no held-out band: never turned into an interval. */
export const sigmaText = (r: BatchStripRow, unit: string | null): string => `σ ${formatValue(r.sigma, { unit }).text} (model, not held-out calibrated)`;

export function measuredFormatted(r: BatchStripRow, unit: string | null): Formatted | null {
  return r.run && finite(r.run.result) ? formatValue(r.run.result, { basis: "measured", unit }) : null;
}

export const feasibilityText = (f: FeasibilityCell): string => (f.state === "value" ? formatProb(f.p).text : "n/a");

/** "90% held-out band" from the engine's coverage, or "held-out band" when it said none. */
export const coverageLabel = (coverage: number | null): string => {
  const c = coverageText(coverage);
  return c ? `${c} held-out band` : "held-out band";
};

// --- Description and data table -------------------------------------------------

export function describeBatchStrip(m: BatchStripModel): string {
  if (m.rows.length === 0) return `The engine proposed no recipes for ${m.target}.`;
  const n = m.rows.length;
  const head = `Proposed batch of ${n} ${n === 1 ? "recipe" : "recipes"}, predicted ${m.target}${m.unit ? ` (${m.unit})` : ""}${m.halfWidth != null ? ` with the ${coverageLabel(m.coverage)}` : ", no interval reported"}, in the engine's order:`;
  const rows = m.rows.map((r) => {
    const f = predFormatted(r, m);
    const measured = measuredFormatted(r, m.unit);
    const tail = measured ? `, measured ${measured.text}${r.band ? ` (${r.band} band)` : ""}` : r.run?.awaiting ? ", awaiting result" : "";
    return `${r.key} ${r.mode} ${f.value}${f.interval ? ` ${f.interval}` : ""}${tail}`;
  });
  const inc = m.incumbent
    ? ` ${m.incumbent.label[0].toUpperCase()}${m.incumbent.label.slice(1)} ${formatValue(m.incumbent.value, { basis: "measured", unit: m.unit }).text}; ${m.rows.filter((r) => r.pred > m.incumbent!.value).length} of ${n} predicted above it.`
    : " No incumbent to compare with.";
  return `${head} ${rows.join("; ")}.${inc}`;
}

export function batchStripTable(m: BatchStripModel): { columns: string[]; rows: string[][] } {
  const u = m.unit ? ` (${m.unit})` : "";
  const columns = [
    "Proposal",
    "Mode",
    `Predicted${u}`,
    m.halfWidth != null ? coverageLabel(m.coverage) : "Band",
    `Model σ${u}`,
    m.incumbent ? `Predicted gain vs ${m.incumbent.label}${u}` : "Predicted gain",
    "Gain band",
    "P(feasible)",
    ...(m.hasRuns ? [`Measured${u}`, "Inside band"] : []),
  ];
  const rows = m.rows.map((r) => {
    const p = formatValue(r.pred, { interval: rowInterval(r, m.coverage) });
    const g = gainFormatted(r, m);
    const measured = measuredFormatted(r, null);
    return [
      r.key,
      r.mode,
      p.value,
      p.interval ?? "n/a (no band reported)",
      formatValue(r.sigma).value,
      g ? g.value : "n/a",
      g?.interval ?? "n/a",
      r.feasibility.state === "value" ? feasibilityText(r.feasibility) : `n/a (${r.feasibility.reason})`,
      ...(m.hasRuns ? [measured ? measured.value : r.run ? "Awaiting result" : "not started", r.band ?? "n/a"] : []),
    ];
  });
  return { columns, rows };
}
