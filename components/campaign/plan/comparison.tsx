"use client";

import type { ReactNode, Ref } from "react";
import { X } from "lucide-react";
import { MeasuredMark, PredictedMark } from "@/components/campaign/plan/marks";
import type { PlanContext, PlanRow } from "@/components/campaign/plan/recommendations";
import { bandLabel, compareRecipes, formatInterval, formatSetpoint, COMPARE_MIN, type ComparisonRow, type ObservedRange } from "@/components/campaign/plan-view";
import { ModeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = { key: string; label: ReactNode; values: string[]; tone?: (i: number) => string | undefined; note?: string };

/**
 * 2-5 proposals side by side. Setpoint rows where the proposals differ at the
 * sheet's precision are marked "differs" (word + tint, never tint alone), with
 * the highest and lowest value marked, and the spread as a share of the range
 * tried when that range is known. Wide containers get a table; narrow ones a
 * list with one block per input, so nothing scrolls sideways on a phone.
 */
export function Comparison({
  rows,
  ctx,
  onRemove,
  onClear,
  headingRef,
}: {
  rows: PlanRow[];
  ctx: PlanContext;
  onRemove: (rank: number) => void;
  onClear: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const keys = [...ctx.features, ...ctx.others.filter((k) => rows.some((r) => k in r.recipe))];
  const diff = compareRecipes(
    rows.map((r) => r.recipe),
    keys,
    ctx.ranges,
  );
  const nDiff = diff.filter((d) => d.differs).length;
  const outcome: Line[] = [
    { key: "pred", label: <><PredictedMark /> Predicted {ctx.target}</>, values: rows.map((r) => formatNumber(r.item.proposal.pred)), note: "model estimate, not a measurement" },
    { key: "band", label: bandLabel(ctx.coverage), values: rows.map((r) => formatInterval(r.item.proposal.pred, ctx.band) ?? "not reported"), note: ctx.band != null ? "same width for every proposal" : undefined },
    ...(ctx.incumbent != null
      ? [{ key: "gain", label: <>vs <MeasuredMark /> best {formatNumber(ctx.incumbent)}</>, values: rows.map((r) => formatNumber(r.gain, "value", { sign: true })), note: "predicted minus measured" }]
      : []),
    { key: "checks", label: "Checks", values: rows.map((r) => (r.flags.length ? `${r.flags.length} to review` : "none")), tone: (i: number) => (rows[i].flags.length ? "text-warn" : undefined) },
  ];
  const removable = rows.length > COMPARE_MIN;

  return (
    <section aria-labelledby="plan-compare-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="plan-compare-title" ref={headingRef} tabIndex={-1} className="text-heading text-fg outline-none">
            Compare {rows.map((r) => r.id).join(", ")}
          </h2>
          <p className="text-body text-fg-muted">
            {nDiff === 0
              ? "These proposals set every input to the same value at the sheet's precision."
              : `${formatNumber(nDiff, "count")} of ${formatNumber(diff.length, "count")} inputs differ at the sheet's precision. \u2191 marks the highest and \u2193 the lowest of those compared.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear comparison
        </Button>
      </div>

      {/* Narrow: one block per input. */}
      <div className="flex flex-col gap-2 @2xl:hidden">
        <ul className="flex flex-wrap gap-2" aria-label="Proposals in the comparison">
          {rows.map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border py-0.5 pr-0.5 pl-2">
              <span className="font-mono text-code text-fg">{r.id}</span>
              <span className="text-caption text-fg-muted">{r.item.proposal.mode}</span>
              {removable ? <RemoveButton row={r} onRemove={onRemove} /> : <span className="w-1" />}
            </li>
          ))}
        </ul>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {diff.map((d) => (
            <li key={d.key} className={cn("flex flex-col gap-1.5 p-3", d.differs && "bg-accent-soft")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-body text-fg">
                  {d.key} <DiffWord d={d} />
                </span>
                <span className="text-caption text-fg-muted tabular-nums">{rangeText(d.range)}</span>
              </div>
              <Values ids={rows.map((r) => r.id)} values={d.shown} mark={(i) => mark(d, i)} muted={!d.differs} />
              {d.differs && d.spread != null ? <span className="text-caption text-fg-muted tabular-nums">Spread {spreadText(d)}</span> : null}
            </li>
          ))}
          {outcome.map((o) => (
            <li key={o.key} className="flex flex-col gap-1.5 p-3">
              <span className="inline-flex items-center gap-1.5 text-body text-fg">{o.label}</span>
              <Values ids={rows.map((r) => r.id)} values={o.values} tone={o.tone} />
              {o.note ? <span className="text-caption text-fg-muted">{o.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Wide: a table. */}
      <div className="relative hidden overflow-x-auto rounded-lg border border-border @2xl:block" data-scroll-x>
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-left text-label font-normal text-fg-muted">
                Input
              </th>
              {rows.map((r) => (
                <th key={r.id} scope="col" className="px-3 py-2 text-right align-bottom">
                  <span className="flex items-center justify-end gap-1">
                    <span className="font-mono text-code text-fg">{r.id}</span>
                    {removable ? <RemoveButton row={r} onRemove={onRemove} /> : null}
                  </span>
                  <span className="mt-1 flex justify-end">
                    <ModeBadge mode={r.item.proposal.mode} />
                  </span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-left text-label font-normal whitespace-nowrap text-fg-muted">
                Spread
              </th>
              <th scope="col" className="px-3 py-2 text-left text-label font-normal whitespace-nowrap text-fg-muted">
                Range tried
              </th>
            </tr>
          </thead>
          <tbody>
            {diff.map((d) => (
              <tr key={d.key} className={cn("border-b border-border", d.differs && "bg-accent-soft")}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="text-fg">{d.key}</span> <DiffWord d={d} />
                </th>
                {d.shown.map((v, i) => (
                  <td key={rows[i].id} className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap", d.differs ? "text-fg" : "text-fg-muted")}>
                    {v}
                    {mark(d, i)}
                  </td>
                ))}
                <td className="px-3 py-2 text-left text-caption whitespace-nowrap text-fg-muted tabular-nums">{d.differs && d.spread != null ? spreadText(d) : "\u2013"}</td>
                <td className="px-3 py-2 text-left text-caption whitespace-nowrap text-fg-muted tabular-nums">{rangeText(d.range, false)}</td>
              </tr>
            ))}
            {outcome.map((o, n) => (
              <tr key={o.key} className={cn(n < outcome.length - 1 && "border-b border-border")}>
                <th scope="row" className="px-3 py-2 text-left font-normal text-fg">
                  <span className="inline-flex items-center gap-1.5">{o.label}</span>
                </th>
                {o.values.map((v, i) => (
                  <td key={rows[i].id} className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap", o.tone?.(i) ?? "text-fg")}>
                    {v}
                  </td>
                ))}
                <td colSpan={2} className="px-3 py-2 text-caption text-fg-muted">
                  {o.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RemoveButton({ row, onRemove }: { row: PlanRow; onRemove: (rank: number) => void }) {
  return (
    <button type="button" onClick={() => onRemove(row.item.rank)} className="grid size-6 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg">
      <X className="size-3.5" aria-hidden />
      <span className="sr-only">Remove {row.id} from comparison</span>
    </button>
  );
}

function DiffWord({ d }: { d: ComparisonRow }) {
  return <span className={cn("text-caption", d.differs ? "text-accent" : "text-fg-muted")}>{d.differs ? "differs" : "same"}</span>;
}

function mark(d: ComparisonRow, i: number): ReactNode {
  const high = d.highest.includes(i);
  const low = d.lowest.includes(i);
  if (!high && !low) return null;
  return (
    <span className="ml-1 text-caption text-fg-muted">
      <span aria-hidden>{high ? "\u2191" : "\u2193"}</span>
      <span className="sr-only">{high ? "highest" : "lowest"}</span>
    </span>
  );
}

function Values({ ids, values, mark: markFn, muted = false, tone }: { ids: string[]; values: string[]; mark?: (i: number) => ReactNode; muted?: boolean; tone?: (i: number) => string | undefined }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-x-3 gap-y-1">
      {values.map((v, i) => (
        <div key={ids[i]} className="min-w-0">
          <dt className="font-mono text-caption text-fg-muted">{ids[i]}</dt>
          <dd className={cn("text-body tabular-nums", tone?.(i) ?? (muted ? "text-fg-muted" : "text-fg"))}>
            {v}
            {markFn?.(i)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function spreadText(d: ComparisonRow): string {
  return `${formatSetpoint(d.spread, d.range?.decimals)}${d.spreadOfRange != null ? ` (${formatNumber(d.spreadOfRange, "pct")} of range)` : ""}`;
}

function rangeText(range: ObservedRange | null, prefix = true): string {
  if (!range) return prefix ? "range not reported" : "not reported";
  return range.source === "observed"
    ? `${prefix ? "tried " : ""}${formatSetpoint(range.min, range.decimals)} to ${formatSetpoint(range.max, range.decimals)}`
    : `${prefix ? "engine range " : ""}${formatNumber(range.min)} to ${formatNumber(range.max)}${prefix ? "" : " (engine)"}`;
}
