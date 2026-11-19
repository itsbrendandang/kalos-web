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
  type Diagnostics,
  type Driver,
  type Promotion,
  type Reliability,
  type ReliabilityVerdict,
} from "@/lib/api";
import { formatCorr, formatValue } from "@/lib/num";
import { calibrationHeadlineOf } from "@/lib/viz-data/calibration-plot";
import { METRIC_LABEL } from "@/lib/viz-data/reliability-scorecard";

export { METRIC_LABEL };

const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;

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

const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

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

/**
 * "ρ 0.66", "95% CI 0.54 to 0.77, trust floor 0.20": the engine's floor, never
 * a hardcoded one. The CI's coverage comes from formatCorr (the engine's ci95
 * field), not typed here.
 */
export function rankAgreementFact(v: ReliabilityVerdict, repeatNote: string | null): Fact {
  const f = formatCorr(v.rho ?? 0, v.ci);
  const corr = (x: number) => formatCorr(x).value;
  const parts = [
    v.ci && f.coverage ? `${f.coverage} CI ${corr(v.ci[0])} to ${corr(v.ci[1])}` : "CI not reported",
    v.floor != null ? `trust floor ${corr(v.floor)}` : "no trust floor reported",
    repeatNote,
  ].filter((p): p is string => p != null);
  return { label: "Held-out rank agreement", value: v.rho != null ? formatCorr(v.rho).text : "n/a", caption: parts.join(", ") };
}

/** How much evidence the score rests on: rows fitted, CV groups and partition repeats. */
export function evidenceFact(d: Pick<PredictAnalysis, "n" | "cv_n_groups" | "cv_n_repeats">): Fact {
  const groups = d.cv_n_groups != null ? plural(d.cv_n_groups, "CV group") : "CV groups n/a";
  const repeats = d.cv_n_repeats != null ? plural(d.cv_n_repeats, "repeat") : "repeats n/a";
  return { label: "Evidence", value: d.n != null ? plural(d.n, "row") : "n/a", caption: `${groups}, ${repeats}` };
}

/** The interval-calibration headline in plain words; the numbers stay in `calibrationNote`. */
export function calibrationHeadline(cal: Reliability["calibration"]): string {
  return calibrationHeadlineOf(cal);
}

// --- Promotion -----------------------------------------------------------------------

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
      value: formatValue(v, { quantity: "score" }).value,
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
      return f.optimum_at != null ? `peaks inside the range, near ${formatValue(f.optimum_at).text}` : "peaks inside the range";
    case "interior_minimum":
      return f.optimum_at != null ? `dips inside the range, near ${formatValue(f.optimum_at).text}` : "dips inside the range";
    default:
      return String((f as { shape: unknown }).shape);
  }
}

// --- Noise and alternative scale -------------------------------------------------------

/** Replicate noise facts the engine reported, each "n/a" when it sent null. */
export function noiseFacts(noise: Diagnostics["noise"] | null | undefined): Fact[] {
  if (!noise) return [];
  return [
    { label: "Replicated recipes", value: `${count(noise.n_replicated)} of ${count(noise.n_recipes)}`, caption: noise.replicate_aware ? "The fit is replicate-aware." : "The fit treats every row as its own recipe." },
    // ICC sits near 1: 2 decimals would print 0.997 as "1.00".
    { label: "Replicate agreement (ICC)", value: formatValue(noise.icc, { decimals: 3 }).text },
    // Derived target-unit statistics: 3 significant figures (VIZ_SPEC 2.2).
    { label: "Noise SD", value: formatValue(noise.noise_sd).text },
    { label: "Signal SD", value: formatValue(noise.signal_sd).text },
    { label: "Best single run", value: formatValue(noise.best_single, { basis: "measured" }).text },
    { label: "Best reproducible recipe", value: formatValue(noise.best_reproducible, { basis: "measured" }).text },
  ];
}

/** What the engine found on a log scale, or why it did not try. Null when the field is absent. */
export function alternativeScaleNote(alt: Diagnostics["alternative_scale"] | null | undefined): string | null {
  if (!alt) return null;
  if (alt.cv_spearman == null) return alt.reason ?? alt.interpretation ?? "Not scored.";
  return `On a ${alt.scale ?? "transformed"} scale: ${formatCorr(alt.cv_spearman, alt.cv_ci95).text}.${alt.interpretation ? ` ${alt.interpretation}` : ""}`;
}

// --- Setup (goal, bounds, constraints) and target unit ----------------------------

export type SetupRefusalView = { code: string | null; reason: string; fix: string | null };

export type SetupNotes = {
  goal: "maximize" | "minimize";
  /** The setup could not be honoured: no proposals, with the engine's reason and fix. */
  refused: SetupRefusalView | null;
  /** Quiet notes about how the setup was applied (bound clipped to the data, proposals dropped). */
  notes: { key: string; text: string; detail: string | null }[];
};

const fmtRange = (r: [number, number] | null | undefined): string | null =>
  r && Number.isFinite(r[0]) && Number.isFinite(r[1]) ? `${formatValue(r[0], { quantity: "setting" }).text} to ${formatValue(r[1], { quantity: "setting" }).text}` : null;

/**
 * What the engine said about the campaign setup on this analysis (`goal`,
 * `setup`, `proposal_notice`), in plain words. The refusal (setup.status
 * "refused", proposal_notice "setup_not_applied") carries the engine's reason
 * and fix; warnings are quiet notes. Nothing is inferred when the fields are absent.
 */
export function setupNotes(d: Pick<PredictAnalysis, "goal" | "setup" | "proposal_notice">): SetupNotes {
  const s = d.setup ?? null;
  const goal = (d.goal ?? s?.goal) === "minimize" ? "minimize" : "maximize";
  const notice = d.proposal_notice as ({ code?: string; message?: string; reason?: string } & Record<string, unknown>) | null | undefined;
  let refused: SetupRefusalView | null = null;
  if (s?.status === "refused" || notice?.code === "setup_not_applied") {
    const r = s?.refusal ?? null;
    refused = {
      code: r?.code ?? notice?.code ?? null,
      reason: r?.reason ?? r?.message ?? notice?.reason ?? notice?.message ?? "The engine could not apply the campaign setup, so it proposed no experiments.",
      fix: r?.what_would_fix_it ?? (typeof notice?.what_would_fix_it === "string" ? notice.what_would_fix_it : null),
    };
  }
  const notes: SetupNotes["notes"] = [];
  for (const w of s?.warnings ?? []) {
    if (w.code === "bound_extrapolates" && w.feature) {
      const b = s?.bounds_applied?.[w.feature];
      const applied = fmtRange(b?.applied ?? null);
      notes.push({
        key: `${w.code}-${w.feature}`,
        text: `The bound set for ${w.feature} reaches past the measured data, so the search uses ${applied ? `${applied}, ` : ""}its overlap with the measured range. Kalos does not extrapolate.`,
        detail: w.message || null,
      });
    } else if (w.code === "gp_shapes_swept_at_highest_run") {
      notes.push({
        key: w.code,
        text: "The model-shape summary sweeps each input through the highest measured run; with the goal to minimize, read its dips (interior minima) as the candidate optima.",
        detail: w.message || null,
      });
    } else {
      notes.push({ key: `${w.code}-${w.feature ?? ""}`, text: `Setup note${w.feature ? ` for ${w.feature}` : ""}: ${w.code.replace(/_/g, " ")}.`, detail: w.message || null });
    }
  }
  const dropped = s?.n_proposals_dropped ?? 0;
  if (dropped > 0) {
    notes.push({ key: "dropped", text: `${plural(dropped, "proposal")} ${dropped === 1 ? "was" : "were"} dropped for breaking the setup's bounds or constraints.`, detail: null });
  }
  return { goal, refused, notes };
}

/**
 * A quiet hint when the engine found no unit for the target
 * (`target_unit.source === "none"`); null otherwise (a unit is shown, or the
 * analysis predates the field).
 */
export function unitHint(d: Pick<PredictAnalysis, "target" | "target_unit">): string | null {
  if (d.target_unit?.source !== "none") return null;
  return `No unit is shown for ${d.target}: its column header names none. You can set one in the campaign setup.`;
}
