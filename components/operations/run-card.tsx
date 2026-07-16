import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PipelineRun } from "@/lib/mock/pipeline";
import { StepTracker } from "@/components/operations/step-tracker";
import { DriftChip } from "@/components/operations/drift-chip";

/** One running (or attention) run: identity, the step tracker, a progress
 *  row, and drift chips. Attention runs get an amber left stripe so they
 *  read as needing a look even before the drift chips register. */
export function RunCard({ run }: { run: PipelineRun }) {
  const attention = run.status === "attention";
  const pct = Math.round(run.progress * 100);

  return (
    <Card className={cn("flex flex-col gap-3", attention && "border-l-4 border-l-amber")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold text-fg">{run.name}</div>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">
            {run.vessel} · {run.operator}
            {run.elapsedLabel ? ` · started ${run.elapsedLabel}` : ""}
          </div>
        </div>
        {attention ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber/30 bg-amber-soft px-2.5 py-1 text-[11px] font-semibold text-amber">
            Needs attention
          </span>
        ) : null}
      </div>

      <StepTracker procedure={run.procedure} currentStepIndex={run.currentStepIndex} />

      <div className="flex items-center gap-3">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-fg">{pct}%</span>
        {run.etaLabel ? <span className="shrink-0 font-mono text-[11.5px] text-muted">ETA {run.etaLabel}</span> : null}
      </div>

      {run.drift.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {run.drift.map((d) => (
            <DriftChip key={d.variable} drift={d} />
          ))}
        </div>
      ) : (
        <div className="text-[11.5px] text-muted">on-nominal</div>
      )}
    </Card>
  );
}
