"use client";

import { ChevronRight } from "lucide-react";
import { PredictedValue, MeasuredValue } from "@/components/campaign/plan/marks";
import { bandLabel, formatGain, formatInterval } from "@/components/campaign/plan-view";
import { Checkbox } from "@/components/ui/checkbox";
import { ModeBadge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RecipeDetails } from "@/components/campaign/plan/recipe-details";
import { CompareToggle, Flags, MODE_HINT, SetpointText } from "@/components/campaign/plan/row-parts";
import type { PlanContext, PlanRow, SetRowState } from "@/components/campaign/plan/types";

/** Narrow containers: one card per recipe, the prediction first and the recipe's values beneath. */
export function RecommendationCards({ rows, ctx, state }: { rows: PlanRow[]; ctx: PlanContext; state: SetRowState }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const s = state(row);
        const p = row.item.proposal;
        const detailsId = `plan-details-c-${row.id}`;
        const interval = formatInterval(p.pred, ctx.band);
        return (
          <li key={row.id} className={cn("overflow-hidden rounded-xl border bg-surface", s.compared ? "border-accent" : "border-border")}>
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={s.included} onChange={s.onInclude} aria-label={`Run ${row.id}`} />
                <span className="font-mono text-code text-fg">{row.id}</span>
                <ModeBadge mode={p.mode} />
                <span className="hidden text-caption text-fg-muted min-[420px]:inline">{MODE_HINT[p.mode]}</span>
                <span className="ml-auto">
                  <CompareToggle row={row} state={s} />
                </span>
              </div>
              <dl className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-4 gap-y-2">
                {ctx.features.map((f) => (
                  <div key={f} className="min-w-0">
                    <dt className="truncate text-caption text-fg-muted">{f}</dt>
                    <dd className="text-body tabular-nums">
                      <SetpointText row={row} input={f} ctx={ctx} />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-3">
                <PredictedValue value={formatNumber(p.pred)} unit={ctx.unit || undefined} className="text-heading" />
                <span className="text-caption text-fg-muted tabular-nums">{interval ? `${bandLabel(ctx.coverage).toLowerCase()} ${interval}` : "no likely range reported"}</span>
                {row.gain != null && ctx.incumbent != null ? (
                  <p className="flex w-full flex-wrap items-center gap-x-1.5 text-caption text-fg-muted tabular-nums">
                    {formatGain(row.gain)} over
                    <MeasuredValue value={formatNumber(ctx.incumbent)} label={ctx.incumbentLabel} />
                  </p>
                ) : null}
              </div>
              {row.flags.length ? <Flags flags={row.flags} compact /> : null}
              <button
                type="button"
                aria-expanded={s.expanded}
                aria-controls={detailsId}
                onClick={s.onExpand}
                className="-mx-1 inline-flex h-8 w-fit items-center gap-1.5 rounded-lg px-1 text-label text-fg hover:bg-subtle"
              >
                <ChevronRight className={cn("size-4 text-fg-muted transition-transform", s.expanded && "rotate-90")} aria-hidden />
                Details<span className="sr-only"> for {row.id}</span>
              </button>
            </div>
            {s.expanded ? (
              <div id={detailsId} className="border-t border-border bg-subtle p-3 sm:p-4">
                <RecipeDetails row={row} ctx={ctx} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
