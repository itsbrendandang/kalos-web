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

/**
 * Shown while the engine reads the sheet and fits the model, which takes about
 * a minute and a half on a first run. The ticking clock is visual only; the
 * live-region text changes every 15 s, so a screen reader is not read a number
 * every second.
 */
export function FitProgress({ elapsed }: { elapsed: number }) {
  const announced = Math.floor(elapsed / 15) * 15;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
      <Loader2 className="size-4 shrink-0 animate-spin text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">Fitting the model to your runs</p>
        <p className="text-caption text-fg-muted">
          Checking the sheet, then fitting and cross-validating. This can take up to 2 minutes on a large sheet; keep this tab open.
        </p>
      </div>
      <span className="text-label tabular-nums text-fg" aria-hidden>
        {formatElapsed(elapsed)}
      </span>
      <span role="status" className="sr-only">
        Still fitting, {announced} seconds so far
      </span>
    </div>
  );
}
