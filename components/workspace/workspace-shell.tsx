"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CampaignRail } from "./campaign-rail";
import { WorkspaceHeader, type WorkspaceTab } from "./workspace-header";
import { AskPanel } from "./ask-panel";
import { NewCampaignDialog } from "./new-campaign-dialog";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Loading } from "@/components/page-header";
import { usePersistedBoolean } from "@/lib/workspace/use-persisted-boolean";
import {
  getWorkspaceCampaign,
  getWorkspaceEvidence,
  listWorkspaceCampaigns,
  type WorkspaceCampaignResult,
  type WorkspaceCampaignsResult,
} from "@/lib/workspace/adapter";
import { WorkspaceCampaignProvider } from "@/lib/workspace/campaign-context";
import type { CampaignSummary } from "@/lib/workspace/types";

function tabFromPathname(pathname: string, campaignId: string): WorkspaceTab {
  const base = `/c/${campaignId}`;
  if (pathname === `${base}/map`) return "map";
  if (pathname === `${base}/brief`) return "brief";
  return "log";
}

/** Owns everything the campaign workspace shares across the Log/Map/Brief
 *  tabs: the rail's open state, the Ask panel's open state, the current
 *  campaign fetch, and the rail's campaign list fetch. Lives in
 *  app/c/[campaignId]/layout.tsx (a layout, not a page), so it does not
 *  remount when a tab link is clicked - see the route-structure note in
 *  app/c/[campaignId]/layout.tsx for why that matters (state like the
 *  eventual Map camera position belongs here, not in a per-tab page). */
export function WorkspaceShell({ campaignId, children }: { campaignId: string; children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const activeTab = tabFromPathname(pathname, campaignId);

  const [railOpen, setRailOpen] = usePersistedBoolean("kalos-workspace-rail-open", true);
  const [askOpen, setAskOpen] = usePersistedBoolean("kalos-workspace-ask-open", true);

  const [newCampaignOpen, setNewCampaignOpen] = useState(false);

  const [campaigns, setCampaigns] = useState<WorkspaceCampaignsResult | { status: "loading" }>({ status: "loading" });
  const [current, setCurrent] = useState<WorkspaceCampaignResult | { status: "loading" }>({ status: "loading" });

  const refresh = useCallback(() => {
    setCurrent({ status: "loading" });
    getWorkspaceCampaign(campaignId).then(setCurrent);
  }, [campaignId]);

  const [dataVersion, setDataVersion] = useState(0);

  const reload = useCallback(async () => {
    setCurrent(await getWorkspaceCampaign(campaignId));
    setDataVersion((v) => v + 1);
  }, [campaignId]);

  /** Re-read the rail's campaign list. A successful upload adds a campaign,
   *  so the list has to be re-read for it to appear at all. */
  const reloadCampaigns = useCallback(async () => {
    setCampaigns(await listWorkspaceCampaigns());
  }, []);

  useEffect(() => {
    let cancelled = false;
    listWorkspaceCampaigns().then((r) => {
      if (!cancelled) setCampaigns(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // No synchronous setState reset here: the initial `current` state is
    // already { status: "loading" }, and a later campaignId change (rail
    // navigation) is allowed to keep showing the previous campaign until
    // the new one resolves, same as ExperimentDetail's refetch-on-id-change
    // effect (components/experiments/experiment-detail.tsx).
    let cancelled = false;
    getWorkspaceCampaign(campaignId).then((r) => {
      if (!cancelled) setCurrent(r);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (current.status === "loading") {
    return (
      <div className="flex h-svh items-center justify-center bg-canvas">
        <Loading label="Loading campaign" />
      </div>
    );
  }

  if (current.status === "unavailable") {
    return (
      <div className="flex h-svh items-center justify-center bg-canvas p-8">
        <ServiceUnavailable
          onRetry={refresh}
          busy={false}
          title="Campaign workspace unavailable"
          body="The dashboard could not reach the kalos engine. Try again in a moment."
        />
      </div>
    );
  }

  if (current.status === "not-found") {
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-1.5 bg-canvas p-8 text-center">
        <div className="text-[15px] font-semibold text-fg">Campaign not found</div>
        <p className="max-w-[48ch] text-[13px] text-muted">
          No campaign matches &ldquo;{campaignId}&rdquo;. It may have been renamed, or never existed.
        </p>
      </div>
    );
  }

  const campaign = current.campaign;
  const campaignSummaries: CampaignSummary[] = campaigns.status === "ok" ? campaigns.campaigns : [];
  const evidence = getWorkspaceEvidence(current.demo);
  // The campaign-wide run total comes from the engine's own counters
  // (Campaign.runsLogged), NOT from summing `rounds[].runs`: the engine only
  // breaks runs down for the open round, so that sum reports the handful
  // sitting unfolded right now and reads as a whole-campaign total it is not.
  // When the total is genuinely unavailable the line says so instead of
  // printing a number.
  const rounds = campaign.rounds.length;
  const roundsPart = `${rounds} round${rounds === 1 ? "" : "s"}`;
  const summaryLine =
    campaign.runsLogged != null
      ? `${campaign.runsLogged} run${campaign.runsLogged === 1 ? "" : "s"} logged · ${roundsPart}`
      : `${roundsPart} · run total not instrumented`;

  return (
    <WorkspaceCampaignProvider value={{ campaignId, result: current, refresh, reload, reloadCampaigns, dataVersion }}>
      <div className="flex h-svh w-full overflow-hidden bg-canvas">
        <CampaignRail
          open={railOpen}
          onToggle={() => setRailOpen(!railOpen)}
          campaigns={campaignSummaries}
          activeCampaignId={campaignId}
          evidence={evidence}
          onNewCampaign={() => setNewCampaignOpen(true)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkspaceHeader
            campaignId={campaignId}
            campaignName={campaign.name}
            objective={campaign.objective}
            activeTab={activeTab}
            roundNumber={campaign.currentRound}
            askOpen={askOpen}
            onToggleAsk={() => setAskOpen(!askOpen)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
        {askOpen && <AskPanel onClose={() => setAskOpen(false)} summaryLine={summaryLine} />}
      </div>
      {newCampaignOpen && (
        <NewCampaignDialog
          onClose={() => setNewCampaignOpen(false)}
          onUploaded={async () => {
            // A fresh upload becomes the engine's most-recent campaign, which
            // is the one this workspace already resolves to, so re-reading
            // both the rail and the current campaign is enough - no route
            // change to guess at.
            await Promise.all([reloadCampaigns(), reload()]);
          }}
        />
      )}
    </WorkspaceCampaignProvider>
  );
}
