/*
 * Client for the engine's assistant and campaign-history routes (engine
 * docs/ASSISTANT.md, docs/CAMPAIGNS_API.md). All read-only. Every call goes
 * through the same-origin proxy, which allows exactly these paths.
 *
 * Older engines do not have these routes: a 404 resolves to `null` so callers
 * fall back to what the web derives itself, instead of showing an error.
 */

import { engineError } from "@/lib/engine-error";

const API = process.env.NEXT_PUBLIC_API_URL || "/api/engine";

async function getJson<T>(path: string): Promise<T | null> {
  const r = await fetch(`${API}${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw await engineError(r);
  return (await r.json()) as T;
}

// --- Next step (no model needed) --------------------------------------------

export type AssistNext = {
  state: string;
  step: string;
  why: string;
  why_it_matters: string;
  /** A web route such as /campaign/record, or null when there is nowhere to go. */
  action_route: string | null;
  blockers: { code: string; text: string; why?: string }[];
  campaign_id: string | null;
};

/** The engine's one next step; null on engines without the assistant. */
export const getAssistNext = (): Promise<AssistNext | null> => getJson<AssistNext>("/api/assist/next");

/** Only routes the web actually has may be linked from an engine-provided step. */
export function safeActionRoute(route: string | null | undefined): string | null {
  return route != null && /^\/campaign\/(setup|plan|run|record|learn)$/.test(route) ? route : null;
}

// --- Assistant status and Ask (Ask needs a configured model) ----------------

export type AssistStatus = {
  /** "none" means Ask is off; search still works. */
  provider: string;
  model: string | null;
  /** False when the provider sends data off this machine (anthropic). */
  local: boolean;
  chunks?: number;
  retriever?: string;
};

export const getAssistStatus = (): Promise<AssistStatus | null> => getJson<AssistStatus>("/api/assist/index/status");

/** Whether the Ask box can be offered at all. */
export const canAsk = (s: AssistStatus | null): boolean => s != null && s.provider !== "none";

export type AskSource = { kind: string; id: string; quote: string; campaign_id?: string | null };

export type AskAnswer = {
  answer: string;
  sources: AskSource[];
  /** Nothing in the campaign's data or the docs answered it; `next` is the step instead. */
  abstained: boolean;
  next?: AssistNext | null;
  provider_path?: string;
  offline_fallback?: boolean;
  model?: string | null;
};

export async function ask(question: string, campaignId?: string | null): Promise<AskAnswer> {
  const r = await fetch(`${API}/api/assist/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(campaignId ? { question, campaign_id: campaignId } : { question }),
  });
  if (!r.ok) throw await engineError(r);
  return (await r.json()) as AskAnswer;
}

// --- Campaigns, search and track record --------------------------------------

type CampaignListItem = { id: string; is_default?: boolean; archived?: boolean };

/** The tenant's default campaign id (what /api/campaign describes), or null. */
export async function getDefaultCampaignId(): Promise<string | null> {
  const list = await getJson<{ campaigns: CampaignListItem[] }>("/api/campaigns");
  return list?.campaigns.find((c) => c.is_default && !c.archived)?.id ?? null;
}

export type SearchHit = { kind: string; id: string; title: string; text: string; score: number };

export type SearchResult = {
  retriever: string;
  fallback_reason?: string | null;
  n_documents: number;
  hits: SearchHit[];
};

export async function searchCampaign(campaignId: string, q: string, k = 8): Promise<SearchResult> {
  const params = new URLSearchParams({ q, k: String(k) });
  const r = await fetch(`${API}/api/campaigns/${encodeURIComponent(campaignId)}/search?${params}`);
  if (!r.ok) throw await engineError(r);
  return (await r.json()) as SearchResult;
}

export type CoverageStat = {
  n: number;
  inside: number;
  outside: number;
  observed: number | null;
  nominal: number;
  wilson_95?: [number, number] | null;
  judged?: boolean;
  reason?: string | null;
};

export type ErrorStat = { n: number; mean: number | null; mean_abs: number | null; rmse: number | null };

export type TrackRound = {
  round: number;
  /** Which uploaded run sheet the round belongs to (1 = the first); rounds restart at 0 after a replacing upload. */
  dataset_epoch?: number;
  /** False for rounds of an earlier run sheet. Absent on engines that do not separate them. */
  current_dataset?: boolean;
  /** When the round's first prediction was recorded (epoch seconds). */
  first_recorded_at?: number;
  n_started: number;
  n_measured: number;
  n_corrected: number;
  coverage: CoverageStat;
  coverage_so_far: CoverageStat;
  error: ErrorStat;
  excluded: Record<string, number>;
};

export type TrackRecord = {
  campaign_id: string;
  has_campaign: boolean;
  coverage: number;
  current_round: number;
  /** Newest first. `round` is the engine's 0-based round. */
  rounds: TrackRound[];
  pooled: { coverage: CoverageStat; error: ErrorStat };
  /** The engine's scoring rules, as plain sentences keyed by rule. */
  rules?: Record<string, string | number>;
};

/** Up to the engine's cap of 100 rounds, newest first. */
export const getTrackRecord = (campaignId: string): Promise<TrackRecord | null> =>
  getJson<TrackRecord>(`/api/campaigns/${encodeURIComponent(campaignId)}/track-record?coverage=0.9&limit=100`);

export type TrackRun = {
  id: number;
  run_id: string;
  /** The engine's 0-based round; people see displayRound(round). */
  round: number;
  status: string;
  prediction: { available: boolean; pred: number | null; unavailable_reason?: string | null; recorded_at?: number | null };
  /** The band recorded when the run was started, at the requested coverage; never the current analysis. */
  band: { lo: number; hi: number; coverage: number } | null;
  measured: { value: number | null; corrected?: boolean } | null;
  scored: boolean;
  inside: boolean | null;
  error: number | null;
};

export type TrackRuns = { items: TrackRun[]; has_more: boolean };

/** Oldest first, up to the engine's page cap of 500; `has_more` means newer runs exist beyond those returned. */
export const getTrackRuns = (campaignId: string): Promise<TrackRuns | null> =>
  getJson<TrackRuns>(`/api/campaigns/${encodeURIComponent(campaignId)}/track-record/runs?coverage=0.9&limit=500`);
