"use client";

import Link from "next/link";
import { Callout } from "@/components/kit/callout";
import { Verdict } from "@/components/kit/verdict";
import { buttonVariants, Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { rejectionCopy, type UploadRejection } from "@/components/campaign/plan-view";
import { DatasetEyebrow, PlanFrame, PlanHeader } from "@/components/campaign/plan/header";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string) => `${formatNumber(n, "count")} ${n === 1 ? one : `${one}s`}`;

/** Shown while the first analysis and campaign reads are in flight. */
export function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-label="Loading the proposed recipes">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <h1 className="text-display text-fg">Plan</h1>
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** No analysis yet: say what to do next. A rejected upload takes the place of the empty state. */
export function NoProposals({ rejection }: { rejection: UploadRejection | null }) {
  return (
    <PlanFrame>
      <PlanHeader />
      {rejection ? (
        <RejectedUploadCallout rejection={rejection} />
      ) : (
        <EmptyState
          title="No proposed recipes yet"
          description="Upload a run sheet. Kalos learns from the runs you already have, then proposes the first recipes to try here."
          action={
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Upload a run sheet
            </Link>
          }
        />
      )}
    </PlanFrame>
  );
}

/** The one Callout for an upload the engine refused, with a way forward. */
export function RejectedUploadCallout({ rejection }: { rejection: UploadRejection }) {
  const copy = rejectionCopy(rejection);
  return (
    <div role="alert">
      <Callout
        tone="bad"
        title={copy.title}
        action={
          <Link href="/campaign/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Upload a different sheet
          </Link>
        }
      >
        <p>{copy.body}</p>
        {copy.suggestion ? <p className="mt-1 text-fg-muted">{copy.suggestion}</p> : null}
      </Callout>
    </div>
  );
}

/** The Callout for a rejected upload while the recipes are still the previous sheet's. Keeping it is an explicit choice. */
export function KeepPreviousCallout({ rejection, dataset, onKeep }: { rejection: UploadRejection; dataset: string; onKeep: () => void }) {
  return (
    <Callout
      tone="warn"
      title={`Your last upload, ${rejection.name}, was not used`}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onKeep}>
            Keep planning from {dataset}
          </Button>
          <Link href="/campaign/setup" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Go to Setup
          </Link>
        </div>
      }
    >
      {rejectionCopy(rejection).body} The recipes below are still from {dataset}. Choose whether to keep planning from it.
    </Callout>
  );
}

/** After a start: the runs are in the lab, so the old recipes are not offered again. */
export function Started({
  dataset,
  round,
  pending,
  awaiting,
}: {
  dataset: string;
  round: number;
  pending: number;
  awaiting: number;
}) {
  return (
    <PlanFrame>
      <PlanHeader
        round={round}
        eyebrow={<DatasetEyebrow name={dataset} />}
        action={
          <Link href="/campaign/run" className={buttonVariants()}>
            See the runs in the lab
          </Link>
        }
      />
      <Verdict tone="good">
        {plural(pending, "run")} started for round {round}. {awaiting > 0 ? `${formatNumber(awaiting, "count")} ${awaiting === 1 ? "is" : "are"} waiting for a result.` : "All have results."}
      </Verdict>
      <p className="text-body text-fg-muted">Follow them on Run, and record each result as it comes back. Planning the next round happens on Learn.</p>
      <Link href="/campaign/run" className={cn(buttonVariants(), "w-full sm:hidden")}>
        See the runs in the lab
      </Link>
    </PlanFrame>
  );
}
