import { cn } from "@/lib/utils";

type StepState = "done" | "current" | "upcoming";

function stepState(index: number, currentStepIndex: number): StepState {
  if (currentStepIndex < 0) return "upcoming";
  if (index < currentStepIndex) return "done";
  if (index === currentStepIndex) return "current";
  return "upcoming";
}

/**
 * Horizontal procedure tracker: a node per step, a connecting rail between
 * them. Completed steps are filled chart-1 (the data color, per the design
 * system - chrome stays neutral), the current step gets a ring and its name
 * labeled below, upcoming steps are hollow. `currentStepIndex` of `-1` (not
 * started) renders every node upcoming; an index `>= procedure.length`
 * (completed) renders every node done.
 */
export function StepTracker({
  procedure,
  currentStepIndex,
}: {
  procedure: readonly string[];
  currentStepIndex: number;
}) {
  return (
    <div className="flex items-start">
      {procedure.map((step, i) => {
        const state = stepState(i, currentStepIndex);
        const isLast = i === procedure.length - 1;
        return (
          <div key={step} className={cn("flex items-start", isLast ? "shrink-0" : "min-w-0 flex-1")}>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <span
                title={step}
                className={cn(
                  "size-2.5 shrink-0 rounded-full border-2",
                  state === "done" && "border-chart-1 bg-chart-1",
                  state === "current" && "border-chart-1 bg-card ring-2 ring-chart-1/35",
                  state === "upcoming" && "border-border bg-card",
                )}
              />
              <span
                className={cn(
                  "max-w-[84px] truncate text-center text-[10px] leading-tight font-semibold",
                  state === "current" ? "text-chart-1-ink" : "text-transparent select-none",
                )}
              >
                {step}
              </span>
            </div>
            {!isLast ? (
              <span className={cn("mt-[5px] h-px min-w-[10px] flex-1", state === "done" ? "bg-chart-1" : "bg-border")} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
