/** Small shared bits the Log tab's blocks all reach for. Kept in one module
 *  (rather than one file each) because none of them is more than a styled
 *  span and they are only ever used by components/workspace/log/**. */
import { cn } from "@/lib/utils";

/** The recurring `10px/600` uppercase eyebrow (design spec: "Campaign
 *  timeline", "Activity", every stat-strip cell label). */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-[10px] font-semibold tracking-[0.09em] text-muted uppercase", className)}>{children}</span>
  );
}

/** An ink-colored mono numeral inside an otherwise-muted sentence - the
 *  design's way of letting a reader pick the numbers out of prose. */
export function InlineNumeral({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-plex-mono tabular-nums text-fg", className)}>{children}</span>;
}

/** The middot-joined meta sentence separator used in several header rows. */
export const DOT = " · ";
