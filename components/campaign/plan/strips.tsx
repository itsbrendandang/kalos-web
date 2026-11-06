import type { BoundaryCheck } from "@/components/campaign/plan-view";
import { cn } from "@/lib/utils";

/*
 * A small inline SVG summarising one input against its range. Decorative:
 * aria-hidden, because the numbers printed beside it carry the meaning.
 */

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
