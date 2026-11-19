/*
 * C4 DriverForest adapter (VIZ_SPEC section 5): engine `drivers`,
 * `driver_selection` and `gp_shapes` -> chart props, plus the description,
 * the Data table and the selection note. Pure, no React.
 *
 * Honesty rules held here:
 * - `significant` is the engine's verdict (95% CI excludes zero AND survives
 *   FDR). It is copied, never re-derived. The "CI spans 0" / "fails FDR" words
 *   come from the engine's own `ci_excludes_zero` / `survives_fdr` flags; when
 *   an older engine omits them the row says "not significant" and nothing more.
 * - The CI is the engine's `ci95` field, so its coverage is 95% by the field's
 *   definition (formatCorr supplies the label).
 * - GP `relevance` has no interval, so it is a tooltip number only, never a bar.
 */
import type { Driver, DriverSelection } from "@/lib/api";
import { formatCorr, formatP, formatSetting, formatValue } from "@/lib/num";

export type GpShapeKind = "flat" | "monotonic_up" | "monotonic_down" | "interior_optimum" | "interior_minimum";

export type ForestDriver = {
  name: string;
  rho: number;
  ci: [number, number];
  significant: boolean;
  excludesZero: boolean | null;
  survivesFdr: boolean | null;
  p: number | null;
  /** Index in the engine's `drivers` array, for the source field. */
  index: number;
};

export type ForestShape = {
  shape: GpShapeKind | string;
  relevance: number;
  optimumAt: number | null;
  peakGain: number | null;
  missedBySpearman: boolean;
};

/** The shape column: drawn, declined by the engine with its reason, or absent (older engine). */
export type ShapesState = { kind: "ready"; shapes: Record<string, ForestShape> } | { kind: "not-scored"; reason: string } | { kind: "absent" };

export type DriverForestData = {
  drivers: ForestDriver[];
  shapes: ShapesState;
  /** GP features the rank correlation misses that have no forest row (not among the reported drivers). */
  missedOnly: string[];
  /** Caveats the engine lists for its shapes (`gp_shapes.unmodeled`), verbatim. */
  shapeCaveats: string[];
  selectionNote: string | null;
  nTested: number | null;
  /** Independent units the correlations were computed on (recipes), when reported. */
  nUnits: number | null;
  unitWord: string | null;
  fdrShort: string | null;
};

type ForestInput = {
  drivers?: Driver[] | null;
  driver_selection?: DriverSelection | null;
  gp_shapes?: {
    available: boolean;
    reason: string | null;
    features: { name: string; relevance: number; shape: string; optimum_at: number | null; peak_gain?: number | null; missed_by_spearman: boolean }[];
    unmodeled?: string[];
  } | null;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "benjamini_hochberg" -> "BH"; anything else is shown as the engine sent it. */
export function fdrShortName(method: string | null | undefined): string | null {
  if (!method) return null;
  if (/benjamini.?hochberg|^bh$/i.test(method)) return "BH";
  if (/bonferroni/i.test(method)) return "Bonferroni";
  if (/benjamini.?yekutieli|^by$/i.test(method)) return "BY";
  return method;
}

/**
 * "10 inputs tested, 8 shown, ranked by |ρ| (BH FDR, q = 0.05), per recipe (165 recipes, 165 rows)".
 * Null when the engine did not report `driver_selection` (absent rule: say nothing).
 */
export function forestSelectionNote(sel: DriverSelection | null | undefined): string | null {
  if (!sel) return null;
  const ranked = sel.ranked_by === "abs_rho" ? "|ρ|" : sel.ranked_by;
  const fdr = fdrShortName(sel.fdr_method);
  const q = isNum(sel.fdr_q) ? formatValue(sel.fdr_q, { quantity: "score" }).value : null;
  const tested = `${formatValue(sel.n_tested, { quantity: "count" }).text} ${sel.n_tested === 1 ? "input" : "inputs"} tested, ${formatValue(sel.n_reported, { quantity: "count" }).text} shown, ranked by ${ranked}`;
  const method = fdr ? ` (${fdr} FDR${q ? `, q = ${q}` : ""})` : "";
  const per =
    sel.unit && isNum(sel.n_units) && isNum(sel.n_rows)
      ? `, per ${sel.unit} (${formatValue(sel.n_units, { quantity: "count" }).text} ${sel.unit}${sel.n_units === 1 ? "" : "s"}, ${formatValue(sel.n_rows, { quantity: "count" }).text} ${sel.n_rows === 1 ? "row" : "rows"})`
      : "";
  return `${tested}${method}${per}.`;
}

/** Engine response -> forest data. Rows are ranked by |rho| (the engine's own ranking), strongest first. */
export function toDriverForest(d: ForestInput): DriverForestData {
  const drivers: ForestDriver[] = (d.drivers ?? [])
    .map((x, index) => ({ x, index }))
    .filter(({ x }) => isNum(x.rho) && Array.isArray(x.ci95) && isNum(x.ci95[0]) && isNum(x.ci95[1]))
    .map(({ x, index }) => ({
      name: x.name,
      rho: x.rho,
      ci: [x.ci95[0], x.ci95[1]] as [number, number],
      significant: x.significant === true,
      excludesZero: typeof x.ci_excludes_zero === "boolean" ? x.ci_excludes_zero : null,
      survivesFdr: typeof x.survives_fdr === "boolean" ? x.survives_fdr : null,
      p: isNum(x.p) ? x.p : null,
      index,
    }))
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));

  const g = d.gp_shapes;
  let shapes: ShapesState = { kind: "absent" };
  let missedOnly: string[] = [];
  if (g && g.available === false) {
    shapes = { kind: "not-scored", reason: g.reason?.trim() || "the engine did not say why" };
  } else if (g && g.available) {
    const map: Record<string, ForestShape> = {};
    for (const f of g.features ?? []) {
      map[f.name] = {
        shape: f.shape,
        relevance: f.relevance,
        optimumAt: isNum(f.optimum_at) ? f.optimum_at : null,
        peakGain: isNum(f.peak_gain) ? f.peak_gain : null,
        missedBySpearman: f.missed_by_spearman === true,
      };
    }
    shapes = { kind: "ready", shapes: map };
    const shown = new Set(drivers.map((x) => x.name));
    missedOnly = (g.features ?? []).filter((f) => f.missed_by_spearman && !shown.has(f.name)).map((f) => f.name);
  }

  const sel = d.driver_selection ?? null;
  return {
    drivers,
    shapes,
    missedOnly,
    shapeCaveats: g && g.available ? (g.unmodeled ?? []) : [],
    selectionNote: forestSelectionNote(sel),
    nTested: sel && isNum(sel.n_tested) ? sel.n_tested : null,
    nUnits: sel && isNum(sel.n_units) ? sel.n_units : null,
    unitWord: sel?.unit ?? null,
    fdrShort: fdrShortName(sel?.fdr_method),
  };
}

/** The status word beside a row: the engine's verdict, and for a non-significant row which test it failed. */
export function driverStatus(x: Pick<ForestDriver, "significant" | "excludesZero" | "survivesFdr">, fdrShort: string | null = null): string {
  if (x.significant) return fdrShort ? `significant (${fdrShort})` : "significant";
  if (x.excludesZero === false) return "CI spans 0";
  if (x.survivesFdr === false) return "fails FDR";
  return "not significant";
}

/** The GP shape as a word (the column), with the engine's optimum location when it gave one. */
export function shapeWord(s: ForestShape): string {
  const at = s.optimumAt != null ? formatSetting(s.optimumAt).text : null;
  switch (s.shape) {
    case "flat":
      return "flat";
    case "monotonic_up":
      return "rising";
    case "monotonic_down":
      return "falling";
    case "interior_optimum":
      return at ? `optimum ${at}` : "interior optimum";
    case "interior_minimum":
      return at ? `minimum ${at}` : "interior minimum";
    default:
      return String(s.shape);
  }
}

/** Shown when the correlation misses a curved effect the model sees. */
export const MISSED_TEXT = "Correlation misses a curved effect the model sees";

/** Pure aria description of the whole forest. */
export function describeDriverForest(data: DriverForestData, target: string): string {
  if (!data.drivers.length) return emptyDriversText(data);
  const sig = data.drivers.filter((x) => x.significant);
  const head = `Spearman rank correlation of ${data.drivers.length} ${data.drivers.length === 1 ? "input" : "inputs"} with ${target}, ${formatCorr(0, [0, 0]).coverage} CI, on a scale from −1 to 1.`;
  const verdict = sig.length
    ? `${sig.length} significant after FDR control: ${sig.map((x) => `${x.name} ${formatCorr(x.rho, x.ci).text}`).join("; ")}.`
    : "None is significant after FDR control.";
  const rest = data.drivers.filter((x) => !x.significant);
  const others = rest.length ? ` Not significant: ${rest.map((x) => `${x.name} ${formatCorr(x.rho).value} (${driverStatus(x)})`).join("; ")}.` : "";
  const shapes =
    data.shapes.kind === "not-scored"
      ? ` Model shapes not scored: ${data.shapes.reason}.`
      : data.shapes.kind === "ready"
        ? (() => {
            const map = data.shapes.shapes;
            const parts = data.drivers.filter((x) => map[x.name]).map((x) => `${x.name} ${shapeWord(map[x.name])}`);
            return parts.length ? ` Model shapes: ${parts.join("; ")}.` : "";
          })()
        : "";
  return `${head} ${verdict}${others}${shapes}`;
}

export function emptyDriversText(data: Pick<DriverForestData, "nTested">): string {
  return data.nTested != null
    ? `No input showed a rank association with the target (${formatValue(data.nTested, { quantity: "count" }).text} tested).`
    : "This analysis reported no drivers.";
}

/** The Data disclosure: every plotted value, formatted as on the chart. */
export function driverForestTable(data: DriverForestData): { columns: string[]; rows: string[][] } {
  const cov = formatCorr(0, [0, 0]).coverage;
  const withShapes = data.shapes.kind === "ready";
  const columns = ["Input", "ρ", `${cov} CI`, "p", "Verdict", ...(withShapes ? ["Model shape", "Relevance"] : [])];
  const rows = data.drivers.map((x) => {
    const f = formatCorr(x.rho, x.ci);
    const base = [x.name, f.value, f.interval ?? "n/a", formatP(x.p).text, driverStatus(x, data.fdrShort)];
    if (data.shapes.kind !== "ready") return base;
    const s = data.shapes.shapes[x.name];
    return [...base, s ? `${shapeWord(s)}${s.missedBySpearman ? " (missed by correlation)" : ""}` : "n/a", s ? formatValue(s.relevance, { quantity: "score" }).text : "n/a"];
  });
  return { columns, rows };
}

/** The one footer line every chart carries (VIZ_SPEC 2.7): "From: <label> · n = <n> · <method> · engine <version>". */
export function sourceFooter(s: { label: string; engineVersion?: string; method?: string }, n?: { value: number | null; word?: string | null } | null): string {
  const parts = [`From: ${s.label}`];
  if (n && n.value != null && Number.isFinite(n.value)) parts.push(`n = ${formatValue(n.value, { quantity: "count" }).text}${n.word ? ` ${n.word}${n.value === 1 ? "" : "s"}` : ""}`);
  if (s.method) parts.push(s.method);
  parts.push(`engine ${s.engineVersion ?? "n/a"}`);
  return parts.join(" · ");
}
