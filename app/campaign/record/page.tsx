"use client";

import Link from "next/link";
import { RecordForm } from "@/components/campaign/record-form";
import { PageHeader } from "@/components/kit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { parseUnit } from "@/lib/utils";

/** Record: enter or correct measured results for this round. Reads and writes the live campaign only, never demo data. */
export default function RecordPage() {
  const campaign = useCampaign();
  const latest = useLatest();
  const c = campaign.data;

  if (campaign.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Record results" />
        <ErrorState onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      </div>
    );
  }
  if (!c) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Record results" />
        <LoadingSkeleton variant="table" rows={4} />
      </div>
    );
  }
  if (!c.has_campaign || c.pending.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Record results" description="Enter each measured value as it comes back from the lab." />
        <EmptyState
          title="No runs are waiting for results"
          description="Start a batch from the Plan stage, then come back here to record what you measure."
          action={
            <Link href="/campaign/plan" className={buttonVariants({ variant: "outline" })}>
              Go to Plan
            </Link>
          }
        />
      </div>
    );
  }
  return (
    <RecordForm
      runs={c.pending}
      round={c.round}
      best={c.best}
      unit={parseUnit(c.target)}
      drivers={latest.data?.has_data ? latest.data.drivers.map((d) => d.name) : []}
    />
  );
}
