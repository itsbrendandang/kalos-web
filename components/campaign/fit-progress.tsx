"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatElapsed } from "@/lib/sheet-columns";

/** Seconds since `active` last became true; resets when it goes false. */
export function useElapsedSeconds(active: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const reset = setTimeout(() => setS(0), 0); // a new fit starts the clock from zero, not from the last fit's value
    const id = setInterval(() => setS((Date.now() - start) / 1000), 1000);
    return () => {
      clearTimeout(reset);
      clearInterval(id);
    };
  }, [active]);
  return active ? s : 0;
}

/** What Kalos is doing, by how long it has been at it. Kalos reports no step of its own yet, so the step is read from the clock and says so. */
export function fitStep(elapsed: number, rows?: number | null): { step: string; detail: string } {
  if (elapsed < 4) return { step: "Reading and checking the sheet", detail: "The checks run first; the model is built after them." };
  if (elapsed < 20) return { step: "Building the model", detail: "Kalos learns from your runs." };
  return {
    step: "Testing the model on runs it has not seen",
    detail: `${rows != null && rows < 60 ? "A small sheet is tested more times, so this can take longer than a large one. " : ""}This can take up to 2 minutes; keep this tab open.`,
  };
}

/**
 * Shown while Kalos reads the sheet and builds the model. One clock, and the
 * step it is most likely on (Kalos does not report its step yet, so the step is
 * worked out from the time and labelled as such). The live-region text names
 * the step and changes only when the step does, so a screen reader is not read
 * a number every second.
 */
export function FitProgress({ elapsed, rows }: { elapsed: number; rows?: number | null }) {
  const { step, detail } = fitStep(elapsed, rows);
  return (
    <div className="flex items-center gap-3 rounded-2xl glass px-4 py-3.5">
      <Loader2 className="size-4 shrink-0 animate-spin text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{step}</p>
        <p className="text-caption text-fg-muted">{detail} The step is worked out from the time, not reported by Kalos.</p>
      </div>
      <span className="text-label tabular-nums text-fg" aria-label={`${formatElapsed(elapsed)} so far`}>
        {formatElapsed(elapsed)}
      </span>
      <span role="status" className="sr-only">
        {step}
      </span>
    </div>
  );
}
