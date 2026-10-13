"use client";

import Link from "next/link";
import { RunsTable } from "@/components/campaign/runs-table";
import { PageHeader } from "@/components/kit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ExampleBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { displayRound } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView } from "@/lib/workbench";

/** Run: this round's runs and what is still out. Read-only; results are entered on Record. */
export default function RunPage() {
  const campaign = useCampaign();
  const latest = useLatest();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const active = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const analysis = !demo && latest.data?.has_data ? latest.data : null;
  const awaiting = active?.pending.filter((r) => r.awaiting).length ?? 0;
  // The band is the analysis' conformal half-width; without one the table shows the prediction alone.
  const band = analysis?.conformal_q != null ? { halfWidth: analysis.conformal_q, coverage: analysis.conformal_coverage } : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={active ? `Round ${displayRound(active.round)}` : undefined}
        title="Runs in flight"
        meta={demo ? <ExampleBadge /> : null}
        description={
          active && active.pending.length > 0
            ? `${formatNumber(awaiting, "count")} of ${formatNumber(active.pending.length, "count")} runs are awaiting a measured result.`
            : "This round's runs, their recipes and predictions."
        }
        action={
          awaiting > 0 ? (
            <Link href="/campaign/record" className={buttonVariants()}>
              Record results
            </Link>
          ) : null
        }
      />
      {view.state === "error" ? (
        <ErrorState onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      ) : view.state === "loading" ? (
        <LoadingSkeleton variant="table" rows={4} />
      ) : !active || active.pending.length === 0 ? (
        <EmptyState
          title="No runs started this round"
          description="Start runs from the Plan stage."
          action={
            <Link href="/campaign/plan" className={buttonVariants({ variant: "outline" })}>
              Go to Plan
            </Link>
          }
        />
      ) : (
        <RunsTable runs={active.pending} drivers={analysis?.drivers.map((d) => d.name) ?? []} band={band} />
      )}
    </div>
  );
}
