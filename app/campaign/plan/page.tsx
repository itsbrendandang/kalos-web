"use client";

import { ErrorState } from "@/components/ui/honest-state";
import { useCampaign, useLastRejection, useLatest } from "@/hooks/use-engine";
import { campaignStage } from "@/lib/campaign-stage";
import { activeRejection, type PlanAnalysis } from "@/components/campaign/plan-view";
import { Batch } from "@/components/campaign/plan/batch";
import { PlanFrame, PlanHeader } from "@/components/campaign/plan/header";
import { NoProposals, PlanSkeleton, Started } from "@/components/campaign/plan/states";

/**
 * Plan round N: review the recipes the model proposed, compare them, choose
 * which to run, then approve and start them. Nothing starts without the
 * explicit approval step. Every number is an engine field or is computed from
 * runs the engine returned; see components/campaign/plan-view.ts. Once runs
 * are started the page says so and points to Run; re-proposing lives on Learn.
 */
export default function PlanPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { rejection, setRejection } = useLastRejection();

  if (latest.status === "error" || campaign.status === "error") {
    return (
      <PlanFrame>
        <PlanHeader />
        <ErrorState
          title="Could not reach Kalos"
          description="The request failed before Kalos could answer, so there are no proposed recipes to show. This is a connection problem, not a result: your sheet and any started runs are unaffected."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </PlanFrame>
    );
  }
  if (!latest.data || !campaign.data) return <PlanSkeleton />;

  if (!latest.data.has_data) return <NoProposals rejection={activeRejection(rejection, null)} />;

  const d = latest.data as PlanAnalysis;
  const round = campaignStage(d, campaign.data).round ?? 1;
  const active = campaign.data.has_campaign ? campaign.data : null;
  // After a start the analysis no longer matches the campaign until Learn updates the model, so the old recipes are not offered again.
  const started = active != null && active.pending.length > 0 && active.analysis_in_sync !== true;

  if (started) {
    return <Started dataset={d.dataset} round={round} pending={active.pending.length} awaiting={active.n_awaiting} />;
  }

  return (
    <Batch
      key={`${d.campaign_generation}-${d.dataset}-${d.updated}`}
      d={d}
      round={round}
      rejection={activeRejection(rejection, d.dataset)}
      onKeepPrevious={() => setRejection(null)}
    />
  );
}
