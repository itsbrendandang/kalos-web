/*
 * Client for the engine's prospective track record and assistant reads
 * (kalos-engine kalos/portal/history_api.py, kalos/portal/track_record.py,
 * kalos/assist/routes.py). All GET, `read` scope, proxied by
 * lib/server/engine-routes.ts. Errors are EngineError like lib/api.ts.
 *
 * Older engines do not have these routes. A 404 that is not the engine's
 * campaign-not-found answer (`code: "not_found"`) means the route is missing
 * (FastAPI's bare 404, or the proxy's `no_such_engine_route`), so a page can
 * hide the feature instead of showing an error: see `isRouteMissing`.
 *
 * POST /api/assist/ask (a model-written answer) is deliberately not wired.
 */

import { engineGet, type Campaign, type LatestResult } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import { stageHref, type StageKey } from "@/lib/routes";

const enc = encodeURIComponent;

/** True when the failure says this engine (or proxy) has no such route, not that the campaign is missing. */
export const isRouteMissing = (failure: unknown): boolean =>
  failure instanceof EngineError && failure.status === 404 && failure.code !== "not_found";

// --- Track record (prospective: predictions recorded at start vs results measured after) ---

/** Wilson-interval coverage counts. `judged`/`reason` are set on `coverage_so_far` and `pooled.coverage` only. */
export type CoverageStat = {
  n: number;
  inside: number;
  outside: number;
  /** inside / n, or null when n is 0. */
  observed: number | null;
  /** The coverage the bands were built for (the requested level, e.g. 0.9). */
  nominal: number;
  /** Wilson score 95% interval of the share inside; null when n is 0. */
  wilson_95?: [number, number] | null;
  by_method?: Record<string, { n: number; inside: number }>;
  by_coverage_basis?: Record<string, { n: number; inside: number }>;
  basis?: "prospective";
  /** True only when the engine judged it (enough scored runs). Never infer a verdict without it. */
  judged?: boolean;
  /** Why it is not judged, e.g. "needs 10 scored runs to judge; has 7". */
  reason?: string | null;
  /** Whether `nominal` lies inside `wilson_95` (null when not judged). */
  nominal_inside_interval?: boolean | null;
};

/** Measured minus the prediction recorded at start. */
export type ErrorStat = { n: number; mean: number | null; mean_abs: number | null; rmse: number | null; basis?: string };

export type TrackRound = {
  /** The engine's 0-based round (people see round + 1). Restarts at 0 after a replacing upload. */
  round: number;
  /** Which uploaded run sheet the round belongs to (1 = the first). */
  dataset_epoch?: number;
  /** False for rounds of an earlier run sheet. Absent on engines that do not separate them. */
  current_dataset?: boolean;
  /** When the round's first prediction was recorded (epoch seconds). */
  first_recorded_at?: number;
  n_started: number;
  n_engine_predictions?: number;
  n_measured: number;
  n_corrected: number;
  n_folded?: number;
  coverage: CoverageStat;
  coverage_so_far: CoverageStat;
  error: ErrorStat;
  error_so_far?: ErrorStat;
  /** Runs not scored, counted by the engine's reason code (see `excluded_reasons`). */
  excluded: Record<string, number>;
};

export type TrackRecord = {
  campaign_id: string;
  has_campaign: boolean;
  basis?: "prospective";
  coverage: number;
  band?: "proposal" | "global";
  current_round: number | null;
  /** Newest first. */
  rounds: TrackRound[];
  page?: { limit: number; offset: number; total_rounds: number; has_more: boolean; next_offset: number | null };
  /** Pooled over every scored run, across every run sheet. */
  pooled: { coverage: CoverageStat; error: ErrorStat };
  /** Rounds of the current sheet folded with no recorded prediction (before the engine kept prediction history). */
  rounds_without_record?: { rounds: number[]; count: number; reason: string | null };
  /** The engine's scoring rules: plain sentences, and `judged_from_n` as a number. */
  rules?: Record<string, string | number>;
  /** Reason code -> plain sentence for a run that is not scored. */
  excluded_reasons?: Record<string, string>;
};

/** Up to the engine's cap of 100 rounds, newest first, at the 0.9 level. */
export const getTrackRecord = (campaignId: string): Promise<TrackRecord> =>
  engineGet<TrackRecord>(`/api/campaigns/${enc(campaignId)}/track-record?coverage=0.9&limit=100`);

export type BandCaveat = { code: string | null; message: string; recorded: boolean };

export type RecordedBand = {
  lo: number;
  hi: number;
  coverage: number;
  method?: string | null;
  coverage_basis?: string | null;
  caveat?: BandCaveat;
  recorded_at?: number | null;
};

export type TrackRun = {
  /** Row id (keyset cursor). */
  id: number;
  run_id: string;
  /** The engine's 0-based round. */
  round: number | null;
  recipe?: Record<string, unknown> | null;
  status: "folded" | "measured" | "awaiting" | "discarded" | string;
  prediction: {
    available: boolean;
    unavailable_reason?: string | null;
    basis?: "predicted";
    pred: number | null;
    std?: number | null;
    recorded_at?: number | null;
    model_version?: string | null;
    provenance_sha256?: string | null;
  };
  /** The band recorded when the run was started, at the requested coverage; never the current analysis. */
  band: RecordedBand | null;
  measured: {
    value: number | null;
    basis?: "measured";
    version?: number | null;
    n_versions?: number;
    first_recorded_at?: number | null;
    latest_recorded_at?: number | null;
    corrected?: boolean;
  } | null;
  folded_in_round?: number | null;
  scored: boolean;
  inside: boolean | null;
  /** Measured minus predicted. */
  error: number | null;
  /** Why the run is not scored (a key of `excluded_reasons`), or null when scored. */
  excluded?: string | null;
};

export type TrackRuns = {
  campaign_id?: string;
  coverage?: number;
  items: TrackRun[];
  /** Newer runs exist beyond those returned. */
  has_more: boolean;
  next_after_id?: number | null;
  rules?: Record<string, string | number>;
  excluded_reasons?: Record<string, string>;
};

/** Oldest first, up to the engine's page cap of 500. */
export const getTrackRuns = (campaignId: string): Promise<TrackRuns> =>
  engineGet<TrackRuns>(`/api/campaigns/${enc(campaignId)}/track-record/runs?coverage=0.9&limit=500`);

// --- Campaign search (records only; nothing is generated) ---

export type SearchHit = { kind: string; id: string; title: string; text: string; score: number };

export type SearchResult = {
  campaign_id: string;
  /** "embeddings" with a local embedding model, else "keyword" (`fallback_reason` says why). */
  retriever: "embeddings" | "keyword" | string;
  model?: string | null;
  fallback_reason?: string | null;
  n_documents: number;
  hits: SearchHit[];
};

/** Engine limits: q 1-500 characters, k 1-25. */
export const SEARCH_MAX_QUERY = 500;
export const SEARCH_MAX_K = 25;

export const searchCampaign = (campaignId: string, q: string, k = 10): Promise<SearchResult> => {
  const params = new URLSearchParams({ q: q.slice(0, SEARCH_MAX_QUERY), k: String(Math.max(1, Math.min(SEARCH_MAX_K, Math.round(k)))) });
  return engineGet<SearchResult>(`/api/campaigns/${enc(campaignId)}/search?${params}`);
};

// --- The guide's next step (no model needed) and the assistant status ---

export type AssistNext = {
  /** The guide state, e.g. runs_awaiting, recipes_proposed, round_complete. */
  state: string;
  step: string;
  why: string;
  why_it_matters: string;
  /** A legacy engine route such as /campaign/record; map it with `assistActionHref`. */
  action_route: string | null;
  blockers: { code: string; text: string; why?: string }[];
  campaign_id: string | null;
};

/** The guide's one next step for a campaign (the tenant's default campaign when omitted). */
export const getAssistNext = (campaignId?: string | null): Promise<AssistNext> =>
  engineGet<AssistNext>(`/api/assist/next${campaignId ? `?${new URLSearchParams({ campaign_id: campaignId })}` : ""}`);

/** The engine's legacy `/campaign/<stage>` route as this app's page for that stage, or null for anything else. */
export function assistActionHref(campaignId: string, route: string | null | undefined): string | null {
  const m = route ? /^\/campaign\/(setup|plan|run|record|learn)$/.exec(route) : null;
  return m ? stageHref(campaignId, m[1] as StageKey) : null;
}

export type AssistStatus = {
  /** "none" means no model is configured (search and the guide still work). */
  provider: "none" | "ollama" | "anthropic" | string;
  model: string | null;
  /** False when the provider sends data off this machine. */
  local: boolean;
  chunks?: number;
  built_at?: number | null;
  building?: boolean;
  retriever?: string;
  fast_model?: string;
  quality_model?: string;
  escalation?: boolean;
};

/** Provider, model, where it runs and the index size. The engine builds the index on the first call. */
export const getAssistStatus = (): Promise<AssistStatus> => engineGet<AssistStatus>("/api/assist/index/status");

// --- When to refetch ---

/**
 * Changes whenever the track record or the guide's next step could change:
 * a run started or discarded, a result recorded or corrected, a round folded,
 * an analysis replaced. Null until both the summary and the analysis are known.
 */
export function campaignDataKey(summary: Campaign | null | undefined, latest: LatestResult | null | undefined): string | null {
  if (!summary || !latest) return null;
  const runs = summary.has_campaign ? summary.pending.map((r) => [r.id, r.awaiting, r.result, r.result_version ?? null]) : [];
  return JSON.stringify([summary.has_campaign ? summary.round : null, runs, latest.has_data ? (latest.updated ?? null) : "none"]);
}
