/*
 * C8 ReliabilityScorecard adapter (VIZ_SPEC 5, C8). Pure: the engine's
 * reliability fields -> rows on one shared rho axis, the trust floor, the
 * top-k hit count and the promotion checklist, plus the Data table and the
 * description. Every rho, CI, floor and verdict is an engine field; the only
 * arithmetic is min/max for the axis, the top-k hit count (overlap x k, the
 * same exact product `cvTopKNote` prints) and counting checklist lines.
 *
 * The CV rho and its CI are the engine's `cv_spearman` / `cv_ci95`, a 95%
 * interval by the engine's own field name; that is why "95% CI" appears here
 * and nowhere is it computed.
 */
import type { DataTable } from "@/components/viz/frame";
import {
  groupMeanBaselineVerdict,
  isUnmeasuredFailure,
  reliabilityVerdict,
  type AnalyzeResult,
  type Promotion,
  type Reliability,
  type ReliabilityVerdict,
} from "@/lib/api";
import { formatCorr, formatState, formatValue, type NumState } from "@/lib/num";

export type ScorecardInput = Pick<
  AnalyzeResult,
  "cv_spearman" | "cv_ci95" | "cv_n_groups" | "cv_n_repeats" | "cv_spearman_per_repeat" | "cv_logo" | "cv_topk" | "cv_group_mean_baseline" | "n"
> & {
  reliability?: Reliability & { space_filling_advice?: string | null };
  promotion?: (Promotion & { not_judged?: string[] }) | null;
};

export type ScoreRowKey = "cv" | "group-mean" | "logo" | "producers";

export type ScoreRow = {
  key: ScoreRowKey;
  label: string;
  rho: number | null;
  ci: [number, number] | null;
  /** Finite per-repeat rho (model row only, and only with 2+ repeats). */
  repeats: number[];
  /** `value` when `rho` is plotted; otherwise the designed state with the engine's reason. */
  state: NumState;
  note: string | null;
};

export type TopK = { hits: number; k: number; n: number };

export type GateStatus = "passed" | "missed" | "unmeasured" | "not-judged";

export type Gate = {
  key: string;
  label: string;
  status: GateStatus;
  /** The engine's metric value for this gate, when it reported one. */
  value: number | null;
  /** The engine's own line for a failed or not-judged gate, verbatim. */
  engine: string | null;
};

export type PromotionChecklist = {
  passed: boolean;
  gates: Gate[];
  /** Gates the engine measured or tried to (passed + missed + unmeasured). */
  judged: number;
  nPassed: number;
  meaning: string | null;
};

export type ScorecardData = {
  verdict: ReliabilityVerdict;
  /** Rows with a plotted rho (model first). */
  rows: ScoreRow[];
  /** Rows the engine declined to score, with its reason (shown as text, never plotted). */
  unscored: ScoreRow[];
  floor: number | null;
  topk: TopK | Extract<NumState, { kind: "not-scored" }> | null;
  promotion: PromotionChecklist | null;
  /** Shared rho axis: min(0, lowest plotted value) - 0.05 to 1. */
  domain: [number, number];
  /** "1 partition only; ..." when the engine ran a single partition. */
  repeatCaption: string | null;
  /** The group-mean baseline beats or ties the model (raise the warn callout). */
  baseline: { text: string; prominent: boolean } | null;
  evidence: { n: number | null; groups: number | null; repeats: number | null };
};

/** Plain labels for the engine's promotion metrics (its four gates); unknown keys show as sent. */
export const METRIC_LABEL: Record<string, string> = {
  surrogate_spearman: "Held-out rank agreement",
  feasibility_auc: "Feasibility classifier AUC",
  ece: "Interval calibration error (ECE)",
  brier: "Feasibility Brier score",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The promotion verdict as a checklist. A metric is "passed" only when the engine reported it and named no failure for it. */
export function promotionChecklist(p: ScorecardInput["promotion"]): PromotionChecklist | null {
  if (!p) return null;
  const failures = p.failures ?? [];
  const metrics = p.metrics ?? {};
  const keyOf = (f: string) => f.match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
  const failed = new Map<string, string>();
  const loose: string[] = [];
  for (const f of failures) {
    const k = keyOf(f);
    if (k && !failed.has(k)) failed.set(k, f);
    else loose.push(f);
  }
  const gates: Gate[] = [];
  const keys = [...Object.keys(METRIC_LABEL), ...[...failed.keys()].filter((k) => !(k in METRIC_LABEL))];
  for (const key of keys) {
    const f = failed.get(key);
    const value = isNum(metrics[key]) ? metrics[key] : null;
    if (f) gates.push({ key, label: METRIC_LABEL[key] ?? key, status: isUnmeasuredFailure(f) ? "unmeasured" : "missed", value, engine: f });
    else if (value != null && key in METRIC_LABEL) gates.push({ key, label: METRIC_LABEL[key], status: "passed", value, engine: null });
  }
  for (const f of loose) gates.push({ key: f, label: f, status: isUnmeasuredFailure(f) ? "unmeasured" : "missed", value: null, engine: f });
  for (const nj of p.not_judged ?? []) {
    const i = nj.indexOf(":");
    gates.push({ key: nj, label: i > 0 ? nj.slice(0, i).trim() : nj, status: "not-judged", value: null, engine: i > 0 ? nj.slice(i + 1).trim() : null });
  }
  const nPassed = gates.filter((g) => g.status === "passed").length;
  const judged = gates.filter((g) => g.status !== "not-judged").length;
  return { passed: p.passed, gates, judged, nPassed, meaning: p.meaning || null };
}

/** Every engine field the scorecard needs, as rows on one rho axis. */
export function toScorecard(d: ScorecardInput): ScorecardData {
  const verdict = reliabilityVerdict(d);
  const rel = d.reliability;
  const all: ScoreRow[] = [];
  const perRepeat = (d.cv_spearman_per_repeat ?? []).filter(isNum);
  const nRepeats = d.cv_n_repeats ?? null;
  all.push({
    key: "cv",
    label: "Model, grouped CV",
    rho: verdict.rho,
    ci: verdict.ci,
    repeats: perRepeat.length >= 2 ? perRepeat : [],
    state: verdict.rho != null ? { kind: "value" } : { kind: "not-scored", reason: verdict.reason },
    note: nRepeats != null ? `${formatValue(nRepeats, { quantity: "count" }).text} ${nRepeats === 1 ? "partition" : "repeats"}` : null,
  });

  const gm = d.cv_group_mean_baseline;
  const gmv = groupMeanBaselineVerdict(d.cv_spearman, gm);
  if (gm) {
    all.push({
      key: "group-mean",
      label: "Group-mean baseline",
      rho: isNum(gm.spearman) ? gm.spearman : null,
      ci: null,
      repeats: [],
      state: isNum(gm.spearman) ? { kind: "value" } : { kind: "not-scored", reason: gm.reason ?? "not scored by the engine" },
      note: isNum(gm.spearman) ? (gmv?.prominent ? "the model does not beat it" : "the model beats it") : null,
    });
  }

  const logo = d.cv_logo;
  if (logo) {
    const groups = isNum(logo.n_groups) ? `${formatValue(logo.n_groups, { quantity: "count" }).text} ${logo.n_groups === 1 ? "group" : "groups"}` : null;
    all.push({
      key: "logo",
      label: "Next unseen group (LOGO)",
      rho: isNum(logo.spearman) ? logo.spearman : null,
      ci: null,
      repeats: [],
      state: isNum(logo.spearman) ? { kind: "value" } : { kind: "not-scored", reason: logo.reason ?? "not scored by the engine" },
      note: isNum(logo.spearman) ? [groups, isNum(logo.n_oof) ? `n = ${formatValue(logo.n_oof, { quantity: "count" }).text}` : null].filter(Boolean).join(", ") || null : null,
    });
  }

  if (rel && rel.producer_spearman !== undefined) {
    const np = isNum(rel.n_producers) ? formatValue(rel.n_producers, { quantity: "count" }).text : null;
    const thr = isNum(rel.producer_threshold) ? formatValue(rel.producer_threshold).text : null;
    all.push({
      key: "producers",
      label: "Producers only",
      rho: isNum(rel.producer_spearman) ? rel.producer_spearman : null,
      ci: null,
      repeats: [],
      state: isNum(rel.producer_spearman) ? { kind: "value" } : { kind: "na", reason: np != null ? `${np} producing runs` : undefined },
      note: isNum(rel.producer_spearman)
        ? [np != null ? `${np} runs above ${thr ?? "the threshold"}` : null, rel.producer_clears_floor ? "clears the floor" : "below the floor"].filter(Boolean).join(", ")
        : null,
    });
  }

  const rows = all.filter((r) => r.state.kind === "value");
  const unscored = verdict.rho == null ? [] : all.filter((r) => r.state.kind !== "value");
  const values = rows.flatMap((r) => [r.rho, ...(r.ci ?? []), ...r.repeats]).filter(isNum);
  const lo = Math.min(0, ...values, ...(isNum(verdict.floor) ? [verdict.floor] : [])) - 0.05;

  const tk = d.cv_topk;
  const topk: ScorecardData["topk"] = !tk
    ? null
    : !tk.evaluable || !isNum(tk.overlap)
      ? { kind: "not-scored", reason: tk.reason ?? "not scored by the engine" }
      : { hits: Math.round(tk.overlap * tk.k), k: tk.k, n: tk.n };

  return {
    verdict,
    rows: verdict.rho == null ? [] : rows,
    unscored,
    floor: verdict.floor,
    topk,
    promotion: promotionChecklist(d.promotion),
    domain: [lo, 1],
    repeatCaption: nRepeats === 1 ? "1 partition only; the interval reflects group resampling." : null,
    baseline: gmv ? { text: baselineText(gm!), prominent: gmv.prominent } : null,
    evidence: { n: isNum(d.n) ? d.n : null, groups: isNum(d.cv_n_groups) ? d.cv_n_groups : null, repeats: nRepeats },
  };
}

/** The group-mean baseline in words, numbers through lib/num; the engine's reason or interpretation verbatim. */
function baselineText(gm: NonNullable<ScorecardInput["cv_group_mean_baseline"]>): string {
  if (!isNum(gm.spearman)) return gm.reason ?? "Not scored.";
  const c = (v: number) => formatValue(v, { quantity: "count" }).text;
  return `Group-mean baseline ${formatCorr(gm.spearman).text} (${c(gm.n_evaluable)} rows, ${c(gm.n_groups_used)} groups)${gm.interpretation ? `: ${gm.interpretation}` : ""}`;
}

/** A rho as "ρ 0.71 [0.59, 0.79] 95% CI" (CI only when the engine sent one). */
export const rhoText = (r: Pick<ScoreRow, "rho" | "ci">): string => formatCorr(r.rho, r.ci).text;

/** "Top-5 caught" for a scored top-k, "Top-k caught" when the engine declined it. */
export function topkLabel(t: ScorecardData["topk"]): string {
  return t && !("kind" in t) ? `Top-${formatValue(t.k, { quantity: "count" }).text} caught` : "Top-k caught";
}

/** "4 of 5 (n = 165)": of the true top-k held-out recipes, how many the model's top-k caught; or "Not scored: <reason>". */
export function topkValue(t: ScorecardData["topk"]): string | null {
  if (!t) return null;
  if ("kind" in t) return `${formatState(t).text}: ${t.reason}`;
  const c = (v: number) => formatValue(v, { quantity: "count" }).text;
  return `${c(t.hits)} of ${c(t.k)} (n = ${c(t.n)})`;
}

/** "Top-5 caught: 4 of 5 (n = 165)" or "Not scored: <engine reason>". */
export function topkText(t: ScorecardData["topk"]): string | null {
  if (!t) return null;
  if ("kind" in t) return topkValue(t);
  return `${topkLabel(t)}: ${topkValue(t)}`;
}

/** The plain-language description (also the chart's aria-label). */
export function describeScorecard(s: ScorecardData): string {
  const parts = [`Model reliability: ${s.verdict.label}.`];
  if (s.verdict.rho == null) {
    parts.push(s.verdict.reason);
    return parts.join(" ");
  }
  for (const r of s.rows) {
    const reps = r.repeats.length ? `, per repeat ${r.repeats.map((v) => formatCorr(v).value).join(", ")}` : "";
    parts.push(`${r.label}: ${rhoText(r)}${reps}${r.note ? ` (${r.note})` : ""}.`);
  }
  parts.push(s.floor != null ? `Trust floor ${formatCorr(s.floor).value}.` : "No trust floor reported.");
  for (const r of s.unscored) parts.push(`${r.label}: ${formatState(r.state).text}${r.state.kind === "not-scored" ? `, ${r.state.reason}` : ""}.`);
  const tk = topkText(s.topk);
  if (tk) parts.push(s.topk && "kind" in s.topk ? `Top-k caught: ${tk}.` : `${tk}.`);
  if (s.promotion) parts.push(`Promotion gates ${s.promotion.passed ? "passed" : "not passed"}: ${s.promotion.nPassed} of ${s.promotion.judged} passed.`);
  return parts.join(" ");
}

/** The plotted values as a table (same formatting as the chart). */
export function scorecardTable(s: ScorecardData): DataTable {
  const rows: (string | number)[][] = [...s.rows, ...s.unscored].map((r) => {
    const f = formatCorr(r.rho, r.ci);
    return [
      r.label,
      r.state.kind === "value" ? f.value : formatState(r.state).text,
      f.interval ?? "n/a",
      r.repeats.length ? r.repeats.map((v) => formatCorr(v).value).join(", ") : "n/a",
      r.state.kind === "not-scored" ? r.state.reason : (r.note ?? ""),
    ];
  });
  if (s.floor != null) rows.push(["Trust floor (engine)", formatCorr(s.floor).value, "n/a", "n/a", ""]);
  return { columns: ["Check", "ρ", "95% CI", "Per repeat", "Note"], rows };
}

/** The one ChartFrame footer line (VIZ_SPEC 2.7): "From: <label> · n = <n> · <method> · engine <version>". */
export function sourceFooter(source: { label: string; engineVersion?: string }, n: number | null, method: string | null): string {
  return [
    `From: ${source.label}`,
    n != null ? `n = ${formatValue(n, { quantity: "count" }).text}` : null,
    method,
    source.engineVersion ? `engine ${source.engineVersion}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
