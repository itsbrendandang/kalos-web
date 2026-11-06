"use client";

import { useCampaign, useLatest } from "@/hooks/use-engine";
import { campaignStage, type CampaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";

export type EngineStatus = "connected" | "connecting" | "offline";

/** Where the campaign is in its loop, plus the engine's connection state. One place so the sidebar, the stage bar and Experiments agree. */
export function useCampaignStage(): { stage: CampaignStage | null; status: EngineStatus; demo: boolean; retry: () => void } {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const failed = view.state === "error" || latest.status === "error";
  const ready = !failed && view.state !== "loading" && latest.data != null;
  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const stage = ready ? campaignStage(demo ? { has_data: true } : latest.data!, active ?? { has_campaign: false }) : null;
  const status: EngineStatus = failed ? "offline" : ready ? "connected" : "connecting";
  return { stage, status, demo, retry: () => { void latest.refresh(); void campaign.refresh(); } };
}
