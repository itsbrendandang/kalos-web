"use client";

import { useAsync, type AsyncState } from "@/hooks/use-async";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { getAssistNext, getAssistStatus, getDefaultCampaignId, type AssistNext, type AssistStatus } from "@/lib/assist";

/**
 * A key that changes whenever the campaign or the published analysis does, so
 * engine-derived reads (the next step, the track record) refresh after every
 * write the shared resources already re-fetch. Null until both have answered.
 */
export function useCampaignKey(): string | null {
  const latest = useLatest();
  const campaign = useCampaign();
  if (!latest.data || !campaign.data) return null;
  const c = campaign.data;
  const l = latest.data;
  return [
    l.has_data ? `${l.dataset}:${l.updated}:${l.campaign_generation ?? ""}` : "none",
    c.has_campaign ? `${c.round}:${c.n_base}:${c.n_awaiting}:${c.n_measured}:${c.pending.length}` : "no-campaign",
  ].join("|");
}

/** The tenant's default campaign id; data is null on engines without /api/campaigns. */
export function useDefaultCampaignId(): AsyncState<string | null> {
  const latest = useLatest();
  const key = latest.data ? (latest.data.has_data ? `${latest.data.dataset}:${latest.data.updated}` : "none") : null;
  return useAsync(getDefaultCampaignId, key);
}

/** The engine's next step; data is null on engines without the assistant. */
export function useAssistNext(): AsyncState<AssistNext | null> {
  return useAsync(getAssistNext, useCampaignKey());
}

/** Which model, if any, backs Ask; read once. */
export function useAssistStatus(): AsyncState<AssistStatus | null> {
  return useAsync(getAssistStatus, "once");
}
