// Client for the Kalos engine API (the FastAPI service in the kalos repo).
import type { ValidationReport } from "@/lib/validation";

/**
 * Default: the same-origin server proxy (app/api/engine/[...path]/route.ts).
 * Every fetch below runs in the BROWSER, so it can never carry the engine's
 * bearer token directly - a token in any client-visible code is public the
 * moment it ships. The proxy runs server-side and attaches
 * `Authorization: Bearer ${KALOS_ENGINE_TOKEN}` there instead; see that
 * file's header comment for the full reasoning.
 *
 * Escape hatch: setting NEXT_PUBLIC_API_URL still points every call straight
 * at an engine (e.g. a local dev engine run with no auth configured, or
 * DEMO_MODE flows that never call the engine at all). That's opt-in dev
 * convenience, not the deployed posture - the proxy is the default.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "/api/engine";

export type Proposal = {
  vals: number[];
  pred: number;
  std: number;
  mode: "explore" | "exploit";
  reason: string;
  /**
   * Predicted probability this recipe actually produces, read off the same
   * feasibility classifier that (maybe) gated the batch's acquisition - see
   * `proposal_gating` below. Present only when the batch was gated (an
   * ungated run reports no probability nobody asked to trust, rather than a
   * value); `null` on a NaN entry from the engine. Absent entirely on older
   * engine builds.
   */
  p_feasible?: number | null;
};

export type MultiProposal = {
  vals: number[];
  pred_titer: number;
  pred_purity: number;
  mode: "explore" | "exploit";
  reason: string;
};

export type SingleRun = {
  trajectory: { round: number; best: number; n: number }[];
  proposals: Proposal[];
  best_recipe: number[];
  best_value: number;
  optimum: number[];
};

export type MultiRun = {
  trajectory: { round: number; pareto: number; best_titer: number; best_purity: number }[];
  pareto: { titer: number; purity: number }[];
  all: { titer: number; purity: number }[];
  proposals: MultiProposal[];
};

/**
 * One input's correlation with the target, plus enough uncertainty
 * information for the UI to say whether it's a real finding or noise.
 * `significant` is true iff BOTH `ci_excludes_zero` (the 95% CI excludes
 * zero) AND `survives_fdr` (the driver survives Benjamini-Hochberg
 * multiplicity control across every feature tested) - the engine computes
 * this, the UI must never re-derive or override it. Without FDR control,
 * testing many noise features reports a "significant" driver far too often
 * (measured at 78.8% of reports over 400 simulations on 30 noise features;
 * BH cuts that to 3.5%), so a driver must never be presented as trustworthy
 * on `ci_excludes_zero` alone.
 */
export type Driver = {
  name: string;
  rho: number;
  ci95: [number, number];
  significant: boolean;
  /** Two-sided p-value for the correlation. Absent on older engine builds. */
  p?: number;
  /** Whether the 95% CI excludes zero, before multiplicity control. Absent on older engine builds. */
  ci_excludes_zero?: boolean;
  /** Whether the driver survives Benjamini-Hochberg FDR correction across all tested features. Absent on older engine builds. */
  survives_fdr?: boolean;
};

/**
 * How the engine chose which drivers to report: it tests every candidate
 * feature, ranks them, and surfaces only the top slice - itself a
 * statistical act the UI must disclose rather than let "top drivers" read
 * as an exhaustive or automatic result. Absent on older engine builds.
 */
export type DriverSelection = {
  n_tested: number;
  n_reported: number;
  top_k: number;
  fdr_method: string;
  fdr_q: number;
  n_bootstrap: number;
  ranked_by: string;
  /**
   * The unit of analysis the panel was tested against - replicates of one
   * recipe are averaged first, so `n_units` (not `n_rows`) is the
   * independent evidence every p-value and CI is computed on. Absent on
   * engine builds before this disclosure shipped.
   */
  unit?: string;
  n_units?: number;
  n_rows?: number;
};

/**
 * Held-out coverage of the surrogate's own uncertainty bands (reliability.calibration):
 * a model can rank held-out runs correctly while every interval is half the
 * width it should be, which is a distinct failure mode from `spearman`.
 * `available: false` means the sheet did not have enough held-out points with
 * a usable posterior sd to measure it - `ece`/`z_std`/`levels` are then
 * `null`/`[]`, and `reason` says why, rather than a fabricated coverage rate.
 * `z_std` above 1 means the bands read too narrow (overconfident); below 1,
 * too wide. Absent on older engine builds (the whole field, not just
 * `available`, may be missing).
 */
export type Calibration = {
  available: boolean;
  reason: string | null;
  n: number;
  ece: number | null;
  z_std: number | null;
  levels: { nominal: number; empirical: number }[];
};

export type ProducerFields = {
  producer_spearman: number | null;
  producer_clears_floor: boolean;
  n_producers: number;
  producer_threshold: number;
};

export type Diagnostics = {
  noise: {
    n_recipes: number;
    n_replicated: number;
    replicate_aware: boolean;
    icc: number | null;
    noise_sd: number | null;
    signal_sd: number | null;
    best_single: number | null;
    best_reproducible: number | null;
    scale: null | {
      variance_mean_rho: number | null;
      homoscedastic: boolean | null;
      icc_raw: number | null;
      icc_log: number | null;
      icc_gain: number | null;
      log_offset: number | null;
      suggests_transform: boolean;
      reason: string | null;
    };
  };
  alternative_scale: {
    scale: "log1p" | null;
    offset: number | null;
    cv_spearman: number | null;
    cv_ci95: [number, number] | null;
    calibration: Calibration | null;
    icc: number | null;
    interpretation: string | null;
    reason: string | null;
  };
  gp_shapes: {
    available: boolean;
    reason: string | null;
    swept_at: string;
    n_features: number;
    features: {
      name: string;
      relevance: number;
      lengthscale: number;
      shape: "flat" | "monotonic_up" | "monotonic_down" | "interior_optimum" | "interior_minimum";
      optimum_at: number | null;
      peak_gain: number | null;
      peak_separation_sd: number | null;
      spearman_rho: number;
      missed_by_spearman: boolean;
    }[];
    unmodeled: string[];
  };
};

export type Reliability = Partial<ProducerFields> & {
  spearman: number | null;
  ci95: [number, number] | null;
  spearman_floor: number;
  clears_floor: boolean;
  ci_excludes_zero: boolean;
  /** Quantities the current engine does not model, surfaced so the UI can say so. */
  unmodeled: string[];
  /** Absent on engine builds before calibration scoring shipped. */
  calibration?: Calibration;
};

/**
 * Fail-closed promotion verdict (`promotion`): whether this analysis clears
 * the same four gates (rank agreement, feasibility AUC, interval ECE,
 * feasibility Brier) the engine's promotion policy has always defined.
 * REPORTED, not enforced - a `false` verdict does not mean this app should
 * reject or hide the analysis, only say honestly that it is not yet shown
 * fit to promote. `passed=false` also covers the case where a required gate
 * is UNMEASURABLE on this sheet (e.g. an all-producer upload with no
 * non-producers to score feasibility against) - fail-closed by design, not
 * an error state - which is exactly what `meaning` explains and a failure
 * line naming "unmeasured" confirms. `metrics` only ever contains gates that
 * were actually finite (never NaN), so it is safe to render directly. Absent
 * on older engine builds.
 */
export type Promotion = {
  passed: boolean;
  failures: string[];
  metrics: Record<string, number>;
  summary: string;
  meaning: string;
};

/**
 * Leave-one-group-out generalization (`cv_logo`): the harder question of
 * generalizing to the NEXT group the model has seen nothing like, versus
 * grouped K-fold's "a few unseen groups among many familiar ones" above. Only
 * computed when there is a declared/detected group column and the group
 * count is small enough to afford one GP fit per group - `spearman` is
 * `null` with a stated `reason` otherwise (no group column, or too many
 * groups), never silently absent. Absent entirely on older engine builds.
 */
export type CvLogo = {
  spearman: number | null;
  n_groups: number | null;
  n_oof: number | null;
  reason: string | null;
};

/**
 * "Of the true top-k recipes, how many did the model's top-k catch"
 * (`cv_topk`) - the client's actual decision (which k recipes to advance),
 * which a pooled Spearman can obscure on a zero-inflated target. `overlap`
 * is `null` with a stated `reason` when there are fewer than `k` evaluable
 * held-out rows to rank. Absent entirely on older engine builds.
 */
export type CvTopK = {
  overlap: number | null;
  k: number;
  n: number;
  evaluable: boolean;
  reason: string | null;
};

/**
 * The group-mean baseline floor (`cv_group_mean_baseline`): how much of the
 * apparent CV signal is just the model recognizing which recipe a row
 * belongs to, rather than modeling the process - predicted by the mean of a
 * recipe's OTHER rows alone, no process feature involved. `spearman` is
 * `null` with a stated `reason` when too few recipes are replicated to
 * compute it. `interpretation` is the engine's own one-line reading,
 * present whenever `spearman` is. Absent entirely on older engine builds.
 */
export type CvGroupMeanBaseline = {
  spearman: number | null;
  n_evaluable: number;
  n_groups_used: number;
  interpretation: string | null;
  reason: string | null;
};

/**
 * One input column whose search range was narrowed because some observed
 * cells were physically impossible (`design_box_exclusions`) - reported so
 * the client never assumes the box being optimized over is the full data
 * range. Absent entirely on older engine builds; an empty array means
 * nothing was excluded.
 */
export type DesignBoxExclusion = {
  column: string;
  n_excluded: number;
  lower: number;
  upper: number;
};

/**
 * Whether/why the proposal acquisition was gated by predicted feasibility
 * (`proposal_gating`) - NEW, optimistic field from the current engine
 * branch: type as optional, render only when present, nothing when absent.
 * `reason` always explains the verdict either way (gated or not - all three
 * gate conditions are independently reported). `threshold` is the label
 * threshold used to define "feasible" for training the classifier, not an
 * AUC/count policy floor.
 */
export type ProposalGating = {
  gated: boolean;
  reason: string;
  n_infeasible: number;
  feasibility_auc: number | null;
  threshold: number;
};

/**
 * Whether/why a requested constraint (e.g. purity >= floor) was applied to
 * this batch (`constraint`) - NEW, optimistic field from the current engine
 * branch. Always present in a current-engine response even with no
 * constraint requested (`reason: "no constraint requested"`), so a consumer
 * never has to special-case its absence - but the UI should render nothing
 * for that overwhelmingly common inert case; see `constraintNote` below.
 */
export type ConstraintReport = {
  column: string | null;
  floor: number | null;
  n_rows_with_value: number;
  applied: boolean;
  reason: string | null;
};

/**
 * One input column's fate through the data-cleaning pipeline. Status is
 * typed as `string` (not a strict union) because the engine payload isn't
 * runtime-validated here - known values are handled explicitly by callers,
 * with an honest fallback for anything unrecognized.
 */
export type ProvenanceEntry = {
  name: string;
  status: string;
  coerced_cells: number;
  non_null: number;
};

export type AnalyzeResult = Partial<Diagnostics> & {
  n: number;
  d: number;
  target: string;
  group_col: string | null;
  targets: string[];
  features: string[];
  cv_spearman: number | null;
  cv_ci95?: [number, number] | null;
  cv_n_groups?: number;
  /**
   * How many partitions actually went into `cv_ci95` - the CI now covers
   * partition-to-partition variance, not just group-resampling variance
   * within one fixed split. This is the EFFECTIVE count (it can collapse to
   * 1 on a sheet with too few groups for a second partition to exist), not
   * the requested ceiling. Absent on older engine builds.
   */
  cv_n_repeats?: number;
  /**
   * Per-repeat pooled Spearman, so the partition-to-partition spread that
   * widens `cv_ci95` is visible on its own rather than only as a width.
   * `null` entries are repeats where rho was not finite. Absent on older
   * engine builds.
   */
  cv_spearman_per_repeat?: (number | null)[];
  /** Distribution-free +/- band (abs) from pooled out-of-fold residuals. */
  conformal_q?: number | null;
  /**
   * The conformal band's actual coverage, e.g. `0.9` for a 90% band (the
   * engine computes this at `alpha=0.1`). Absent on older engine builds -
   * callers must derive any displayed percentage from this field and never
   * hardcode one, and must omit the percentage entirely (not guess) when
   * it's missing. See `coveragePct` below.
   */
  conformal_coverage?: number;
  reliability?: Reliability;
  /** Fail-closed promotion verdict, REPORTED not enforced. Absent on older engine builds. */
  promotion?: Promotion;
  /** Absent with no group column, too many groups to afford it, or an older engine build. */
  cv_logo?: CvLogo;
  /** Absent entirely on older engine builds. */
  cv_topk?: CvTopK;
  /** Absent entirely on older engine builds. */
  cv_group_mean_baseline?: CvGroupMeanBaseline;
  best: number;
  drivers: Driver[];
  /** How the engine selected which `drivers` to report. Absent on older engine builds. */
  driver_selection?: DriverSelection;
  proposal_features: string[];
  proposals: Proposal[];
  oof: [number, number][];
  /**
   * Input columns whose search range was narrowed because some observed
   * cells were physically impossible. Absent on older engine builds; an
   * empty array means nothing was excluded.
   */
  design_box_exclusions?: DesignBoxExclusion[];
  /**
   * Which acquisition optimizer actually served `proposals` - a large
   * categorical space silently switches from exact enumeration to an
   * alternating heuristic. Typed as `string` (not a strict union), matching
   * `ProvenanceEntry.status`'s convention: the payload isn't runtime-validated
   * here, so an unrecognized value still renders honestly rather than
   * crashing a strict-union render. Absent on older engine builds.
   */
  proposal_optimizer?: string;
  /**
   * In-flight recipes the acquisition was told about when computing
   * `proposals`. 0 means the batch was computed as if nothing were running -
   * true for a one-shot upload, and the thing to check first if a round
   * re-proposes work already started. Absent on older engine builds.
   */
  n_pending_considered?: number;
  /**
   * Whether/why the proposal acquisition was gated by predicted feasibility.
   * NEW, optimistic field from the current engine branch: type as optional,
   * render only when present. Absent on older engine builds.
   */
  proposal_gating?: ProposalGating;
  /**
   * Whether/why a requested constraint was applied to `proposals`. NEW,
   * optimistic field from the current engine branch. Absent on older engine
   * builds; see `ConstraintReport` for why "present but inert" also renders
   * nothing.
   */
  constraint?: ConstraintReport;
  /**
   * Optional low-dimensional projection of every run, positioned by recipe
   * similarity - each point is `[x, y, target]`. Absent on analyses run
   * before the engine started returning it; callers must render nothing
   * rather than fabricate a placeholder when this is missing.
   */
  embedding?: { method: string; points: [number, number, number][] };
  /**
   * Spearman correlation among the kept features and the target (the same rho
   * the drivers use). `labels` are features first then the target; `matrix` is
   * the symmetric correlation grid. Absent on analyses run before the engine
   * returned it - render nothing rather than fabricate.
   */
  correlation?: { labels: string[]; matrix: number[][] };
  /**
   * The GP-predicted target across the two strongest drivers, other inputs held
   * at their median. This is a MODEL prediction (surrogate posterior mean), not
   * measured data - the UI must label it as such. `z[i][j]` is the prediction at
   * `(x_vals[j], y_vals[i])`; `runs` are observed rows `[x, y, target]` projected
   * onto the two axes for overlay. Absent on older analyses.
   */
  response_surface?: {
    x_feature: string;
    y_feature: string;
    x_vals: number[];
    y_vals: number[];
    z: number[][];
    runs: [number, number, number][];
  };
  /** Per-column data-cleaning trail (kept/dropped/target), for traceability. */
  provenance?: ProvenanceEntry[];
  /**
   * Data-validation report for the uploaded run sheet, run before the model
   * fit (see lib/validation.ts for the full shape and UI helpers). Absent on
   * analyses run before the engine started returning it - render an honest
   * "no validation report" state rather than fabricate a pass.
   */
  validation?: ValidationReport;
  /** Engine run metadata, surfaced for traceability when present. */
  seed?: number;
  timestamp?: number;
  engine_version?: string;
  error?: string;
};

export const runSingle = (): Promise<SingleRun> =>
  fetch(`${API}/api/single`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

export const runMulti = (): Promise<MultiRun> =>
  fetch(`${API}/api/multi`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

export async function runFile(file: File, target?: string): Promise<AnalyzeResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (target) fd.append("target", target);
  return fetch(`${API}/api/run`, { method: "POST", body: fd }).then(async (r) => {
    const d = (await r.json()) as AnalyzeResult;
    // A 400 with the documented { error } body is an expected "bad upload"
    // response the caller renders inline (see analyze/page.tsx) - not a
    // failure to throw on. Any other non-ok response (5xx, or a 4xx without
    // that shape) is unexpected, so route it to the same error/offline path
    // as the other engine calls instead of returning it as a fake result.
    if (!r.ok && typeof d.error !== "string") throw new Error(`engine responded ${r.status}`);
    return d;
  });
}

// The most recent real (uploaded) analysis — what the Overview reflects.
export type LatestResult =
  | { has_data: false; campaign_generation?: string | null }
  | (AnalyzeResult & { has_data: true; dataset: string; updated: number; campaign_generation?: string | null });

/** Use the same incumbent as acquisition; never fall back for replicate-aware fits. */
export function proposalIncumbent(d: Pick<AnalyzeResult, "best" | "noise">): number | null {
  return d.noise?.replicate_aware ? d.noise.best_reproducible ?? null : d.best;
}

/** Names the incumbent `proposalIncumbent` returns, for copy that compares against it. */
export function incumbentLabel(d: Pick<AnalyzeResult, "noise">): string {
  return d.noise?.replicate_aware ? "best reproducible recipe" : "best measured run";
}

export const getLatest = (): Promise<LatestResult> =>
  fetch(`${API}/api/latest`).then((r) => {
    // fetch only rejects on network failure; treat a non-2xx engine response as an
    // error too, so callers show the offline state instead of a fake "no data".
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

/** The populated (has-data) shape of the latest analysis. */
export type PopulatedResult = Extract<LatestResult, { has_data: true }>;

/**
 * The single canonical "is this model trustworthy" verdict. Every place the UI
 * claims reliability (the dataset pill, the KPI sub-copy) must use this so the
 * page never contradicts itself: the model is reliable only when the held-out
 * correlation clears the floor AND its 95% CI excludes zero.
 */
/**
 * Why a dataset is or is not reliable, in one short phrase, using the engine's
 * OWN floor rather than a hardcoded number.
 *
 * This exists because `/results` used to render
 * `reliable ? "Clears the 0.20 floor" : "Below the 0.20 floor"`, which was wrong
 * in two ways at once. It hardcoded a floor the engine owns and reports as
 * `reliability.spearman_floor`, and - worse - `reliable` is `isReliable()`,
 * which is `clears_floor AND ci_excludes_zero`. So a model that genuinely
 * CLEARED the floor but whose 95% CI still included zero was told "Below the
 * 0.20 floor": a false statement about its own score, and the wrong reason for
 * the right verdict. A scientist debugging why their run was not trusted would
 * have gone looking at the wrong number.
 *
 * The two failure modes are distinguished, because the fix for them differs: a
 * rho below the floor needs a better model or better data, while a CI spanning
 * zero at an adequate rho usually just needs more runs.
 */
export function reliabilityReason(
  d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">,
): string {
  const rel = d.reliability;
  if (!rel) return isReliable(d) ? "Clears the trust floor" : "Below the trust floor";
  const floor = rel.spearman_floor.toFixed(2);
  if (!rel.clears_floor) return `Below the ${floor} floor`;
  if (!rel.ci_excludes_zero) return `Clears the ${floor} floor, but its 95% CI includes zero`;
  return `Clears the ${floor} floor`;
}

export function isReliable(d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">): boolean {
  const rel = d.reliability;
  if (rel) return rel.clears_floor && rel.ci_excludes_zero;
  const ci = d.cv_ci95 ?? null;
  return d.cv_spearman != null && ci != null && ci[0] > 0;
}

/**
 * The conformal band's coverage as a percentage string (`0.9` -> `"90%"`),
 * or `null` when the engine didn't report `conformal_coverage` (an older
 * engine build). Callers must never hardcode a coverage number - when this
 * returns `null`, say "conformal band" with no percentage rather than guess.
 */
export function coveragePct(conformalCoverage: number | null | undefined): string | null {
  if (conformalCoverage == null || !Number.isFinite(conformalCoverage)) return null;
  return `${Math.round(conformalCoverage * 100)}%`;
}

/**
 * One-line disclosure of how the engine selected which drivers to report -
 * how many candidate features were tested and how many survived to the
 * displayed top slice. Returns `null` when the engine didn't report
 * `driver_selection` (an older engine build) - render nothing rather than
 * imply a selection process that wasn't disclosed.
 */
export function driverSelectionNote(sel: DriverSelection | null | undefined): string | null {
  if (!sel) return null;
  const base = `${sel.n_tested} feature${sel.n_tested === 1 ? "" : "s"} tested - showing the top ${sel.n_reported}, ranked by ${sel.ranked_by} (${sel.fdr_method} FDR, q=${sel.fdr_q}).`;
  if (sel.unit == null || sel.n_units == null || sel.n_rows == null) return base;
  return `${base} Tested per ${sel.unit} (${sel.n_units} ${sel.unit}${sel.n_units === 1 ? "" : "s"}, ${sel.n_rows} row${sel.n_rows === 1 ? "" : "s"}).`;
}

// --- Honesty-parity helpers -------------------------------------------------
// Pure formatters for the engine's newer response fields, following the same
// contract every helper above already does: absent field -> null (render
// nothing); present-but-unmeasured -> the engine's own stated reason, never a
// fabricated number. Kept here rather than inline in components so the
// render-or-explain logic is unit-testable without a DOM.

/**
 * Held-out prediction-interval calibration (`reliability.calibration`): is
 * the stated +/- band honest, not just the ranking. `null` when the field is
 * absent (older engine build) - render nothing. When the engine could not
 * measure it on this sheet (`available: false`), returns the engine's own
 * reason rather than a fabricated ECE.
 */
export function calibrationNote(cal: Calibration | null | undefined): string | null {
  if (!cal) return null;
  if (!cal.available) return `Not scored - ${cal.reason ?? "not enough held-out points"}.`;
  const parts = [`ECE ${cal.ece != null ? cal.ece.toFixed(2) : "n/a"}`];
  if (cal.z_std != null) {
    const shape = cal.z_std > 1 ? "bands read narrow, overconfident" : cal.z_std < 1 ? "bands read wide" : "well-calibrated";
    parts.push(`z_std ${cal.z_std.toFixed(2)} (${shape})`);
  }
  return `${parts.join(" - ")}, n=${cal.n}.`;
}

/**
 * Per-repeat pooled Spearman spread (`cv_n_repeats`/`cv_spearman_per_repeat`) -
 * `cv_ci95` already reflects this partition-to-partition variance in its
 * width; this surfaces the spread itself, subtly, beside the point estimate.
 * `null` when there is nothing to add: fewer than 2 finite repeats, or the
 * fields are absent (older engine build).
 */
export function repeatSpreadNote(
  nRepeats: number | null | undefined,
  perRepeat: (number | null)[] | null | undefined,
): string | null {
  const finite = (perRepeat ?? []).filter((v): v is number => v != null);
  if (finite.length < 2) return null;
  const lo = Math.min(...finite).toFixed(2);
  const hi = Math.max(...finite).toFixed(2);
  return `${nRepeats ?? finite.length} repeats: ${lo} to ${hi}`;
}

/**
 * Leave-one-group-out generalization (`cv_logo`) - the harder question of
 * generalizing to the NEXT group the model has seen nothing like. `null`
 * when the field is absent (older engine build); the engine's own `reason`
 * when it could not be computed on this sheet (no group column, or too many
 * groups to afford it) rather than silence.
 */
export function cvLogoNote(logo: CvLogo | null | undefined): string | null {
  if (!logo) return null;
  if (logo.spearman == null) return logo.reason ?? "Not scored.";
  return `rho ${logo.spearman.toFixed(2)} across ${logo.n_groups} held-out group${logo.n_groups === 1 ? "" : "s"} (n=${logo.n_oof}).`;
}

/**
 * "Of the true top-k recipes, how many did the model's top-k catch"
 * (`cv_topk`). `null` when the field is absent (older engine build);
 * `evaluable: false` renders the engine's stated reason rather than a number
 * that looks measured.
 */
export function cvTopKNote(topk: CvTopK | null | undefined): string | null {
  if (!topk) return null;
  if (!topk.evaluable || topk.overlap == null) return topk.reason ?? "Not scored.";
  const hits = Math.round(topk.overlap * topk.k);
  return `${hits} of the true top ${topk.k} caught (n=${topk.n}).`;
}

/**
 * The group-mean baseline floor (`cv_group_mean_baseline`): how much of the
 * apparent CV signal is just the model recognizing which recipe a row
 * belongs to. `null` when the field is absent (older engine build).
 * Otherwise always returns text - the engine's stated `reason` when the
 * baseline itself could not be computed, or a line built from `spearman` and
 * `interpretation` when it could - plus `prominent`, true when the caller
 * should surface this as a loud callout rather than a quiet mention: the
 * model's own `cv_spearman` does not clearly beat the floor (does not
 * strictly exceed it), which is the honest moment this field exists for.
 */
export function groupMeanBaselineVerdict(
  cvSpearman: number | null | undefined,
  baseline: CvGroupMeanBaseline | null | undefined,
): { text: string; prominent: boolean } | null {
  if (!baseline) return null;
  if (baseline.spearman == null) {
    return { text: baseline.reason ?? "Not scored.", prominent: false };
  }
  const beats = cvSpearman != null && cvSpearman > baseline.spearman;
  const text = `Group-mean baseline rho ${baseline.spearman.toFixed(2)} (n=${baseline.n_evaluable} rows, ${baseline.n_groups_used} groups)${
    baseline.interpretation ? ` - ${baseline.interpretation}` : ""
  }`;
  return { text, prominent: !beats };
}

/**
 * Which region of the recipe space was actually searched, when narrowed
 * because some observed cells were physically impossible
 * (`design_box_exclusions`) - so a consumer never assumes the search box is
 * the full data range. `null` when nothing was excluded, or the field is
 * absent (older engine build).
 */
export function designBoxExclusionsNote(exclusions: DesignBoxExclusion[] | null | undefined): string | null {
  if (!exclusions || exclusions.length === 0) return null;
  const parts = exclusions.map(
    (e) => `${e.column} (${e.lower.toFixed(2)} to ${e.upper.toFixed(2)}, ${e.n_excluded} row${e.n_excluded === 1 ? "" : "s"} excluded)`,
  );
  return `Search box narrowed for ${exclusions.length} feature${exclusions.length === 1 ? "" : "s"}: ${parts.join("; ")}.`;
}

/**
 * How this batch was actually computed (`proposal_optimizer`/
 * `n_pending_considered`) - mirrors the seed/timestamp/engine_version audit
 * trail: a large categorical space silently switches optimizers, and
 * in-flight recipes change what the acquisition already knew about. `null`
 * only when the engine reported neither (older engine build).
 */
export function proposalAuditNote(optimizer: string | null | undefined, nPending: number | null | undefined): string | null {
  const parts: string[] = [];
  if (optimizer) parts.push(`${optimizer} optimizer`);
  if (nPending != null) parts.push(`${nPending} in-flight recipe${nPending === 1 ? "" : "s"} considered`);
  return parts.length ? parts.join(" - ") : null;
}

/**
 * Whether/why the proposal acquisition was gated by predicted feasibility
 * (`proposal_gating`). `null` when the field is absent (older engine build,
 * or an engine build before this NEW optimistic field shipped).
 */
export function proposalGatingNote(gating: ProposalGating | null | undefined): string | null {
  if (!gating) return null;
  return gating.reason;
}

/**
 * Whether/why a requested constraint was applied to this batch
 * (`constraint`). `null` when the field is absent, or present but inert (the
 * overwhelmingly common "no constraint requested" case) - rendering nothing
 * for that case even though the field itself is present, since there is
 * nothing to disclose.
 */
export function constraintNote(constraint: ConstraintReport | null | undefined): string | null {
  if (!constraint) return null;
  if (constraint.reason === "no constraint requested") return null;
  if (constraint.applied) {
    return `Constrained by ${constraint.column} >= ${constraint.floor} (fit on ${constraint.n_rows_with_value} rows).`;
  }
  return `Constraint on ${constraint.column ?? "the requested column"} not applied - ${constraint.reason ?? "unknown reason"}.`;
}

/**
 * Whether a promotion-gate failure line (`promotion.failures[]`) names an
 * unmeasured metric rather than one that was measured and fell short - so
 * the UI can render the unmeasured case as a neutral disclosure instead of a
 * scarier miss (see `check_gates` in the engine: a missing/NaN required
 * metric fails closed and reads exactly like a rejection unless explained).
 */
export function isUnmeasuredFailure(failure: string): boolean {
  return failure.includes("unmeasured");
}

// --- Campaign loop client (kalos/docs/CAMPAIGN_LOOP.md) -------------------
// The closed optimization loop behind /decide: propose -> run -> log outcome
// -> re-propose. A campaign is one target plus a growing (recipe -> outcome)
// table; `/api/campaign` reflects it, `/api/campaign/reanalyze` is the loop
// closing (folds measured runs into the base data and re-runs `_analyze`).

/** One recipe started from a proposed batch, awaiting or holding a measured outcome. */
export type CampaignRun = {
  id: string;
  recipe: Record<string, number>;
  pred: number;
  std: number;
  mode: "explore" | "exploit";
  reason: string;
  result: number | null;
  awaiting: boolean;
};

export type Campaign =
  | { has_campaign: false }
  | {
      has_campaign: true;
      target: string;
      features: string[];
      n_base: number;
      best: number | null;
      round: number;
      /**
       * The progress trajectory: one { round, best, n_base } point per round
       * (round 0 = the seeded base, then one per re-analyze). `best` is the
       * measured best-so-far (non-decreasing), not a prediction - see
       * kalos/docs/CAMPAIGN_LOOP.md.
       */
      history: { round: number; best: number | null; n_base: number }[];
      pending: CampaignRun[];
      n_awaiting: number;
      n_measured: number;
      /**
       * Whether /api/latest provably describes this campaign as it is now
       * (kalos/docs/CAMPAIGN_LOOP.md, "Analysis/campaign coherence"). Every
       * campaign write (start, result, fold, reseed) re-mints the stamp, so
       * this is false from the first run started after an analysis until the
       * next re-analyze. Optional only because older engines do not send it.
       */
      analysis_in_sync?: boolean;
    };

export type CampaignComparison = {
  baseline_round: number;
  current_round: number;
  baseline_best: number | null;
  current_best: number | null;
  improvement: number | null;
  n_runs_added: number;
  comparison_type: "initial" | "previous";
};

/** Only compare endpoints in this campaign's history, including missing measurements. */
export function campaignComparisons(c: Extract<Campaign, { has_campaign: true }>): CampaignComparison[] {
  const currentIndex = c.history.findIndex((h) => h.round === c.round);
  if (currentIndex < 1) return [];
  const current = c.history[currentIndex];
  // At round 1 the previous round IS the initial one; one card, not two identical ones.
  const types = currentIndex === 1 ? (["initial"] as const) : (["initial", "previous"] as const);
  return types.map((comparison_type) => {
    const baseline = c.history[comparison_type === "initial" ? 0 : currentIndex - 1];
    const delta = baseline.best == null || current.best == null ? null : current.best - baseline.best;
    return {
      baseline_round: baseline.round,
      current_round: current.round,
      baseline_best: baseline.best,
      current_best: current.best,
      improvement: delta == null ? null : baseline.best! > 0 ? delta / baseline.best! * 100 : delta,
      n_runs_added: current.n_base - baseline.n_base,
      comparison_type,
    };
  });
}

export const getCampaign = (): Promise<Campaign> =>
  fetch(`${API}/api/campaign`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

/** A recipe about to be started, in the shape POST /api/campaign/start expects. */
export type StartRecipe = {
  recipe: Record<string, number>;
  pred: number;
  std: number;
  mode: string;
  reason: string;
};

export async function startRuns(recipes: StartRecipe[]): Promise<void> {
  const r = await fetch(`${API}/api/campaign/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipes }),
  });
  if (!r.ok) throw new Error(`engine responded ${r.status}`);
}

export async function logResult(id: string, value: number): Promise<void> {
  const r = await fetch(`${API}/api/campaign/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, value }),
  });
  if (!r.ok) {
    // The documented 400 body is { error }; fall back to a status-based
    // message for anything else (network hiccup, unexpected 5xx shape).
    let message = `engine responded ${r.status}`;
    try {
      const body: unknown = await r.json();
      if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
        message = (body as { error: string }).error;
      }
    } catch {
      // Body wasn't JSON - keep the status-based message.
    }
    throw new Error(message);
  }
}

export async function reanalyze(): Promise<{ analysis: PopulatedResult; campaign: Campaign }> {
  const r = await fetch(`${API}/api/campaign/reanalyze`, { method: "POST" });
  if (!r.ok) throw new Error(`engine responded ${r.status}`);
  return r.json();
}

// --- Optional AI providers (GET /api/providers) -----------------------------
// Documented optional upgrades some validation checks can use when a key is
// configured (e.g. an LLM-assisted check) - never required. See
// components/validation/provider-status.tsx for the neutral (not
// error/warning) rendering of an unconfigured provider.

export type Provider = {
  name: string;
  available: boolean;
  required_env: string[];
  missing_env: string[];
  capability: string;
  fallback: string;
};

export type ProvidersResponse = { providers: Provider[] };

export const getProviders = (): Promise<ProvidersResponse> =>
  fetch(`${API}/api/providers`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

export { API };
