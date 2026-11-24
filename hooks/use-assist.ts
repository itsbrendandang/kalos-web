"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEngineResource, useOptionalCampaignData, type EngineResource } from "@/hooks/use-engine";
import {
  campaignDataKey,
  getAssistNext,
  getAssistStatus,
  getTrackRecord,
  getTrackRuns,
  isRouteMissing,
  type AssistNext,
  type AssistStatus,
  type TrackRecord,
  type TrackRuns,
} from "@/lib/assist";

/**
 * An engine read (see EngineResource for its honest states) plus `unsupported`:
 * the engine or proxy has no such route (an older engine), so the caller should
 * hide the feature or say so plainly instead of showing an error.
 */
export type AssistResource<T> = EngineResource<T> & { unsupported: boolean };

/**
 * Refetches when the campaign in the URL changes (a run started, a result
 * recorded or corrected, a re-analysis landed), keyed on the EngineDataProvider
 * summary and analysis. Outside that campaign's provider there is no key and
 * the read happens once (call `refresh` yourself).
 */
function useCampaignKeyed<T>(campaignId: string | null | undefined, fetcher: () => Promise<T>): AssistResource<T> {
  const resource = useEngineResource(fetcher);
  const ctx = useOptionalCampaignData();
  const key = ctx && campaignId && ctx.campaignId === campaignId ? campaignDataKey(ctx.campaign.data, ctx.latest.data) : null;
  const lastKey = useRef<string | null>(key);
  const { refresh } = resource;
  useEffect(() => {
    if (key == null || key === lastKey.current) return;
    const first = lastKey.current == null;
    lastKey.current = key;
    if (!first) void refresh();
  }, [key, refresh]);
  return { ...resource, unsupported: resource.data == null && isRouteMissing(resource.failure) };
}

/** GET /api/campaigns/{id}/track-record?coverage=0.9&limit=100 (rounds newest first). */
export function useTrackRecord(campaignId: string): AssistResource<TrackRecord> {
  const fetcher = useCallback(() => getTrackRecord(campaignId), [campaignId]);
  return useCampaignKeyed(campaignId, fetcher);
}

/** GET /api/campaigns/{id}/track-record/runs?coverage=0.9&limit=500 (runs oldest first). */
export function useTrackRuns(campaignId: string): AssistResource<TrackRuns> {
  const fetcher = useCallback(() => getTrackRuns(campaignId), [campaignId]);
  return useCampaignKeyed(campaignId, fetcher);
}

/** GET /api/assist/next[?campaign_id=]: the guide's one next step (the tenant default campaign without an id). */
export function useAssistNext(campaignId?: string | null): AssistResource<AssistNext> {
  const fetcher = useCallback(() => getAssistNext(campaignId), [campaignId]);
  return useCampaignKeyed(campaignId, fetcher);
}

/** GET /api/assist/index/status: provider, model, where it runs, index size. Read once. */
export function useAssistStatus(): AssistResource<AssistStatus> {
  const resource = useEngineResource(getAssistStatus);
  return { ...resource, unsupported: resource.data == null && isRouteMissing(resource.failure) };
}
