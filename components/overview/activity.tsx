"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { jobStageLabel } from "@/components/kit/job-progress";
import { useCampaignId, useReanalysis, useUploadJob } from "@/hooks/use-engine";
import { isJobActive, type Job } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { CANVAS_CARD } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** "Fitting the model..., 40% as reported by the engine." The stage and progress are the engine's own. */
export function jobStatusLine(job: Pick<Job, "stage" | "kind" | "progress">): string {
  return `${jobStageLabel(job)}, ${formatValue(Math.min(1, Math.max(0, job.progress)), { quantity: "pct" }).text} as reported by the engine.`;
}

/**
 * Long engine work for this campaign, visible from the Overview: an upload
 * being analyzed and a re-analysis, each with the engine's own stage and
 * progress, and a link to the page where it can be followed and cancelled
 * (Harmonize for an upload, Validate for a re-analysis). Renders nothing when
 * idle.
 */
export function CampaignActivity({ harmonizeHref, validateHref }: { harmonizeHref: string; validateHref?: string }) {
  const id = useCampaignId();
  const { job, pollTrouble } = useUploadJob();
  const reanalysis = useReanalysis();
  const uploading = job && isJobActive(job) ? job : null;
  const reJob = reanalysis.running ? reanalysis.job : null;
  if (!uploading && !reJob) return null;
  return (
    <div className="flex flex-col gap-3">
      {uploading ? (
        <ActivityRow
          label="Upload analysis in progress"
          title={uploading.cancel_requested ? "Cancelling the sheet analysis" : "Analyzing an uploaded sheet"}
          status={`${jobStatusLine(uploading)}${pollTrouble ? " Lost touch with the analysis service; still trying." : ""}`}
          href={harmonizeHref}
          link="Follow it on Harmonize"
        />
      ) : null}
      {reJob ? (
        <ActivityRow
          label="Re-analysis in progress"
          title={reJob.cancel_requested ? "Cancelling the re-analysis" : "Re-analyzing with the measured results"}
          status={`${jobStatusLine(reJob)} The numbers below update when it finishes.${reanalysis.pollTrouble ? " Lost touch with the analysis service; still trying." : ""}`}
          href={validateHref ?? `${campaignHref(id, "validate")}#learn`}
          link="Follow it on Validate"
        />
      ) : null}
    </div>
  );
}

function ActivityRow({ label, title, status, href, link }: { label: string; title: string; status: string; href: string; link: string }) {
  return (
    <section aria-label={label} className={cn(CANVAS_CARD, "flex flex-wrap items-center gap-3 p-panel")}>
      <Loader2 className="size-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{title}</p>
        <p className="text-caption text-fg-muted" role="status">
          {status}
        </p>
      </div>
      <Link href={href} className="text-label text-accent hover:underline">
        {link}
      </Link>
    </section>
  );
}
