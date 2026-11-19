"use client";

import { Fragment } from "react";
import { Check, ChevronRight, Columns2, TriangleAlert } from "lucide-react";
import type { BatchItem } from "@/components/campaign/plan-batch";
import { RangeBar } from "@/components/campaign/plan/strips";
import {
  BAND_CAVEAT,
  bandLabel,
  exactSetpoint,
  constraintPrediction,
  formatSetpoint,
  type BoundaryCheck,
  type ObservedRange,
  type RecipeFlag,
  type SetpointValue,
} from "@/components/campaign/plan-view";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Num } from "@/components/viz/num";
import type { ConstraintReport } from "@/lib/api";
import { conformalInterval, formatProb, formatValue, type Formatted } from "@/lib/num";
import type { Source } from "@/lib/source";
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
  /** From the target header "(g/L)"; null when it names none (never invented). */
  unit: string | null;
  /** The engine's `proposal_features`: one column each. */
  features: string[];
  /** Every other input any recipe sets, A-Z: shown in Details. */
  others: string[];
  ranges: Record<string, ObservedRange>;
  band: number | null;
  coverage: number | null;
  incumbent: number | null;
  incumbentLabel: string;
  constraint: ConstraintReport | null | undefined;
  /** `proposal_gating.gated`; p_feasible is shown only when true. Null when the engine did not report gating. */
  gated: boolean | null;
  /** The source of a proposal's prediction (proposals[i].pred) for the provenance popover. */
  sourceFor?: (row: PlanRow) => Source;
  /** The source of the incumbent. */
  incumbentSource?: Source;
};

/** A proposal's prediction with the engine's band at its coverage, at the precision the band supports. */
export function predOf(row: PlanRow, ctx: Pick<PlanContext, "band" | "coverage" | "unit">): Formatted {
  const p = row.item.proposal;
  return formatValue(p.pred, { basis: "predicted", unit: ctx.unit, interval: conformalInterval(p.pred, ctx.band, ctx.coverage) });
}

/** Predicted gain over the incumbent (exact `pred - incumbent`), with the band shifted by the same amount. */
export function gainOf(row: PlanRow, ctx: Pick<PlanContext, "band" | "coverage" | "unit" | "incumbent">): Formatted | null {
  if (ctx.incumbent == null) return null;
  const p = row.item.proposal;
  const g = p.pred - ctx.incumbent;
  const iv = conformalInterval(p.pred, ctx.band, ctx.coverage);
  return formatValue(g, { basis: "predicted", unit: ctx.unit, sign: true, interval: iv ? { ...iv, lo: iv.lo - ctx.incumbent, hi: iv.hi - ctx.incumbent } : null });
}

/** The engine's mode, as a word (never a color). */
export function ModeText({ mode, className }: { mode: "explore" | "exploit"; className?: string }) {
  return <span className={cn("text-caption text-fg-muted", className)}>{mode}</span>;
}

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

function CompareToggle({ row, state, iconOnly = false }: { row: PlanRow; state: RowState; iconOnly?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={state.compared}
      title={iconOnly ? `Compare ${row.id}` : undefined}
      disabled={!state.compared && state.compareDisabled}
      onClick={state.onCompare}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-label whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-fg-muted",
        state.compared ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-fg hover:bg-subtle",
      )}
    >
      {state.compared ? <Check className="size-4" aria-hidden /> : <Columns2 className="size-4" aria-hidden />}
      <span className={iconOnly ? "sr-only" : undefined}>Compare</span>
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

/** The prediction at its band's precision (the band itself is the next column), with its source. */
function PredictedCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const f = predOf(row, ctx);
  return <Num value={row.item.proposal.pred} basis="predicted" size="table" options={{ decimals: f.decimals }} source={ctx.sourceFor?.(row)} className="justify-end" />;
}

function BandCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const f = predOf(row, ctx);
  return <span className="text-caption whitespace-nowrap text-fg-muted tabular-nums">{f.interval ?? "n/a"}</span>;
}

function GainCell({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const g = gainOf(row, ctx);
  if (!g) return <span className="text-caption text-fg-muted">n/a (no incumbent)</span>;
  return (
    <span className="flex flex-col items-end whitespace-nowrap tabular-nums">
      <span className="text-fg">{g.value}</span>
      <span className="text-caption text-fg-muted">{g.interval ?? "interval n/a"}</span>
    </span>
  );
}

/** Desktop (container >= 56rem): one row per proposal, details expand beneath. */
export function RecommendationsTable({ rows, ctx, state }: { rows: PlanRow[]; ctx: PlanContext; state: (row: PlanRow) => RowState }) {
  const cols = 7 + ctx.features.length;
  const unit = ctx.unit ? ` (${ctx.unit})` : "";
  return (
    <div className="relative overflow-x-auto" data-scroll-x>
      <table className="w-full text-body">
        <caption className="sr-only">
          Model-generated proposals for {ctx.target}, in the order the engine proposed them. Predicted values are not measurements.
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
            <th scope="col" className="h-10 px-2 text-right font-medium whitespace-nowrap">
              Predicted{unit}
            </th>
            <th scope="col" className="h-10 px-2 text-right font-medium whitespace-nowrap" title={ctx.band != null ? BAND_CAVEAT : undefined}>
              {ctx.band != null ? bandLabel(ctx.coverage) : "Band"}
            </th>
            <th scope="col" className="h-10 px-2 text-right font-medium">
              <span className="whitespace-nowrap">Predicted gain{unit}</span>
              <span className="flex flex-wrap items-baseline justify-end gap-x-1 text-caption font-normal">
                vs {ctx.incumbentLabel}
                {ctx.incumbent != null ? <Num value={ctx.incumbent} basis="measured" size="table" className="text-caption" /> : null}
              </span>
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
                      <ModeText mode={row.item.proposal.mode} />
                    </div>
                    {ctx.others.some((k) => k in row.recipe) ? (
                      <span className="block pl-6 text-caption whitespace-nowrap text-fg-muted">+{ctx.others.filter((k) => k in row.recipe).length} more inputs</span>
                    ) : null}
                  </td>
                  {ctx.features.map((f) => (
                    <td key={f} className="px-2 py-3 text-right tabular-nums whitespace-nowrap">
                      <SetpointText row={row} input={f} ctx={ctx} />
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right">
                    <PredictedCell row={row} ctx={ctx} />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <BandCell row={row} ctx={ctx} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <GainCell row={row} ctx={ctx} />
                  </td>
                  <td className="max-w-44 px-2 py-2.5">
                    <Flags flags={row.flags} compact />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <CompareToggle row={row} state={s} iconOnly />
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
      <span className="text-fg">{formatSetpoint(row.recipe[input], ctx.ranges[input])}</span>
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
        const f = predOf(row, ctx);
        const g = gainOf(row, ctx);
        return (
          <li key={row.id} className={cn("rounded-xl border bg-surface", s.compared ? "border-accent" : "border-border")}>
            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Checkbox checked={s.included} onChange={s.onInclude} aria-label={`Run ${row.id}`} />
                <span className="font-mono text-code text-fg">{row.id}</span>
                <ModeText mode={p.mode} className="text-body" />
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
                  <Num value={p.pred} basis="predicted" unit={ctx.unit} size="body" options={{ decimals: f.decimals }} source={ctx.sourceFor?.(row)} />
                  <span className="text-caption text-fg-muted tabular-nums">{f.interval ? `${f.interval} ${bandLabel(ctx.coverage)}` : "no band reported"}</span>
                </div>
                {g && ctx.incumbent != null ? (
                  <p className="flex flex-wrap items-baseline gap-x-1.5 text-caption text-fg-muted tabular-nums">
                    <span className="text-fg">{g.value}</span>
                    {g.interval ? <span>{g.interval}</span> : null}
                    <span>predicted gain vs {ctx.incumbentLabel}</span>
                    <Num value={ctx.incumbent} basis="measured" unit={ctx.unit} className="text-caption" />
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
  const f = predOf(row, ctx);
  const g = gainOf(row, ctx);
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
                    {exactSetpoint(v)}
                    <span className="sr-only"> proposed</span>
                  </span>
                </div>
                {range && check ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RangeBar check={check} />
                    <span className="text-caption text-fg-muted tabular-nums">
                      {range.source === "observed"
                        ? `tried ${formatSetpoint(range.min, range)} to ${formatSetpoint(range.max, range)} in ${formatValue(range.n, { quantity: "count" }).text} runs`
                        : `search range ${formatSetpoint(range.min, range)} to ${formatSetpoint(range.max, range)}`}
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
          Values are exactly as the engine proposed them and exactly what Start sends; the table rounds them to the precision of each input&apos;s range. Ranges are the engine&apos;s search range, or else the lowest and highest values in the measured runs it returned
          {missing.length ? `; it returns none for ${missing.join(", ")}, so their edges are not checked` : ""}.
        </p>
      </section>

      <section aria-label={`Prediction for ${row.id}`} className="flex flex-col gap-4">
        <div>
          <h3 className="text-label text-fg">Prediction</h3>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body">
            <dt className="text-fg-muted">{ctx.target}</dt>
            <dd>
              <Num value={p.pred} basis="predicted" unit={ctx.unit} options={{ decimals: f.decimals }} source={ctx.sourceFor?.(row)} />
            </dd>
            <dt className="text-fg-muted">{bandLabel(ctx.coverage)}</dt>
            <dd className="tabular-nums">
              {f.interval ? (
                <>
                  {f.interval}
                  <span className="block text-caption text-fg-muted">
                    Half-width {formatValue(ctx.band).text}, one width the engine reports for the whole batch. {BAND_CAVEAT}
                  </span>
                </>
              ) : (
                <span className="text-fg-muted">Not reported by the engine</span>
              )}
            </dd>
            <dt className="text-fg-muted">Model SD</dt>
            <dd className="tabular-nums">
              {formatValue(p.std, { unit: ctx.unit }).text}
              <span className="block text-caption text-fg-muted">The model&apos;s own spread. Judge the prediction by the band, not this.</span>
            </dd>
            {g && ctx.incumbent != null ? (
              <>
                <dt className="text-fg-muted">Predicted gain</dt>
                <dd className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                  {g.value} {g.interval ? <span className="text-caption text-fg-muted">{g.interval}</span> : null}
                  <span className="text-caption text-fg-muted">vs {ctx.incumbentLabel}</span>
                  <Num value={ctx.incumbent} basis="measured" unit={ctx.unit} className="text-caption" source={ctx.incumbentSource} />
                </dd>
              </>
            ) : null}
            {p.p_feasible != null || ctx.gated != null ? (
              <>
                <dt className="text-fg-muted">Engine-estimated feasibility</dt>
                <dd className="tabular-nums">
                  {ctx.gated && p.p_feasible != null ? (
                    formatProb(p.p_feasible).text
                  ) : (
                    <span className="text-fg-muted">n/a ({ctx.gated ? "the engine returned no probability for this recipe" : "batch was not feasibility-gated"})</span>
                  )}
                </dd>
              </>
            ) : null}
            {c && ctx.constraint?.column ? (
              <>
                <dt className="text-fg-muted">{ctx.constraint.column}</dt>
                <dd className="flex flex-wrap items-baseline gap-x-1.5">
                  <Num value={c.mean} basis="predicted" options={{ uncertainty: c.std }} />
                  {c.std != null ? <span className="text-caption text-fg-muted">model SD {formatValue(c.std).text}</span> : null}
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
