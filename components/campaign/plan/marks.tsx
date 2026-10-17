import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The two inks for numbers in text (DESIGN.md, chart tokens): a model
 * prediction is a hollow ring in --chart-predicted and says "predicted"; a
 * measured value is a filled dot in --chart-measured and says "measured".
 * They are never drawn as the same mark.
 */

export function PredictedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cn("inline-block size-2.5 shrink-0", className)} aria-hidden>
      <circle cx="5" cy="5" r="3.6" fill="none" stroke="var(--chart-predicted)" strokeWidth="1.8" />
    </svg>
  );
}

export function MeasuredMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={cn("inline-block size-2.5 shrink-0", className)} aria-hidden>
      <circle cx="5" cy="5" r="4" fill="var(--chart-measured)" />
    </svg>
  );
}

/** A predicted number with its ring and the word "predicted" (visible, or sr-only when a column header already says it). */
export function PredictedValue({ value, unit, label = "predicted", hideLabel = false, className }: { value: ReactNode; unit?: string; label?: string; hideLabel?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <PredictedMark className="self-center" />
      <span className={hideLabel ? "sr-only" : "text-caption text-fg-muted"}>{label}</span>
      <span className="text-fg tabular-nums">{value}</span>
      {unit ? <span className="text-caption text-fg-muted">{unit}</span> : null}
    </span>
  );
}

export function MeasuredValue({ value, unit, label = "measured", hideLabel = false, className }: { value: ReactNode; unit?: string; label?: string; hideLabel?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <MeasuredMark className="self-center" />
      <span className={hideLabel ? "sr-only" : "text-caption text-fg-muted"}>{label}</span>
      <span className="text-fg tabular-nums">{value}</span>
      {unit ? <span className="text-caption text-fg-muted">{unit}</span> : null}
    </span>
  );
}

/** The legend the batch table carries once, so each row can stay compact. */
export function MarkLegend({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted", className)}>
      <span className="inline-flex items-center gap-1.5">
        <PredictedMark /> predicted by the model
      </span>
      <span className="inline-flex items-center gap-1.5">
        <MeasuredMark /> measured in the lab
      </span>
    </p>
  );
}
