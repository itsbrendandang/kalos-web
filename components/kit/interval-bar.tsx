import { formatNumber, type Quantity } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A prediction and its band against a reference line (usually the current
 * best), on a shared scale so rows compare at a glance. The numbers are
 * printed too, and the whole bar has a text alternative.
 */
export function IntervalBar({
  value,
  band,
  reference,
  referenceLabel = "current best",
  domain,
  quantity = "value",
  className,
}: {
  value: number;
  /** Half-width of the band (the conformal band), or null when unknown. */
  band: number | null;
  reference?: number | null;
  referenceLabel?: string;
  /** The shared [min, max] scale across every bar being compared. */
  domain: [number, number];
  quantity?: Quantity;
  className?: string;
}) {
  const [lo, hi] = domain;
  const pos = (v: number) => (hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 50);
  const f = (v: number) => formatNumber(v, quantity);
  const bandText = band != null ? `, band ${f(value - band)} to ${f(value + band)}` : "";
  const refText = reference != null ? `; ${referenceLabel} ${f(reference)}` : "";
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div role="img" aria-label={`Predicted ${f(value)}${bandText}${refText}`} className="relative h-6 min-w-24 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {band != null ? (
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-chart-band"
            style={{ left: `${pos(value - band)}%`, width: `${Math.max(0, pos(value + band) - pos(value - band))}%` }}
          />
        ) : null}
        {reference != null ? (
          <div className="absolute inset-y-0 border-l border-dashed border-chart-reference" style={{ left: `${pos(reference)}%` }} />
        ) : null}
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-chart-predicted"
          style={{ left: `${pos(value)}%` }}
        />
      </div>
      <span className="shrink-0 text-caption text-fg tabular-nums">
        {f(value)}
        {band != null ? <span className="text-fg-muted"> ± {f(band)}</span> : null}
      </span>
    </div>
  );
}
