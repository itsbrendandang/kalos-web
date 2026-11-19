// What the Harmonize page says about the uploaded sheet, built ONLY from fields of the engine's analysis.
// Pure, so every rule is unit tested (__tests__/harmonize-data.test.ts). A field the engine did not send
// becomes null here and the page reads it as "n/a" (or says the engine did not report it); nothing is
// inferred from the sheet in the browser.

import type { AnalyzeResult, DataDrops, DesignBoxExclusion, Job, ProvenanceEntry, RunRecord } from "@/lib/api";
import { formatSetting, formatValue } from "@/lib/num";
import { columnsFromProvenance, type RolesContext } from "@/lib/sheet-roles";

// --- Fields the engine sends that lib/api.ts does not type yet (read defensively) ---------------------

export type Orientation = { orientation: string; confidence: number | null };
export type VisualizationReasons = { embedding: string | null; correlation: string | null };

/** The analysis fields this page reads, including the untyped `header_row`, `orientation` and `visualization_reasons`. */
export type HarmonizeAnalysis = Pick<
  AnalyzeResult,
  | "features"
  | "target"
  | "provenance"
  | "feature_ranges"
  | "design_box_exclusions"
  | "auto_categorical"
  | "categorical_features"
  | "n_dropped_incomplete"
  | "n_censored_excluded"
  | "data_drops"
  | "run"
  | "embedding"
  | "correlation"
> & { header_row?: unknown; orientation?: unknown; visualization_reasons?: unknown };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The 0-based header row index the engine parsed at (top level, else the run record), or null. */
export function headerRow(a: HarmonizeAnalysis): number | null {
  const top = num(a.header_row);
  if (top != null) return top;
  return num((a.run as RunRecord | undefined)?.header_row);
}

/** The engine's sheet-orientation finding (`standard` or `transposed`), or null when not reported. */
export function orientationOf(a: HarmonizeAnalysis): Orientation | null {
  const o = a.orientation;
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  if (typeof rec.orientation !== "string" || !rec.orientation) return null;
  return { orientation: rec.orientation, confidence: num(rec.confidence) };
}

/** Plain words for the sheet's orientation. Unknown values keep the engine's word, de-underscored. */
export function orientationText(o: Orientation): string {
  if (o.orientation === "standard") return "One run per row, as expected";
  if (o.orientation === "transposed") return "One run per column; the engine turned it so each run is a row";
  return o.orientation.replace(/_/g, " ");
}

/** Why the engine did not compute the run landscape or the correlation map, when it said. */
export function visualizationReasons(a: HarmonizeAnalysis): VisualizationReasons | null {
  const v = a.visualization_reasons;
  if (!v || typeof v !== "object") return null;
  const rec = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return { embedding: s(rec.embedding), correlation: s(rec.correlation) };
}

/**
 * Plain copy for a visualization the engine did not return. `reason` is the engine's own text when it gave
 * one; null with the field absent means an analysis from before the engine returned it.
 */
export function visualizationAbsentText(kind: "embedding" | "correlation", reason: string | null): string {
  const what = kind === "embedding" ? "The run map" : "The correlation map";
  const lower = what.charAt(0).toLowerCase() + what.slice(1);
  if (!reason) return `${what} is not part of this analysis (it was made before the engine returned it). Re-upload the sheet to get it.`;
  const r = reason.toLowerCase();
  if (r.includes("at least 2") || r.includes("fewer than 2")) return `${what} needs at least two inputs, and this sheet has fewer.`;
  if (r.includes("no continuous")) return `${what} needs numeric inputs, and this sheet has none the model kept.`;
  if (r.includes("no features")) return `${what} needs inputs, and the model kept none.`;
  if (r.includes("failed")) return `The engine could not compute ${lower} for this sheet.`;
  return `The engine did not compute ${lower} for this sheet.`;
}

// --- Column provenance table ----------------------------------------------------------------------------

export type ColumnStatus = "target" | "kept" | "coerced" | "dropped";

export type ColumnRow = {
  name: string;
  status: ColumnStatus;
  /** Plain words for the status, e.g. "Input, categorical" or "Left out: treated as an ID". */
  label: string;
  /** The engine's raw status, kept for a title attribute (never shown in prose). */
  raw: string;
  /** Cells the engine could not read as numbers. */
  coerced: number | null;
  nonNull: number | null;
  /** Who set the column's role: "inferred" from names, "declared" by the user, or null when not reported. */
  source: "inferred" | "declared" | null;
  /** A data-quality note established by the counts (see lib/sheet-roles qualityWarning), or null. */
  warning: string | null;
};

/**
 * One row per column the engine read, in the engine's order. Kept inputs with unreadable cells are
 * "coerced" unless they are categorical (text levels are expected there, not a problem).
 */
export function columnRows(a: HarmonizeAnalysis, ctx: RolesContext = {}): ColumnRow[] {
  const prov: readonly ProvenanceEntry[] = a.provenance ?? [];
  const cats = new Set([...(a.categorical_features ?? []), ...(a.auto_categorical ?? [])]);
  const auto = new Set(a.auto_categorical ?? []);
  const sheet = columnsFromProvenance(prov, ctx);
  return prov.map((p, i): ColumnRow => {
    const c = sheet[i];
    const coerced = num(p.coerced_cells);
    const source: ColumnRow["source"] = p.source === "declared" || p.source === "inferred" ? p.source : null;
    const base = { name: p.name, raw: p.status, coerced, nonNull: num(p.non_null), source };
    if (c.kind === "target") return { ...base, status: "target", label: "Target (maximized)", warning: null };
    if (c.kind === "input") {
      if (cats.has(p.name)) {
        return { ...base, status: "kept", label: auto.has(p.name) ? "Input, categorical (detected)" : "Input, categorical", warning: null };
      }
      if (coerced != null && coerced > 0) {
        return { ...base, status: "coerced", label: "Input, some cells not numbers", warning: c.warning };
      }
      return { ...base, status: "kept", label: "Input", warning: null };
    }
    const why = c.note ? c.note.charAt(0).toLowerCase() + c.note.slice(1) : null;
    return { ...base, status: "dropped", label: why ? `Left out: ${why}` : "Left out", warning: c.warning };
  });
}

// --- What was excluded ----------------------------------------------------------------------------------

export type Fact = { label: string; value: number | null; note?: string };

/** Sum of a count that older engines send as a number and newer ones as a per-column map. */
function countOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object") {
    const vals = Object.values(v as Record<string, unknown>).map(num);
    return vals.every((x) => x != null) ? vals.reduce<number>((s, x) => s + (x ?? 0), 0) : null;
  }
  return null;
}

const REASON_LABEL: Record<string, string> = {
  missing: "Blank target or input cells",
  non_numeric: "Cells that were not numbers",
  censored: "Censored cells (for example <LOD)",
};

/**
 * Rows and cells the fit left out, as the engine counted them. The two row counts are always listed
 * (n/a when not reported); cell breakdowns only when the engine sent them.
 */
export function exclusionFacts(a: HarmonizeAnalysis): Fact[] {
  const drops: DataDrops | undefined = a.data_drops ?? a.run?.data_drops;
  const facts: Fact[] = [
    { label: "Runs left out for a blank or unreadable cell", value: num(a.n_dropped_incomplete) ?? num(drops?.rows_dropped) },
    { label: "Runs left out for a censored value", value: num(a.n_censored_excluded) ?? num(drops?.censored_rows_excluded), note: "Not imputed" },
  ];
  for (const [k, v] of Object.entries(drops?.cells_by_reason ?? {})) {
    facts.push({ label: REASON_LABEL[k] ?? `Cells: ${k.replace(/_/g, " ")}`, value: num(v) });
  }
  const blank = countOf(drops?.blank_cells_as_absent as unknown);
  if (blank != null) facts.push({ label: "Blank cells read as absent (not as zero)", value: blank });
  return facts;
}

/** Per-column cell counts the engine reported as unusable, flattened, largest first. */
export function cellsByColumn(a: HarmonizeAnalysis): { column: string; reason: string; n: number }[] {
  const drops = a.data_drops ?? a.run?.data_drops;
  const out: { column: string; reason: string; n: number }[] = [];
  for (const [column, reasons] of Object.entries(drops?.cells_by_column ?? {})) {
    for (const [reason, n] of Object.entries(reasons ?? {})) {
      const v = num(n);
      if (v != null && v > 0) out.push({ column, reason: (REASON_LABEL[reason] ?? reason.replace(/_/g, " ")).toLowerCase(), n: v });
    }
  }
  return out.sort((x, y) => y.n - x.n);
}

// --- Explored design space ------------------------------------------------------------------------------

export type DesignRow = {
  name: string;
  kind: "continuous" | "categorical" | "unreported";
  low: number | null;
  high: number | null;
  /** Set when the engine narrowed this input's box because some cells were physically impossible. */
  narrowed: DesignBoxExclusion | null;
};

/**
 * Each input's observed range as the engine reports it (`feature_ranges`): the box the optimizer searches.
 * Categorical inputs have no range; an input missing from the map reads as unreported, never as 0.
 */
export function designRows(a: HarmonizeAnalysis): DesignRow[] {
  const ranges = a.feature_ranges ?? {};
  const cats = new Set([...(a.categorical_features ?? []), ...(a.auto_categorical ?? [])]);
  const narrowed = new Map((a.design_box_exclusions ?? []).map((e) => [e.column, e]));
  return (a.features ?? []).map((name) => {
    const r = ranges[name];
    const lo = Array.isArray(r) ? num(r[0]) : null;
    const hi = Array.isArray(r) ? num(r[1]) : null;
    const kind = lo != null && hi != null ? "continuous" : cats.has(name) ? "categorical" : "unreported";
    return { name, kind, low: lo, high: hi, narrowed: narrowed.get(name) ?? null };
  });
}

/** A narrowed box as "lo to hi", both ends at the precision the narrowed range supports (VIZ_SPEC 2.4). */
export function boxRangeText(lower: number | null | undefined, upper: number | null | undefined): string {
  const range: [number, number] | null = lower != null && upper != null && Number.isFinite(lower) && Number.isFinite(upper) ? [lower, upper] : null;
  return `${formatSetting(lower, range).text} to ${formatSetting(upper, range).text}`;
}

/**
 * One sentence for the boxes the engine narrowed (`design_box_exclusions`), or null when none was.
 * The engine reports `n_excluded` as values (cells) left out of the box.
 */
export function narrowedBoxNote(exclusions: readonly DesignBoxExclusion[] | null | undefined): string | null {
  if (!exclusions || exclusions.length === 0) return null;
  const count = (n: number) => formatValue(n, { quantity: "count" }).text;
  const parts = exclusions.map((e) => `${e.column} (${boxRangeText(e.lower, e.upper)}, ${count(e.n_excluded)} ${e.n_excluded === 1 ? "value" : "values"} left out)`);
  return `Search box narrowed for ${count(exclusions.length)} ${exclusions.length === 1 ? "input" : "inputs"}: ${parts.join("; ")}.`;
}

// --- Upload job outcome ---------------------------------------------------------------------------------

/** A finished upload job that did not succeed, or null. Used to describe an outcome this page did not start. */
export function jobProblem(job: Job | null): { kind: "cancelled" | "failed"; code: string; detail: string | null } | null {
  if (!job) return null;
  if (job.state === "cancelled") return { kind: "cancelled", code: "job_cancelled", detail: null };
  if (job.state === "failed" || job.state === "timed_out") {
    const code = job.error?.code || (job.state === "timed_out" ? "timeout" : "analysis_failed");
    return { kind: "failed", code, detail: job.error?.message || null };
  }
  return null;
}
