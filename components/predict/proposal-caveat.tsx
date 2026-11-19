import { Info } from "lucide-react";
import type { ProposalCaveat } from "@/lib/proposal-caveat";
import { cn } from "@/lib/utils";

/**
 * The trust caveat shown with proposal intervals (lib/proposal-caveat): the
 * engine's own sentence when it sent one, with its interval basis and the
 * coverage it measured at proposals beneath; the fixed text on older engines.
 * `compact` drops the box for use inside a table cell or a details list.
 */
export function ProposalCaveatNote({ caveat, compact = false, className }: { caveat: ProposalCaveat; compact?: boolean; className?: string }) {
  const meta = [caveat.basisText ? `Interval basis: ${caveat.basisText}` : null, caveat.estimateText && !caveat.text.includes(caveat.estimateText) ? `Coverage at proposals: ${caveat.estimateText}` : null].filter(Boolean);
  return (
    <p role="note" className={cn("flex items-start gap-2 text-caption text-fg", compact ? "text-fg-muted" : "rounded-lg border border-border bg-subtle px-3 py-2", className)}>
      {compact ? null : <Info className="mt-0.5 size-3.5 shrink-0 text-fg-muted" aria-hidden />}
      <span className="flex flex-col gap-0.5">
        <span>{caveat.text}</span>
        {meta.length ? <span className="text-fg-muted tabular-nums">{meta.join(" · ")}.</span> : null}
      </span>
    </p>
  );
}
