import { Info } from "lucide-react";

/**
 * Disclaimer shown on every non-live Projects screen. These screens render
 * seed data (see app/projects/data.ts) with numbers that look like a real
 * scored analysis, so without this a viewer could mistake fabricated figures
 * (a success probability, a scale-up curve, a calibration score) for real
 * engine output. Only the `live: true` project is scored by the engine; that
 * view already carries its own "Live · engine" treatment instead of this one.
 */
export function IllustrativeBanner() {
  return (
    <div className="mb-3.5 flex items-center gap-2 rounded-[9px] border-[0.5px] border-[color:var(--v-warn-border)] bg-[var(--v-warn-bg)] px-3.5 py-2.5 text-[color:var(--v-warn-ink)]">
      <Info className="size-4 shrink-0 text-[color:var(--v-warn-accent)]" />
      <span className="text-[12px] font-medium">Sample data - illustrative, not a real analysis</span>
    </div>
  );
}
