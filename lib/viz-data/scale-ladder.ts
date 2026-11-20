/*
 * C9 ScaleLadderChart adapter (VIZ_SPEC 5, C9): the JSON scale-up readout
 * (POST /api/scale/readout.json) into chart props. Pure and DOM-free, so the
 * mapping, the description and the data table are unit tested
 * (__tests__/viz-scale-ladder.test.ts).
 *
 * Every plotted value is an engine field: measured `scale_points[].actual`,
 * backtest `scale_points[].oof_pred`, the rung MAEs and their two naive
 * baselines, the target prediction with its interval and the engine's
 * coverage, and the licensed / warning / refused zones from `zones`. Nothing
 * is averaged, fitted or extrapolated here. Stage volume bands are a program
 * definition, not data: the campaign's own GET /stages when there is one,
 * otherwise the engine's default stage definitions below, labelled as such.
 */
import type { StageDef } from "@/lib/api";
import { columnDecimals, coverageText, formatValue, formatVolume, type IntervalSpec } from "@/lib/num";
import type { DivergencePerScale, ReadoutDecision, ReadoutRung, ScaleReadout } from "@/lib/scale-readout";
import type { Basis } from "@/lib/num";
import type { Source } from "@/lib/source";

export type LadderStageBand = { key: string; label: string; minL: number; maxL: number };

/**
 * The engine's default stage definitions (GET /api/campaigns/{id}/stages with
 * `source: "default"`), copied verbatim: a program definition, not data. Used
 * only outside a campaign, and always labelled "default stage volume ranges".
 * S1 (media screen) and S6 (handoff) have no volume and appear only in C11.
 */
export const DEFAULT_STAGE_VOLUMES: readonly LadderStageBand[] = [
  { key: "S2", label: "HT microbioreactor", minL: 0.0001, maxL: 0.003 },
  { key: "S3", label: "Flask", minL: 0.05, maxL: 0.25 },
  { key: "S4", label: "Bench bioreactor", minL: 0.5, maxL: 1.0 },
  { key: "S5", label: "Bioreactor", minL: 2.0, maxL: 50.0 },
];

export type LadderStages = { bands: LadderStageBand[]; source: "campaign" | "default" };

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Where a readout number came from (VIZ_SPEC 2.7): the readout id, its engine build, the upload hash and time. */
export function sourceFromReadout(r: Pick<ScaleReadout, "readout_id" | "generated_at_utc" | "provenance" | "target_inputs">, field: string, basis: Basis, fileName?: string | null): Source {
  const t = r.generated_at_utc ? Date.parse(r.generated_at_utc) : NaN;
  const out: Source = {
    label: fileName ? `Scale-up readout of ${fileName}` : "Scale-up readout",
    field,
    basis,
    method: `readout ${r.readout_id}`,
  };
  if (fileName) out.dataset = fileName;
  if (r.provenance?.raw_upload_sha256) out.inputSha256 = r.provenance.raw_upload_sha256;
  if (r.provenance?.engine_version) out.engineVersion = r.provenance.engine_version;
  if (r.provenance?.kalos_git_sha) out.buildSha = r.provenance.kalos_git_sha;
  if (typeof r.provenance?.seed === "number") out.seed = r.provenance.seed;
  if (Number.isFinite(t)) out.timestamp = t;
  return out;
}

/** Stage bands from a campaign's GET /stages: only stages with a volume range. */
export function stageBandsFromStages(stages: readonly Pick<StageDef, "key" | "label" | "min_L" | "max_L">[]): LadderStageBand[] {
  return stages
    .filter((s) => finite(s.min_L) && finite(s.max_L) && s.min_L > 0 && s.max_L >= s.min_L)
    .map((s) => ({ key: s.key, label: s.label, minL: s.min_L as number, maxL: s.max_L as number }));
}

export type LadderPoint = { scaleL: number; actual: number; oofPred: number | null; index: number };

export type LadderRungRow = {
  scaleL: number;
  stepRatio: number | null;
  n: number;
  mae: number | null;
  naiveMean: number | null;
  naiveNN: number | null;
  beatsBoth: boolean | null;
  tooFew: boolean;
  inWindow: boolean | null;
  measuredMean: number | null;
  backtestPredMean: number | null;
  /** Divergence codes the engine set for this scale (did_not_beat_baselines, outside_backtest_band). */
  codes: string[];
  bandHalfWidth: number | null;
  outsideBand: boolean | null;
  bandUnavailableReason: string | null;
};

export type LadderTarget = {
  scaleL: number;
  decision: ReadoutDecision;
  prediction: number | null;
  interval: IntervalSpec | null;
  /** The engine's own interval label, printed as sent. */
  intervalLabel: string;
  reasons: string[];
  dataPlan: string[];
};

export type LadderZones = { fromL: number; licensedMaxL: number; warnMaxL: number; hardCapL: number; rule: string | null };

export type LadderData = {
  target: string;
  unit: string | null;
  readoutId: string;
  points: LadderPoint[];
  rungs: LadderRungRow[];
  skipped: { scaleL: number; reason: string }[];
  /** "nested leave-last-scale-out" and the engine's description of it. */
  backtest: { label: string; description: string | null } | null;
  divergence: { computed: boolean; reason: string | null; rule: string | null };
  prediction: LadderTarget;
  outOfRange: string[];
  zones: LadderZones | null;
  stages: LadderStages;
  /** The engine's minimum runs per rung (MIN_RUNG_N_FOR_LICENSE), when it sent its constants. */
  minRungN: number | null;
  /** Shared log x domain in liters. */
  xDomain: [number, number];
  /** Value domain of the top panel: every point, every backtest prediction and the target interval. */
  yDomain: [number, number] | null;
  /** MAE domain of the bottom panel (from 0). */
  maeDomain: [number, number] | null;
  decimals: { value: number; mae: number };
};

/** The backtest method in words. The engine's method is nested leave-LAST-scale-out; it is never called leave-one-scale-out. */
export function backtestMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  if (method === "nested_leave_last_scale_out") return "nested leave-last-scale-out";
  return method.replace(/_/g, " ");
}

/** The divergence codes as chip words (VIZ_SPEC 2.6). Unknown codes keep the engine's word with spaces. */
export function divergenceWord(code: string): string {
  if (code === "did_not_beat_baselines") return "did not beat baselines";
  if (code === "outside_backtest_band") return "outside backtest band";
  return code.replace(/_/g, " ");
}

const DECISION_CHIP: Record<ReadoutDecision, { word: string; tone: "neutral" | "warn" | "refused" }> = {
  NUMBER: { word: "Prediction", tone: "neutral" },
  NUMBER_WITH_WARNING: { word: "Prediction with warning", tone: "warn" },
  REFUSAL: { word: "Refused", tone: "refused" },
};

/** The decision chip: NUMBER "Prediction" (neutral), with-warning (warn), REFUSAL "Refused" (hatch, never red). */
export const decisionChip = (d: ReadoutDecision) => DECISION_CHIP[d];

function sameScale(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function toScaleLadderData(r: ScaleReadout, stages: LadderStages = { bands: [...DEFAULT_STAGE_VOLUMES], source: "default" }): LadderData {
  const points: LadderPoint[] = (r.scale_points ?? [])
    .filter((p) => finite(p.scale_L) && p.scale_L > 0 && finite(p.actual))
    .map((p, index) => ({ scaleL: p.scale_L, actual: p.actual, oofPred: finite(p.oof_pred) ? p.oof_pred : null, index }));

  // backtest.per_scale carries the means; fall back to the top-level rungs on a build without it.
  const perScale: ReadoutRung[] = r.backtest?.per_scale?.length ? r.backtest.per_scale : r.rungs ?? [];
  const div = r.divergence && r.divergence.computed ? r.divergence : null;
  const divFor = (s: number): DivergencePerScale | undefined => div?.per_scale.find((d) => sameScale(d.scale_L, s));
  const flagFor = (s: number): string[] => div?.flags.find((f) => sameScale(f.scale_L, s))?.codes ?? [];
  const rungFor = (s: number) => (r.rungs ?? []).find((x) => sameScale(x.scale_L, s));
  const rungs: LadderRungRow[] = perScale
    .filter((x) => finite(x.scale_L) && x.scale_L > 0)
    .map((x) => {
      const d = divFor(x.scale_L);
      const codes = [...new Set([...(d?.codes ?? []), ...flagFor(x.scale_L)])];
      const inWindow = x.in_license_window ?? rungFor(x.scale_L)?.in_license_window;
      return {
        scaleL: x.scale_L,
        stepRatio: finite(x.step_ratio) ? x.step_ratio : null,
        n: x.n,
        mae: finite(x.mae) ? x.mae : null,
        naiveMean: finite(x.naive_mean_mae) ? x.naive_mean_mae : null,
        naiveNN: finite(x.naive_nn_mae) ? x.naive_nn_mae : null,
        beatsBoth: x.beats_both ?? null,
        tooFew: !!x.too_few_to_judge,
        inWindow: inWindow ?? null,
        measuredMean: finite(x.measured_mean) ? x.measured_mean : (d && finite(d.measured_mean) ? d.measured_mean : null),
        backtestPredMean: finite(x.backtest_pred_mean) ? x.backtest_pred_mean : (d && finite(d.backtest_pred_mean) ? d.backtest_pred_mean : null),
        codes,
        bandHalfWidth: d && finite(d.band_half_width) ? d.band_half_width : null,
        outsideBand: d?.outside_band ?? null,
        bandUnavailableReason: d?.band_unavailable_reason ?? null,
      };
    });

  const skipped = (r.backtest?.skipped?.length ? r.backtest.skipped : r.skipped_rungs ?? [])
    .filter((s) => finite(s.scale_L) && s.scale_L > 0)
    .map((s) => ({ scaleL: s.scale_L, reason: s.reason }));

  const targetL = r.target_inputs?.scale_L;
  const refused = r.decision === "REFUSAL";
  const lohi = !refused && r.interval && finite(r.interval[0]) && finite(r.interval[1]) ? r.interval : null;
  const prediction: LadderTarget = {
    scaleL: targetL,
    decision: r.decision,
    prediction: !refused && finite(r.prediction) ? r.prediction : null,
    interval: lohi ? { lo: lohi[0], hi: lohi[1], coverage: finite(r.interval_coverage) ? r.interval_coverage : null, method: "scale-ladder" } : null,
    intervalLabel: r.interval_label,
    reasons: r.reasons ?? [],
    dataPlan: r.data_plan ?? [],
  };

  const maxTrained = finite(r.max_trained_scale_L) ? r.max_trained_scale_L : points.length ? Math.max(...points.map((p) => p.scaleL)) : null;
  const z = r.zones;
  const zones: LadderZones | null =
    z && finite(z.licensed_max_L) && finite(z.warn_max_L) && finite(z.hard_cap_L) && maxTrained != null
      ? { fromL: maxTrained, licensedMaxL: z.licensed_max_L, warnMaxL: z.warn_max_L, hardCapL: z.hard_cap_L, rule: z.rule ?? null }
      : null;

  const xs = [...points.map((p) => p.scaleL), ...rungs.map((x) => x.scaleL), ...skipped.map((s) => s.scaleL), ...(finite(targetL) ? [targetL] : []), ...(zones ? [zones.hardCapL] : [])].filter(
    (v) => v > 0,
  );
  const xLo = xs.length ? Math.min(...xs) : 1;
  const xHi = xs.length ? Math.max(...xs) : 10;
  // A third of a decade of air on each side, so the end marks never sit on the frame.
  const xDomain: [number, number] = [xLo / 10 ** (1 / 3), xHi * 10 ** (1 / 3)];

  const ys = [
    ...points.flatMap((p) => [p.actual, ...(p.oofPred != null ? [p.oofPred] : [])]),
    ...(prediction.prediction != null ? [prediction.prediction] : []),
    ...(prediction.interval ? [prediction.interval.lo, prediction.interval.hi] : []),
  ].filter(Number.isFinite);
  let yDomain: [number, number] | null = null;
  if (ys.length) {
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (hi === lo) {
      const pad = Math.abs(lo) * 0.1 || 1;
      lo -= pad;
      hi += pad;
    }
    yDomain = [lo, hi];
  }
  const maes = rungs.flatMap((x) => [x.mae, x.naiveMean, x.naiveNN]).filter(finite);
  const maeDomain: [number, number] | null = maes.length ? [0, Math.max(...maes)] : null;

  const minRungN = r.provenance?.constants?.MIN_RUNG_N_FOR_LICENSE;
  return {
    target: r.target_column,
    unit: r.target_column_unit ?? null,
    readoutId: r.readout_id,
    points,
    rungs,
    skipped,
    backtest: r.backtest ? { label: backtestMethodLabel(r.backtest.method) ?? "backtest", description: r.backtest.method_description ?? null } : null,
    divergence: r.divergence
      ? { computed: r.divergence.computed, reason: r.divergence.computed ? null : (r.divergence.reason ?? null), rule: r.divergence.rule ?? null }
      : { computed: false, reason: null, rule: null },
    prediction,
    outOfRange: r.out_of_range_params ?? [],
    zones,
    stages,
    minRungN: typeof minRungN === "number" && Number.isFinite(minRungN) ? minRungN : null,
    xDomain,
    yDomain,
    maeDomain,
    decimals: {
      value: columnDecimals(points.flatMap((p) => [{ value: p.actual, u: null }, ...(p.oofPred != null ? [{ value: p.oofPred, u: null }] : [])])),
      mae: columnDecimals(maes.map((value) => ({ value, u: null }))),
    },
  };
}

/** Stage bands that overlap the chart's x domain (clipped), and the ones that lie outside it. */
export function visibleStageBands(d: Pick<LadderData, "stages" | "xDomain">): { shown: LadderStageBand[]; outside: LadderStageBand[] } {
  const [lo, hi] = d.xDomain;
  const shown: LadderStageBand[] = [];
  const outside: LadderStageBand[] = [];
  for (const b of d.stages.bands) {
    if (b.maxL < lo || b.minL > hi) outside.push(b);
    else shown.push({ ...b, minL: Math.max(lo, b.minL), maxL: Math.min(hi, b.maxL) });
  }
  return { shown, outside };
}

/** The chip word for a held-out scale whose backtest band could not be computed (the engine's reason is its tooltip). */
export const NO_BAND = "backtest band n/a";
/** A rung too far below the largest scale to vouch for a step at the target. */
export const OUTSIDE_WINDOW = "outside license window";

/** Flags on a rung as chip words: the engine's divergence codes, plus "n < N", "outside license window" and "backtest band n/a". */
export function rungFlags(x: LadderRungRow, minRungN: number | null): string[] {
  const flags = x.codes.map(divergenceWord);
  if (x.beatsBoth === false && !x.codes.includes("did_not_beat_baselines") && !x.tooFew) flags.push("did not beat baselines");
  if (x.tooFew) flags.push(minRungN != null ? `n < ${formatValue(minRungN, { quantity: "count" }).text}` : "too few to judge");
  if (x.inWindow === false) flags.push(OUTSIDE_WINDOW);
  if (x.bandUnavailableReason) flags.push(NO_BAND);
  return flags;
}

const vol = (l: number) => formatVolume(l).text;
const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/** The prediction as one line: "6.1 [5.6, 6.7] 90%" (coverage from the engine), or the refusal. */
export function predictionText(d: LadderData, unit: string | null = d.unit): string {
  const p = d.prediction;
  if (p.decision === "REFUSAL" || p.prediction == null) return `Refused: ${p.reasons[0] ?? "no reason given"}`;
  return formatValue(p.prediction, { basis: "predicted", unit, interval: p.interval }).text;
}

/** The plotted values as a table (Data disclosure, print and copy path): one row per scale, then the target. */
export function scaleLadderTable(d: LadderData): { columns: string[]; rows: string[][] } {
  const u = d.unit ? ` (${d.unit})` : "";
  const cov = coverageText(d.prediction.interval?.coverage);
  const columns = ["Scale", "Runs", `Measured mean${u}`, `Backtest prediction mean${u}`, `Model MAE${u}`, `Carry-mean MAE${u}`, `Nearest-recipe MAE${u}`, "Flags"];
  const mae = (v: number | null) => (v == null ? "n/a" : formatValue(v, { decimals: d.decimals.mae }).text);
  const val = (v: number | null) => (v == null ? "n/a" : formatValue(v).text);
  const rowsByScale = new Map<number, string[]>();
  const pointsAt = (s: number) => d.points.filter((p) => sameScale(p.scaleL, s)).length;
  for (const x of d.rungs) {
    const flags = rungFlags(x, d.minRungN);
    rowsByScale.set(x.scaleL, [vol(x.scaleL), count(x.n), val(x.measuredMean), val(x.backtestPredMean), mae(x.mae), mae(x.naiveMean), mae(x.naiveNN), flags.length ? flags.join(", ") : "none"]);
  }
  for (const s of d.skipped) {
    rowsByScale.set(s.scaleL, [vol(s.scaleL), count(pointsAt(s.scaleL)), "n/a", "n/a", "n/a", "n/a", "n/a", `skipped: ${s.reason}`]);
  }
  for (const s of [...new Set(d.points.map((p) => p.scaleL))]) {
    if (![...rowsByScale.keys()].some((k) => sameScale(k, s))) {
      rowsByScale.set(s, [vol(s), count(pointsAt(s)), "n/a", "n/a", "n/a", "n/a", "n/a", "training only (never held out)"]);
    }
  }
  const rows = [...rowsByScale.entries()].sort(([a], [b]) => a - b).map(([, r]) => r);
  const p = d.prediction;
  const targetCell =
    p.decision === "REFUSAL" || p.prediction == null
      ? `Refused: ${p.reasons.join("; ") || "no reason given"}`
      : `predicted ${formatValue(p.prediction, { basis: "predicted", interval: p.interval }).value}${p.interval ? ` ${formatValue(p.prediction, { interval: p.interval }).interval} ${cov ?? ""}`.trimEnd() : " (no interval reported)"}`;
  rows.push([`${vol(p.scaleL)} (target)`, "n/a", "n/a", "n/a", "n/a", "n/a", "n/a", targetCell]);
  return { columns, rows };
}

/** Plain-language description (the chart's aria-label and screen-reader summary). */
export function describeScaleLadder(d: LadderData): string {
  const scales = [...new Set(d.points.map((p) => p.scaleL))].sort((a, b) => a - b);
  const parts: string[] = [];
  if (scales.length) {
    parts.push(`Measured ${d.target} at ${count(scales.length)} scales from ${vol(scales[0])} to ${vol(scales[scales.length - 1])} (${count(d.points.length)} runs).`);
  } else {
    parts.push(`No measured points were returned for ${d.target}.`);
  }
  const held = d.rungs.length;
  if (held) {
    const beat = d.rungs.filter((x) => x.beatsBoth === true).length;
    parts.push(
      `${count(held)} ${held === 1 ? "scale was" : "scales were"} held out and predicted from smaller scales only (${d.backtest?.label ?? "backtest"}); the model beat both naive baselines at ${count(beat)} of ${count(held)}.`,
    );
  }
  const flagged = d.rungs.filter((x) => x.codes.length);
  for (const x of flagged) parts.push(`${vol(x.scaleL)}: ${x.codes.map(divergenceWord).join(", ")}.`);
  if (d.skipped.length) parts.push(`${count(d.skipped.length)} ${d.skipped.length === 1 ? "scale" : "scales"} skipped: ${d.skipped.map((s) => vol(s.scaleL)).join(", ")}.`);
  const p = d.prediction;
  if (p.decision === "REFUSAL" || p.prediction == null) {
    parts.push(`At the target ${vol(p.scaleL)} the engine refused: ${p.reasons.join("; ") || "no reason given"}.`);
  } else {
    const f = formatValue(p.prediction, { basis: "predicted", unit: d.unit, interval: p.interval });
    parts.push(`At the target ${vol(p.scaleL)} the engine predicts ${f.value}${f.interval ? ` ${f.interval}` : " with no interval reported"}${f.coverage ? `, ${f.coverage} approximate coverage` : ""}${p.decision === "NUMBER_WITH_WARNING" ? ", with a warning" : ""}.`);
  }
  if (d.zones) parts.push(`Ratio zones: licensed to ${vol(d.zones.licensedMaxL)}, warning to ${vol(d.zones.warnMaxL)}, refused beyond.`);
  if (d.unit) parts.push(`Values in ${d.unit}.`);
  return parts.join(" ");
}
