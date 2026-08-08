// Client for the Kalos engine API (the FastAPI service in the kalos repo).
import type { ValidationReport } from "@/lib/validation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8050";

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
    };

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
