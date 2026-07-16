/**
 * Variant A - the segmented procedure bar. One segment per step: completed
 * steps fill chart-1 (the data color; chrome stays neutral), the current step
 * fills proportionally to how far progress has moved through it, upcoming
 * steps stay empty. A label row ("Step 5 of 8 - Fed-batch" + percent / ETA)
 * sits above and the first / last step names anchor the ends below. This
 * merges the old dot tracker and the separate progress bar into one indicator,
 * so "where is this run" reads in a single place.
 *
 * `currentStepIndex` of -1 (queued) renders every segment empty; an index
 * `>= procedure.length` (completed) renders every segment full.
 */
export function StepTracker({
  procedure,
  currentStepIndex,
  progress,
  etaLabel,
}: {
  procedure: readonly string[];
  currentStepIndex: number;
  progress: number;
  etaLabel?: string;
}) {
  const n = procedure.length;
  const started = currentStepIndex >= 0;
  const done = currentStepIndex >= n;
  const pct = Math.round(progress * 100);
  const currentName = started && !done ? procedure[currentStepIndex] : "";

  // How far the current segment is filled (0..1), derived from overall
  // progress. Clamped so an in-flight step always shows some fill, never full.
  const currentFill = started && !done ? Math.min(0.92, Math.max(0.12, progress * n - currentStepIndex)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="min-w-0 truncate font-semibold text-fg">
          {done ? (
            "All steps complete"
          ) : started ? (
            <>
              Step {currentStepIndex + 1} of {n} · <span className="text-chart-1-ink">{currentName}</span>
            </>
          ) : (
            `Queued · ${n} steps`
          )}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-muted">
          {pct}%{etaLabel ? ` · ETA ${etaLabel}` : ""}
        </span>
      </div>

      <div className="flex gap-[3px]" aria-hidden>
        {procedure.map((step, i) => {
          const isDone = done || i < currentStepIndex;
          const isCurrent = !done && i === currentStepIndex;
          return (
            <div key={step} title={step} className="relative h-2 flex-1 overflow-hidden rounded-[2px] bg-border">
              {isDone ? <div className="absolute inset-0 rounded-[2px] bg-chart-1" /> : null}
              {isCurrent ? (
                <div
                  className="absolute inset-y-0 left-0 rounded-[2px] bg-chart-1"
                  style={{ width: `${currentFill * 100}%` }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between font-mono text-[10px] text-muted">
        <span className="truncate">{procedure[0]}</span>
        <span className="truncate">{procedure[n - 1]}</span>
      </div>
    </div>
  );
}
