"use client";

import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { ColumnRoles } from "@/components/data/column-roles";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useLatest } from "@/hooks/use-engine";
import { runSheetSentence } from "./roles";

/**
 * The run sheet the engine is working from, read live from the engine, and
 * how it read each column. This page changes nothing: replacing the sheet
 * happens in Setup.
 */
export default function DataPage() {
  const latest = useLatest();
  const d = latest.status === "error" ? null : latest.data?.has_data ? latest.data : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data"
        title="Your data"
        description="The run sheet the engine is working from, and how it read each column."
        action={
          d ? (
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline" })}>
              Replace the run sheet
            </Link>
          ) : null
        }
      />

      {latest.status === "error" ? (
        <ErrorState
          title="Could not reach the engine"
          description="The request failed before the engine could answer. This is a connection problem, not an empty run sheet."
          onRetry={() => void latest.refresh()}
          busy={latest.refreshing}
        />
      ) : !latest.data ? (
        <LoadingSkeleton rows={4} label="Loading your data" />
      ) : !d ? (
        <EmptyState
          icon={Upload}
          title="No run sheet yet"
          description="Upload a run sheet in Setup and the engine's reading of it appears here."
          action={
            <Link href="/campaign/setup" className={buttonVariants({})}>
              Upload a run sheet <ArrowRight />
            </Link>
          }
        />
      ) : (
        <>
          <Verdict tone="good">{runSheetSentence(d)}</Verdict>

          <ColumnRoles provenance={d.provenance} droppedIncomplete={d.n_dropped_incomplete} />
        </>
      )}
    </div>
  );
}
