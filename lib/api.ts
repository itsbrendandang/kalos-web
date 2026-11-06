// Client for the Kalos engine API (the FastAPI service in the kalos repo).
import type { StageKey } from "@/lib/routes";
import type { ValidationReport } from "@/lib/validation";
import { recordAudit } from "@/lib/audit-store";
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";
import { EngineError } from "@/lib/engine-error";
import {
  AssistUnavailableError,
  assistUnavailableReason,
  isAssistAnswer,
  isAssistIndexStatus,
  isAssistNext,
  type AssistAnswer,
  type AssistIndexStatus,
  type AssistNext,
} from "@/lib/assist";
import type { SopDraft, SopSource, SopSummary, SopTemplate } from "@/lib/sop";

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
};

/** The full recipe to run and record for a proposal. Falls back to the
 *  proposal_features alone only for older engines that do not send `recipe`. */
export function proposalRecipe(p: Proposal, features: string[]): Record<string, number> {
  return p.recipe ?? Object.fromEntries(features.map((f, i) => [f, p.vals[i]]));
}

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
  blank_cells_as_absent?: number;
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
};

export const runSingle = (): Promise<SingleRun> =>
  fetch(`${API}/api/single`).then((r) => {
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    return r.json();
  });

export const runMulti = (): Promise<MultiRun> =>
  fetch(`${API}/api/multi`).then((r) => {
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    return r.json();
  });

/** Explicit column roles the engine accepts as `roles` (kalos ColumnRoles): replaces name-based inference. */
export type ColumnRolesInput = { target: string; features: string[]; ids?: string[]; /** Inputs whose values are labels, not numbers (the engine's `categoricals`). */ categoricals?: string[] };

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

/**
 * POST /api/run. `roles` is sent when the user confirmed column roles; `sheet` picks a worksheet of a
 * multi-sheet workbook (engine form field `sheet`), omitted the engine chooses. `replace: true` sends the
 * form field `replace=true`, which the engine requires to overwrite a campaign that has awaiting or
 * measured runs; without it that case throws CampaignHasRunsError.
 */
export async function runFile(
  file: File,
  target?: string,
  roles?: ColumnRolesInput,
  sheet?: string,
  opts: { replace?: boolean } = {},
): Promise<AnalyzeResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (target) fd.append("target", target);
  if (roles) fd.append("roles", JSON.stringify(roles));
  if (sheet) fd.append("sheet", sheet);
  if (opts.replace) fd.append("replace", "true");
  let r: Response;
  try {
    r = await fetch(`${API}/api/run`, { method: "POST", body: fd, headers: mutationHeaders() });
  } catch {
    throw new EngineError(0, "engine_unreachable");
  }
  // A body that is not JSON (a proxy's HTML page, a truncated reply) is a typed failure, not a parse crash.
  const d = await readJsonBody(r);
  const refusal = campaignHasRunsRefusal(r.status, d);
  if (refusal) throw refusal;
  if (r.ok && d) {
    recordAudit([{ action: "campaign.upload", detail: `Uploaded "${file.name}" as the campaign data${target ? ` (target ${target})` : ""}${opts.replace ? ", replacing the previous campaign" : ""}.` }]);
    return d as AnalyzeResult;
  }
  // A 400 with the documented { error } body is an expected "bad upload" the caller renders inline
  // (see setup/page.tsx); it is returned, not thrown.
  if (r.status === 400 && d && typeof d.error === "string") return d as AnalyzeResult;
  // Everything else is a failure: the proxy's own code when it sent one, else the code this status means.
  const code = typeof d?.error === "string" ? d.error : codeForStatus(r.status);
  throw new EngineError(r.status, code, typeof d?.limit_mb === "number" ? d.limit_mb : undefined);
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

export { calibrationNote, cvLogoNote, cvTopKNote, designBoxExclusionsNote, driverSelectionNote, groupMeanBaselineVerdict, proposalAuditNote, proposalGatingNote, reliabilityReason, repeatSpreadNote } from "@/lib/api-notes";

export const getLatest = (): Promise<LatestResult> =>
  fetch(`${API}/api/latest`).then((r) => {
    // fetch only rejects on network failure; treat a non-2xx engine response as an
    // error too, so callers show the offline state instead of a fake "no data".
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
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
export function isReliable(d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">): boolean {
  const rel = d.reliability;
  if (rel) return rel.clears_floor && rel.ci_excludes_zero;
  const ci = d.cv_ci95 ?? null;
  return d.cv_spearman != null && ci != null && ci[0] > 0;
}

export type ReliabilityState = "reliable" | "not-yet" | "insufficient";

export type ReliabilityVerdict = {
  state: ReliabilityState;
  /** The plain label every surface shows: "Reliable", "Not yet reliable", "Not enough runs to tell". */
  label: "Reliable" | "Not yet reliable" | "Not enough runs to tell";
  /** Held-out rank agreement (Spearman) between predicted and measured order, when measured. */
  rho: number | null;
  /** Its 95% interval, when the engine reported one. */
  ci: [number, number] | null;
  /** The engine's trust floor for `rho`, when reported. */
  floor: number | null;
  /** The why-line code (lib/why.ts) for a caveat on the score itself, e.g. cv_ci_unavailable when no interval was reported; null when there is none. */
  caveat: "cv_ci_unavailable" | null;
  /** One plain sentence saying why, with no numbers in it: the Spearman, interval and floor are for a disclosure (see trustNumbers). Never says the model is sure while the interval reaches below the floor. */
  reason: string;
};

/**
 * The one reliability verdict app-wide (redesign brief, rule 1). `state` is
 * `isReliable()` - the same predicate as before - plus the honest third case
 * where the engine could not score rank agreement at all. Promotion gates are
 * a separate question with their own line; nothing here reads `promotion`.
 */
export function reliabilityVerdict(
  d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">,
): ReliabilityVerdict {
  const rel = d.reliability;
  const rho = rel?.spearman ?? d.cv_spearman ?? null;
  const ci = rel?.ci95 ?? d.cv_ci95 ?? null;
  const floor = rel?.spearman_floor ?? null;
  if (rho == null) {
    return {
      state: "insufficient",
      label: "Not enough runs to tell",
      rho,
      ci,
      floor,
      caveat: null,
      reason: "Too few past runs could be tested to tell whether the model puts them in the right order.",
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
      caveat: ci ? null : "cv_ci_unavailable",
      reason: reachesBelow
        ? "The model put your past runs in the right order most of the time, so its suggestions are worth running, though we are less sure of that than usual."
        : "The model put your past runs in the right order most of the time, and we are sure enough of that, so its suggestions are worth running.",
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
    caveat: ci ? null : "cv_ci_unavailable",
    reason: belowFloor
      ? "The model put your past runs in the right order about as often as not, so it cannot yet tell a good recipe from a poor one."
      : rel || ci
        ? "The model put your past runs in the right order more often than not, but that could still be chance, so it is not confirmed yet."
        : "Kalos did not say how sure it is that the model puts past runs in the right order, so it is not confirmed yet.",
  };
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
 * A constraint's status in plain words (`plain`), with the engine's own reason kept apart (`raw`) for a
 * disclosure. `raw` is null when the engine gave no reason to show (the constraint applied).
 */
export type ConstraintNote = { plain: string; raw: string | null };

/**
 * Whether/why a requested constraint was applied to this batch
 * (`constraint`). `null` when the field is absent, or present but inert (the
 * overwhelmingly common "no constraint requested" case) - rendering nothing
 * for that case even though the field itself is present, since there is
 * nothing to disclose.
 */
export function constraintNote(constraint: ConstraintReport | null | undefined): ConstraintNote | null {
  if (!constraint) return null;
  if (constraint.reason === "no constraint requested") return null;
  if (constraint.applied) {
    return { plain: `Every proposed recipe keeps ${constraint.column} at or above ${constraint.floor}, using the ${constraint.n_rows_with_value} runs that report it.`, raw: null };
  }
  const column = constraint.column ?? "the requested column";
  // The engine's reason names the count; the sentence says it in plain words and keeps the reason verbatim.
  const few = constraint.reason != null && /numeric value/.test(constraint.reason);
  const n = constraint.n_rows_with_value;
  const plain = few
    ? `The limit on ${column} was not applied: only ${n} ${n === 1 ? "run reports" : "runs report"} a number for it.`
    : `The limit on ${column} was not applied to this round.`;
  return { plain, raw: constraint.reason };
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
  /** The round the run was started in; optional until the engine sends it. */
  round?: number;
};

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
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
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
    headers: mutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ recipes }),
  });
  if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
  recordAudit([{ action: "campaign.start", detail: `Started ${recipes.length} run${recipes.length === 1 ? "" : "s"}: ${recipes.map((x) => x.mode).join(", ")}.` }]);
}

export async function logResult(id: string, value: number): Promise<void> {
  const r = await fetch(`${API}/api/campaign/result`, {
    method: "POST",
    headers: mutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ id, value }),
  });
  if (!r.ok) {
    // The documented 400 body is { error }; fall back to a status-based
    // message for anything else (network hiccup, unexpected 5xx shape).
    let message = `Kalos answered with an error (${r.status})`;
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
  recordAudit([{ action: "campaign.result", detail: `Recorded result ${value} for run ${id}.` }]);
}

export async function reanalyze(): Promise<{ analysis: PopulatedResult; campaign: Campaign }> {
  const r = await fetch(`${API}/api/campaign/reanalyze`, { method: "POST", headers: mutationHeaders() });
  if (!r.ok) {
    // Keep the engine's reason (its code, or its sentence when it sent no code) so the page can say why, e.g. the fit-row cap.
    const body = await readJsonBody(r);
    const code = typeof body?.code === "string" ? body.code : r.status === 400 ? "" : codeForStatus(r.status);
    const detail = typeof body?.error === "string" ? body.error : undefined;
    throw new EngineError(r.status, code, undefined, detail);
  }
  recordAudit([{ action: "campaign.reanalyze", detail: "Updated the model with the recorded results." }]);
  return r.json();
}

// --- Multi-campaign reads (kalos-engine docs/CAMPAIGNS_API.md) -------------
// Read-only: the Data index joins every campaign's analysis to the run sheets
// this browser holds (lib/data-index.ts). Writes still go through the legacy
// single-campaign routes above.

/** One campaign's info record, as `GET /api/campaigns` lists it (`kalos/portal/campaigns_api.py`). */
export type CampaignInfo = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  archived: boolean;
  is_default: boolean;
  /** Absent on older engines. */
  created_by?: string;
  archived_at?: number | null;
  seeded?: boolean;
};

/** The tenant's campaigns, newest first (the engine wraps the list as `{ campaigns }`). */
export const listCampaigns = (): Promise<CampaignInfo[]> =>
  fetch(`${API}/api/campaigns`).then(async (r) => {
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    const body = (await r.json()) as { campaigns?: CampaignInfo[] } | CampaignInfo[];
    return Array.isArray(body) ? body : (body.campaigns ?? []);
  });

/** `GET /api/campaigns/{id}`: the info record plus the loop summary in the `GET /api/campaign` shape. */
export const getCampaignById = (id: string): Promise<{ campaign: CampaignInfo; summary: Campaign }> =>
  fetch(`${API}/api/campaigns/${encodeURIComponent(id)}`).then((r) => {
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    return r.json();
  });

/** `GET /api/campaigns/{id}/analysis`: that campaign's own analysis in the `GET /api/latest` shape. */
export const getCampaignAnalysis = (id: string): Promise<LatestResult> =>
  fetch(`${API}/api/campaigns/${encodeURIComponent(id)}/analysis`).then((r) => {
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    return r.json();
  });

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
    if (!r.ok) throw new Error(`Kalos answered with an error (${r.status})`);
    return r.json();
  });

// --- The assistant (GET/POST /api/assist/*) ---------------------------------
// The guide (next step) and the question panel. The shapes live in
// lib/assist.ts. A 404 means an older engine without the routes ("absent")
// or, with code assist_disabled, an engine whose assistant is turned off;
// callers fall back to lib/agent.ts for the guide and show how to turn the
// assistant on for the panel.

async function assistFailure(r: Response): Promise<never> {
  const d = await readJsonBody(r);
  const code = typeof d?.code === "string" ? d.code : typeof d?.error === "string" ? d.error : null;
  const reason = assistUnavailableReason(r.status, code);
  if (reason) throw new AssistUnavailableError(reason);
  throw new EngineError(r.status, code ?? codeForStatus(r.status));
}

/** GET /api/assist/next: the one next step for the tenant's campaign. */
export const getAssistNext = async (): Promise<AssistNext> => {
  const r = await fetch(`${API}/api/assist/next`);
  if (!r.ok) return assistFailure(r);
  const v: unknown = await r.json();
  if (!isAssistNext(v)) throw new EngineError(r.status, "engine_error");
  return v;
};

/** POST /api/assist/ask: a question answered only from your own data and the guide. */
export const askAssist = async (question: string): Promise<AssistAnswer> => {
  const r = await fetch(`${API}/api/assist/ask`, {
    method: "POST",
    headers: mutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ question }),
  });
  if (!r.ok) return assistFailure(r);
  const v: unknown = await r.json();
  if (!isAssistAnswer(v)) throw new EngineError(r.status, "engine_error");
  return v;
};

/** GET /api/assist/index/status: which model answers, where it runs, and what is indexed. */
export const getAssistIndexStatus = async (): Promise<AssistIndexStatus> => {
  const r = await fetch(`${API}/api/assist/index/status`);
  if (!r.ok) return assistFailure(r);
  const v: unknown = await r.json();
  if (!isAssistIndexStatus(v)) throw new EngineError(r.status, "engine_error");
  return v;
};

/** POST /api/assist/index/rebuild: index your sheets, rounds and results again. Answers with the new status. */
export const rebuildAssistIndex = async (): Promise<AssistIndexStatus> => {
  const r = await fetch(`${API}/api/assist/index/rebuild`, { method: "POST", headers: mutationHeaders() });
  if (!r.ok) return assistFailure(r);
  const v: unknown = await r.json();
  if (!isAssistIndexStatus(v)) throw new EngineError(r.status, "engine_error");
  return v;
};

// --- Procedure drafts (/api/assist/sop/*) ----------------------------------
// Written by the engine from campaign records; the model only rewords. A
// revision the model got wrong (a changed number, a filled placeholder, a
// touched header) comes back as RevisionRefusedError with the plain reasons.

export class RevisionRefusedError extends Error {
  constructor(public readonly reasons: string[]) {
    super("revision refused");
    this.name = "RevisionRefusedError";
  }
}

async function readDraft(r: Response): Promise<SopDraft> {
  if (!r.ok) return assistFailure(r);
  const v = (await r.json()) as SopDraft;
  if (!v || typeof v.draft_id !== "string" || typeof v.markdown !== "string" || !Array.isArray(v.placeholders) || !Array.isArray(v.fields_from_record)) throw new EngineError(r.status, "engine_error");
  return v;
}

/** POST /api/assist/sop/draft: a new draft (version 1) from a run, a proposal or a round. No model is used. */
export const draftSop = async (body: { campaign_id?: string; source: SopSource; template: SopTemplate; title?: string }): Promise<SopDraft> => {
  const r = await fetch(`${API}/api/assist/sop/draft`, { method: "POST", headers: mutationHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
  return readDraft(r);
};

/** POST /api/assist/sop/{id}/revise: the model rewords the prose; a changed record is refused. */
export const reviseSop = async (draftId: string, instruction: string): Promise<SopDraft> => {
  const r = await fetch(`${API}/api/assist/sop/${encodeURIComponent(draftId)}/revise`, {
    method: "POST",
    headers: mutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ instruction }),
  });
  if (r.status === 422) {
    const d = await readJsonBody(r);
    const reasons = Array.isArray(d?.reasons) ? (d!.reasons as unknown[]).filter((x): x is string => typeof x === "string") : [];
    throw new RevisionRefusedError(reasons);
  }
  return readDraft(r);
};

/** POST /api/assist/sop/{id}/fill: the lab's own values for the placeholders, saved as a new version. */
export const fillSop = async (draftId: string, values: Record<string, string>): Promise<SopDraft> => {
  const r = await fetch(`${API}/api/assist/sop/${encodeURIComponent(draftId)}/fill`, {
    method: "POST",
    headers: mutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ values }),
  });
  return readDraft(r);
};

/** GET /api/assist/sop: every draft, newest first. */
export const listSops = async (): Promise<SopSummary[]> => {
  const r = await fetch(`${API}/api/assist/sop`);
  if (!r.ok) return assistFailure(r);
  const body = (await r.json()) as { drafts?: SopSummary[] };
  return Array.isArray(body?.drafts) ? body.drafts : [];
};

/** GET /api/assist/sop/{id}?version=N: one version, the latest when omitted. */
export const getSop = async (draftId: string, version?: number): Promise<SopDraft> => {
  const q = version != null ? `?version=${encodeURIComponent(String(version))}` : "";
  return readDraft(await fetch(`${API}/api/assist/sop/${encodeURIComponent(draftId)}${q}`));
};

/** The download link for a draft (a plain GET the browser follows). */
export const sopExportHref = (draftId: string, format: "md" | "docx", version?: number): string =>
  `${API}/api/assist/sop/${encodeURIComponent(draftId)}/export?format=${format}${version != null ? `&version=${encodeURIComponent(String(version))}` : ""}`;

export { API };
