/*
 * C4b SliceProfiler adapter (VIZ_SPEC C4, engine request R2): the engine's 1D
 * model slices (`slices`) as small multiples. Pure, no React.
 *
 * Honesty rules held here:
 * - Every point is the engine's: x, the latent GP mean and its band `lo`/`hi`
 *   at `slice.coverage`. The band is the model's own GP posterior band
 *   (`band_method: gp_posterior`), labelled "model-based band, not held-out
 *   calibrated", never the conformal band. No interpolation, no smoothing.
 * - Slices are the model only: no measured points are drawn on them.
 * - Every other input is held at `reference.recipe` (the incumbent); the
 *   reference marker sits at that recipe's own value for the swept input.
 * - `slices: null` is the engine declining, with `visualization_reasons.slices`;
 *   `slices` absent is an older analysis (render nothing).
 * - A slice whose arrays are malformed (unequal length, non-finite) is not
 *   drawn and is listed, never repaired.
 */
import type { AnalyzeResult, ModelSlice } from "@/lib/api";
import { coverageText, formatSetting, formatValue, parseUnit } from "@/lib/num";

export type SliceSeries = {
  feature: string;
  /** The feature's unit, parsed from its own header ("(mM)"), never invented. */
  unit: string | null;
  x: number[];
  mean: number[];
  sd: number[] | null;
  lo: number[];
  hi: number[];
  coverage: number | null;
  /** The swept range (engine `range`, else the x extent). */
  range: [number, number];
  /** The held recipe's own value for this input, when numeric and inside the range. */
  reference: number | null;
  /** Proposals' settings for this input, numbered as the batch rows (P1..Pn). */
  proposals: { key: string; x: number }[];
  /** Proposal ids whose setting lies outside the swept range (listed, not drawn). */
  outside: string[];
};

export type SkippedSlice = { feature: string; reason: string; text: string };

export type SliceProfilerData =
  | { state: "absent" }
  | { state: "not-scored"; reason: string; skipped: SkippedSlice[] }
  | {
      state: "ready";
      slices: SliceSeries[];
      skipped: SkippedSlice[];
      /** Slices the engine sent that could not be drawn (malformed arrays). */
      malformed: string[];
      /** One y domain for every panel, so effect sizes compare across inputs. */
      yDomain: [number, number];
      coverage: number | null;
      note: string | null;
      sweptAt: string | null;
      referenceBasis: string | null;
      referenceRecipe: { name: string; value: number | string }[];
    };

export const MODEL_BAND_NOTE = "model-based band, not held-out calibrated";
export const MODEL_ONLY_NOTE = "Slices are the model only: no measured runs are drawn on them.";

const SKIP_TEXT: Record<string, string> = {
  categorical: "categorical input, so there is no continuous sweep",
  feature_cap: "beyond the engine's cap on slices (inputs are ordered by driver strength)",
  non_finite_posterior: "the model returned non-finite values along this input",
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numArray = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(finite);

type SliceInput = Partial<Pick<AnalyzeResult, "slices" | "slices_skipped" | "visualization_reasons">>;

function reasonOf(d: SliceInput): string | null {
  const vr = d.visualization_reasons;
  const raw = vr && typeof vr === "object" ? (vr as Record<string, unknown>).slices : null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function skippedOf(d: SliceInput): SkippedSlice[] {
  return (Array.isArray(d.slices_skipped) ? d.slices_skipped : [])
    .filter((s) => s && typeof s.feature === "string")
    .map((s) => ({ feature: s.feature, reason: String(s.reason ?? ""), text: SKIP_TEXT[s.reason] ?? (s.reason ? String(s.reason).replace(/_/g, " ") : "no reason given") }));
}

/** One engine slice as a drawable series, or null when its arrays are malformed. */
export function toSeries(s: ModelSlice, proposals: { key: string; recipe: Record<string, number | string> }[]): SliceSeries | null {
  if (!s || typeof s.feature !== "string" || !Array.isArray(s.x)) return null;
  const n = s.x.length;
  if (n < 2 || !numArray(s.x, n) || !numArray(s.mean, n) || !numArray(s.lo, n) || !numArray(s.hi, n)) return null;
  const sd = numArray(s.sd, n) ? s.sd : null;
  const xmin = Math.min(...s.x);
  const xmax = Math.max(...s.x);
  const range: [number, number] = Array.isArray(s.range) && finite(s.range[0]) && finite(s.range[1]) ? [Math.min(s.range[0], s.range[1]), Math.max(s.range[0], s.range[1])] : [xmin, xmax];
  const ref = s.reference?.recipe?.[s.feature];
  const reference = finite(ref) && ref >= xmin && ref <= xmax ? ref : null;
  const inside: { key: string; x: number }[] = [];
  const outside: string[] = [];
  for (const p of proposals) {
    const v = p.recipe[s.feature];
    if (!finite(v)) continue;
    if (v >= xmin && v <= xmax) inside.push({ key: p.key, x: v });
    else outside.push(p.key);
  }
  return {
    feature: s.feature,
    unit: parseUnit(s.feature).unit,
    x: s.x,
    mean: s.mean,
    sd,
    lo: s.lo,
    hi: s.hi,
    coverage: finite(s.coverage) ? s.coverage : null,
    range,
    reference,
    proposals: inside,
    outside,
  };
}

/** The engine's slices -> profiler data. `proposals` are the batch's recipes keyed P1..Pn. */
export function toSliceProfiler(d: SliceInput, proposals: { key: string; recipe: Record<string, number | string> }[] = []): SliceProfilerData {
  const skipped = skippedOf(d);
  if (d.slices === undefined) return { state: "absent" };
  if (d.slices === null || !Array.isArray(d.slices)) return { state: "not-scored", reason: reasonOf(d) ?? "the engine did not compute slices for this analysis", skipped };
  const slices: SliceSeries[] = [];
  const malformed: string[] = [];
  for (const s of d.slices) {
    const series = toSeries(s, proposals);
    if (series) slices.push(series);
    else malformed.push(typeof s?.feature === "string" ? s.feature : "an unnamed input");
  }
  if (!slices.length) {
    return { state: "not-scored", reason: reasonOf(d) ?? (malformed.length ? "the slices the engine sent could not be drawn" : "the engine returned no slices"), skipped };
  }
  const all = slices.flatMap((s) => [...s.lo, ...s.hi, ...s.mean]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = hi > lo ? (hi - lo) * 0.05 : Math.abs(lo) * 0.05 || 1;
  const first = d.slices.find((s) => s && typeof s === "object") as ModelSlice | undefined;
  const coverages = [...new Set(slices.map((s) => s.coverage))];
  const recipe = first?.reference?.recipe ?? {};
  return {
    state: "ready",
    slices,
    skipped,
    malformed,
    yDomain: [lo - pad, hi + pad],
    coverage: coverages.length === 1 ? coverages[0] : null,
    note: typeof first?.note === "string" ? first.note : null,
    sweptAt: typeof first?.swept_at === "string" ? first.swept_at : null,
    referenceBasis: typeof first?.reference?.basis === "string" ? first.reference.basis : null,
    referenceRecipe: Object.entries(recipe)
      .filter(([, v]) => finite(v) || (typeof v === "string" && v.length > 0))
      .map(([name, value]) => ({ name, value })),
  };
}

// --- Formatting ----------------------------------------------------------------

/** A swept setting at the precision its range supports, with the feature's unit. */
export const fmtX = (s: Pick<SliceSeries, "range" | "unit">, v: number): string => formatSetting(v, s.range, s.unit).text;

/** A predicted mean, precision from the engine's sd at that point when sent (3 sf otherwise). */
export const fmtMean = (v: number, sd: number | null, unit: string | null): string => formatValue(v, { basis: "predicted", unit, uncertainty: sd }).text;

/** "[1.25, 1.49] 90%": the model band at the mean's precision, coverage from the slice. */
export function fmtBand(s: SliceSeries, i: number): string {
  const f = formatValue(s.mean[i], { interval: { lo: s.lo[i], hi: s.hi[i], coverage: s.coverage, method: "conformal" } });
  return [f.interval, f.coverage].filter(Boolean).join(" ");
}

/** "90% model-based band, not held-out calibrated". */
export const bandText = (coverage: number | null): string => `${coverageText(coverage) ? `${coverageText(coverage)} ` : ""}${MODEL_BAND_NOTE}`;

/** Index of the engine sample nearest to `v` (for a hover readout; no interpolation). */
export function nearestSample(x: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - v) < Math.abs(x[best] - v)) best = i;
  return best;
}

/** Index of the highest mean (ties: first). */
const peakIndex = (m: number[]) => m.reduce((b, v, i) => (v > m[b] ? i : b), 0);
const lowIndex = (m: number[]) => m.reduce((b, v, i) => (v < m[b] ? i : b), 0);

export function describeSliceProfiler(data: SliceProfilerData, target: string, unit: string | null): string {
  if (data.state === "absent") return "";
  if (data.state === "not-scored") return `Model slices not scored: ${data.reason}.`;
  const parts = [
    `Model-predicted ${target} as one input at a time is swept, other inputs held at the ${data.sweptAt ?? "reference"} recipe, with the ${bandText(data.coverage)}. ${MODEL_ONLY_NOTE}`,
  ];
  for (const s of data.slices) {
    const lo = lowIndex(s.mean);
    const hi = peakIndex(s.mean);
    parts.push(
      `${s.feature} from ${fmtX(s, s.x[0])} to ${fmtX(s, s.x[s.x.length - 1])}: predicted mean lowest ${fmtMean(s.mean[lo], s.sd?.[lo] ?? null, unit)} at ${fmtX(s, s.x[lo])}, highest ${fmtMean(s.mean[hi], s.sd?.[hi] ?? null, unit)} at ${fmtX(s, s.x[hi])}${s.proposals.length ? `; proposals at ${s.proposals.map((p) => `${p.key} ${fmtX(s, p.x)}`).join(", ")}` : ""}.`,
    );
  }
  if (data.skipped.length) parts.push(`Not sliced: ${data.skipped.map((k) => `${k.feature} (${k.text})`).join("; ")}.`);
  return parts.join(" ");
}

/** The Data disclosure: every engine sample in long form. */
export function sliceTable(data: SliceProfilerData, unit: string | null): { columns: string[]; rows: string[][] } {
  if (data.state !== "ready") return { columns: [], rows: [] };
  const u = unit ? ` (${unit})` : "";
  const columns = ["Input", "Setting", `Predicted mean${u}`, `Model band${u}`, `Model σ${u}`];
  const rows: string[][] = [];
  for (const s of data.slices) {
    s.x.forEach((x, i) => {
      const sd = s.sd?.[i] ?? null;
      rows.push([s.feature, fmtX(s, x), fmtMean(s.mean[i], sd, null), fmtBand(s, i), sd != null ? formatValue(sd, { fallbackSigFigs: 2 }).text : "n/a"]);
    });
  }
  return { columns, rows };
}
