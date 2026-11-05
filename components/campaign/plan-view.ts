/*
 * Pure rules behind the Plan page: observed input ranges, boundary checks,
 * per-recipe checks, the comparison diff, uncertainty display and the batch
 * diversity summary. Nothing here invents a number: every value is either an
 * engine field or computed from rows the engine returned (the observed runs in
 * `response_surface.runs`). When a field is absent the helper returns null or
 * an empty list and the page says nothing (or says it was not reported).
 * Tested in __tests__/plan-view.test.ts.
 */

import { LOW_FEASIBILITY } from "@/components/campaign/plan-batch";
import type { ConstraintReport, DataDrops, PopulatedResult, Proposal, RunRecord } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { engineMessage } from "@/lib/engine-error";

// --- Engine fields newer than lib/api.ts (kalos-engine PR #87) ---------------
// Typed here, optional, so the page degrades on engines that do not send them.

/** `batch_diversity`: how distinct the proposed batch is. */
export type BatchDiversity = {
  requested: number;
  returned: number;
  near_duplicates_replaced: number;
  /** Minimum pairwise separation, as a fraction of an input's search range. */
  min_separation: number;
  metric?: string;
};

/** `proposal_notice`: why the batch came back shorter than requested. Null when it did not. */
export type ProposalNotice = {
  code: string;
  requested?: number;
  returned?: number;
  min_separation?: number;
  message?: string;
};

export type PlanAnalysis = PopulatedResult & {
  batch_diversity?: BatchDiversity | null;
  proposal_notice?: ProposalNotice | null;
};

/** Recipes are typed numeric, but the engine decodes categorical inputs to their labels. */
export type SetpointValue = number | string;

// --- Observed ranges ---------------------------------------------------------

export type ObservedRange = {
  min: number;
  max: number;
  /** How many measured runs the range comes from; 0 for an engine-reported range. */
  n: number;
  /** "observed": min/max of measured runs the engine returned. "engine": the engine's own `feature_ranges`. */
  source: "observed" | "engine";
  /** Decimal places the sheet uses for this input (from the observed values), or null when unknown. */
  decimals: number | null;
};

/** Decimal places written in a number, capped at 4 so float noise never reads as precision. */
export function decimalsOf(v: number): number {
  if (!Number.isFinite(v)) return 0;
  for (let d = 0; d <= 4; d++) if (Math.abs(Math.round(v * 10 ** d) / 10 ** d - v) < 1e-9) return d;
  return 4;
}

/**
 * The range each input is checked against, from data the engine returned.
 * The engine's own `feature_ranges` win when present (it owns the search box);
 * otherwise the min/max of the measured runs in `response_surface.runs` (only
 * its two plotted inputs). Decimals always come from observed values when any
 * exist. An input with neither has no entry, so nothing is said about its edges.
 */
export function observedRanges(d: Pick<PopulatedResult, "response_surface" | "feature_ranges">): Record<string, ObservedRange> {
  const observed: Record<string, ObservedRange> = {};
  const rs = d.response_surface;
  if (rs && Array.isArray(rs.runs) && rs.runs.length > 0) {
    const cols: [string, number][] = [
      [rs.x_feature, 0],
      [rs.y_feature, 1],
    ];
    for (const [name, i] of cols) {
      const vals = rs.runs.map((r) => r[i]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (!name || vals.length === 0 || name in observed) continue;
      observed[name] = {
        min: Math.min(...vals),
        max: Math.max(...vals),
        n: vals.length,
        source: "observed",
        decimals: Math.max(...vals.map(decimalsOf)),
      };
    }
  }
  const out: Record<string, ObservedRange> = { ...observed };
  for (const [name, r] of Object.entries(d.feature_ranges ?? {})) {
    if (!Array.isArray(r) || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) continue;
    out[name] = { min: Math.min(r[0], r[1]), max: Math.max(r[0], r[1]), n: 0, source: "engine", decimals: observed[name]?.decimals ?? null };
  }
  return out;
}

// --- Boundary checks ----------------------------------------------------------

/** A setpoint within this fraction of the range width from either end counts as "at the edge". */
export const EDGE_FRACTION = 0.02;

export type BoundaryWhere = "below" | "at-min" | "inside" | "at-max" | "above";

export type BoundaryCheck = {
  input: string;
  value: number;
  range: ObservedRange;
  where: BoundaryWhere;
  /** Position in the range, 0 = min, 1 = max (can fall outside 0..1). Null for a zero-width range. */
  position: number | null;
};

/**
 * Where each numeric setpoint sits in its observed range. Only inputs with a
 * known range and a numeric value are checked; categorical labels and inputs
 * without a range are skipped (not guessed).
 */
export function boundaryChecks(
  recipe: Record<string, SetpointValue>,
  ranges: Record<string, ObservedRange>,
  fraction = EDGE_FRACTION,
): BoundaryCheck[] {
  const out: BoundaryCheck[] = [];
  for (const [input, value] of Object.entries(recipe)) {
    const range = ranges[input];
    if (!range || typeof value !== "number" || !Number.isFinite(value)) continue;
    const width = range.max - range.min;
    const tol = Math.max(width * fraction, 1e-9);
    let where: BoundaryWhere;
    if (value < range.min - 1e-9) where = "below";
    else if (value > range.max + 1e-9) where = "above";
    else if (width <= 0) where = "inside";
    else if (value - range.min <= tol) where = "at-min";
    else if (range.max - value <= tol) where = "at-max";
    else where = "inside";
    out.push({ input, value, range, where, position: width > 0 ? (value - range.min) / width : null });
  }
  return out;
}

// --- Per-recipe checks ---------------------------------------------------------

export type FlagKind = "negative" | "low-feasibility" | "constraint" | "outside-range" | "at-edge" | "gain-within-band";

export type RecipeFlag = {
  kind: FlagKind;
  /** Short chip text. */
  label: string;
  /** One plain sentence. */
  detail: string;
};

/** Most serious first. */
export const FLAG_ORDER: FlagKind[] = ["negative", "low-feasibility", "constraint", "outside-range", "at-edge", "gain-within-band"];

export type FlagContext = {
  incumbent: number | null;
  band: number | null;
  nonNegative: boolean;
  ranges: Record<string, ObservedRange>;
  constraint?: ConstraintReport | null;
};

const listNames = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);

/** Predicted value of the requested constraint column for one proposal, when the engine sent it. */
export function constraintPrediction(p: Proposal, constraint: ConstraintReport | null | undefined): { mean: number; std: number | null } | null {
  if (!constraint?.applied || !constraint.column) return null;
  const raw = (p as unknown as Record<string, unknown>)[`pred_${constraint.column}`];
  if (!raw || typeof raw !== "object") return null;
  const { mean, std } = raw as { mean?: unknown; std?: unknown };
  if (typeof mean !== "number" || !Number.isFinite(mean)) return null;
  return { mean, std: typeof std === "number" && Number.isFinite(std) ? std : null };
}

/**
 * Every check a recipe triggers, from engine fields and observed ranges only.
 * Unlike plan-batch's summary list (one flag per recipe, capped), this lists
 * all of them so the row and its details can show each one.
 */
export function recipeFlags(p: Proposal, recipe: Record<string, SetpointValue>, ctx: FlagContext): RecipeFlag[] {
  const flags: RecipeFlag[] = [];
  if (ctx.nonNegative && p.pred < 0) {
    flags.push({ kind: "negative", label: "Predicted below zero", detail: `Predicted at ${formatNumber(p.pred)}, below zero, but no measured value of this target is negative.` });
  }
  if (p.p_feasible != null && Number.isFinite(p.p_feasible) && p.p_feasible < LOW_FEASIBILITY) {
    flags.push({ kind: "low-feasibility", label: "Low engine-estimated feasibility", detail: `Engine-estimated feasibility is ${formatNumber(p.p_feasible, "pct")}, below ${formatNumber(LOW_FEASIBILITY, "pct")}.` });
  }
  const c = constraintPrediction(p, ctx.constraint);
  if (c && ctx.constraint?.floor != null && c.mean < ctx.constraint.floor) {
    flags.push({ kind: "constraint", label: `Below ${ctx.constraint.column} floor`, detail: `Predicted ${ctx.constraint.column} ${formatNumber(c.mean)} is below the requested floor of ${formatNumber(ctx.constraint.floor)}.` });
  }
  const bounds = boundaryChecks(recipe, ctx.ranges);
  const outside = bounds.filter((b) => b.where === "below" || b.where === "above").map((b) => b.input);
  const edge = bounds.filter((b) => b.where === "at-min" || b.where === "at-max").map((b) => b.input);
  if (outside.length) {
    flags.push({ kind: "outside-range", label: `Outside tried range: ${listNames(outside)}`, detail: `${listNames(outside)} ${outside.length === 1 ? "is" : "are"} outside the range tried so far, so the model is extrapolating.` });
  }
  if (edge.length) {
    flags.push({ kind: "at-edge", label: `At edge: ${listNames(edge)}`, detail: `${listNames(edge)} ${edge.length === 1 ? "sits" : "sit"} at the edge of the range tried so far, where the model has data on one side only.` });
  }
  const gain = ctx.incumbent == null ? null : p.pred - ctx.incumbent;
  if (gain != null && gain > 0 && ctx.band != null && ctx.band > gain) {
    flags.push({ kind: "gain-within-band", label: "Gain within band", detail: `Predicted to beat the best by ${formatGain(gain).replace(/^\+/, "")}, which is less than the prediction band's half-width of ±${formatNumber(ctx.band)}, so the band also reaches below the best.` });
  }
  return flags.sort((a, b) => FLAG_ORDER.indexOf(a.kind) - FLAG_ORDER.indexOf(b.kind));
}

/** The batch's checks grouped by kind, for the summary: "P1, P2: gain within band". */
export function groupFlags(rows: { rank: number; flags: RecipeFlag[] }[]): { kind: FlagKind; ranks: number[]; label: string }[] {
  const by = new Map<FlagKind, number[]>();
  for (const { rank, flags } of rows) for (const f of flags) by.set(f.kind, [...(by.get(f.kind) ?? []), rank]);
  const label: Record<FlagKind, string> = {
    negative: "predicted below zero for a target that is never negative",
    "low-feasibility": `engine-estimated feasibility below ${formatNumber(LOW_FEASIBILITY, "pct")}`,
    constraint: "predicted below the requested constraint floor",
    "outside-range": "an input outside the range tried so far",
    "at-edge": "an input at the edge of the range tried so far",
    "gain-within-band": "predicted gain smaller than the band's half-width",
  };
  return FLAG_ORDER.filter((k) => by.has(k)).map((kind) => ({ kind, ranks: by.get(kind)!, label: label[kind] }));
}

// --- Uncertainty -----------------------------------------------------------------

/**
 * The prediction interval `pred ± band`, only when the engine supplied a band
 * (`conformal_q`). Null otherwise: the page then shows no interval at all,
 * never one derived from the model SD.
 */
export function predictionInterval(pred: number, band: number | null | undefined): [number, number] | null {
  if (band == null || !Number.isFinite(band) || band < 0 || !Number.isFinite(pred)) return null;
  return [pred - band, pred + band];
}

/**
 * "90% held-out band" from the engine's coverage, or "held-out band" when it
 * did not say (never a guessed percentage). "Held-out" because the coverage
 * was measured on held-out measured runs; see BAND_CAVEAT.
 */
export function bandLabel(coverage: number | null | undefined): string {
  return coverage != null && Number.isFinite(coverage) ? `${formatNumber(coverage, "pct")} held-out band` : "held-out band";
}

/** Shown wherever the band is: its coverage is not a promise about new recipes. */
export const BAND_CAVEAT = "Coverage measured on held-out measured runs; not guaranteed for proposals.";

/** "47.38 to 55.04", or null when no band was supplied. */
export function formatInterval(pred: number, band: number | null | undefined): string | null {
  const iv = predictionInterval(pred, band);
  return iv ? `${formatNumber(iv[0])} to ${formatNumber(iv[1])}` : null;
}

/**
 * A shared axis for the batch's predicted-vs-best strips: every interval (or
 * point, without a band) and the best measured value fit, with 4% padding.
 */
export function stripDomain(preds: number[], band: number | null | undefined, best: number | null): [number, number] | null {
  const pts: number[] = [];
  for (const p of preds) {
    const iv = predictionInterval(p, band);
    if (iv) pts.push(iv[0], iv[1]);
    else if (Number.isFinite(p)) pts.push(p);
  }
  if (best != null && Number.isFinite(best)) pts.push(best);
  if (pts.length === 0) return null;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

// --- Formatting ------------------------------------------------------------------

/**
 * A signed predicted gain. Below 0.005 in size the 2-decimal format would read
 * "+0.00" or "0.00", which hides the sign and size, so up to 4 significant
 * figures are shown instead.
 */
export function formatGain(g: number | null | undefined): string {
  if (g == null || !Number.isFinite(g)) return "n/a";
  if (g === 0) return "0";
  if (Math.abs(g) < 0.005) {
    const s = Number(Math.abs(g).toPrecision(2)).toString();
    return `${g < 0 ? "-" : "+"}${s}`;
  }
  return formatNumber(g, "value", { sign: true });
}

/** The exact value sent to the engine for a setpoint, unrounded. */
export function exactSetpoint(v: SetpointValue | null | undefined): string {
  if (v == null) return "n/a";
  return typeof v === "number" ? (Number.isFinite(v) ? String(v) : "n/a") : v;
}

/**
 * A setpoint at the sheet's precision when known (the observed values' decimal
 * places), else the app's 2-decimal value format. Labels pass through.
 */
export function formatSetpoint(v: SetpointValue | null | undefined, decimals?: number | null): string {
  if (typeof v === "string") return v;
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (decimals == null) return formatNumber(v);
  const d = Math.max(0, Math.min(4, decimals));
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v));
  return Number(s.replace(/,/g, "")) === 0 ? s : `${v < 0 ? "-" : ""}${s}`;
}

/** Inputs in display order: the engine's `proposal_features` first, then the recipe's other inputs A-Z. */
export function recipeKeys(features: string[], recipe: Record<string, SetpointValue>): { main: string[]; other: string[] } {
  const main = features.filter((f) => f in recipe);
  const other = Object.keys(recipe)
    .filter((k) => !features.includes(k))
    .sort((a, b) => a.localeCompare(b));
  return { main, other };
}

// --- Comparison --------------------------------------------------------------------

/** The comparison view's candidate limits. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 5;

export type ComparisonRow = {
  key: string;
  /** One display string per candidate, at the sheet's precision. */
  shown: string[];
  /** True when the candidates differ at display precision. */
  differs: boolean;
  /** max - min of the numeric values, or null for labels / fewer than 2 numbers. */
  spread: number | null;
  /** `spread` as a fraction of the observed range width, when the range is known. */
  spreadOfRange: number | null;
  range: ObservedRange | null;
  /** Index of the candidate(s) with the lowest and highest value, only when the row differs. */
  lowest: number[];
  highest: number[];
};

/**
 * Side-by-side setpoints for 2-5 candidates. Rows are the given keys; a row
 * "differs" when any two candidates show different values at the precision
 * the page displays, so a 0.003 gap that rounds away is not called a difference.
 */
export function compareRecipes(recipes: Record<string, SetpointValue>[], keys: string[], ranges: Record<string, ObservedRange>): ComparisonRow[] {
  return keys.map((key) => {
    const range = ranges[key] ?? null;
    const vals = recipes.map((r) => (key in r ? r[key] : null));
    const shown = vals.map((v) => formatSetpoint(v, range?.decimals));
    const differs = new Set(shown).size > 1;
    const nums = vals.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
    const finite = nums.filter((v): v is number => v != null);
    const spread = finite.length >= 2 && finite.length === vals.length ? Math.max(...finite) - Math.min(...finite) : null;
    const width = range ? range.max - range.min : 0;
    const spreadOfRange = spread != null && range && width > 0 ? spread / width : null;
    const idx = (target: number | null) => (target == null ? [] : nums.flatMap((v, i) => (v != null && formatSetpoint(v, range?.decimals) === formatSetpoint(target, range?.decimals) ? [i] : [])));
    return {
      key,
      shown,
      differs,
      spread,
      spreadOfRange,
      range,
      lowest: differs && finite.length ? idx(Math.min(...finite)) : [],
      highest: differs && finite.length ? idx(Math.max(...finite)) : [],
    };
  });
}

/** Toggle one candidate in the comparison set, keeping at most COMPARE_MAX in selection order. */
export function toggleCompare(current: readonly number[], rank: number, max = COMPARE_MAX): number[] {
  if (current.includes(rank)) return current.filter((r) => r !== rank);
  if (current.length >= max) return [...current];
  return [...current, rank];
}

// --- Batch diversity ----------------------------------------------------------------

export type DiversitySummary = {
  /** One sentence. */
  headline: string;
  /** Supporting sentences in plain words, from the engine's numbers. No metric text, no codes. */
  notes: string[];
  /** The engine's own strings for this batch (the metric definition, a notice code), verbatim, for a disclosure. */
  rawNotes: string[];
  /** True when the batch came back shorter than requested. */
  short: boolean;
};

/**
 * The engine's account of how distinct the batch is (`batch_diversity`,
 * `proposal_notice`). Null when the engine sent neither: the page then makes
 * no claim about diversity at all.
 */
export function diversitySummary(div: BatchDiversity | null | undefined, notice: ProposalNotice | null | undefined): DiversitySummary | null {
  if (!div && !notice) return null;
  const requested = div?.requested ?? notice?.requested;
  const returned = div?.returned ?? notice?.returned;
  const sep = div?.min_separation ?? notice?.min_separation;
  const short = notice != null || (requested != null && returned != null && returned < requested);
  const notes: string[] = [];
  const rawNotes: string[] = [];
  let headline: string;
  if (requested != null && returned != null) {
    headline = short
      ? `Kalos returned ${formatNumber(returned, "count")} of the ${formatNumber(requested, "count")} proposals requested.`
      : `Kalos returned all ${formatNumber(requested, "count")} proposals requested.`;
  } else {
    headline = short ? "Kalos returned fewer proposals than requested." : "Kalos reported how far apart this batch's proposals are.";
  }
  if (sep != null && Number.isFinite(sep)) {
    notes.push(`Proposals are kept at least ${formatNumber(sep, "pct")} apart on the input ranges.`);
  }
  if (div?.metric) rawNotes.push(`Separation measured as "${div.metric}".`);
  if (div && div.near_duplicates_replaced > 0) {
    const n = div.near_duplicates_replaced;
    notes.push(`Kalos replaced ${formatNumber(n, "count")} near-duplicate ${n === 1 ? "proposal" : "proposals"}.`);
  }
  if (notice?.code === "fewer_distinct_candidates") {
    notes.push("No further candidate was far enough from the others, so the batch is shorter than requested.");
  } else if (notice) {
    notes.push("The model sent a notice about this batch. Its details are under Method.");
  }
  if (notice) rawNotes.push(`Notice code: ${notice.code}.`);
  return { headline, notes, rawNotes, short };
}

// --- Upload rejections -----------------------------------------------------------------

/** The last upload the engine rejected in this browser session (see hooks/use-engine). */
export type UploadRejection = {
  name: string;
  /** The dataset /api/latest showed when the upload was rejected (null when there was none). */
  forDataset: string | null;
  code: string | null;
  error: string;
  target?: string;
  /** `target_summary` from a target_* rejection. */
  targetSummary?: { n_numeric?: number; n_distinct?: number; min?: number; max?: number };
  availableTargets?: string[];
};

/**
 * A rejected-upload record from a `POST /api/run` body, or null when the body
 * is not a validation rejection: only an `{ error, code }` body counts, since
 * an error without a machine code may be a server fault, not a verdict on the sheet.
 */
export function toRejection(fileName: string, body: unknown, forDataset: string | null): UploadRejection | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error !== "string" || typeof b.code !== "string" || b.code === "") return null;
  const ts = b.target_summary;
  return {
    name: fileName,
    forDataset,
    code: b.code,
    error: b.error,
    target: typeof b.target === "string" ? b.target : undefined,
    targetSummary: ts && typeof ts === "object" ? (ts as UploadRejection["targetSummary"]) : undefined,
    availableTargets: Array.isArray(b.available_targets) ? b.available_targets.filter((t): t is string => typeof t === "string") : undefined,
  };
}

/**
 * The rejection that still describes what is on screen: only when /api/latest
 * still shows the dataset it was recorded against. A different dataset (a new
 * upload, a re-analysis) means the memory is stale and is ignored.
 */
export function activeRejection(r: UploadRejection | null, currentDataset: string | null): UploadRejection | null {
  if (!r) return null;
  return r.forDataset === currentDataset ? r : null;
}

/** Title and plain sentences for a rejected upload, from the engine's structured fields where it sent them. */
export function rejectionCopy(r: UploadRejection): { title: string; body: string; suggestion: string | null } {
  if (r.code === "target_constant") {
    const t = r.target ?? "The target column";
    const s = r.targetSummary;
    const same =
      s?.min != null && s.max != null && s.min === s.max
        ? `has the same value (${formatSetpoint(s.min, decimalsOf(s.min))}) in every ${s.n_numeric != null ? `one of its ${formatNumber(s.n_numeric, "count")} rows` : "row"}`
        : "does not vary across runs";
    return {
      title: "No proposals: the target never changes",
      body: `In ${r.name}, ${t} ${same}, so there is nothing for the model to learn from and the engine proposed no experiments.`,
      suggestion: r.availableTargets?.length ? `Columns that do vary and could be the target: ${r.availableTargets.join(", ")}.` : null,
    };
  }
  // A known code gets its plain sentence; an unknown one falls back to the engine's own wording. The raw code is never shown.
  const known = engineMessage({ code: r.code, error: r.error });
  return {
    title: "The last upload was not used",
    body: `The engine did not accept ${r.name}. ${known.message}`,
    suggestion: null,
  };
}

/**
 * Notes about how the fit treated the data, from engine fields only:
 * auto-detected categoricals (`auto_categorical`) and runs excluded from the
 * fit (`n_dropped_incomplete`, `n_censored_excluded`, falling back to
 * `data_drops`). Nothing is inferred from the sheet on the client.
 */
export type DataNote = { tone: "neutral" | "warn"; text: string };

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function dataNotes(d: {
  auto_categorical?: string[];
  n_dropped_incomplete?: number;
  n_censored_excluded?: number;
  data_drops?: DataDrops;
}): DataNote[] {
  const notes: DataNote[] = [];
  const auto = (d.auto_categorical ?? []).filter((c) => typeof c === "string" && c.length > 0);
  if (auto.length) {
    notes.push({
      tone: "neutral",
      text: `${auto.join(", ")} ${auto.length === 1 ? "was" : "were"} read as categorical because ${auto.length === 1 ? "it holds" : "they hold"} text levels, so proposals vary ${auto.length === 1 ? "it" : "them"}. Declare the columns on Setup to change that.`,
    });
  }
  const missing = d.n_dropped_incomplete ?? d.data_drops?.rows_dropped ?? 0;
  const censored = d.n_censored_excluded ?? d.data_drops?.censored_rows_excluded ?? 0;
  if (missing > 0 || censored > 0) {
    const parts = [
      missing > 0 ? `${count(missing, "run")} with a missing or non-numeric value` : null,
      censored > 0 ? `${count(censored, "run")} with a censored value such as <LOD` : null,
    ].filter((p): p is string => p != null);
    notes.push({
      tone: "warn",
      text: `${parts.join(" and ")} ${missing + censored === 1 ? "was" : "were"} left out of the fit. Nothing was imputed.`,
    });
  }
  return notes;
}

/** The provenance facts the engine recorded, as label/value rows. Only fields present on `run` are returned. */
export function runFacts(run: RunRecord | null | undefined): { label: string; value: string }[] {
  if (!run) return [];
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value != null && value !== "") rows.push({ label, value });
  };
  if (run.kind === "upload") add("Source", "Run sheet upload");
  else if (run.kind === "reanalyze") add("Source", "Re-analysis of the campaign's folded runs");
  if (run.profile === "bioprocess") add("Columns", "Inferred from names (bioprocess profile)");
  else if (run.profile === "generic") add("Columns", "Declared by you (generic profile)");
  if (run.input_sha256) add("Input fingerprint", run.input_sha256.slice(0, 12));
  if (run.anonymize !== true) add("Sheet", run.sheet ?? undefined);
  if (typeof run.n_rows === "number") add("Runs fitted", run.n_rows.toLocaleString("en-US"));
  if (typeof run.n_features === "number") add("Inputs modeled", run.n_features.toLocaleString("en-US"));
  if (typeof run.pending_runs === "number") add("Runs in flight when proposed", run.pending_runs.toLocaleString("en-US"));
  if (typeof run.seed === "number") add("Fit seed", String(run.seed));
  if (run.torch_threads !== undefined) add("Threads", run.torch_threads === null ? "not pinned" : String(run.torch_threads));
  if (run.library_versions) {
    const v = Object.entries(run.library_versions)
      .filter(([, ver]) => typeof ver === "string")
      .map(([name, ver]) => `${name} ${ver}`);
    add("Libraries", v.length ? v.join(", ") : null);
  }
  if (run.build_sha) add("Engine build", run.build_sha.slice(0, 12));
  return rows;
}
