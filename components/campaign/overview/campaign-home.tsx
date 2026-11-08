"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ExampleBadge } from "@/components/ui/badge";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useCampaign, useLastRejection, useLatest } from "@/hooks/use-engine";
import { buildCampaignOverview, OVERVIEW_STAGES, resolveAttention, type OverviewStage } from "@/lib/campaign-overview";
import { DEMO_MODE } from "@/lib/demo";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { targetName } from "@/components/campaign/target";
import { campaignView } from "@/lib/workbench";
import type { ActiveCampaign } from "@/lib/workbench";
import { StagePanel } from "@/components/campaign/overview/stage-panel";
import { StageTabs, useStageOrientation } from "@/components/campaign/overview/stage-tabs";
import { SummaryStrip } from "@/components/campaign/overview/summary-strip";
import { useOverviewStage } from "@/components/campaign/overview/use-overview-stage";

export function OverviewSkeleton() {
  return (
    <div className="campaign-overview flex flex-col gap-6" role="status" aria-label="Loading the campaign">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <LoadingSkeleton variant="card" rows={3} />
      <LoadingSkeleton rows={5} label="Loading campaign stages" />
    </div>
  );
}

/**
 * Campaign home. Skeleton, a true request error, and engine-confirmed empty
 * or demo data stay distinct. A refresh that fails after data loaded keeps
 * that data and says it is stale. Demo data is never substituted for an error.
 */
export function CampaignHome() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { rejection } = useLastRejection();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orientation = useStageOrientation();

  const pending = latest.status === "loading" || campaign.status === "loading";
  const hardError = !pending && (latest.status === "error" || campaign.status === "error");
  const view = campaignView(campaign.data, false, DEMO_MODE, DEMO_CAMPAIGN);
  const illustrative = !hardError && view.state === "data" && view.demo;
  const campaignPayload = illustrative ? view.campaign : campaign.data;

  const model = useMemo(
    () =>
      buildCampaignOverview({
        latest: { data: latest.data, error: latest.error, loading: latest.status === "loading" },
        campaign: { data: campaignPayload, error: campaign.error, loading: campaign.status === "loading" },
        rejection,
        selectedCount: null,
        startedHere: false,
        startInFlight: false,
        illustrative,
      }),
    [campaign.error, campaign.status, campaignPayload, illustrative, latest.data, latest.error, latest.status, rejection],
  );

  const showHome = !pending && !hardError;
  const attention = showHome && model.settled ? resolveAttention(model) : null;
  const { stage, select } = useOverviewStage(showHome, showHome ? model.identity : null, attention, showHome && model.settled);

  if (pending) return <OverviewSkeleton />;
  if (hardError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-overview-title text-fg">Campaign</h1>
        <ErrorState
          title="Could not reach the analysis service"
          description="The campaign could not be loaded because the engine did not answer. This is a connection problem, not an empty campaign. Your data is unchanged."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
          retryLabel="Retry"
        />
      </div>
    );
  }

  const active: ActiveCampaign | null = campaignPayload && campaignPayload.has_campaign ? campaignPayload : null;
  const title = model.versions.dataset ?? (model.objective.label ? targetName(model.objective.label) : "Campaign");
  const retry = () => {
    void latest.refresh();
    void campaign.refresh();
  };

  return (
    <div className="campaign-overview flex flex-col gap-6 text-overview-fg">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-overview-title text-overview-fg">{title}</h1>
          {illustrative ? <ExampleBadge /> : null}
        </div>
        <p className="max-w-[68ch] text-body text-overview-fg-muted">
          {model.objective.label ? targetName(model.objective.label) : "No outcome reported"}
          {model.objective.unit ? ` (${model.objective.unit})` : ""}. Direction not reported. Baseline unavailable.
          {illustrative ? " Illustrative data only." : null}
        </p>
      </header>
      {model.staleResources.length ? (
        <div role="alert" className="flex flex-col items-start gap-2 border border-dashed border-overview-border bg-overview-muted px-4 py-3 text-body">
          <p>Couldn&apos;t refresh {model.staleResources.join(" and ")}. Showing the last loaded data. Your data is unchanged.</p>
          <button type="button" className="text-overview-action underline-offset-4 hover:underline" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}
      <SummaryStrip model={model} />
      <Tabs
        className="flex-col"
        value={stage}
        orientation={orientation}
        onValueChange={(value, details) => {
          if (details.reason !== "none") return;
          if (typeof value === "string" && (OVERVIEW_STAGES as readonly string[]).includes(value)) select(value as OverviewStage);
        }}
      >
        <StageTabs model={model} stage={stage} attention={attention} onSelect={select} pathname={pathname} search={searchParams} />
        {OVERVIEW_STAGES.map((id) => (
          <TabsContent key={id} value={id}>
            <StagePanel model={model} stage={id} campaign={active} onRetry={retry} busy={latest.refreshing || campaign.refreshing} />
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-caption text-overview-fg-muted">
        Ranking reliability, promotion checks, and permission to start are separate. Promotion evidence is model promotion, not a scale-up approval.
        {illustrative ? " Illustrative data only." : null}
      </p>
    </div>
  );
}
