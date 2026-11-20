/*
 * C3 RecipeSetpointMatrix adapter (VIZ_SPEC 5, C3): where each proposed recipe
 * sits on each input's range. Pure, no React.
 *
 * Ranges come from the engine's `feature_ranges` (the search range) or, when
 * absent, the values tried in the measured runs the engine returned; with
 * neither, the track spans the proposals and says so. A narrowed box
 * (`design_box_exclusions`) is drawn hatched with its count. The incumbent is
 * `response_surface.fixed_recipe`; the GP optimum appears only for an
 * `interior_optimum` shape. Categorical inputs become level chips. Nothing is
 * estimated client-side.
 */
import type { AnalyzeResult } from "@/lib/api";
import { atRangeEdge, formatSetting, parseUnit, type Formatted } from "@/lib/num";
import { MAX_SETPOINT_FEATURES } from "@/lib/viz-thresholds";

/** A range the page already resolved (engine `feature_ranges`, or min/max of measured runs). */
export type RangeInput = { min: number; max: number; source: "engine" | "observed"; n?: number };

export type SetpointProposal = { key: string; n: number; values: Record<string, number | string> };

export type NumericFeature = {
  kind: "numeric";
  name: string;
  label: string;
  unit: string | null;
  /** The range the track spans and the precision comes from. */
  range: [number, number] | null;
  rangeSource: "engine" | "observed" | "proposals";
  rangeN: number | null;
  /** The searched sub-range when the engine narrowed the box, with the excluded count. */
  narrowed: { lower: number; upper: number; nExcluded: number } | null;
  incumbent: number | null;
  optimumAt: number | null;
  /** What the track draws: the range, any narrowing, every proposal and the incumbent. */
  domain: [number, number];
};

export type CategoricalFeature = {
  kind: "categorical";
  name: string;
  label: string;
  /** Levels the proposals (and the incumbent) use, with which proposals pick each. */
  levels: { level: string; keys: string[] }[];
  incumbent: string | null;
};

export type SetpointFeature = NumericFeature | CategoricalFeature;

export type SetpointMatrixModel = {
  features: SetpointFeature[];
  proposals: SetpointProposal[];
  /** How the incumbent diamond is labeled, or null when the engine sent no fixed recipe. */
  incumbentLabel: string | null;
  /** Inputs shown before "Show all". */
  initial: number;
  gpAvailable: boolean;
};

type MatrixAnalysis = Pick<AnalyzeResult, "proposal_features" | "design_box_exclusions" | "response_surface" | "categorical_features"> & {
  gp_shapes?: { available: boolean; features: { name: string; relevance: number; shape: string; optimum_at: number | null }[] } | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function toSetpointMatrixModel(d: MatrixAnalysis, proposals: SetpointProposal[], ranges: Record<string, RangeInput>): SetpointMatrixModel {
  const fixed = d.response_surface?.fixed_recipe ?? null;
  const swept = d.response_surface?.swept_at;
  const cats = new Set(d.categorical_features ?? []);
  const gp = d.gp_shapes?.available ? d.gp_shapes.features : [];
  const main = (d.proposal_features ?? []).filter((f) => proposals.some((p) => f in p.values));
  const others = [...new Set(proposals.flatMap((p) => Object.keys(p.values)))].filter((k) => !main.includes(k)).sort((a, b) => a.localeCompare(b));
  let names = [...main, ...others];
  if (names.length > MAX_SETPOINT_FEATURES && gp.length) {
    // Many inputs: the engine's GP relevance orders them (most relevant first); unranked inputs keep their order after.
    const rel = new Map(gp.map((f) => [f.name, f.relevance]));
    names = [...names].sort((a, b) => (rel.get(b) ?? -Infinity) - (rel.get(a) ?? -Infinity));
  }
  const features = names.map((name): SetpointFeature => {
    const { name: label, unit } = parseUnit(name);
    const vals = proposals.map((p) => p.values[name]);
    const isCat = cats.has(name) || vals.some((v) => typeof v === "string");
    if (isCat) {
      const inc = fixed && name in fixed ? String(fixed[name]) : null;
      const order: string[] = [];
      for (const v of vals) if (v != null && !order.includes(String(v))) order.push(String(v));
      if (inc != null && !order.includes(inc)) order.push(inc);
      return {
        kind: "categorical",
        name,
        label,
        levels: order.map((level) => ({ level, keys: proposals.filter((p) => p.values[name] != null && String(p.values[name]) === level).map((p) => p.key) })),
        incumbent: inc,
      };
    }
    const nums = vals.filter(finite);
    const r = ranges[name];
    const range: [number, number] | null = r && finite(r.min) && finite(r.max) ? [Math.min(r.min, r.max), Math.max(r.min, r.max)] : null;
    const ex = (d.design_box_exclusions ?? []).find((e) => e.column === name);
    const narrowed = ex && finite(ex.lower) && finite(ex.upper) ? { lower: ex.lower, upper: ex.upper, nExcluded: ex.n_excluded } : null;
    const incRaw = fixed?.[name];
    const incumbent = finite(incRaw) ? incRaw : null;
    const shape = gp.find((f) => f.name === name);
    const optimumAt = shape && shape.shape === "interior_optimum" && finite(shape.optimum_at) ? shape.optimum_at : null;
    const pts = [...nums, ...(range ?? []), ...(narrowed ? [narrowed.lower, narrowed.upper] : []), ...(incumbent != null ? [incumbent] : []), ...(optimumAt != null ? [optimumAt] : [])];
    let lo = pts.length ? Math.min(...pts) : 0;
    let hi = pts.length ? Math.max(...pts) : 1;
    if (hi - lo <= 0) {
      const pad = Math.abs(lo) * 0.05 || 1;
      lo -= pad;
      hi += pad;
    }
    return {
      kind: "numeric",
      name,
      label,
      unit,
      range,
      rangeSource: range ? r!.source : "proposals",
      rangeN: range && r!.source === "observed" ? (r!.n ?? null) : null,
      narrowed,
      incumbent,
      optimumAt,
      domain: [lo, hi],
    };
  });
  return {
    features,
    proposals,
    incumbentLabel: fixed ? (!swept || swept === "incumbent" ? "incumbent" : `held at ${swept}`) : null,
    initial: Math.min(features.length, MAX_SETPOINT_FEATURES),
    gpAvailable: gp.length > 0,
  };
}

/** A setpoint at the precision its range supports (VIZ_SPEC 2.4). */
export const settingFormatted = (v: number | null | undefined, f: Pick<NumericFeature, "range">): Formatted => formatSetting(v, f.range);

/** Where a value sits: "low edge" / "high edge" / "below range" / "above range", or null inside. Only for a real range. */
export function edgeOf(v: number, f: Pick<NumericFeature, "range" | "rangeSource">): "low edge" | "high edge" | "below range" | "above range" | null {
  if (!f.range || f.rangeSource === "proposals") return null;
  const [lo, hi] = f.range;
  const tol = Math.abs(hi - lo) * 0.01;
  if (v < lo - tol) return "below range";
  if (v > hi + tol) return "above range";
  if (!atRangeEdge(v, f.range)) return null;
  return Math.abs(v - lo) <= Math.abs(hi - v) ? "low edge" : "high edge";
}

/** "P2 at high edge" / "P1 above range". */
export const edgePhrase = (key: string, e: NonNullable<ReturnType<typeof edgeOf>>): string => (e.endsWith("edge") ? `${key} at ${e}` : `${key} ${e}`);

export const rangeWord = (f: NumericFeature): string =>
  f.rangeSource === "engine" ? "search range" : f.rangeSource === "observed" ? `range tried${f.rangeN ? ` in ${f.rangeN} runs` : ""}` : "search range not reported";

export function describeSetpointMatrix(m: SetpointMatrixModel): string {
  if (m.proposals.length === 0 || m.features.length === 0) return "No proposed setpoints to show.";
  const parts = m.features.map((f) => {
    if (f.kind === "categorical") return `${f.label}: ${f.levels.map((l) => `${l.level} ${l.keys.length ? l.keys.join(" ") : "none"}`).join(", ")}`;
    const vals = m.proposals.map((p) => p.values[f.name]).filter(finite);
    if (vals.length === 0) return `${f.label}: not set`;
    const lo = settingFormatted(Math.min(...vals), f).text;
    const hi = settingFormatted(Math.max(...vals), f).text;
    const span = lo === hi ? `all ${lo}` : `${lo} to ${hi}`;
    const range = f.range ? ` within ${rangeWord(f)} ${settingFormatted(f.range[0], f).text} to ${settingFormatted(f.range[1], f).text}` : " (search range not reported)";
    const edges = m.proposals.flatMap((p) => {
      const v = p.values[f.name];
      const e = finite(v) ? edgeOf(v, f) : null;
      return e ? [edgePhrase(p.key, e)] : [];
    });
    return `${f.label}: ${span}${range}${edges.length ? `, ${edges.join(", ")}` : ""}`;
  });
  return `Setpoints of ${m.proposals.length} proposals on ${m.features.length} inputs. ${parts.join("; ")}.`;
}

export function setpointMatrixTable(m: SetpointMatrixModel): { columns: string[]; rows: string[][] } {
  const columns = ["Input", "Range", ...m.proposals.map((p) => p.key), ...(m.incumbentLabel ? [m.incumbentLabel[0].toUpperCase() + m.incumbentLabel.slice(1)] : []), ...(m.gpAvailable ? ["GP optimum"] : [])];
  const rows = m.features.map((f) => {
    if (f.kind === "categorical") {
      return [f.label, "categorical", ...m.proposals.map((p) => (p.values[f.name] != null ? String(p.values[f.name]) : "n/a")), ...(m.incumbentLabel ? [f.incumbent ?? "n/a"] : []), ...(m.gpAvailable ? ["n/a"] : [])];
    }
    const range = f.range ? `[${settingFormatted(f.range[0], f).value}, ${settingFormatted(f.range[1], f).value}] ${rangeWord(f)}` : "not reported";
    const cell = (v: number | string | undefined) => {
      if (!finite(v)) return "n/a";
      const e = edgeOf(v, f);
      return `${settingFormatted(v, f).value}${e ? ` (${e})` : ""}`;
    };
    return [
      f.unit ? `${f.label} (${f.unit})` : f.label,
      range,
      ...m.proposals.map((p) => cell(p.values[f.name])),
      ...(m.incumbentLabel ? [f.incumbent != null ? settingFormatted(f.incumbent, f).value : "n/a"] : []),
      ...(m.gpAvailable ? [f.optimumAt != null ? settingFormatted(f.optimumAt, f).value : "n/a"] : []),
    ];
  });
  return { columns, rows };
}
