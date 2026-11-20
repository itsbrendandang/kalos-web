/*
 * Clone / strain adapters (STRAIN_VIEWS SV-G1, SV-G4, SV-G5; engine docs/CLONES.md).
 * Pure: engine `strain_summary` -> chart and table props, Data tables and descriptions.
 *
 * Clones are opaque labels. Every number here is an engine field: per-clone
 * measured means with their 95% t-interval (only when n >= 3), the derived
 * process-adjusted effect, and the GP's predicted value at one reference
 * process. Nothing is ranked, averaged or re-computed in the browser; rows keep
 * the engine's label order. Colour classes are equal-width over each column's
 * extent of the engine's intervals (lowest lower bound to highest upper bound of
 * the coloured cells), per VIZ_SPEC_V2 2.7: two clones whose means differ by
 * less than their intervals land in the same or a neighbouring class, so the
 * shade never overstates a difference the data cannot resolve.
 */
import type { DataTable } from "@/components/viz/frame";
import type { AnalyzeResult, CloneAdjustedEffect, CloneGpAtReference, CloneLevel, CloneOutcome, EngineRefusalEntry, StrainSummary } from "@/lib/api";
import { columnDecimals, coverageText, formatSetting, formatValue } from "@/lib/num";
import { classOf, equalEdges, extentOf } from "@/lib/viz-data/heat";

/** Below this many runs the engine reports no interval and the cell carries no colour (engine `MIN_RUNS_CI`, `ci_reason: "n<3"`). */
export const CLONE_MIN_RUNS = 3;

type Available = Extract<StrainSummary, { available: true }>;

export const isAvailable = (s: StrainSummary | null | undefined): s is Available => !!s && s.available === true && Array.isArray(s.levels);

/* ---------------------------------------------------------------- chip (SV-G5) */

export type CloneGlyph = { label: string; color: string | null; shape: "circle" | "square" | "triangle" | "diamond" | null };

const SHAPES: NonNullable<CloneGlyph["shape"]>[] = ["circle", "square", "triangle", "diamond"];

/**
 * Category marks for up to 8 clones (Okabe-Ito --chart-1..6, then two neutral
 * shapes); beyond 8 a text chip only (no hue). Shape varies with colour so the
 * chips also read in greyscale. Fill/hollow, never hue, carries measured vs proposed.
 */
export function cloneGlyphs(labels: readonly string[]): Map<string, CloneGlyph> {
  return new Map(
    labels.map((label, i) => [
      label,
      i < 6
        ? { label, color: `var(--chart-${i + 1})`, shape: SHAPES[i % SHAPES.length] }
        : i < 8
          ? { label, color: "var(--fg-muted)", shape: SHAPES[(i + 1) % SHAPES.length] }
          : { label, color: null, shape: null },
    ]),
  );
}

/** The clone column and the glyph for each label, or null when the analysis has no clone column. */
export type CloneKey = { column: string; glyphs: Map<string, CloneGlyph>; fixedLevel: string | null; policy: string | null };

export function cloneKeyOf(d: Pick<AnalyzeResult, "strain_summary"> | null | undefined): CloneKey | null {
  const s = d?.strain_summary;
  if (!isAvailable(s) || !s.column) return null;
  return { column: s.column, glyphs: cloneGlyphs(s.levels.map((l) => l.label)), fixedLevel: s.fixed_level ?? null, policy: s.policy ?? null };
}

/** The clone label of a recipe (run or proposal), or null when the recipe does not name one. */
export function cloneOfRecipe(recipe: Record<string, unknown> | null | undefined, key: CloneKey | null): string | null {
  if (!key || !recipe) return null;
  const v = recipe[key.column];
  if (v == null || v === "") return null;
  return String(v);
}

/* ------------------------------------------------------- clone x outcome (SV-G1) */

export type OutcomeCell = {
  level: string;
  outcome: string;
  n: number;
  mean: number | null;
  ci: [number, number] | null;
  coverage: number | null;
  /** 1..5, or null when the cell carries no colour (n < 3, no mean, or no interval). */
  cls: number | null;
  /** Why the cell carries no colour, in the engine's words when it gave them. */
  reason: string | null;
  /** Printed text: "3.40 [3.00, 3.80]", or the state. */
  text: string;
  best: number | null;
  bestRunId: string | null;
  sd: number | null;
  byScale: string[] | null;
};

export type OutcomeColumn = { key: string; unit: string | null; direction: string | null; isTarget: boolean; edges: number[]; decimals: number };

export type CloneOutcomeGrid = {
  column: string;
  levels: { label: string; nRuns: number; flags: string[]; isReference: boolean; isFixed: boolean }[];
  columns: OutcomeColumn[];
  cells: OutcomeCell[][];
  /** Coverage of the measured intervals as the engine reported it (0.95), or null. */
  coverage: number | null;
  /** One sentence when the clones ran at different conditions or are confounded; null otherwise. */
  caveat: string | null;
  refusals: EngineRefusalEntry[];
  source: string | null;
};

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function outcomeKeys(s: Available): string[] {
  const seen: string[] = [];
  for (const l of s.levels) for (const k of Object.keys(l.outcomes ?? {})) if (!seen.includes(k)) seen.push(k);
  const t = s.target;
  return t && seen.includes(t) ? [t, ...seen.filter((k) => k !== t)] : seen;
}

function cellReason(o: CloneOutcome | undefined): string | null {
  if (!o) return "no runs of this clone recorded this outcome";
  if (o.n_runs < CLONE_MIN_RUNS) return `n = ${o.n_runs}: fewer than ${CLONE_MIN_RUNS} runs, so no interval and no colour`;
  if (o.ci_reason && o.ci_reason.startsWith("scales_mixed")) return "split by scale: the engine never pools runs across scales";
  if (finite(o.mean) == null) return o.ci_reason ?? "the engine reported no mean";
  if (!o.ci95) return o.ci_reason ? `no interval (${o.ci_reason})` : "no interval";
  return null;
}

export function toCloneOutcomeGrid(s: StrainSummary | null | undefined): CloneOutcomeGrid | null {
  if (!isAvailable(s) || s.levels.length === 0) return null;
  const keys = outcomeKeys(s);
  const columns: OutcomeColumn[] = keys.map((k) => {
    const colored = s.levels.map((l) => l.outcomes?.[k]).filter((o): o is CloneOutcome => !!o && cellReason(o) == null);
    const ext = extentOf(colored.flatMap((o) => [o.mean, o.ci95?.[0], o.ci95?.[1]]));
    const decimals = columnDecimals(
      colored.map((o) => ({ value: o.mean as number, u: o.ci95 ? Math.min((o.mean as number) - o.ci95[0], o.ci95[1] - (o.mean as number)) : null })),
    );
    return {
      key: k,
      unit: s.outcome_units?.[k] ?? null,
      direction: s.outcome_direction?.[k] ?? null,
      isTarget: k === s.target,
      edges: ext ? equalEdges(ext[0], ext[1]) : [],
      decimals,
    };
  });
  const covs = new Set<number>();
  const cells = s.levels.map((l) =>
    columns.map((c): OutcomeCell => {
      const o = l.outcomes?.[c.key];
      const reason = cellReason(o);
      const mean = finite(o?.mean);
      const ci = o?.ci95 && finite(o.ci95[0]) != null && finite(o.ci95[1]) != null ? ([o.ci95[0], o.ci95[1]] as [number, number]) : null;
      if (ci && finite(o?.coverage) != null) covs.add(o!.coverage as number);
      const coverage = finite(o?.coverage);
      const text =
        reason == null && mean != null && ci
          ? `${fmt(mean, c.decimals)} [${fmt(ci[0], c.decimals)}, ${fmt(ci[1], c.decimals)}]`
          : mean != null && (o?.n_runs ?? 0) > 0 && !(o?.ci_reason ?? "").startsWith("scales_mixed")
            ? fmt(mean, c.decimals)
            : "n/a";
      return {
        level: l.label,
        outcome: c.key,
        n: o?.n_runs ?? 0,
        mean,
        ci,
        coverage,
        cls: reason == null ? classOf(mean, c.edges) : null,
        reason,
        text,
        best: finite(o?.best),
        bestRunId: o?.best_run_id ?? null,
        sd: finite(o?.sd),
        byScale: o?.by_scale ? Object.keys(o.by_scale) : null,
      };
    }),
  );
  return {
    column: s.column,
    levels: s.levels.map((l) => ({ label: l.label, nRuns: l.n_runs, flags: l.flags ?? [], isReference: l.label === s.reference_level, isFixed: l.label === s.fixed_level })),
    columns,
    cells,
    coverage: covs.size === 1 ? [...covs][0] : null,
    caveat: cloneCaveat(s),
    refusals: s.refusals ?? [],
    source: s.source ?? null,
  };
}

/** A measured mean at the column's shared decimals (precision from the narrowest interval in the column). */
const fmt = (v: number, decimals: number) => formatValue(v, { decimals }).value;

/** The raw-means caveat (STRAIN_VIEWS G1 banner), from the engine's flags only. */
export function cloneCaveat(s: Available): string | null {
  const imbalance = new Set<string>();
  const confounded = new Set<string>();
  for (const l of s.levels)
    for (const f of l.flags ?? []) {
      if (f.startsWith("clone_process_imbalance:")) imbalance.add(f.slice("clone_process_imbalance:".length));
      if (f.startsWith("clone_confounded_with:")) confounded.add(f.slice("clone_confounded_with:".length));
    }
  const parts: string[] = [];
  if (imbalance.size || s.process_balance?.flag) parts.push(`clones ran at different process conditions${imbalance.size ? ` (${[...imbalance].join(", ")})` : ""}`);
  if (confounded.size) parts.push(`some clones cannot be separated from ${[...confounded].join(", ")}`);
  if (!parts.length) return null;
  return `Raw means: ${parts.join("; ")}. The process-adjusted effects are in the clone comparison on Predict.`;
}

export function describeCloneOutcome(g: CloneOutcomeGrid): string {
  const cov = coverageText(g.coverage);
  const thin = g.cells.flat().filter((c) => c.n > 0 && c.n < CLONE_MIN_RUNS).length;
  return (
    `Measured mean of ${g.columns.length} outcome${g.columns.length === 1 ? "" : "s"} for ${g.levels.length} clone${g.levels.length === 1 ? "" : "s"} of ${g.column}` +
    `${cov ? `, with the ${cov} interval` : ""} and the run count in every cell.` +
    (thin ? ` ${thin} cell${thin === 1 ? " has" : "s have"} fewer than ${CLONE_MIN_RUNS} runs and carr${thin === 1 ? "ies" : "y"} no colour.` : "")
  );
}

export function cloneOutcomeTable(g: CloneOutcomeGrid): DataTable {
  return {
    caption: "Measured mean [interval] and n per clone and outcome, as the engine computed them",
    columns: ["Clone", ...g.columns.flatMap((c) => [`${c.key}${c.unit ? ` (${c.unit})` : ""}`, `${c.key} n`])],
    rows: g.levels.map((l, i) => [l.label, ...g.cells[i].flatMap((c) => [c.reason && c.text !== "n/a" ? `${c.text} (${c.reason})` : c.text, c.n])]),
  };
}

/* ------------------------------------------------------- comparison table (SV-G4) */

export type CloneRow = {
  label: string;
  isReference: boolean;
  isFixed: boolean;
  nRuns: number;
  nRecipes: number | null;
  rounds: string[] | null;
  measured: CloneOutcome | null;
  adjusted: CloneAdjustedEffect | null;
  predicted: CloneGpAtReference | null;
  covariates: { name: string; text: string }[];
  flags: string[];
  oofCoverage: CloneLevel["oof_coverage"];
};

export type CloneComparison = {
  column: string;
  target: string;
  unit: string | null;
  reference: string | null;
  rows: CloneRow[];
  /** Shared x domain for the adjusted-effect interval bars (extent of the engine intervals and 0). */
  effectDomain: [number, number] | null;
  adjustedNote: string | null;
  policyNote: string | null;
  /** The reference settings the prediction column was evaluated at, as engine values. */
  referenceAt: Record<string, number | string | null> | null;
  loco: Available["leave_one_clone_out"] | null;
  refusals: EngineRefusalEntry[];
};

export function toCloneComparison(s: StrainSummary | null | undefined): CloneComparison | null {
  if (!isAvailable(s) || s.levels.length === 0) return null;
  const target = s.target ?? outcomeKeys(s)[0] ?? "";
  const rows = s.levels.map(
    (l): CloneRow => ({
      label: l.label,
      isReference: l.label === s.reference_level,
      isFixed: l.label === s.fixed_level,
      nRuns: l.n_runs,
      nRecipes: l.n_recipes ?? null,
      rounds: l.rounds ?? null,
      measured: l.outcomes?.[target] ?? null,
      adjusted: l.adjusted_effect ?? null,
      predicted: l.gp_at_reference ?? null,
      covariates: Object.entries(l.covariates ?? {}).map(([name, c]) => ({
        name,
        text:
          c.min != null && c.max != null
            ? Number.isInteger(c.min) && Number.isInteger(c.max)
              ? `${formatValue(c.min, { quantity: "count" }).text}–${formatValue(c.max, { quantity: "count" }).text}`
              : `${formatSetting(c.min, [c.min, c.max]).text}–${formatSetting(c.max, [c.min, c.max]).text}`
            : c.n_distinct != null
              ? `${formatValue(c.n_distinct, { quantity: "count" }).text} distinct`
              : "n/a",
      })),
      flags: l.flags ?? [],
      oofCoverage: l.oof_coverage ?? null,
    }),
  );
  const ext = extentOf(rows.flatMap((r) => (r.adjusted?.ci95 ? [r.adjusted.ci95[0], r.adjusted.ci95[1]] : [])).concat([0]));
  const referenceAt = s.levels.map((l) => l.gp_at_reference?.at).find((a) => a && Object.keys(a).length > 0) ?? null;
  const policyNote =
    s.policy === "fixed" && s.fixed_level
      ? `All proposals use ${s.fixed_level} (fixed${s.fixed_level_source ? `, from ${SOURCE_WORD[s.fixed_level_source] ?? s.fixed_level_source}` : ""}).${s.fixed_level_note ? ` ${s.fixed_level_note}.` : ""}`
      : s.policy === "factor"
        ? `The proposals may choose among the clones (policy factor${s.source === "detected" ? `; ${s.column} was detected by name, not declared` : ""}).`
        : null;
  return {
    column: s.column,
    target,
    unit: s.outcome_units?.[target] ?? null,
    reference: s.reference_level ?? null,
    rows,
    effectDomain: ext && ext[1] > ext[0] ? ext : null,
    adjustedNote: s.adjusted_note ?? null,
    policyNote,
    referenceAt,
    loco: s.leave_one_clone_out ?? null,
    refusals: s.refusals ?? [],
  };
}

const SOURCE_WORD: Record<string, string> = {
  setup: "the campaign setup",
  declared: "the roles you declared",
  registry_lead: "the clone registry's lead",
  most_runs: "the clone with the most runs",
};

/** Plain words for the engine's per-clone flags (the raw flag stays in the tooltip). */
export function flagText(flag: string): string {
  if (flag === "clone_too_few_runs") return `fewer than ${CLONE_MIN_RUNS} runs`;
  if (flag === "mostly_pooled") return "mostly pooled (data weight below 0.5)";
  if (flag === "clone_effect_methods_disagree") return "adjusted and predicted differences disagree in sign";
  if (flag.startsWith("clone_confounded_with:")) return `not separable from ${flag.split(":")[1]}`;
  if (flag.startsWith("clone_process_imbalance:")) return `ran at different ${flag.split(":")[1]}`;
  return flag;
}

/** "−0.52 [−0.90, −0.10]" at the interval's precision, or null. */
export function effectText(a: CloneAdjustedEffect | null | undefined): string | null {
  if (!a || a.estimate == null || !a.ci95) return null;
  const f = formatValue(a.estimate, { interval: { lo: a.ci95[0], hi: a.ci95[1], coverage: null, method: "bootstrap-ci" }, sign: true });
  return f.interval ? `${f.value} ${f.interval}` : f.value;
}

export function describeCloneComparison(c: CloneComparison): string {
  const withEffect = c.rows.filter((r) => r.adjusted?.estimate != null).length;
  return `Per-clone comparison for ${c.rows.length} clones of ${c.column}: measured ${c.target}, ${withEffect} process-adjusted effect${withEffect === 1 ? "" : "s"} relative to ${c.reference ?? "the reference clone"}, and the model's prediction at one reference process.`;
}

