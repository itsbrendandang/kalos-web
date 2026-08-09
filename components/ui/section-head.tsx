import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Grouping header: a bold label, an optional one-line descriptor, a hairline
 * that runs to the edge, and an optional trailing badge. This is the "bold
 * label, hairline rule" pattern that was hand-duplicated in
 * components/analysis-readout.tsx, components/operations/operations-view.tsx
 * and elsewhere - consolidated here as the one shared primitive so future
 * surfaces don't reimplement it a fourth time.
 *
 * Renders a real `<h2>` so the section title participates in the document
 * outline (not just a styled `<div>`).
 */
export function SectionHead({
  title,
  sub,
  badge,
  className,
}: {
  title: string;
  sub?: string;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? (
        <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span>
      ) : null}
      <Separator className="w-auto min-w-4 flex-1 data-horizontal:w-auto" />
      {badge ?? null}
    </div>
  );
}
