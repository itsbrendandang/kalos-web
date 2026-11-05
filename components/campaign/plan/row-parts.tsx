"use client";

import { Check, ChevronRight, Columns2, TriangleAlert } from "lucide-react";
import type { RecipeFlag } from "@/components/campaign/plan-view";
import { formatSetpoint } from "@/components/campaign/plan-view";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanContext, PlanRow, RowState } from "@/components/campaign/plan/types";

/** What each mode means, in plain words, for the card layout. */
export const MODE_HINT = { exploit: "high predicted value", explore: "chosen to learn" } as const;

/** The warnings for one proposal. Each is a warn badge with its explanation on hover and in Details. */
export function Flags({ flags, compact = false }: { flags: RecipeFlag[]; compact?: boolean }) {
  if (flags.length === 0) return <span className="text-caption text-fg-muted">None</span>;
  return (
    <ul className={cn("flex flex-wrap gap-1", compact && "flex-col items-start")}>
      {flags.map((f) => (
        <li key={f.kind}>
          <Badge tone="warn" className={cn("h-auto min-h-6 py-0.5", compact ? "whitespace-normal" : "whitespace-nowrap")} title={f.detail}>
            <TriangleAlert aria-hidden />
            {f.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function CompareToggle({ row, state }: { row: PlanRow; state: RowState }) {
  return (
    <button
      type="button"
      aria-pressed={state.compared}
      disabled={!state.compared && state.compareDisabled}
      onClick={state.onCompare}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-label whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-fg-muted",
        state.compared ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-fg hover:bg-subtle",
      )}
    >
      {state.compared ? <Check className="size-4" aria-hidden /> : <Columns2 className="size-4" aria-hidden />}
      <span>{state.compared ? "Comparing" : "Compare"}</span>
      <span className="sr-only"> {row.id}</span>
    </button>
  );
}

/** The row's id, which opens its Details. */
export function ExpandButton({ row, state, controls }: { row: PlanRow; state: RowState; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={state.expanded}
      aria-controls={controls}
      onClick={state.onExpand}
      className="-ml-1 inline-flex h-8 items-center gap-1 rounded-lg px-1 text-label text-fg hover:bg-subtle"
    >
      <ChevronRight className={cn("size-4 shrink-0 text-fg-muted transition-transform", state.expanded && "rotate-90")} aria-hidden />
      <span className="font-mono text-code">{row.id}</span>
      <span className="sr-only">details</span>
    </button>
  );
}

/** A setpoint at the sheet's precision, with an edge marker when it sits at or past the range tried. */
export function SetpointText({ row, input, ctx }: { row: PlanRow; input: string; ctx: PlanContext }) {
  const check = row.checks.find((c) => c.input === input);
  const edge = check && check.where !== "inside";
  return (
    <span className={cn("inline-flex items-center gap-1", edge && "text-warn")}>
      {edge ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
      <span className="text-fg">{formatSetpoint(row.recipe[input], ctx.ranges[input]?.decimals)}</span>
      {edge ? <span className="sr-only">{check.where === "below" || check.where === "above" ? "(outside the range tried)" : "(at the edge of the range tried)"}</span> : null}
    </span>
  );
}
