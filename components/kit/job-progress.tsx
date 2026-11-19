"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Job } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/lib/sheet-columns";
import { cn } from "@/lib/utils";

/** The engine's job stages in order (kalos-engine docs/JOBS.md), with what each one does in plain words. */
export const JOB_STAGES: { key: string; label: string }[] = [
  { key: "queued", label: "Waiting for a free analysis slot" },
  { key: "parsing", label: "Reading and checking the sheet" },
  { key: "fitting", label: "Fitting the model and cross-validating" },
  { key: "calibrating", label: "Checking the model's reliability and intervals" },
  { key: "proposing", label: "Proposing the next batch" },
  { key: "publishing", label: "Saving the analysis to the campaign" },
];

export function jobStageIndex(stage: string): number {
  const i = JOB_STAGES.findIndex((s) => s.key === stage);
  return i === -1 ? 0 : i;
}

/** Seconds since an epoch-seconds timestamp, ticking once a second while `live`. */
export function useSecondsSince(since: number | null | undefined, live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (since == null) return 0;
  return Math.max(0, (now - since * 1000) / 1000);
}

/**
 * An upload being analyzed as an engine background job: the engine's own
 * stage list and progress (reported at stage boundaries, so the bar moves in
 * steps, not smoothly), the elapsed time, and Cancel. It keeps running if the
 * user leaves the page.
 */
export function JobProgress({
  job,
  onCancel,
  cancelling = false,
  pollTrouble = false,
  className,
}: {
  job: Job;
  onCancel?: () => void;
  cancelling?: boolean;
  pollTrouble?: boolean;
  className?: string;
}) {
  const live = job.state === "queued" || job.state === "running";
  const elapsed = useSecondsSince(job.started_at ?? job.created_at, live);
  const at = jobStageIndex(job.stage);
  const pct = Math.round(Math.min(1, Math.max(0, job.progress)) * 100);
  const announced = JOB_STAGES[at]?.label ?? job.stage;
  return (
    <section aria-label="Analysis progress" className={cn("rounded-xl border border-border bg-surface p-panel", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-label text-fg">
            <Loader2 className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
            {job.cancel_requested ? "Cancelling the analysis" : "Analyzing your sheet"}
          </p>
          <p className="mt-0.5 text-caption text-fg-muted">
            Runs on the engine in the background: you can leave this page and come back. Progress is reported by the engine at each stage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-label tabular-nums text-fg" aria-hidden>
            {formatElapsed(elapsed)}
          </span>
          {onCancel ? (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelling || job.cancel_requested}>
              {cancelling || job.cancel_requested ? "Cancelling..." : "Cancel"}
            </Button>
          ) : null}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Engine-reported progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, ${announced}`}
        className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <ol className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {JOB_STAGES.map((s, i) => {
          const state = i < at ? "done" : i === at ? "current" : "upcoming";
          return (
            <li key={s.key} className={cn("flex items-center gap-2 text-caption", state === "upcoming" ? "text-fg-muted" : "text-fg")}>
              {state === "done" ? (
                <Check className="size-3.5 shrink-0 text-good" aria-hidden />
              ) : state === "current" ? (
                <span className="size-3.5 shrink-0 rounded-full border-2 border-accent" aria-hidden />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-border-strong" aria-hidden />
              )}
              <span>
                {s.label}
                {state === "current" ? <span className="sr-only"> (in progress)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {pollTrouble ? <p className="mt-3 text-caption text-warn">Lost touch with the analysis service; still trying. The job keeps running on the engine.</p> : null}
      <span role="status" className="sr-only">
        {announced}
      </span>
    </section>
  );
}

/**
 * A synchronous engine call with no stage reporting (re-analysis has no job
 * route): an elapsed timer and a plain statement that the engine does not
 * report progress for it, never a fake percentage.
 */
export function ElapsedProgress({ title, note, startedAt, className }: { title: string; note: string; startedAt: number | null; className?: string }) {
  const elapsed = useSecondsSince(startedAt != null ? startedAt / 1000 : null, true);
  const announced = Math.floor(elapsed / 15) * 15;
  return (
    <section aria-label={title} className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface p-panel", className)}>
      <Loader2 className="size-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{title}</p>
        <p className="text-caption text-fg-muted">{note}</p>
      </div>
      <span className="text-label tabular-nums text-fg" aria-hidden>
        {formatElapsed(elapsed)}
      </span>
      <span role="status" className="sr-only">
        Still working, {announced} seconds so far
      </span>
    </section>
  );
}
