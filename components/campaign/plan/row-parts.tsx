"use client";

import { Check, ChevronRight, Columns2, TriangleAlert } from "lucide-react";
import type { FlagKind, RecipeFlag } from "@/components/campaign/plan-view";
import { formatSetpoint } from "@/components/campaign/plan-view";
import { cn } from "@/lib/utils";
import type { PlanContext, PlanRow, RowState } from "@/components/campaign/plan/types";

/** What each kind of bet means, in plain words, for the card layout. */
export const MODE_HINT = { exploit: "the model expects a high value", explore: "run to learn from" } as const;

/**
 * The warnings for one recipe, as plain words naming every input they concern. A flag every recipe of the
 * round carries (`shared`) is said once above the table and not repeated here. The full sentence is the
 * title and in Details.
 */
export function Flags({ flags, compact = false, shared }: { flags: RecipeFlag[]; compact?: boolean; shared?: ReadonlySet<FlagKind> }) {
  const own = flags.filter((f) => !shared?.has(f.kind));
  if (flags.length === 0) return <span className="text-caption text-fg-muted">None</span>;
  if (own.length === 0) return <span className="text-caption text-fg-muted">As every recipe (see Before you start)</span>;
  return (
    <ul className={cn("flex min-w-[14rem] flex-col gap-1", compact && "min-w-0 items-start")}>
      {own.map((f) => (
        <li key={f.kind} className="flex items-start gap-1.5 text-caption text-warn" title={f.detail}>
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{f.label}</span>
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

/** One value of the recipe at the sheet's precision, with an edge marker when it sits at or past what has been tried. */
export function SetpointText({ row, input, ctx }: { row: PlanRow; input: string; ctx: PlanContext }) {
  const check = row.checks.find((c) => c.input === input);
  const edge = check && check.where !== "inside";
  return (
    <span className={cn("inline-flex items-center gap-1", edge && "text-warn")}>
      {edge ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
      <span className="text-fg">{formatSetpoint(row.recipe[input], ctx.ranges[input]?.decimals)}</span>
      {edge ? <span className="sr-only">{check.where === "below" || check.where === "above" ? "(outside what you have tried)" : "(at the edge of what you have tried)"}</span> : null}
    </span>
  );
}
