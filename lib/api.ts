// Client for the Kalos engine API (the FastAPI service in the kalos repo).
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8050";

/**
 * An engine response that ANSWERED and refused, as opposed to an engine that
 * could not be reached at all. `status` is carried because callers act on it:
 * `POST /api/campaign/reanalyze` returns 409 when the campaign was written
 * underneath an in-flight analysis and the caller is expected to retry (see
 * kalos/portal/campaign_routes.py), which is impossible to distinguish from a
 * permanent 400 by message alone. `message` is the engine's own `{ error }`
 * string when it sent one - those strings are authored by `CampaignError`
 * specifically so a client can show them verbatim - and a status-based
 * fallback otherwise.
 */
export class EngineError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EngineError";
    this.status = status;
  }
}

/** Builds the `EngineError` for a non-ok response, preferring the engine's
 *  documented `{ error }` reason over a generic status message. */
async function engineError(r: Response): Promise<EngineError> {
  let message = `engine responded ${r.status}`;
  try {
    const body: unknown = await r.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      message = (body as { error: string }).error;
    }
  } catch {
    // Body wasn't JSON (or was empty) - keep the status-based message.
  }
  return new EngineError(message, r.status);
}

export type Proposal = {
  vals: number[];
  pred: number;
  std: number;
  mode: "explore" | "exploit";
  reason: string;
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
 * `significant` is true iff `ci95` excludes zero at the 95% level - the
 * engine computes this, the UI must never re-derive or override it.
 */
export type Driver = {
  name: string;
  rho: number;
  ci95: [number, number];
  significant: boolean;
};

/**
 * One input's relative importance from the fitted GP's own ARD (automatic
 * relevance determination) lengthscales - a MODEL-derived estimate, distinct
 * from `Driver.rho` (a raw-data Spearman correlation computed without ever
 * fitting the surrogate). `importance` is unitless and only meaningful
 * relative to the other entries in the same `effects` list, not as an
 * absolute score.
 */
export type GpMainEffect = { name: string; importance: number };

/**
 * `available: false` covers the real cases the engine has for not exposing
 * this (too few points to fit a stable GP, a kernel without per-dimension
 * lengthscales, etc.) - `reason` is engine-authored and must be shown
 * verbatim rather than replaced with a generic "no data" message.
 */
export type GpMainEffects = { available: true; effects: GpMainEffect[] } | { available: false; reason: string };

export type Reliability = {
  spearman: number | null;
  ci95: [number, number] | null;
  spearman_floor: number;
  clears_floor: boolean;
  ci_excludes_zero: boolean;
  /** Quantities the current engine does not model, surfaced so the UI can say so. */
  unmodeled: string[];
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

export type AnalyzeResult = {
  n: number;
  d: number;
  target: string;
  group_col: string | null;
  targets: string[];
  features: string[];
  cv_spearman: number | null;
  cv_ci95?: [number, number] | null;
  cv_n_groups?: number;
  /** Distribution-free +/- band (abs) from pooled out-of-fold residuals. */
  conformal_q?: number | null;
  reliability?: Reliability;
  best: number;
  drivers: Driver[];
  proposal_features: string[];
  proposals: Proposal[];
  oof: [number, number][];
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
   * GP ARD-based relative feature importance - a MODEL estimate (reads the
   * fitted surrogate's per-dimension lengthscales), complementary to
   * `drivers` (a raw-data statistic, no model fit involved). Absent on
   * analyses run before the engine started returning it; callers must
   * render nothing (or the honest `available:false` reason) rather than
   * fabricate a chart.
   */
  gp_main_effects?: GpMainEffects;
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
    if (!r.ok && typeof d.error !== "string") throw new EngineError(`engine responded ${r.status}`, r.status);
    return d;
  });
}

// The most recent real (uploaded) analysis — what the Overview reflects.
export type LatestResult =
  | { has_data: false }
  | (AnalyzeResult & { has_data: true; dataset: string; updated: number });

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
export function isReliable(d: Pick<AnalyzeResult, "reliability" | "cv_ci95" | "cv_spearman">): boolean {
  const rel = d.reliability;
  if (rel) return rel.clears_floor && rel.ci_excludes_zero;
  const ci = d.cv_ci95 ?? null;
  return d.cv_spearman != null && ci != null && ci[0] > 0;
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
  /**
   * Unix-epoch seconds. The engine's pending-run record has always carried
   * these (kalos/portal/campaign.py's `run` dict), but no client type
   * declared them until the Map tab's replay footer needed real elapsed
   * time instead of round-index spacing - see lib/workspace/graph/replay.ts.
   * Optional because a demo/mock CampaignRun (or an older cached response)
   * may not have them; callers must treat their absence as "not
   * instrumented," never default to Date.now() or a fabricated date.
   */
  created_at?: number;
  measured_at?: number | null;
  /**
   * Real, engine-reported lineage the GP conditioned on when it proposed
   * this recipe - NOT declared anywhere in kalos today (see
   * ENGINE_RECON.md section 3: run ids are discarded on fold, so no run,
   * folded or pending, can currently be tied back to a specific parent).
   * These fields are typed here so the Map tab's Lineage lens can read them
   * the moment the engine adds them, through the same adapter seam, without
   * a second migration - until then they are always absent, and the UI must
   * render that absence honestly (see lib/workspace/graph/build-lineage.ts).
   * `parent_row_count` is the TRUE total number of rows this run descended
   * from; `parent_ids` is only the subset of those rows that can be named
   * (folded rows with a traceable id) - `parent_row_count` is almost always
   * larger than `parent_ids.length`. Never infer one from the other.
   */
  parent_ids?: string[];
  parent_row_count?: number | null;
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
       * The folded (already-measured, already-in-the-base-data) side of
       * lineage - as opposed to `pending`, which is the not-yet-folded
       * side. Not served by the engine today (`commit_fold` discards a
       * run's id when it folds it into `base_rows` - see
       * kalos/portal/campaign.py and ENGINE_RECON.md section 3), so this is
       * always absent. Typed here, optional, for the same forward-
       * compatibility reason as CampaignRun's `parent_ids` above - see
       * lib/workspace/graph/lineage-adapter.ts for the one place that reads
       * it and degrades honestly when it is missing.
       */
      lineage?: { folded_rows: { run_id: string; created_at: number; measured_at: number | null }[] };
    };

export const getCampaign = (): Promise<Campaign> =>
  fetch(`${API}/api/campaign`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

/** A recipe about to be started, in the shape POST /api/campaign/start expects.
 *  `pred`/`std`/`reason` are nullable because the engine stores whatever it is
 *  given (`campaign.py`'s `start` reads them with `.get()`) and a proposal
 *  whose prediction was never recorded must be booked as it really is, not
 *  with a fabricated 0. */
export type StartRecipe = {
  recipe: Record<string, number>;
  pred: number | null;
  std: number | null;
  mode: string;
  reason: string | null;
};

export async function startRuns(recipes: StartRecipe[]): Promise<void> {
  const r = await fetch(`${API}/api/campaign/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipes }),
  });
  if (!r.ok) throw await engineError(r);
}

export async function logResult(id: string, value: number): Promise<void> {
  const r = await fetch(`${API}/api/campaign/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, value }),
  });
  if (!r.ok) throw await engineError(r);
}

/**
 * Closes the loop: folds every measured pending run into the base data and
 * re-runs the analysis. Throws an `EngineError` with `status: 409` when the
 * campaign was written underneath the in-flight analysis - the engine
 * committed NOTHING in that case and the caller is expected to retry (see
 * lib/workspace/adapter.ts's `closeWorkspaceLoop`, the one place that does).
 */
export async function reanalyze(): Promise<{ analysis: PopulatedResult; campaign: Campaign }> {
  const r = await fetch(`${API}/api/campaign/reanalyze`, { method: "POST" });
  if (!r.ok) throw await engineError(r);
  return r.json();
}

/** One calendar day's run count for the campaign activity strip. `runs` counts
 *  runs MEASURED that day (a result logged via `POST /api/campaign/result`),
 *  not wells - the engine has no well/plate-capacity concept (see
 *  lib/workspace/log-types.ts). */
export type CampaignActivityDay = { date: string; runs: number };

export type CampaignActivity =
  | { has_campaign: false }
  | {
      has_campaign: true;
      id: string;
      days: CampaignActivityDay[];
      stats: { days_running: number; days_with_runs: number; longest_pause_days: number };
      /**
       * Engine-authored coverage caveat (e.g. the rows from the original
       * upload have no per-row timestamp, so they cannot appear in `days`),
       * or null when the engine has nothing to caveat. Render verbatim.
       */
      note: string | null;
    };

export const getCampaignActivity = (): Promise<CampaignActivity> =>
  fetch(`${API}/api/campaign/activity`).then((r) => {
    if (!r.ok) throw new Error(`engine responded ${r.status}`);
    return r.json();
  });

export { API };
