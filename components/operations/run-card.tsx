import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PipelineRun } from "@/lib/mock/pipeline";
import { StepTracker } from "@/components/operations/step-tracker";
import { DriftChip } from "@/components/operations/drift-chip";

/** One running (or attention) run: a status glyph, identity, the segmented
 *  procedure bar, and drift chips.
 *
 *  The status glyph encodes state in SHAPE, not just color, so it survives a
 *  greyscale print or a color-vision difference: a green circle means running
 *  clean, an amber square means needs attention. Attention runs also carry the
 *  amber left stripe + pill for a louder peripheral signal. */
export function RunCard({ run }: { run: PipelineRun }) {
  const attention = run.status === "attention";

  return (
    <Card className={cn("flex flex-col gap-3", attention && "border-l-4 border-l-amber")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden
            title={attention ? "Needs attention" : "Running"}
            className={cn(
              "mt-[3px] size-2.5 shrink-0",
              attention ? "rounded-[2px] bg-amber" : "rounded-full bg-green",
            )}
          />
          <div className="min-w-0">
            <div className="truncate text-[14.5px] font-semibold text-fg">{run.name}</div>
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">
              {run.vessel} · {run.operator}
              {run.elapsedLabel ? ` · started ${run.elapsedLabel}` : ""}
            </div>
          </div>
        </div>
        {attention ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber/30 bg-amber-soft px-2.5 py-1 text-[11px] font-semibold text-amber">
            Needs attention
          </span>
        ) : null}
      </div>

      <StepTracker
        procedure={run.procedure}
        currentStepIndex={run.currentStepIndex}
        progress={run.progress}
        etaLabel={run.etaLabel}
      />

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
