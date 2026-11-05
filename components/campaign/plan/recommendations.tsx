"use client";

import { Fragment } from "react";
import { PredictedMark, MeasuredValue } from "@/components/campaign/plan/marks";
import { BAND_CAVEAT, bandLabel, formatGain, formatInterval } from "@/components/campaign/plan-view";
import { Checkbox } from "@/components/ui/checkbox";
import { ModeBadge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RecipeDetails } from "@/components/campaign/plan/recipe-details";
import { CompareToggle, ExpandButton, Flags, SetpointText } from "@/components/campaign/plan/row-parts";
import type { PlanContext, PlanRow, SetRowState } from "@/components/campaign/plan/types";

/**
 * Desktop (container >= 56rem): one row per proposal, 40px-class rows with
 * right-aligned tabular numerics and a sticky header. Details expand beneath
 * the row. Predicted and gain are the two numbers the eye needs; the band sits
 * under the prediction in caption type.
 */
export function RecommendationsTable({ rows, ctx, state }: { rows: PlanRow[]; ctx: PlanContext; state: SetRowState }) {
  const cols = 6 + ctx.features.length + (ctx.others.length ? 1 : 0);
  return (
    <div className="relative max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-border" data-scroll-x>
      <table className="w-full border-separate border-spacing-0 text-body">
        <caption className="sr-only">Model-generated proposals for {ctx.target}, sorted by predicted value. Predicted values are not measurements.</caption>
        <thead>
          <tr className="text-label text-fg-muted">
            <th scope="col" className="sticky top-0 z-10 h-10 w-10 border-b border-border bg-surface px-2 text-left font-medium">
              <span className="sr-only">Include</span>
            </th>
            <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-left font-medium">
              Proposal
            </th>
            {ctx.features.map((f) => (
              <th key={f} scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-right font-medium whitespace-nowrap">
                {f}
              </th>
            ))}
            {ctx.others.length ? (
              <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-right font-medium whitespace-nowrap">
                Other inputs
              </th>
            ) : null}
            <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-right font-medium whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5">
                <PredictedMark />
                Predicted{ctx.unit ? ` (${ctx.unit})` : ""}
              </span>
              <span className="block text-caption font-normal" title={ctx.band != null ? BAND_CAVEAT : undefined}>
                {ctx.band != null ? bandLabel(ctx.coverage) : "\u00a0"}
              </span>
            </th>
            <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-right font-medium whitespace-nowrap">
              Gain over best
              <span className="block text-caption font-normal">
                {ctx.incumbent != null ? <MeasuredValue value={formatNumber(ctx.incumbent)} label={ctx.incumbentLabel} className="text-caption" /> : ctx.incumbentLabel}
              </span>
            </th>
            <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-left font-medium">
              Checks
            </th>
            <th scope="col" className="sticky top-0 z-10 h-10 border-b border-border bg-surface px-2 text-right font-medium">
              <span className="sr-only">Compare</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const s = state(row);
            const detailsId = `plan-details-t-${row.id}`;
            return (
              <Fragment key={row.id}>
                <tr className={cn("align-top", s.expanded ? "bg-subtle" : "hover:bg-subtle", !s.included && "text-fg-muted")}>
                  <td className="border-b border-border px-2 py-2">
                    <Checkbox checked={s.included} onChange={s.onInclude} aria-label={`Run ${row.id}`} />
                  </td>
                  <td className="border-b border-border px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <ExpandButton row={row} state={s} controls={detailsId} />
                      <ModeBadge mode={row.item.proposal.mode} />
                    </div>
                  </td>
                  {ctx.features.map((f) => (
                    <td key={f} className="border-b border-border px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                      <SetpointText row={row} input={f} ctx={ctx} />
                    </td>
                  ))}
                  {ctx.others.length ? (
                    <td className="border-b border-border px-2 py-2.5 text-right text-caption whitespace-nowrap text-fg-muted tabular-nums">
                      {ctx.others.filter((k) => k in row.recipe).length} in details
                    </td>
                  ) : null}
                  <td className="border-b border-border px-2 py-2 text-right">
                    <PredictionCell row={row} ctx={ctx} />
                  </td>
                  <td className="border-b border-border px-2 py-2 text-right">
                    <GainCell row={row} />
                  </td>
                  <td className="border-b border-border px-2 py-2">
                    <Flags flags={row.flags} />
                  </td>
                  <td className="border-b border-border px-2 py-2 text-right">
                    <CompareToggle row={row} state={s} />
                  </td>
                </tr>
                {s.expanded ? (
                  <tr className="bg-subtle">
                    <td colSpan={cols} id={detailsId} className="border-b border-border px-4 pt-1 pb-5 sm:pl-12">
                      <RecipeDetails row={row} ctx={ctx} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The predicted value, right-aligned, with its band beneath. Shared by the table and the cards' details. */
export function PredictionCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const p = row.item.proposal;
  const interval = formatInterval(p.pred, ctx.band);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-medium text-fg tabular-nums">{formatNumber(p.pred)}</span>
      <span className="text-caption whitespace-nowrap text-fg-muted tabular-nums">{interval ?? "no band reported"}</span>
    </div>
  );
}

function GainCell({ row }: { row: PlanRow }) {
  if (row.gain == null) return <span className="text-caption text-fg-muted">no best to compare</span>;
  return <span className="text-fg tabular-nums">{formatGain(row.gain)}</span>;
}
