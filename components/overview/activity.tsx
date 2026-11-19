"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ElapsedProgress, JOB_STAGES, jobStageIndex } from "@/components/kit/job-progress";
import { useReanalysis, useUploadJob } from "@/hooks/use-engine";
import { isJobActive } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/**
 * Long engine work for this campaign, visible from the Overview: an upload
 * being analyzed (the engine's own stage and progress, with a link to
 * Harmonize where it can be cancelled) and a re-analysis (elapsed time only,
 * because the engine reports no stages for it). Renders nothing when idle.
 */
export function CampaignActivity({ harmonizeHref }: { harmonizeHref: string }) {
  const { job, pollTrouble } = useUploadJob();
  const reanalysis = useReanalysis();
  const uploading = job && isJobActive(job) ? job : null;
  if (!uploading && !reanalysis.running) return null;
  return (
    <div className="flex flex-col gap-3">
      {uploading ? (
        <section aria-label="Upload analysis in progress" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-panel">
          <Loader2 className="size-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-label text-fg">{uploading.cancel_requested ? "Cancelling the sheet analysis" : "Analyzing an uploaded sheet"}</p>
            <p className="text-caption text-fg-muted" role="status">
              {JOB_STAGES[jobStageIndex(uploading.stage)]?.label ?? "Working"}, {formatNumber(Math.min(1, Math.max(0, uploading.progress)), "pct")} as reported by the engine.
              {pollTrouble ? " Lost touch with the analysis service; still trying." : ""}
            </p>
          </div>
          <Link href={harmonizeHref} className="text-label text-accent hover:underline">
            Follow it on Harmonize
          </Link>
        </section>
      ) : null}
      {reanalysis.running ? (
        <ElapsedProgress
          title="Re-analyzing with the measured results"
          note="The engine reports no stages for a re-analysis, so only the elapsed time is shown. The numbers below update when it finishes."
          startedAt={reanalysis.startedAt}
        />
      ) : null}
    </div>
  );
}
