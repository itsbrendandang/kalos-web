/*
 * Pure state for the campaign views: what each fetch may claim, and the split
 * of pending runs into in-flight and measured (kalos/docs/CAMPAIGN_LOOP.md).
 * No React and no framework imports, so every rule here is unit tested
 * directly in __tests__/workbench.test.ts.
 */

import type { Campaign, CampaignRun, LatestResult } from "@/lib/api";

export type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

// --- What each fetch is allowed to claim ------------------------------------

/**
 * What the campaign side of the workbench may show. `err` wins over
 * everything else: a rejected fetch is always "error", even when an earlier
 * success left data behind, so a dropped connection is never rendered as a
 * fact about the lab ("no campaign", zero runs in flight). Demo data is only
 * ever shown when the engine confirmed there is no campaign AND demo mode is
 * on - never as a stand-in for a failed request.
 */
export type CampaignView =
  | { state: "loading" }
  | { state: "error" }
  | { state: "none" }
  | { state: "data"; campaign: ActiveCampaign; demo: boolean };

export function campaignView(
  campaign: Campaign | null,
  err: boolean,
  demoMode: boolean,
  demoCampaign: ActiveCampaign,
): CampaignView {
  if (err) return { state: "error" };
  if (campaign == null) return { state: "loading" };
  if (campaign.has_campaign) return { state: "data", campaign, demo: false };
  return demoMode ? { state: "data", campaign: demoCampaign, demo: true } : { state: "none" };
}

/** Same rule for the "next batch" proposals from /api/latest. */
export type QueueState = "loading" | "error" | "data";

export function queueState(data: LatestResult | null, err: boolean): QueueState {
  if (err) return "error";
  if (data == null) return "loading";
  return "data";
}

// --- Pending runs --------------------------------------------------------------

/** Started runs still waiting for a measured outcome. */
export const inFlight = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => r.awaiting);

/** Runs with a logged outcome, waiting to be folded in by the next re-analyze. */
export const measured = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => !r.awaiting);

/** Run ids are opaque engine ids (UUID-like); run lists show a short, stable
 *  prefix the way git shows short commit hashes. */
export const shortId = (id: string): string => id.slice(0, 7);
