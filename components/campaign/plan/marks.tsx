import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The two inks for numbers in text (DESIGN.md, chart tokens): a model
 * prediction is a hollow ring in --chart-predicted and says "predicted"; a
 * measured value is a filled dot in --chart-measured and says "measured".
 * They are never drawn as the same mark.
 */

/*
 * `x`/`y` place a mark inside an SVG plot (the response surface). `halo` draws a
 * page-coloured outline under it, so the mark stays separate from any cell fill.
 */
type MarkPosition = { x?: number; y?: number; halo?: boolean };

/**
 * `default` is the existing plan mark (hollow violet ring / filled ink dot).
 * `neutral` is opt-in for the campaign home: a hollow diamond in
 * --overview-predicted, or a filled dot in --overview-measured. It does not
 * change marks that omit `ink`.
 */
type MarkInk = "default" | "neutral";

export function PredictedMark({ className, x, y, halo = false, ink = "default" }: { className?: string; ink?: MarkInk } & MarkPosition) {
  return (
    <svg viewBox="0 0 10 10" x={x} y={y} className={cn("inline-block size-2.5 shrink-0", className)} aria-hidden>
      {ink === "neutral" ? (
        <path d="M5 1.15 L8.85 5 L5 8.85 L1.15 5 Z" fill="none" stroke="var(--overview-predicted, var(--fg-muted))" strokeWidth="1.3" />
      ) : (
        <>
          {halo ? <circle cx="5" cy="5" r="3.6" fill="none" stroke="var(--bg)" strokeWidth="3.6" /> : null}
          <circle cx="5" cy="5" r="3.6" fill="none" stroke="var(--chart-predicted)" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

export function MeasuredMark({ className, x, y, halo = false, ink = "default" }: { className?: string; ink?: MarkInk } & MarkPosition) {
  return (
    <svg viewBox="0 0 10 10" x={x} y={y} className={cn("inline-block size-2.5 shrink-0", className)} aria-hidden>
      {halo && ink === "default" ? <circle cx="5" cy="5" r="4.6" fill="var(--bg)" /> : null}
      <circle cx="5" cy="5" r="4" fill={ink === "neutral" ? "var(--overview-measured, var(--chart-measured))" : "var(--chart-measured)"} />
    </svg>
  );
}

/** A predicted number with its ring and the word "predicted" (visible, or sr-only when a column header already says it). */
export function PredictedValue({ value, unit, label = "predicted", hideLabel = false, className, ink = "default" }: { value: ReactNode; unit?: string; label?: string; hideLabel?: boolean; className?: string; ink?: MarkInk }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <PredictedMark className="self-center" ink={ink} />
      <span className={hideLabel ? "sr-only" : "text-caption text-fg-muted"}>{label}</span>
      <span className="text-fg tabular-nums">{value}</span>
      {unit ? <span className="text-caption text-fg-muted">{unit}</span> : null}
    </span>
  );
}

export function MeasuredValue({ value, unit, label = "measured", hideLabel = false, className, ink = "default" }: { value: ReactNode; unit?: string; label?: string; hideLabel?: boolean; className?: string; ink?: MarkInk }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)}>
      <MeasuredMark className="self-center" ink={ink} />
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
