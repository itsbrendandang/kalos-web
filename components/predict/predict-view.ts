/*
 * Pure rules behind the Predict page (app/campaigns/[id]/predict): the trust
 * evidence, the driver split, the promotion lines and the one-line verdict.
 * Every value is an engine field or reads "n/a"; verdicts are only the
 * engine's own (reliability floor, promotion gates, driver significance).
 * Tested in __tests__/predict-view.test.ts.
 */

import type { PlanAnalysis } from "@/components/campaign/plan-view";
import {
  isUnmeasuredFailure,
  Z_STD_TOLERANCE,
  type Diagnostics,
  type Driver,
  type Promotion,
  type Reliability,
  type ReliabilityVerdict,
} from "@/lib/api";
import { formatNumber, formatRange } from "@/lib/format";

// --- Engine fields newer than lib/api.ts -------------------------------------
// Typed here, optional, so the page degrades on engines that do not send them.

/** `proposal_provenance`: what produced this batch (hashes, seed, engine build). */
export type ProposalProvenance = {
  schema_version?: number;
  engine_version?: string;
  build_sha?: string;
  seed?: number;
  input_sha256?: string;
  config_sha256?: string;
  provenance_sha256?: string;
  timestamp?: number;
  created_at?: string;
  model_artifact_stored?: boolean;
};

export type PredictAnalysis = PlanAnalysis & {
  proposal_provenance?: ProposalProvenance | null;
  /** `space_filling_advice` is set by the engine only when the model is below its trust floor. */
  reliability?: Reliability & { space_filling_advice?: string | null };
  /** `not_judged` lists gates the engine could not judge on this sheet (neither passed nor failed). */
  promotion?: Promotion & { not_judged?: string[] };
};

// --- Verdict -------------------------------------------------------------------

export type VerdictTone = "good" | "warn" | "neutral";

/** Reliable reads good, below the floor reads warn, not enough data stays neutral (it is not a failure). */
export const trustTone = (state: ReliabilityVerdict["state"]): VerdictTone => (state === "reliable" ? "good" : state === "not-yet" ? "warn" : "neutral");

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n, "count")} ${n === 1 ? one : many}`;

/**
 * The page's one-line verdict: what the engine says about the model, joined
 * with what to do about the batch. Never claims more than the reliability
 * verdict does.
 */
export function predictHeadline(input: {
  state: ReliabilityVerdict["state"];
  /** Proposals in the batch, or null once runs from it are in flight. */
  proposals: number | null;
  /** Runs started from this batch that are still in flight (only read when `proposals` is null). */
  inFlight?: number;
  round: number;
}): string {
  const { state, proposals, inFlight = 0, round } = input;
  if (proposals == null) {
    return inFlight > 0
      ? `${plural(inFlight, "run")} from round ${round} ${inFlight === 1 ? "is" : "are"} in flight. Record the results on Validate.`
      : `The runs from round ${round} have results. Learn from them on Validate.`;
  }
  if (proposals === 0) {
    return state === "reliable" ? "The model clears its trust floor, but the engine proposed no experiments this round." : "The engine proposed no experiments this round.";
  }
  const batch = plural(proposals, "proposal");
  if (state === "reliable") return `The model ranks held-out runs above its trust floor. ${batch} ready to review.`;
  if (state === "not-yet") return `The model is not yet reliable, so treat these ${batch} as exploration, not a forecast.`;
  return `There are too few held-out runs to judge the model, so treat these ${batch} as exploration.`;
}

// --- Evidence ----------------------------------------------------------------------

export type Fact = { label: string; value: string; caption?: string };

/** "ρ 0.66", "95% CI 0.54 to 0.77, trust floor 0.20": the engine's floor, never a hardcoded one. */
export function rankAgreementFact(v: ReliabilityVerdict, repeatNote: string | null): Fact {
  const parts = [
    v.ci ? `95% CI ${formatRange(v.ci[0], v.ci[1], "corr")}` : "95% CI not reported",
    v.floor != null ? `trust floor ${formatNumber(v.floor, "corr")}` : "no trust floor reported",
    repeatNote,
  ].filter((p): p is string => p != null);
  return { label: "Held-out rank agreement", value: v.rho != null ? `ρ ${formatNumber(v.rho, "corr")}` : "n/a", caption: parts.join(", ") };
}

/** How much evidence the score rests on: rows fitted, CV groups and partition repeats. */
export function evidenceFact(d: Pick<PredictAnalysis, "n" | "cv_n_groups" | "cv_n_repeats">): Fact {
  const groups = d.cv_n_groups != null ? plural(d.cv_n_groups, "CV group") : "CV groups n/a";
  const repeats = d.cv_n_repeats != null ? plural(d.cv_n_repeats, "repeat") : "repeats n/a";
  return { label: "Evidence", value: d.n != null ? plural(d.n, "row") : "n/a", caption: `${groups}, ${repeats}` };
}

/** The interval-calibration headline in plain words; the numbers stay in `calibrationNote`. */
export function calibrationHeadline(cal: Reliability["calibration"]): string {
  if (!cal) return "Not reported";
  if (!cal.available) return "Not scored";
  if (cal.z_std == null) return "Scored";
  if (Math.abs(cal.z_std - 1) <= Z_STD_TOLERANCE) return "Close to calibrated";
  return cal.z_std > 1 ? "Bands read too narrow" : "Bands read too wide";
}

// --- Promotion -----------------------------------------------------------------------

/** Plain labels for the engine's promotion metrics; unknown keys show as sent. */
export const METRIC_LABEL: Record<string, string> = {
  surrogate_spearman: "Held-out rank agreement",
  feasibility_auc: "Feasibility classifier AUC",
  ece: "Interval calibration error (ECE)",
  brier: "Feasibility Brier score",
};

export type PromotionView = {
  passed: boolean;
  /** "Passed" / "Not passed": the engine's verdict, nothing more. */
  headline: string;
  meaning: string | null;
  /** Gates that were measured and fell short. */
  missed: string[];
  /** Gates that could not be measured on this sheet (fail closed): shown neutrally. */
  unmeasured: string[];
  /** Gates the engine did not judge at all. */
  notJudged: string[];
  metrics: { key: string; label: string; value: string }[];
};

/** The promotion verdict as the engine reported it (reported, not enforced). Null when the engine sent none. */
export function promotionView(p: PredictAnalysis["promotion"]): PromotionView | null {
  if (!p) return null;
  const failures = p.failures ?? [];
  return {
    passed: p.passed,
    headline: p.passed ? "Passed" : "Not passed",
    meaning: p.meaning || null,
    missed: failures.filter((f) => !isUnmeasuredFailure(f)),
    unmeasured: failures.filter(isUnmeasuredFailure),
    notJudged: p.not_judged ?? [],
    metrics: Object.entries(p.metrics ?? {}).map(([key, v]) => ({
      key,
      label: METRIC_LABEL[key] ?? key,
      value: formatNumber(v, key === "ece" || key === "brier" ? "icc" : "corr"),
    })),
  };
}

// --- Drivers -------------------------------------------------------------------------

/**
 * The engine's `significant` (CI excludes zero AND survives FDR) decides which
 * drivers are findings; the rest are not distinguishable from noise. Never
 * re-derived here. Findings strongest first; the rest keep the engine's order.
 */
export function splitDrivers(drivers: readonly Driver[] | null | undefined): { findings: Driver[]; noise: Driver[] } {
  const all = drivers ?? [];
  return {
    findings: all.filter((d) => d.significant === true).sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)),
    noise: all.filter((d) => d.significant !== true),
  };
}

type GpShape = NonNullable<Diagnostics["gp_shapes"]>["features"][number];

/** A model response shape in words, with the engine's optimum location when it gave one. */
export function shapeText(f: GpShape): string {
  switch (f.shape) {
    case "flat":
      return "flat across the range";
    case "monotonic_up":
      return "rises across the range";
    case "monotonic_down":
      return "falls across the range";
    case "interior_optimum":
      return f.optimum_at != null ? `peaks inside the range, near ${formatNumber(f.optimum_at)}` : "peaks inside the range";
    case "interior_minimum":
      return f.optimum_at != null ? `dips inside the range, near ${formatNumber(f.optimum_at)}` : "dips inside the range";
    default:
      return String((f as { shape: unknown }).shape);
  }
}

// --- Noise and alternative scale -------------------------------------------------------

/** Replicate noise facts the engine reported, each "n/a" when it sent null. */
export function noiseFacts(noise: Diagnostics["noise"] | null | undefined): Fact[] {
  if (!noise) return [];
  return [
    { label: "Replicated recipes", value: `${formatNumber(noise.n_replicated, "count")} of ${formatNumber(noise.n_recipes, "count")}`, caption: noise.replicate_aware ? "The fit is replicate-aware." : "The fit treats every row as its own recipe." },
    { label: "Replicate agreement (ICC)", value: formatNumber(noise.icc, "icc") },
    { label: "Noise SD", value: formatNumber(noise.noise_sd) },
    { label: "Signal SD", value: formatNumber(noise.signal_sd) },
    { label: "Best single run", value: formatNumber(noise.best_single) },
    { label: "Best reproducible recipe", value: formatNumber(noise.best_reproducible) },
  ];
}

/** What the engine found on a log scale, or why it did not try. Null when the field is absent. */
export function alternativeScaleNote(alt: Diagnostics["alternative_scale"] | null | undefined): string | null {
  if (!alt) return null;
  if (alt.cv_spearman == null) return alt.reason ?? alt.interpretation ?? "Not scored.";
  const ci = alt.cv_ci95 ? `, 95% CI ${formatRange(alt.cv_ci95[0], alt.cv_ci95[1], "corr")}` : "";
  return `On a ${alt.scale ?? "transformed"} scale: ρ ${formatNumber(alt.cv_spearman, "corr")}${ci}.${alt.interpretation ? ` ${alt.interpretation}` : ""}`;
}
