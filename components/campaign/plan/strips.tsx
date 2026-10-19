import { predictionInterval, type BoundaryCheck } from "@/components/campaign/plan-view";
import { cn } from "@/lib/utils";

/*
 * Two small inline SVGs. Both are decorative summaries of numbers printed
 * right beside them, so they are aria-hidden; the text carries the meaning.
 */

/**
 * Predicted value (hollow ring) with the engine's prediction band as a
 * whisker, against the best measured value (dashed line, filled dot at its
 * foot). Every row in the batch shares `domain`, so rows are comparable.
 * Without a band, only the ring is drawn (no interval is made up).
 */
export function BandStrip({
  pred,
  band,
  best,
  domain,
  className,
}: {
  pred: number;
  band: number | null;
  best: number | null;
  domain: [number, number];
  className?: string;
}) {
  const W = 160;
  const H = 20;
  const x = (v: number) => ((v - domain[0]) / (domain[1] - domain[0])) * (W - 8) + 4;
  const iv = predictionInterval(pred, band);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-5 w-full min-w-[96px]", className)} aria-hidden>
      <line x1="4" x2={W - 4} y1={H / 2} y2={H / 2} stroke="var(--chart-grid)" strokeWidth="1" />
      {iv ? (
        <>
          <rect x={x(iv[0])} width={Math.max(1, x(iv[1]) - x(iv[0]))} y={H / 2 - 4} height="8" rx="2" fill="var(--chart-band)" />
          <line x1={x(iv[0])} x2={x(iv[1])} y1={H / 2} y2={H / 2} stroke="var(--chart-predicted)" strokeWidth="1" />
          <line x1={x(iv[0])} x2={x(iv[0])} y1={H / 2 - 4} y2={H / 2 + 4} stroke="var(--chart-predicted)" strokeWidth="1" />
          <line x1={x(iv[1])} x2={x(iv[1])} y1={H / 2 - 4} y2={H / 2 + 4} stroke="var(--chart-predicted)" strokeWidth="1" />
        </>
      ) : null}
      {best != null ? (
        <>
          <line x1={x(best)} x2={x(best)} y1="1" y2={H - 1} stroke="var(--chart-reference)" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx={x(best)} cy={H - 2.5} r="2" fill="var(--chart-measured)" />
        </>
      ) : null}
      <circle cx={x(pred)} cy={H / 2} r="4" fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth="1.8" />
    </svg>
  );
}

/** The observed range of one input as a hairline, its ends as ticks, and the proposed setpoint as a hollow ring. */
export function RangeBar({ check, className }: { check: BoundaryCheck; className?: string }) {
  const W = 120;
  const H = 14;
  const { range, value } = check;
  const width = range.max - range.min;
  // Show a little room outside the range so an out-of-range value is still drawn.
  const lo = Math.min(range.min, value) - width * 0.08;
  const hi = Math.max(range.max, value) + width * 0.08;
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * (W - 8) + 4;
  const edge = check.where !== "inside";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-3.5 w-[120px] shrink-0", className)} aria-hidden>
      <line x1={x(range.min)} x2={x(range.max)} y1={H / 2} y2={H / 2} stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" />
      <line x1={x(range.min)} x2={x(range.min)} y1="3" y2={H - 3} stroke="var(--fg-muted)" strokeWidth="1" />
      <line x1={x(range.max)} x2={x(range.max)} y1="3" y2={H - 3} stroke="var(--fg-muted)" strokeWidth="1" />
      <circle cx={x(value)} cy={H / 2} r="4" fill="var(--surface)" stroke={edge ? "var(--warn)" : "var(--chart-predicted)"} strokeWidth="1.8" />
    </svg>
  );
}
