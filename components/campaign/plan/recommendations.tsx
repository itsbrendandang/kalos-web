"use client";

import { Fragment } from "react";
import { Check, ChevronRight, Columns2, TriangleAlert } from "lucide-react";
import type { BatchItem } from "@/components/campaign/plan-batch";
import { MeasuredValue, PredictedValue } from "@/components/campaign/plan/marks";
import { BandStrip, RangeBar } from "@/components/campaign/plan/strips";
import {
  bandLabel,
  constraintPrediction,
  formatInterval,
  formatSetpoint,
  type BoundaryCheck,
  type ObservedRange,
  type RecipeFlag,
  type SetpointValue,
} from "@/components/campaign/plan-view";
import { Badge, ModeBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { ConstraintReport } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One proposed experiment, with everything the page derived for it. */
export type PlanRow = {
  item: BatchItem;
  /** "P1": the displayed id, by rank. */
  id: string;
  recipe: Record<string, SetpointValue>;
  flags: RecipeFlag[];
  checks: BoundaryCheck[];
  gain: number | null;
};

/** What every row shares. */
export type PlanContext = {
  target: string;
  unit: string;
  /** The engine's `proposal_features`: one column each. */
  features: string[];
  /** Every other input any recipe sets, A-Z: shown in Details. */
  others: string[];
  ranges: Record<string, ObservedRange>;
  band: number | null;
  coverage: number | undefined;
  incumbent: number | null;
  incumbentLabel: string;
  domain: [number, number] | null;
  constraint: ConstraintReport | null | undefined;
};

export type RowState = {
  included: boolean;
  onInclude: () => void;
  compared: boolean;
  /** Disabled when five are already selected for comparison. */
  compareDisabled: boolean;
  onCompare: () => void;
  expanded: boolean;
  onExpand: () => void;
};

const MODE_HINT = { exploit: "high predicted value", explore: "chosen to learn" } as const;

function Flags({ flags, compact = false }: { flags: RecipeFlag[]; compact?: boolean }) {
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

function CompareToggle({ row, state }: { row: PlanRow; state: RowState }) {
  return (
    <button
      type="button"
      aria-pressed={state.compared}
      disabled={!state.compared && state.compareDisabled}
      onClick={state.onCompare}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-label whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-fg-muted",
        state.compared ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-fg hover:bg-subtle",
      )}
    >
      {state.compared ? <Check className="size-4" aria-hidden /> : <Columns2 className="size-4" aria-hidden />}
      <span>Compare</span>
      <span className="sr-only"> {row.id}</span>
    </button>
  );
}

function ExpandButton({ row, state, controls }: { row: PlanRow; state: RowState; controls: string }) {
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

function PredictedCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const p = row.item.proposal;
  const interval = formatInterval(p.pred, ctx.band);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <PredictedValue value={formatNumber(p.pred)} hideLabel className="text-label" />
      <span className="text-caption text-fg-muted tabular-nums whitespace-nowrap">
        {interval ?? "no band reported"}
      </span>
    </div>
  );
}

function GainCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const p = row.item.proposal;
  return (
    <div className="flex min-w-[120px] flex-col gap-0.5">
      {ctx.domain ? <BandStrip pred={p.pred} band={ctx.band} best={ctx.incumbent} domain={ctx.domain} /> : null}
      <span className="text-caption text-fg-muted tabular-nums">
        {row.gain == null ? "no best to compare" : `${formatNumber(row.gain, "value", { sign: true })} predicted vs best`}
      </span>
    </div>
  );
}

/** Desktop (container >= 56rem): one row per proposal, details expand beneath. */
export function RecommendationsTable({ rows, ctx, state }: { rows: PlanRow[]; ctx: PlanContext; state: (row: PlanRow) => RowState }) {
  const cols = 6 + ctx.features.length + (ctx.others.length ? 1 : 0);
  return (
    <div className="relative overflow-x-auto" data-scroll-x>
      <table className="w-full text-body">
        <caption className="sr-only">
          Model-generated proposals for {ctx.target}, sorted by predicted value. Predicted values are not measurements.
        </caption>
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th scope="col" className="h-10 w-10 px-2 text-left font-medium">
              Run
            </th>
            <th scope="col" className="h-10 px-2 text-left font-medium">
              Proposal
            </th>
            {ctx.features.map((f) => (
              <th key={f} scope="col" className="h-10 px-2 text-right font-medium whitespace-nowrap">
                {f}
              </th>
            ))}
            {ctx.others.length ? (
              <th scope="col" className="h-10 px-2 text-right font-medium whitespace-nowrap">
                Other inputs
              </th>
            ) : null}
            <th scope="col" className="h-10 px-2 text-right font-medium whitespace-nowrap">
              Predicted{ctx.unit ? ` (${ctx.unit})` : ""}
              <span className="block text-caption font-normal">{ctx.band != null ? bandLabel(ctx.coverage) : "\u00a0"}</span>
            </th>
            <th scope="col" className="h-10 px-2 text-left font-medium whitespace-nowrap">
              vs {ctx.incumbent != null ? <MeasuredValue value={formatNumber(ctx.incumbent)} label="best measured" className="text-label" /> : "best measured"}
            </th>
            <th scope="col" className="h-10 px-2 text-left font-medium">
              Checks
            </th>
            <th scope="col" className="h-10 px-2 text-right font-medium">
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
                <tr className={cn("border-b border-border align-top", s.expanded && "border-b-0 bg-subtle", !s.included && "text-fg-muted")}>
                  <td className="px-2 py-2.5">
                    <Checkbox checked={s.included} onChange={s.onInclude} aria-label={`Run ${row.id}`} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <ExpandButton row={row} state={s} controls={detailsId} />
                      <ModeBadge mode={row.item.proposal.mode} />
                    </div>
                  </td>
                  {ctx.features.map((f) => (
                    <td key={f} className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                      <SetpointText row={row} input={f} ctx={ctx} />
                    </td>
                  ))}
                  {ctx.others.length ? (
                    <td className="px-2 py-3 text-right text-caption text-fg-muted whitespace-nowrap">
                      {ctx.others.filter((k) => k in row.recipe).length} in details
                    </td>
                  ) : null}
                  <td className="px-2 py-2.5 text-right">
                    <PredictedCell row={row} ctx={ctx} />
                  </td>
                  <td className="px-2 py-2.5">
                    <GainCell row={row} ctx={ctx} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Flags flags={row.flags} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <CompareToggle row={row} state={s} />
                  </td>
                </tr>
                {s.expanded ? (
                  <tr className="border-b border-border bg-subtle">
                    <td colSpan={cols} id={detailsId} className="px-4 pt-1 pb-5 sm:pl-12">
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

/** A setpoint at the sheet's precision, with an edge marker when it sits at or past the range tried. */
function SetpointText({ row, input, ctx }: { row: PlanRow; input: string; ctx: PlanContext }) {
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

/** Narrow containers: one card per proposal. */
export function RecommendationCards({ rows, ctx, state }: { rows: PlanRow[]; ctx: PlanContext; state: (row: PlanRow) => RowState }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const s = state(row);
        const p = row.item.proposal;
        const detailsId = `plan-details-c-${row.id}`;
        const interval = formatInterval(p.pred, ctx.band);
        return (
          <li key={row.id} className={cn("rounded-xl border bg-surface", s.compared ? "border-accent" : "border-border")}>
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
              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <PredictedValue value={formatNumber(p.pred)} unit={ctx.unit || undefined} className="text-heading" />
                  <span className="text-caption text-fg-muted tabular-nums">
                    {interval ? `${bandLabel(ctx.coverage)} ${interval}` : "no prediction band reported"}
                  </span>
                </div>
                {ctx.domain ? <BandStrip pred={p.pred} band={ctx.band} best={ctx.incumbent} domain={ctx.domain} /> : null}
                {row.gain != null && ctx.incumbent != null ? (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-fg-muted tabular-nums">
                    {formatNumber(row.gain, "value", { sign: true })} predicted vs
                    <MeasuredValue value={formatNumber(ctx.incumbent)} label="best measured" />
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

const WHERE_TEXT: Record<BoundaryCheck["where"], string> = {
  below: "Below the range tried",
  "at-min": "At the low edge",
  inside: "",
  "at-max": "At the high edge",
  above: "Above the range tried",
};

/** Everything real the engine said about one proposal, plus where each setpoint sits in its range. */
export function RecipeDetails({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const p = row.item.proposal;
  const keys = [...ctx.features.filter((f) => f in row.recipe), ...ctx.others.filter((k) => k in row.recipe)];
  const missing = keys.filter((k) => !ctx.ranges[k] && typeof row.recipe[k] === "number");
  const interval = formatInterval(p.pred, ctx.band);
  const c = constraintPrediction(p, ctx.constraint);
  return (
    <div className="grid gap-x-8 gap-y-5 pt-2 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label={`Setpoints of ${row.id}`}>
        <h3 className="text-label text-fg">Setpoints</h3>
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {keys.map((k) => {
            const v = row.recipe[k];
            const check = row.checks.find((x) => x.input === k);
            const range = ctx.ranges[k];
            return (
              <li key={k} className="flex flex-col gap-1 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-body text-fg-muted">{k}</span>
                  <span className="text-body text-fg tabular-nums">
                    {typeof v === "number" ? String(v) : v}
                    <span className="sr-only"> proposed</span>
                  </span>
                </div>
                {range && check ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RangeBar check={check} />
                    <span className="text-caption text-fg-muted tabular-nums">
                      {range.source === "observed"
                        ? `tried ${formatSetpoint(range.min, range.decimals)} to ${formatSetpoint(range.max, range.decimals)} in ${formatNumber(range.n, "count")} runs`
                        : `engine range ${formatNumber(range.min)} to ${formatNumber(range.max)}`}
                    </span>
                    {check.where !== "inside" ? (
                      <span className="inline-flex items-center gap-1 text-caption text-warn">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        {WHERE_TEXT[check.where]}
                      </span>
                    ) : null}
                  </div>
                ) : typeof v === "number" ? (
                  <span className="text-caption text-fg-muted">Range tried not reported</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-caption text-fg-muted">
          Values are exactly as the engine proposed them. Ranges are the lowest and highest values in the measured runs the engine returned
          {missing.length ? `; it returns none for ${missing.join(", ")}, so their edges are not checked` : ""}.
        </p>
      </section>

      <section aria-label={`Prediction for ${row.id}`} className="flex flex-col gap-4">
        <div>
          <h3 className="text-label text-fg">Prediction</h3>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body">
            <dt className="text-fg-muted">{ctx.target}</dt>
            <dd>
              <PredictedValue value={formatNumber(p.pred)} unit={ctx.unit || undefined} />
            </dd>
            <dt className="text-fg-muted">{bandLabel(ctx.coverage)}</dt>
            <dd className="tabular-nums">
              {interval ? (
                <>
                  {interval}
                  <span className="block text-caption text-fg-muted">± {formatNumber(ctx.band)}, one width the engine reports for the whole batch</span>
                </>
              ) : (
                <span className="text-fg-muted">Not reported by the engine</span>
              )}
            </dd>
            <dt className="text-fg-muted">Model SD</dt>
            <dd className="tabular-nums">
              {formatNumber(p.std)}
              <span className="block text-caption text-fg-muted">The model&apos;s own spread. Judge the prediction by the band, not this.</span>
            </dd>
            {row.gain != null && ctx.incumbent != null ? (
              <>
                <dt className="text-fg-muted">vs best</dt>
                <dd className="tabular-nums">
                  {formatNumber(row.gain, "value", { sign: true })} vs <MeasuredValue value={formatNumber(ctx.incumbent)} label={ctx.incumbentLabel} />
                </dd>
              </>
            ) : null}
            {p.p_feasible != null ? (
              <>
                <dt className="text-fg-muted">Chance it produces</dt>
                <dd className="tabular-nums">{formatNumber(p.p_feasible, "pct")} (engine estimate)</dd>
              </>
            ) : null}
            {c && ctx.constraint?.column ? (
              <>
                <dt className="text-fg-muted">{ctx.constraint.column}</dt>
                <dd>
                  <PredictedValue value={`${formatNumber(c.mean)}${c.std != null ? ` ± ${formatNumber(c.std)} SD` : ""}`} />
                </dd>
              </>
            ) : null}
          </dl>
        </div>

        <div>
          <h3 className="text-label text-fg">Why the engine proposed it</h3>
          <p className="mt-1 text-body text-fg">
            {p.mode === "exploit" ? "Exploit: the model expects a high value here." : "Explore: chosen to learn where the model is unsure, or to spread the batch out."}
          </p>
          <p className="mt-1 text-caption text-fg-muted">
            Engine note, verbatim (± there is the model SD): <span className="font-mono">{p.reason}</span>
          </p>
        </div>

        {row.flags.length ? (
          <div>
            <h3 className="text-label text-fg">Checks</h3>
            <ul className="mt-1 flex flex-col gap-1.5">
              {row.flags.map((f) => (
                <li key={f.kind} className="flex items-start gap-2 text-body text-fg">
                  <TriangleAlert className="mt-1 size-3.5 shrink-0 text-warn" aria-hidden />
                  {f.detail}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
