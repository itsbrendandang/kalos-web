// Client for the Kalos engine API (the FastAPI service in the kalos repo).
//
// The response types below (the AnalyzeResult family) are hand-maintained on
// purpose: they carry version-tolerance (?/Partial<> for fields absent on older
// engine builds) and documentation the engine's OpenAPI cannot - FastAPI types
// the request bodies but leaves the analysis RESPONSE an untyped object. The
// engine guards against silently dropping a field this file reads with a
// contract test on its side: kalos-engine tests/test_web_contract.py asserts
// every top-level /api/run field listed here is still returned. Keep that
// field list and these types in sync when the web starts or stops using a field.
import type { StageKey } from "@/lib/routes";
import type { ValidationReport } from "@/lib/validation";
import type { CoverageAtProposalsEstimate, EngineIntervalCaveat } from "@/lib/proposal-caveat";
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";
import { EngineError } from "@/lib/engine-error";
import { formatValue, parseUnit } from "@/lib/num";

/** A statistic at 2 decimals with a U+2212 minus, through lib/num (never toFixed). */
const fixed2 = (v: number): string => formatValue(v, { quantity: "score" }).value;

/**
 * Default: the same-origin, authenticated server proxy
 * (app/api/engine/[...path]/route.ts, docs/ENGINE_AUTH.md). Every fetch
 * below runs in the BROWSER and carries only the HttpOnly session cookie; the
 * proxy checks the session, MFA, organization membership and role, and mints
 * a short-lived engine token server-side. The browser never sees that token,
 * the engine URL or the tenant id.
 *
 * Dev-only escape hatch: outside production builds, NEXT_PUBLIC_API_URL still
 * points every call straight at a local engine running in open mode. In a
 * production build it is ignored (NODE_ENV is inlined at build time), so a
 * deployment can never route browsers around the proxy.
 */
const DIRECT_ENGINE_URL = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_API_URL : undefined;
const API = DIRECT_ENGINE_URL || "/api/engine";

/**
 * Headers for a state-changing call. Through the proxy that includes the
 * CSRF marker it requires on POST/PATCH/DELETE (lib/engine-csrf.ts); the
 * dev-only direct-engine path gets none (a custom header would force a CORS
 * preflight the engine does not answer).
 */
export function mutationHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return API === "/api/engine" ? { ...extra, [ENGINE_CSRF_HEADER]: ENGINE_CSRF_VALUE } : { ...extra };
}

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
  /**
   * Every setpoint of the recipe, keyed by input: the `proposal_features`
   * shown as columns plus every other input the recipe sets. This is what the
   * lab runs and what a started run must record. Absent on older engines.
   */
  recipe?: Record<string, number>;
  /**
   * Distance from this recipe to the nearest measured (training) row: each
   * continuous input divided by its design-box width, +1 per differing
   * categorical level, Euclidean. 0 = the recipe is a measured row. A number
   * only: the engine applies no threshold or label (an extrapolation signal,
   * compare `training_nn_distance_median`). Absent on older analyses.
   */
  nearest_training_distance?: number | null;
  /** Observation-scale predictive sd the per-proposal intervals are built from. Absent on older analyses. */
  predictive_std?: number | null;
  /** Per-level normalized split-conformal intervals (approximate coverage, see `interval_method`). Absent on older analyses. */
  intervals?: ProposalInterval[];
  /** Model-based GP posterior bands, per level. Never held-out calibrated; label them so. */
  gp_intervals?: GpInterval[];
  /** Model-based predictive quantiles (GP observation posterior). */
  quantiles?: ProposalQuantiles | null;
  /**
   * The verdict's label for this proposal (trust layer F04): `{status: "trusted" | "exploration_untrusted", verdict,
   * message}`; "model_guided" is read as trusted. Absent on older engines.
   */
  trust?: { status: string; verdict?: string; message?: string } | string | null;
  /** Analytic expected improvement over the incumbent (model-based, context only: the batch is chosen by qLogNEI). */
  expected_improvement?: ImprovementStat | null;
  /** Model probability of beating the incumbent (model-based). */
  p_improve?: ImprovementStat | null;
  /** The clone this proposal uses (docs/CLONES.md G5): `{column, level, policy, n_runs}`. Absent without a clone column. */
  clone?: ProposalClone | null;
};

/** `proposals[].clone` (engine docs/CLONES.md). */
export type ProposalClone = { column: string; level: string; policy: "fixed" | "factor" | string; n_runs?: number | null };

/** One per-proposal interval entry. A refused level has `available: false`, null bounds and the engine's reason. */
export type ProposalInterval = {
  coverage: number;
  method: string;
  calibrated_on?: string;
  n_calibration?: number;
  available: boolean;
  lo: number | null;
  hi: number | null;
  q_norm?: number;
  /** Selection-aware quantile (engine F15, `conformal_selection_aware`). */
  q_sel?: number;
  empirical_oof_coverage?: number;
  /** What the coverage claim rests on, e.g. "held_out_past_runs" (engine trust layer; `interval_basis` on newer builds). */
  coverage_basis?: string | null;
  interval_basis?: string | null;
  /** The engine's caveat for this proposal interval: plain message plus the coverage measured at proposals. */
  caveat?: EngineIntervalCaveat | null;
  coverage_at_proposals_estimate?: CoverageAtProposalsEstimate | null;
  code?: string;
  reason?: string;
  what_would_fix_it?: string;
};

export type GpInterval = {
  coverage: number;
  method: string;
  posterior?: string;
  note?: string;
  /** "model_based" (trust layer F02); with the coverage measured at proposals in simulation. */
  coverage_basis?: string | null;
  coverage_at_proposals_estimate?: CoverageAtProposalsEstimate | null;
  available: boolean;
  lo: number | null;
  hi: number | null;
  code?: string;
  reason?: string;
};

export type ProposalQuantiles = { basis: string; posterior?: string; note?: string; p05: number; p25: number; p50: number; p75: number; p95: number };

export type ImprovementStat = {
  value: number | null;
  method: string;
  incumbent: number | null;
  incumbent_basis?: string;
  maximize: boolean;
  basis: string;
  posterior?: string;
  note?: string;
  /** The engine's plain statement of what the value is (p_improve: P(latent MEAN beats the incumbent), not one measurement). */
  description?: string;
};

/** How `proposals[].intervals` were built, with a per-level availability (`interval_method`). */
export type IntervalMethod = {
  method: string;
  calibrated_on?: string;
  n_calibration?: number;
  coverage_guarantee?: string;
  empirical_oof_coverage_note?: string;
  levels: {
    coverage: number;
    available: boolean;
    q_norm?: number;
    rank?: number;
    n_calibration?: number;
    empirical_oof_coverage?: number;
    n_inside?: number;
    coverage_by_sigma_half?: Record<string, { n: number; coverage: number | null }>;
    code?: string;
    reason?: string;
    what_would_fix_it?: string;
    min_n?: number;
  }[];
  gp_posterior?: Record<string, string>;
} & Record<string, unknown>;

/** The entry of `intervals` (or `gp_intervals`) at a coverage level, or null when the engine sent none for it. */
export function intervalAt<T extends { coverage: number }>(list: readonly T[] | null | undefined, coverage: number): T | null {
  return list?.find((i) => Math.abs(i.coverage - coverage) < 1e-9) ?? null;
}

/** 1D model slice (R2): latent GP mean with a model-based band, other inputs held at `reference`. */
export type ModelSlice = {
  feature: string;
  x: number[];
  mean: number[];
  sd: number[];
  lo: number[];
  hi: number[];
  coverage: number;
  band_method: string;
  band_of?: string;
  note?: string;
  basis: string;
  range?: [number, number];
  swept_at?: string;
  reference?: { basis: string; incumbent_basis?: string; recipe: Record<string, number | string> };
  n_points?: number;
};

/** The display unit of the target (R6): user setup, then a well-defined header pattern, else none. */
export type TargetUnit = { unit: string | null; source: "user" | "header" | "none"; header: string | null; note: string };

/** How the campaign setup was applied to this analysis (`setup`). `status: "refused"` means no proposals. */
export type AppliedSetup = {
  status: "applied" | "refused" | string;
  goal: Goal;
  hash?: string;
  bounds_applied?: Record<string, { requested: [number | null, number | null]; observed: [number, number] | null; applied: [number, number] | null; extrapolates: boolean }>;
  constraints_applied?: LinearConstraint[];
  warnings?: { code: string; feature?: string; message: string }[];
  refusal?: { code: string; reason?: string; message?: string; what_would_fix_it?: string } | null;
  n_proposals_dropped?: number;
  sign_convention?: string;
} & Record<string, unknown>;

/** The full recipe to run and record for a proposal. Falls back to the
 *  proposal_features alone only for older engines that do not send `recipe`. */
export function proposalRecipe(p: Proposal, features: string[]): Record<string, number> {
  return p.recipe ?? Object.fromEntries(features.map((f, i) => [f, p.vals[i]]));
}

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
  /**
   * Null when the floor was not judged (trust layer F04: fewer than 12 runs or 3 CV groups): neither passed nor failed.
   * See `verdict` / `not_judged_reason`.
   */
  clears_floor: boolean | null;
  /** "clears_floor" | "below_floor" | "not_judged" (trust layer F04). Absent on older engines. */
  verdict?: "clears_floor" | "below_floor" | "not_judged" | string;
  judged?: boolean;
  not_judged_reason?: string | null;
  clears_floor_rule?: string;
  ci_excludes_zero: boolean;
  /** Quantities the current engine does not model, surfaced so the UI can say so. */
  unmodeled: string[];
  /** Absent on engine builds before calibration scoring shipped. */
  calibration?: Calibration;
  /** Set only when the model is below its trust floor: the batch should be read as exploration. */
  space_filling_advice?: string | null;
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
  /** Gates the engine could not judge on this sheet (absent on older engines). */
  not_judged?: string[];
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
  /** "highest" or "lowest" (the goal's best runs; engine aa7396a). Absent on older engines. */
  direction?: "highest" | "lowest";
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
  /** "inferred" from column names, or "declared" when the caller sent explicit roles. Absent on older engines. */
  source?: string;
};

/** Counts of what the fit excluded or treated specially. Counts only, never column names in the run record. */
export type DataDrops = {
  rows_dropped?: number;
  censored_rows_excluded?: number;
  /** Keys: missing, non_numeric, censored (counted over cells). */
  cells_by_reason?: Record<string, number>;
  cells_by_column?: Record<string, Record<string, number>>;
  /** A count, or per-column counts on current engines. */
  blank_cells_as_absent?: number | Record<string, number>;
  auto_categorical_count?: number;
};

/**
 * The `run` block (kalos run record, schema_version 1). Every field is optional
 * so an older or partial record renders only what it carries. `filename` and
 * `sheet` are absent under anonymize. Source: docs/CAMPAIGNS_API.md (feat/data-handling).
 */
export type RunRecord = {
  schema_version?: number;
  kind?: "upload" | "reanalyze" | string;
  input_sha256?: string;
  input_bytes?: number;
  filename?: string;
  sheet?: string | null;
  target?: string;
  profile?: "bioprocess" | "generic" | string;
  roles_declared?: unknown;
  anonymize?: boolean;
  seed?: number;
  torch_threads?: number | null;
  torch_threads_actual?: number | null;
  max_fit_rows?: number;
  build_sha?: string;
  library_versions?: Partial<Record<"numpy" | "pandas" | "torch" | "botorch", string | null>>;
  validation_mode?: "warn" | "strict" | string;
  pending_runs?: number;
  n_rows?: number;
  n_features?: number;
  data_drops?: DataDrops;
  header_row?: number | null;
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
  /** The engine's caveat for the `conformal_q` band at proposals (trust layer). Absent on older engines. */
  conformal_caveat?: EngineIntervalCaveat | null;
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
  /** Search range [low, high] of each continuous input; used to flag proposals at the edge. Absent on older engine builds. */
  feature_ranges?: Record<string, [number, number]>;
  proposals: Proposal[];
  /**
   * Out-of-fold (held-out) pairs, each `[measured, predicted]`: the engine
   * writes `zip(oof_a, oof_p)` (kalos-engine analysis.py). The first value is
   * the sheet's measured target, the second the model's held-out prediction.
   */
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
  correlation?: {
    labels: string[];
    matrix: number[][];
    /**
     * The engine says "recipe", but kalos/portal/viz_utils.py `_correlation_spearman` computes rho over the
     * fitted rows (one per run), not recipe means: the web labels the matrix per run (row). VIZ_SPEC_V2 E5.
     */
    unit?: string;
    n_units?: number;
    /** Fitted rows the matrix was computed over. Every fitted row is complete, so it is each cell's n. */
    n_rows?: number;
  };
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
    /**
     * Posterior SD on the same grid. Computed by the engine's feat/data-handling
     * branch (viz_utils._response_surface_gp) but not returned on engine main yet.
     * Typed for the request in docs/PLAN_ENGINE_REQUIREMENTS.md; the Plan surface
     * does not render it ("predicted mean only").
     */
    std?: number[][];
    /** What the non-plotted inputs were held at, e.g. "incumbent". Absent on older engines. */
    swept_at?: string;
    /** The values the other inputs were held at, keyed by input. Absent on older engines. */
    fixed_recipe?: Record<string, number | string>;
    /** Which recipe the incumbent was taken from ("single" or "recipe_mean"). Absent on older engines. */
    incumbent_basis?: string;
  };
  /**
   * Inputs the engine modeled as categorical without declared roles (text
   * columns with 2-12 repeated levels). Absent on older engine builds; an
   * empty array means none were detected. Source: docs/UPLOADS.md (feat/data-handling).
   */
  auto_categorical?: string[];
  /** All categorical inputs the model used (declared or auto-detected). Absent on older engine builds. */
  categorical_features?: string[];
  /** Runs excluded from the fit for a missing or non-numeric target/feature cell. Absent on older engine builds. */
  n_dropped_incomplete?: number;
  /** Runs excluded from the fit for a censored value (e.g. `<LOD`). Not imputed. Absent on older engine builds. */
  n_censored_excluded?: number;
  /** What the fit excluded, as counts. Absent on older engine builds. */
  data_drops?: DataDrops;
  /** How this analysis was produced (provenance). Absent on rows written before the engine recorded it. */
  run?: RunRecord;
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
  /** Worksheet names when the uploaded workbook has several (may accompany an `error`). Absent on older engines. */
  sheets?: string[];
  /** The worksheet the engine actually read. Absent on older engines and CSV; may be null on an error. */
  sheet_used?: string | null;
  /** Machine code on a 400 (e.g. "sheet_not_found", "target_constant"); the human text is `error`. Absent on older engines. */
  code?: string;
  /** What produced this batch: hashes of inputs and config, seed, engine build. `model_artifact_stored` is false today. */
  proposal_provenance?: ({ provenance_sha256?: string; input_sha256?: string; config_sha256?: string; engine_version?: string; seed?: number } & Record<string, unknown>) | null;
  /** The detected header row (0-based) when the sheet had a title block. Absent on older engines. */
  header_row?: number | null;
  /** The engine's orientation finding for the sheet. Absent on older engines. */
  orientation?: unknown;
  /** Why a visualization (embedding, correlation, surface) was not computed, keyed by name. */
  visualization_reasons?: unknown;
  /** Coverage levels the per-proposal intervals were computed at, e.g. [0.9, 0.95]. Absent on older analyses. */
  interval_levels?: number[];
  /** How the per-proposal intervals were built, with per-level refusals. Absent on older analyses. */
  interval_method?: IntervalMethod;
  /** Median nearest-other-row distance between measured rows, in the `nearest_training_distance` metric (scale for it). */
  training_nn_distance_median?: number | null;
  /** 1D model slices; `null` with the reason in `visualization_reasons.slices`. Absent on older analyses. */
  slices?: ModelSlice[] | null;
  slices_skipped?: { feature: string; reason: string }[];
  /** The target's display unit. Absent on older analyses (fall back to the header via `parseUnit`). */
  target_unit?: TargetUnit;
  /** The optimization direction this analysis used (absent = maximize, the engine default). */
  goal?: Goal;
  /** The campaign setup as applied to this analysis; null when none was stored. */
  setup?: AppliedSetup | null;
  /** Why the batch is empty or reduced (e.g. `setup_not_applied`, `model_refused`). */
  proposal_notice?: { code: string; message?: string; reason?: string } & Record<string, unknown> | null;
  /** The engine's one answer to "can I trust the model's suggestions?" (trust layer F04). Absent on older engines. */
  verdict?: EngineVerdict | null;
  /** What the verdict did to the batch (trust layer F04). Absent on older engines. */
  proposal_trust?: ProposalTrustBlock | null;
  /** Set when the verdict refused: `proposals` is empty and this says why (trust layer F04). */
  refusal?: ModelRefusal | null;
  /** Which held-out grouping drove the score (trust layer F05). Absent on older engines. */
  cv_grouping?: CvGrouping | null;
  /** Per-clone block (engine docs/CLONES.md); `available: false` with a reason when there is no clone column. Absent on older engines. */
  strain_summary?: StrainSummary | null;
  /** Per-clone model slices `{<clone column>: {<label>: slice[]}}` (predicted, model band). `{}` without a modeled clone. */
  slices_by_level?: Record<string, Record<string, (ModelSlice & { level?: string; band_kind?: string; calibrated?: boolean })[]>>;
  /** Clones whose slices were not computed, with the engine's message. */
  slices_by_level_skipped?: Record<string, { level: string; reason: string; n_runs?: number; message?: string }[]>;
  /** The clone label of each `oof` row, aligned. */
  oof_levels?: Record<string, (string | null)[]>;
  /** Categorical inputs the drivers and correlation leave out (a signed rank correlation is undefined for labels). */
  drivers_skipped?: { feature: string; reason: string }[];
  correlation_skipped?: { feature: string; reason: string }[];
};

/** The engine's model verdict (`verdict`, trust layer F04). */
export type EngineVerdict = {
  state: "reliable" | "not_yet" | "refused" | string;
  code?: string;
  headline?: string;
  reasons?: { code: string; plain: string }[];
  n_runs?: number;
  min_runs?: number;
  n_groups?: number;
  min_groups?: number;
  rule?: string;
} & Record<string, unknown>;

/** `proposal_trust`: trusted (model-guided), exploration_untrusted, or withheld (refused). */
export type ProposalTrustBlock = {
  status: "trusted" | "model_guided" | "exploration_untrusted" | "withheld" | string;
  verdict?: string;
  gated?: boolean;
  withheld?: boolean;
  n_requested?: number;
  n_returned?: number;
  reasons?: string[];
  message?: string;
  rule?: string;
};

/** `refusal` when the verdict withheld the batch. */
export type ModelRefusal = { code: string; plain?: string; what_would_help?: string } & Record<string, unknown>;

/** `cv_grouping` (F05): the grouping whose held-out score drove the verdict, and every candidate. */
export type CvGrouping = {
  used?: { basis: string; column?: string | null; n_groups?: number; merged_with_replicates?: boolean } | null;
  candidates?: { basis: string; column?: string | null; n_groups?: number; evaluable?: boolean; spearman?: number | null; ci95?: [number, number] | null; reason?: string | null; used?: boolean }[];
  rule?: string;
  warnings?: { code: string; message: string; column?: string }[];
} & Record<string, unknown>;

/** Optimization direction. */
export type Goal = "maximize" | "minimize";

/**
 * The target's unit for display: the engine's `target_unit` when the analysis
 * carries it (the user's setup wins over the header), else the unit parsed
 * from the header for analyses that predate the field. Never invented.
 */
export function targetUnitOf(d: { target?: string | null; target_unit?: TargetUnit | null } | null | undefined): string | null {
  if (!d) return null;
  if (d.target_unit) return d.target_unit.unit ?? null;
  return d.target ? parseUnit(d.target).unit : null;
}

/** Explicit column roles the engine accepts as `roles` (kalos ColumnRoles): replaces name-based inference. */
export type ColumnRolesInput = { target: string; features: string[]; ids?: string[] };

/**
 * The engine refused an upload because the campaign still has awaiting or
 * measured runs (HTTP 409, code `campaign_has_runs`). Nothing was replaced.
 * The caller asks the user, then resends the same file with `replace: true`.
 * Counts are null when the body did not carry them.
 */
export class CampaignHasRunsError extends Error {
  readonly code = "campaign_has_runs";
  constructor(
    readonly awaiting: number | null,
    readonly measured: number | null,
  ) {
    super("campaign_has_runs");
    this.name = "CampaignHasRunsError";
  }
}

const countField = (body: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  }
  return null;
};

/**
 * Typed refusal for a 409 `campaign_has_runs` body, or null for any other
 * response. Accepts the code under `code` or `error`, and the counts as
 * `awaiting`/`measured` or `n_awaiting`/`n_measured`.
 */
export function campaignHasRunsRefusal(status: number, body: unknown): CampaignHasRunsError | null {
  if (status !== 409 || typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.code !== "campaign_has_runs" && b.error !== "campaign_has_runs") return null;
  return new CampaignHasRunsError(countField(b, "awaiting", "n_awaiting"), countField(b, "measured", "n_measured"));
}

async function readJsonBody(r: Response): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await r.json();
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The code a status means when the body carried none (proxy failures and non-JSON replies). */
function codeForStatus(status: number): string {
  if (status === 401) return "unauthenticated";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status === 503) return "engine_busy";
  if (status === 504) return "engine_timeout";
  return "engine_error";
}

// The most recent real (uploaded) analysis - what the Overview reflects.
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
  if (floorNotJudged(rel)) return NOT_JUDGED_LABEL;
  const floor = fixed2(rel.spearman_floor);
  if (!rel.clears_floor) return `Below the ${floor} floor`;
  if (!rel.ci_excludes_zero) return `Clears the ${floor} floor, but its 95% CI includes zero`;
  return `Clears the ${floor} floor`;
}

/** The plain label for a floor the engine did not judge (never shown as a pass or a fail). */
export const NOT_JUDGED_LABEL = "Not judged: too few runs";

/**
 * True when the engine did not judge the trust floor (trust layer F04: fewer than 12 runs or 3 CV groups):
 * `reliability.verdict` "not_judged", or `clears_floor` null. Neither a pass nor a fail.
 */
export const floorNotJudged = (rel: Pick<Reliability, "clears_floor" | "verdict"> | null | undefined): boolean =>
  rel != null && (rel.verdict === "not_judged" || rel.clears_floor === null);

export function isReliable(d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">): boolean {
  const rel = d.reliability;
  if (rel) return rel.clears_floor === true && rel.ci_excludes_zero;
  const ci = d.cv_ci95 ?? null;
  return d.cv_spearman != null && ci != null && ci[0] > 0;
}

export type ReliabilityState = "reliable" | "not-yet" | "not-judged" | "insufficient";

export type ReliabilityVerdict = {
  state: ReliabilityState;
  /** The plain label every surface shows: "Reliable", "Not yet reliable", "Not judged: too few runs", "Not enough data". */
  label: "Reliable" | "Not yet reliable" | typeof NOT_JUDGED_LABEL | "Not enough data";
  /** Held-out rank agreement (Spearman) between predicted and measured order, when measured. */
  rho: number | null;
  /** Its 95% interval, when the engine reported one. */
  ci: [number, number] | null;
  /** The engine's trust floor for `rho`, when reported. */
  floor: number | null;
  /** One plain sentence saying why. Never says "clears" while the interval reaches below the floor. */
  reason: string;
};

/**
 * The one reliability verdict app-wide (redesign brief, rule 1). `state` is
 * `isReliable()` - the same predicate as before - plus the honest third case
 * where the engine could not score rank agreement at all. Promotion gates are
 * a separate question with their own line; nothing here reads `promotion`.
 */
export function reliabilityVerdict(
  d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman"> & Partial<Pick<AnalyzeResult, "verdict">>,
): ReliabilityVerdict {
  const rel = d.reliability;
  const rho = rel?.spearman ?? d.cv_spearman ?? null;
  const ci = rel?.ci95 ?? d.cv_ci95 ?? null;
  const floor = rel?.spearman_floor ?? null;
  const floorText = floor != null ? ` (${fixed2(floor)})` : "";
  // Trust layer F04: below 12 runs or 3 CV groups the engine does not judge the floor. Not a pass, not a fail.
  if (floorNotJudged(rel)) {
    const why = rel?.not_judged_reason ? ` (${rel.not_judged_reason})` : "";
    return {
      state: "not-judged",
      label: NOT_JUDGED_LABEL,
      rho,
      ci,
      floor,
      reason: `Not judged: too few runs${why}. The trust floor was neither passed nor failed, so treat the model's suggestions as exploration.`,
    };
  }
  // The engine's own verdict can be stricter than the floor (it also needs >= 20 runs and >= 8 groups): never say
  // "Reliable" while it says "not yet".
  const engineNotYet = d.verdict?.state === "not_yet" || d.verdict?.state === "refused";
  if (rho == null) {
    return {
      state: "insufficient",
      label: "Not enough data",
      rho,
      ci,
      floor,
      reason: "There are not enough held-out runs to measure how well the model ranks recipes.",
    };
  }
  if (isReliable(d) && engineNotYet) {
    return {
      state: "not-yet",
      label: "Not yet reliable",
      rho,
      ci,
      floor,
      reason: d.verdict?.headline ?? `The model clears the trust floor${floorText}, but the engine's verdict is not yet reliable.`,
    };
  }
  if (isReliable(d)) {
    const reachesBelow = floor != null && ci != null && ci[0] < floor;
    return {
      state: "reliable",
      label: "Reliable",
      rho,
      ci,
      floor,
      reason: reachesBelow
        ? `The model ranks held-out runs above the trust floor${floorText} on average, but its 95% interval still reaches below it.`
        : `The model ranks held-out runs above the trust floor${floorText}, and its 95% interval stays above it.`,
    };
  }
  // Without a `reliability` object there is no floor to compare against: the only known cause is the interval.
  const belowFloor = rel ? !rel.clears_floor : false;
  return {
    state: "not-yet",
    label: "Not yet reliable",
    rho,
    ci,
    floor,
    reason: belowFloor
      ? `The model's ranking of held-out runs is below the trust floor${floorText}.`
      : rel
        ? "The model's ranking of held-out runs is above the trust floor on average, but its 95% interval still includes zero, so it is not confirmed yet."
        : ci
          ? "The model's ranking of held-out runs has a 95% interval that includes zero, so it is not confirmed yet."
          : "The engine did not report a 95% interval for the model's ranking of held-out runs, so it is not confirmed yet.",
  };
}

/**
 * Which held-out grouping drove the reliability score (`cv_grouping.used`, trust layer F05), in plain words:
 * "held-out by batch (5 groups)", "held-out by campaign round (4 groups)", "held-out by replicate group (30 groups)".
 * Null when the engine did not say (older analyses): nothing is guessed.
 */
export function cvGroupingText(g: CvGrouping | null | undefined): string | null {
  const u = g?.used;
  if (!u || typeof u.basis !== "string") return null;
  const by =
    u.basis === "replicate_clusters"
      ? "replicate group"
      : u.basis === "campaign_round"
        ? "campaign round"
        : u.column
          ? u.column
          : u.basis.replace(/_/g, " ");
  const n = typeof u.n_groups === "number" && Number.isFinite(u.n_groups) ? ` (${u.n_groups} ${u.n_groups === 1 ? "group" : "groups"})` : "";
  const merged = u.merged_with_replicates && u.basis !== "replicate_clusters" ? ", replicates kept together" : "";
  return `held-out by ${by}${n}${merged}`;
}

/** The engine's sentence for the grouping that drove the score, for a tooltip or disclosure. */
export const CV_GROUPING_NOTE =
  "Every grouping the engine could check (replicates, batch, lot, plate, date, round, scale) was cross-validated; the lowest held-out score is the one reported, so runs of one group never sit on both sides of a split.";

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
/**
 * How far `z_std` may sit from 1 before the UI calls the bands narrow or
 * wide. The engine reports the number, not a verdict; within this distance
 * (about the sampling noise of z_std at a few dozen held-out points) the
 * honest reading is "close to calibrated", not "too narrow".
 */
export const Z_STD_TOLERANCE = 0.1;

export function calibrationNote(cal: Calibration | null | undefined): string | null {
  if (!cal) return null;
  if (!cal.available) return `Not scored - ${cal.reason ?? "not enough held-out points"}.`;
  const parts = [`ECE ${cal.ece != null ? fixed2(cal.ece) : "n/a"}`];
  if (cal.z_std != null) {
    const shape = Math.abs(cal.z_std - 1) <= Z_STD_TOLERANCE ? "close to calibrated" : cal.z_std > 1 ? "bands read narrow, overconfident" : "bands read wide";
    parts.push(`z_std ${fixed2(cal.z_std)} (${shape})`);
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
  const lo = fixed2(Math.min(...finite));
  const hi = fixed2(Math.max(...finite));
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
  return `rho ${fixed2(logo.spearman)} across ${logo.n_groups} held-out group${logo.n_groups === 1 ? "" : "s"} (n=${logo.n_oof}).`;
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
  // `direction` (engine aa7396a): under minimize the top k are the LOWEST runs.
  const which = topk.direction === "lowest" ? `lowest ${topk.k}` : `top ${topk.k}`;
  return `${hits} of the true ${which} caught (n=${topk.n}).`;
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
  const text = `Group-mean baseline rho ${fixed2(baseline.spearman)} (n=${baseline.n_evaluable} rows, ${baseline.n_groups_used} groups)${
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
    (e) => `${e.column} (${fixed2(e.lower)} to ${fixed2(e.upper)}, ${e.n_excluded} row${e.n_excluded === 1 ? "" : "s"} excluded)`,
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
// The closed optimization loop (Predict -> Validate): propose -> run -> log outcome
// -> re-propose. A campaign is one target plus a growing (recipe -> outcome)
// table; `GET /api/campaigns/{id}` reflects it, `POST .../reanalyze` is the loop
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
  /** The round the run was started in; optional until the engine sends it. */
  round?: number;
  created_at?: number;
  measured_at?: number | null;
  /** Which analysis proposed this run (provenance hashes, engine version, seed). */
  analysis_provenance?: { provenance_sha256?: string; input_sha256?: string; config_sha256?: string; engine_version?: string; seed?: number; timestamp?: number } | null;
  /** Result versioning (present once a result was recorded or corrected). */
  result_version?: number;
  previous_result?: number | null;
  result_reason?: string | null;
  result_actor?: string | null;
  result_recorded_at?: number | null;
  /** Who supplied `pred`/`std`: "engine" (matched a published proposal at start) or "caller". Null on legacy runs. */
  pred_source?: "engine" | "caller" | null;
  /** The engine's own prediction and band recorded when the run started (R5). Null on legacy runs. */
  prediction_at_start?: PredictionAtStart | null;
  /** measured − predicted (derived), against the prediction recorded at start. Null while awaiting or without one. */
  residual?: number | null;
  residual_basis?: string | null;
  /** Whether the measured value fell inside the band recorded at start. */
  inside_band?: boolean | null;
};

export type PredictionAtStart =
  | {
      available: true;
      basis: string;
      pred: number;
      std: number;
      std_method?: string;
      interval: { lo: number; hi: number; half_width: number; coverage: number; method: string } | null;
      interval_unavailable_reason: string | null;
      proposal_index?: number;
      analysis_provenance?: Record<string, unknown>;
      analysis_generation?: string;
      recorded_at?: number;
      intervals?: ProposalInterval[];
      gp_intervals?: GpInterval[];
    }
  | { available: false; reason: string };

/** The engine's own stage state (forward-compatible: optional until the engine sends it). */
export type EngineStage = {
  round: number | null;
  current: "setup" | "plan" | "run" | "record" | "learn";
  started: number;
  steps: { key: StageKey; state: "done" | "current" | "upcoming"; detail: string }[];
};
export type EngineNextAction = { stage: StageKey; action: string; reason: string };

export type Campaign =
  | { has_campaign: false; stage?: EngineStage; next_action?: EngineNextAction }
  | {
      has_campaign: true;
      stage?: EngineStage;
      next_action?: EngineNextAction;
      target: string;
      features: string[];
      n_base: number;
      best: number | null;
      /** Optimization direction (`best` is the minimum when minimizing). Absent on older engines. */
      goal?: Goal;
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
       * Whether the campaign analysis provably describes this campaign as it is now
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

/** A recipe about to be started, in the shape POST /api/campaigns/{id}/runs expects. */
export type StartRecipe = {
  recipe: Record<string, number>;
  pred: number;
  std: number;
  mode: string;
  reason: string;
};

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

// --- Multi-campaign API (kalos-engine docs/CAMPAIGNS_API.md) ---------------
// Every campaign-scoped read and write the app makes. The legacy single-
// campaign routes above act only on the tenant's DEFAULT campaign; the pages
// use these instead, so a campaign created here is never confused with it.

/** A campaign's identity and lifecycle (not its data: see `Campaign` for the summary). */
export type CampaignMeta = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  archived: boolean;
  /** True once a sheet was uploaded and the campaign has base data. */
  seeded: boolean;
  /** The campaign the legacy /api/run, /api/campaign routes act on. */
  is_default: boolean;
};

export type CampaignDetail = { campaign: CampaignMeta; summary: Campaign };

/** Background analysis job (kalos-engine docs/JOBS.md). Stage and progress are the engine's, reported at stage boundaries. */
export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";
export type Job = {
  id: string;
  campaign_id: string;
  kind: string;
  state: JobState;
  /** queued | parsing | fitting | calibrating | proposing | publishing | succeeded (or a terminal state). */
  stage: string;
  /** 0-1, reported at stage boundaries, not per iteration. */
  progress: number;
  attempts: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  updated_at: number;
  cancel_requested: boolean;
  input_bytes: number | null;
  /** Fixed engine text; never the exception text. */
  error: { code: string; message: string } | null;
  campaign_generation: string | null;
};

export const isJobActive = (j: Pick<Job, "state"> | null | undefined): boolean => j?.state === "queued" || j?.state === "running";

/** The engine's `{ error, code }` envelope as a typed EngineError (code, plus the engine's own sentence when it sent one). */
async function failure(r: Response): Promise<EngineError> {
  return failureFrom(r.status, await readJsonBody(r));
}

function failureFrom(status: number, d: Record<string, unknown> | null): EngineError {
  const code = typeof d?.code === "string" ? d.code : typeof d?.error === "string" && /^[a-z][a-z0-9_]*$/.test(d.error) ? d.error : codeForStatus(status);
  const detail = typeof d?.error === "string" && d.error !== code ? d.error : undefined;
  const fix = typeof d?.what_would_fix_it === "string" && d.what_would_fix_it ? d.what_would_fix_it : undefined;
  return new EngineError(status, code, typeof d?.limit_mb === "number" ? d.limit_mb : undefined, detail, fix);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, init);
  } catch {
    throw new EngineError(0, "engine_unreachable");
  }
  if (!r.ok) throw await failure(r);
  return (await r.json()) as T;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: mutationHeaders({ "Content-Type": "application/json" }),
  body: body === undefined ? undefined : JSON.stringify(body),
});

const enc = encodeURIComponent;

export const listCampaigns = (includeArchived = false): Promise<CampaignMeta[]> =>
  call<{ campaigns: CampaignMeta[] }>(`/api/campaigns${includeArchived ? "?include_archived=true" : ""}`).then((d) => d.campaigns);

export const createCampaign = (name: string): Promise<CampaignMeta> => call<CampaignMeta>("/api/campaigns", jsonInit("POST", { name }));

/** Rename, or archive/unarchive (archiving needs an admin with a recent second factor). */
export const updateCampaign = (id: string, patch: { name?: string; archived?: boolean }): Promise<CampaignMeta> =>
  call<CampaignMeta>(`/api/campaigns/${enc(id)}`, jsonInit("PATCH", patch));

export const getCampaignDetail = (id: string): Promise<CampaignDetail> => call<CampaignDetail>(`/api/campaigns/${enc(id)}`);

/** The campaign's current analysis: the /api/latest shape, `{ has_data: false }` before the first upload. */
export const getCampaignAnalysis = (id: string): Promise<LatestResult> => call<LatestResult>(`/api/campaigns/${enc(id)}/analysis`);

export type UploadOptions = { target?: string; roles?: ColumnRolesInput; sheet?: string; replace?: boolean };

/**
 * Submit an upload as a background job. The engine runs the pre-fit checks
 * before queueing, so a bad sheet comes back at once as `{ refused }` with
 * the same `{ error, code, sheets }` body /api/run returns (rendered inline,
 * not thrown). A campaign with runs and no `replace` throws
 * CampaignHasRunsError; anything else non-2xx throws EngineError.
 */
export async function submitUploadJob(campaignId: string, file: File, opts: UploadOptions = {}): Promise<{ job: Job } | { refused: AnalyzeResult }> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.target) fd.append("target", opts.target);
  if (opts.roles) fd.append("roles", JSON.stringify(opts.roles));
  if (opts.sheet) fd.append("sheet", opts.sheet);
  if (opts.replace) fd.append("replace", "true");
  let r: Response;
  try {
    r = await fetch(`${API}/api/campaigns/${enc(campaignId)}/jobs`, { method: "POST", body: fd, headers: mutationHeaders() });
  } catch {
    throw new EngineError(0, "engine_unreachable");
  }
  if (r.ok) {
    const d = await readJsonBody(r);
    if (d && typeof d.job === "object" && d.job) return { job: d.job as Job };
    throw new EngineError(r.status, "engine_error");
  }
  const d = await readJsonBody(r);
  const refusal = campaignHasRunsRefusal(r.status, d);
  if (refusal) throw refusal;
  if (r.status === 400 && d && typeof d.error === "string") return { refused: d as unknown as AnalyzeResult };
  throw failureFrom(r.status, d);
}

export const getJob = (jobId: string): Promise<Job> => call<{ job: Job }>(`/api/jobs/${enc(jobId)}`).then((d) => d.job);

export const cancelJob = (jobId: string): Promise<Job> => call<{ job: Job }>(`/api/jobs/${enc(jobId)}/cancel`, jsonInit("POST")).then((d) => d.job);

/** Newest first. */
export const listJobs = (campaignId: string, limit = 5): Promise<Job[]> =>
  call<{ jobs: Job[] }>(`/api/campaigns/${enc(campaignId)}/jobs?limit=${limit}`).then((d) => d.jobs);

/** Start recipes from the proposed batch: they become awaiting runs. */
export const startCampaignRuns = (campaignId: string, recipes: StartRecipe[]): Promise<{ started: CampaignRun[] }> =>
  call(`/api/campaigns/${enc(campaignId)}/runs`, jsonInit("POST", { recipes }));

/**
 * Record (or correct) a run's measured value. Results are append-only and
 * versioned: a correction of an existing value needs a `reason`
 * (400 `reason_required` otherwise).
 */
export const recordCampaignResult = (campaignId: string, runId: string, value: number, reason?: string): Promise<CampaignRun> =>
  call(`/api/campaigns/${enc(campaignId)}/runs/${enc(runId)}/result`, jsonInit("POST", reason ? { value, reason } : { value }));

/**
 * Fold measured runs into the base data and re-fit, as a background job
 * (202): track it with getJob, cancel with cancelJob. Stages: planning,
 * fitting, calibrating, proposing, publishing. Refused before queueing with
 * 409 `job_pending`, 400 `nothing_to_fold` / `no_data`, 429, 503 (EngineError).
 */
export const submitReanalyzeJob = (campaignId: string): Promise<Job> =>
  call<{ job: Job }>(`/api/campaigns/${enc(campaignId)}/reanalyze/jobs`, jsonInit("POST")).then((d) => d.job);

// --- Campaign list with summary fields (GET /api/campaigns?summary=true) -----

/** One campaign card: identity plus the engine's summary fields, from ONE list request (no request per campaign). */
export type CampaignSummaryRow = CampaignMeta & {
  has_data: boolean;
  target: string | null;
  n_base: number;
  round: number;
  n_awaiting: number;
  n_measured: number;
  goal?: { direction: Goal; source: string };
  /** Measured, folded rows only: never a prediction. Null before data. */
  best_measured?: { value: number | null; basis: "measured"; direction: "max" | "min" } | null;
  analysis?:
    | { present: false }
    | {
        present: true;
        updated: number;
        in_sync: boolean;
        engine_version?: string;
        cv_spearman: number | null;
        conformal_q: number | null;
        conformal_coverage: number | null;
        reliability: { clears_floor: boolean | null; verdict?: string; not_judged_reason?: string | null; ci_excludes_zero: boolean; spearman: number | null; ci95: [number, number] | null; spearman_floor: number; producer_clears_floor?: boolean } | null;
        n_proposals: number;
        /** The stored analysis's model verdict (trust layer F04), when the engine sends it. */
        verdict?: EngineVerdict | null;
      };
  /** The target's display unit (engine 754a87a); absent on older engines (fall back to the header). */
  target_unit?: TargetUnit | null;
  current_stage?: string | null;
  latest_gate_decision?: { gate: string; decision: GateDecision; decided_at: number } | null;
  active_job?: { id: string; kind: string; state: JobState; progress: number; stage: string } | null;
};

export const listCampaignSummaries = (opts: { includeArchived?: boolean; limit?: number; cursor?: string } = {}): Promise<{ campaigns: CampaignSummaryRow[]; next_cursor: string | null }> => {
  const q = new URLSearchParams({ summary: "true" });
  if (opts.includeArchived) q.set("include_archived", "true");
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  return call<{ campaigns: CampaignSummaryRow[]; next_cursor?: string | null }>(`/api/campaigns?${q}`).then((d) => ({ campaigns: d.campaigns, next_cursor: d.next_cursor ?? null }));
};

/**
 * Every page of the summary list, following `next_cursor`. Stops after `maxPages` requests (or if the engine repeats
 * a cursor) and says so with `complete: false`, so the caller can show "showing N of more" instead of a short list.
 */
export async function listAllCampaignSummaries(
  opts: { includeArchived?: boolean; limit?: number; maxPages?: number } = {},
): Promise<{ campaigns: CampaignSummaryRow[]; complete: boolean }> {
  const { maxPages = 25, ...page } = opts;
  const campaigns: CampaignSummaryRow[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let n = 0; n < maxPages; n++) {
    const d = await listCampaignSummaries({ ...page, cursor });
    campaigns.push(...d.campaigns);
    if (!d.next_cursor) return { campaigns, complete: true };
    if (seen.has(d.next_cursor)) break;
    seen.add(d.next_cursor);
    cursor = d.next_cursor;
  }
  return { campaigns, complete: false };
}

// --- Setup: goal, bounds, linear constraints, target unit (GET/PUT /setup) ----

export type LinearConstraint = { coefficients: Record<string, number>; op: "<=" | ">="; rhs: number };
export type SetupDoc = {
  goal: Goal;
  bounds: Record<string, { lo: number | null; hi: number | null }>;
  linear_constraints: LinearConstraint[];
  target_unit: string | null;
};
export type SetupView = {
  campaign_id: string;
  setup: SetupDoc;
  source: "default" | "stored" | "unreadable";
  hash: string;
  updated_at: number | null;
  updated_by: string | null;
  bounds_report: Record<string, { lo: number | null; hi: number | null; observed: [number, number] | null; effective: [number, number] | null; extrapolates: boolean }>;
  has_analysis: boolean;
  analysis_setup_hash: string | null;
  /** false: the setup changed since the analysis, re-analyze to apply it. null: no analysis yet. */
  settings_in_sync: boolean | null;
};

export const getSetup = (campaignId: string): Promise<SetupView> => call<SetupView>(`/api/campaigns/${enc(campaignId)}/setup`);

/** Replace the whole setup. 400 codes (EngineError.code): invalid_bounds, infeasible_constraints, constraints_with_categoricals, bounds_outside_data, ... */
export const putSetup = (campaignId: string, doc: SetupDoc): Promise<SetupView> => call<SetupView>(`/api/campaigns/${enc(campaignId)}/setup`, jsonInit("PUT", doc));

// --- Stage track and go/no-go gates (recorded by people, never computed) -----

export type GateDecision = "go" | "no_go" | "pending";
export type GateEvidenceRef = { kind: "analysis" | "scale_readout" | "job" | "run"; id: string; label?: string };
export type GateRecord = {
  id: number;
  gate: string;
  decision: GateDecision;
  note: string;
  evidence_linked: GateEvidenceRef[];
  decided_by: string;
  auth_method?: string;
  decided_at: number;
  basis: "recorded";
};
export type StageDef = {
  key: string;
  label: string;
  min_L: number | null;
  max_L: number | null;
  nominal_L: number[] | null;
  volume_unit?: string;
  gate: { key: string; decision: GateDecision | null; state: "open" | "recorded"; basis: string; current: GateRecord | null; history_count: number };
};
export type StagesView = {
  campaign_id: string;
  source: "default" | "campaign";
  updated_at: number | null;
  updated_by: string | null;
  current_stage: string | null;
  current_stage_basis: string;
  stages: StageDef[];
  orphaned_gates: unknown[];
};
export type ComputedEvidence =
  | {
      available: true;
      basis: "computed";
      source: string;
      scope: string;
      note: string;
      analysis_updated_at: number | null;
      campaign_generation?: string;
      target: string | null;
      n_measured: number | null;
      best_measured: { value: number | null; basis: "measured" } | null;
      reliability: { basis: string; method: string; spearman: number | null; ci95: [number, number] | null; spearman_floor: number | null; clears_floor: boolean | null; ci_excludes_zero: boolean | null; verdict?: string; not_judged_reason?: string | null } | null;
      promotion: { basis: string; passed: boolean; failures: string[]; summary: string } | null;
    }
  | { available: false; basis: "computed"; code: string; reason: string; what_would_fix_it?: string };
export type GateView = {
  key: string;
  stage_label: string;
  in_stage_definitions: boolean;
  decision: GateDecision | null;
  state: "open" | "recorded";
  basis: string;
  current: GateRecord | null;
  history_count: number;
  history: GateRecord[];
  history_truncated: boolean;
  computed_evidence: ComputedEvidence;
};
export type GatesView = {
  campaign_id: string;
  stages_source: string;
  current_stage: string | null;
  history_preview?: number;
  gates: GateView[];
  orphaned_gates: GateView[];
  orphaned_gates_total?: number;
  orphaned_gates_truncated?: boolean;
};

export const getStages = (campaignId: string): Promise<StagesView> => call<StagesView>(`/api/campaigns/${enc(campaignId)}/stages`);

/** Replace the stage definitions; `current_stage` is required (null clears it) and is set by a person. */
export const putStages = (
  campaignId: string,
  body: { stages: { key: string; label: string; min_L?: number | null; max_L?: number | null; nominal_L?: number[] | null }[]; current_stage: string | null },
): Promise<StagesView> => call<StagesView>(`/api/campaigns/${enc(campaignId)}/stages`, jsonInit("PUT", body));

export const getGates = (campaignId: string): Promise<GatesView> => call<GatesView>(`/api/campaigns/${enc(campaignId)}/gates`);

export const getGateHistory = (campaignId: string, gate: string, opts: { limit?: number; beforeId?: number } = {}): Promise<{ items: GateRecord[]; has_more: boolean; next_before_id: number | null }> => {
  const q = new URLSearchParams();
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.beforeId != null) q.set("before_id", String(opts.beforeId));
  return call(`/api/campaigns/${enc(campaignId)}/gates/${enc(gate)}/history${q.size ? `?${q}` : ""}`);
};

/** Record a human go/no-go decision (append-only; the server sets who and when). A note is required. */
export const recordGateDecision = (
  campaignId: string,
  gate: string,
  body: { decision: GateDecision; note: string; evidence?: GateEvidenceRef[] },
): Promise<{ campaign_id: string; recorded: GateRecord; gate: GateView }> => call(`/api/campaigns/${enc(campaignId)}/gates/${enc(gate)}`, jsonInit("PUT", body));

// --- Report: raw rows, result history + audit log, operating ranges ----------

export type RowsExport = {
  campaign_id: string;
  has_data: boolean;
  format: "json";
  target: string | null;
  columns: string[];
  original_rows_identifiable: boolean;
  original_rows_reason: string | null;
  original_rows: { origin: string; round: number; n: number; rows: Record<string, unknown>[] } | null;
  folded_rows: { origin: string; n: number; rows: { origin: string; folded_in_round: number; values: Record<string, unknown> }[] } | null;
  unattributed_rows: { origin: string; n: number; rows: Record<string, unknown>[] } | null;
  anonymization: { applied: boolean } & Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export const exportRowsJson = (campaignId: string): Promise<RowsExport> => call<RowsExport>(`/api/campaigns/${enc(campaignId)}/export/rows?format=json`);

/**
 * The rows as the engine's CSV (formula-neutralized), with the engine's X-Kalos-Content-Sha256 and
 * X-Kalos-Anonymized headers when sent (the proxy passes both, shape-checked).
 */
export async function exportRowsCsv(campaignId: string): Promise<{ blob: Blob; filename: string | null; contentSha256: string | null; anonymized: boolean | null }> {
  let r: Response;
  try {
    r = await fetch(`${API}/api/campaigns/${enc(campaignId)}/export/rows?format=csv`);
  } catch {
    throw new EngineError(0, "engine_unreachable");
  }
  if (!r.ok) throw await failure(r);
  const cd = r.headers.get("content-disposition") ?? "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  const sha = r.headers.get("x-kalos-content-sha256");
  const anon = r.headers.get("x-kalos-anonymized");
  return { blob: await r.blob(), filename: m ? m[1] : null, contentSha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : null, anonymized: anon === "true" ? true : anon === "false" ? false : null };
}

export type ResultHistoryItem = {
  id: number;
  run_id: string;
  version: number;
  value: number;
  previous_value: number | null;
  reason: string | null;
  actor: string | null;
  auth_method?: string;
  recorded_at: number;
  is_correction: boolean;
  basis: "measured";
};
export type AuditItem = {
  id: number;
  ts: number;
  subject: string | null;
  auth_method?: string;
  action: string;
  campaign_id?: string | null;
  job_id?: string | null;
  outcome: string;
  request_id?: string | null;
  detail: string | null;
};
export type ResultHistory = {
  campaign_id: string;
  limit: number;
  results?: { items: ResultHistoryItem[]; has_more: boolean; next_before_id: number | null };
  audit?: { items: AuditItem[]; has_more: boolean; next_before_id: number | null };
  notes?: Record<string, string>;
};

export const getResultHistory = (
  campaignId: string,
  opts: { section?: "all" | "results" | "audit"; limit?: number; resultsBeforeId?: number; auditBeforeId?: number } = {},
): Promise<ResultHistory> => {
  const q = new URLSearchParams();
  if (opts.section) q.set("section", opts.section);
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.resultsBeforeId != null) q.set("results_before_id", String(opts.resultsBeforeId));
  if (opts.auditBeforeId != null) q.set("audit_before_id", String(opts.auditBeforeId));
  return call<ResultHistory>(`/api/campaigns/${enc(campaignId)}/results/history${q.size ? `?${q}` : ""}`);
};

export type OperatingRanges =
  | {
      campaign_id?: string;
      status: "computed";
      method: string;
      basis: "predicted";
      model_based: true;
      must_verify_experimentally: true;
      statement: string;
      rule: Record<string, unknown>;
      model?: Record<string, unknown>;
      sampling?: Record<string, unknown>;
      anchor?: Record<string, unknown>;
      ranges: { feature: string; low: number; high: number; design_low: number; design_high: number; basis: string }[];
      box?: Record<string, unknown>;
      fraction_of_design_space_meeting_rule: number | null;
      reliability?: Record<string, unknown>;
      caveats?: string[];
    }
  | { campaign_id?: string; status: "not_computed"; reason_code: string; reason: string; what_would_fix_it?: string; diagnostics?: Record<string, unknown> };

/** Compute (write scope: it refits the GP and occupies the analysis slot; the proxy offers only this POST form) the model-based operating box, or the engine's not_computed reason. */
export const computeOperatingRanges = (campaignId: string, body: { threshold: number; probability: number }): Promise<OperatingRanges> =>
  call<OperatingRanges>(`/api/campaigns/${enc(campaignId)}/operating-ranges`, jsonInit("POST", { ...body, basis: "target" }));

export { API };

/* ---- Clones / strains (engine docs/CLONES.md, schema v7). Labels only; every statistic is the engine's. ---- */

export type EngineRefusalEntry = { code: string; level?: string | null; reason: string; what_would_fix_it?: string | null } & Record<string, unknown>;

/** One clone's MEASURED summary for one outcome (`basis: "measured"`). `ci95` only when n_runs >= 3. */
export type CloneOutcome = {
  basis: string;
  n_runs: number;
  n_missing?: number;
  n_recipes?: number | null;
  n_replicated_recipes?: number | null;
  mean: number | null;
  sd?: number | null;
  median?: number | null;
  min?: number | null;
  max?: number | null;
  best?: number | null;
  best_run_id?: string | null;
  ci95: [number, number] | null;
  ci_reason?: string | null;
  /** The interval's coverage, e.g. 0.95. */
  coverage?: number;
  replicate_sd?: number | null;
  replicate_sd_reason?: string | null;
  by_scale?: Record<string, CloneOutcome>;
};

/** Process-adjusted clone effect (`basis: "derived"`), relative to `relative_to`; withheld with a refusal. */
export type CloneAdjustedEffect = {
  basis: string;
  estimate: number | null;
  ci95: [number, number] | null;
  coverage?: number;
  approximate?: boolean;
  ci_method?: string;
  shrinkage_w?: number | null;
  mostly_pooled?: boolean;
  is_reference?: boolean;
  relative_to?: string;
  n?: number;
  refusal?: EngineRefusalEntry | null;
};

/** The GP at one shared reference process with this clone (`basis: "predicted"`). */
export type CloneGpAtReference = {
  basis: string;
  pred: number | null;
  lo?: number | null;
  hi?: number | null;
  coverage?: number;
  method?: string;
  calibrated?: boolean;
  calibrated_on?: string;
  note?: string;
  at?: Record<string, number | string | null>;
  refusal?: EngineRefusalEntry | null;
};

export type CloneLevel = {
  label: string;
  n_runs: number;
  n_recipes?: number | null;
  n_replicated_recipes?: number | null;
  n_fitted?: number;
  rounds?: string[] | null;
  scales?: string[] | null;
  outcomes: Record<string, CloneOutcome>;
  covariates?: Record<string, { min?: number | null; max?: number | null; n?: number; n_distinct?: number }>;
  adjusted_effect?: CloneAdjustedEffect | null;
  gp_at_reference?: CloneGpAtReference | null;
  oof_coverage?: { n: number; nominal: number; empirical: number | null; reason: string | null } | null;
  flags: string[];
};

export type StrainSummary =
  | { available: false; reason: string; refusals?: EngineRefusalEntry[]; levels?: CloneLevel[] }
  | {
      available: true;
      reason: null;
      column: string;
      source?: "setup" | "declared" | "detected" | string;
      policy?: "fixed" | "factor" | string;
      modeled?: boolean;
      fixed_level?: string | null;
      fixed_level_source?: string | null;
      fixed_level_note?: string | null;
      reference_level?: string | null;
      n_levels?: number;
      n_levels_with_3_runs?: number;
      target?: string;
      outcome_units?: Record<string, string | null>;
      outcome_direction?: Record<string, string>;
      levels: CloneLevel[];
      process_balance?: { flag: boolean; messages?: string[] } & Record<string, unknown>;
      confounded_with?: { column: string; cramers_v?: number | null; fully?: boolean; confined?: Record<string, string> }[];
      scale?: { column: string | null; levels: string[]; mixed: boolean; note: string | null };
      adjusted_method?: string | null;
      adjusted_note?: string;
      tau?: number | null;
      i2?: number | null;
      leave_one_clone_out?: { spearman: number | null; n_clones?: number; n_oof?: number; reason: string | null; note?: string } | null;
      refusals: EngineRefusalEntry[];
    };
