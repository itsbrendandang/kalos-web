"use client";

import { TriangleAlert } from "lucide-react";
import { MeasuredValue, PredictedValue } from "@/components/campaign/plan/marks";
import { RangeBar } from "@/components/campaign/plan/strips";
import { BAND_CAVEAT, bandLabel, bandSentence, constraintPrediction, exactSetpoint, formatGain, formatInterval, formatSetpoint, type BoundaryCheck } from "@/components/campaign/plan-view";
import { Disclosure } from "@/components/kit/disclosure";
import { WhyLine } from "@/components/kit/why-line";
import { formatNumber } from "@/lib/format";
import type { PlanContext, PlanRow } from "@/components/campaign/plan/types";

const WHERE_TEXT: Record<BoundaryCheck["where"], string> = {
  below: "Below what you have tried",
  "at-min": "At the low edge",
  inside: "",
  "at-max": "At the high edge",
  above: "Above what you have tried",
};

/**
 * Everything the engine said about one recipe, and where each of its values
 * sits in its range. Plain words first; the engine's own note is kept verbatim
 * one click down.
 */
export function RecipeDetails({ row, ctx }: { row: PlanRow; ctx: PlanContext }) {
  const p = row.item.proposal;
  const keys = [...ctx.features.filter((f) => f in row.recipe), ...ctx.others.filter((k) => k in row.recipe)];
  const missing = keys.filter((k) => !ctx.ranges[k] && typeof row.recipe[k] === "number");
  const interval = formatInterval(p.pred, ctx.band);
  const c = constraintPrediction(p, ctx.constraint);
  return (
    <div className="grid gap-x-8 gap-y-5 pt-2 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label={`Recipe ${row.id}`}>
        <h3 className="text-label text-fg">Recipe</h3>
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
                        ? `tried ${formatSetpoint(range.min, range.decimals)} to ${formatSetpoint(range.max, range.decimals)} in ${formatNumber(range.n, "count")} runs`
                        : `allowed range ${formatNumber(range.min)} to ${formatNumber(range.max)}`}
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
          Values are exactly what Start sends; the table rounds them to the sheet&apos;s precision. Tried ranges are the lowest and highest values in the measured runs
          {missing.length ? `. No range is reported for ${missing.join(", ")}, so their edges are not checked` : ""}.
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
                  <span className="block text-caption text-fg-muted">
                    ± {formatNumber(ctx.band)}, one width for every recipe this round. {bandSentence(ctx.coverage) ?? BAND_CAVEAT}
                  </span>
                </>
              ) : (
                <span className="text-fg-muted">Not reported</span>
              )}
            </dd>
            {row.gain != null && ctx.incumbent != null ? (
              <>
                <dt className="text-fg-muted">Over best</dt>
                <dd className="tabular-nums">
                  {formatGain(row.gain)} over <MeasuredValue value={formatNumber(ctx.incumbent)} label={ctx.incumbentLabel} />
                </dd>
              </>
            ) : null}
            {p.p_feasible != null ? (
              <>
                <dt className="text-fg-muted">Chance it works</dt>
                <dd className="tabular-nums">{formatNumber(p.p_feasible, "pct")}</dd>
              </>
            ) : null}
            {c && ctx.constraint?.column ? (
              <>
                <dt className="text-fg-muted">{ctx.constraint.column}</dt>
                <dd>
                  <PredictedValue value={formatNumber(c.mean)} />
                </dd>
              </>
            ) : null}
          </dl>
          <Disclosure summary={<span className="text-caption text-fg-muted">How sure the model is here</span>} className="mt-2 border-t-0 [&>summary]:py-1">
            <p className="text-caption text-fg-muted tabular-nums">
              Model spread (posterior SD) {formatNumber(p.std)}{c?.std != null && ctx.constraint?.column ? `; ${ctx.constraint.column} ± ${formatNumber(c.std)} SD` : ""}. The model&apos;s own
              spread; judge the prediction by the likely range, not this.
            </p>
          </Disclosure>
        </div>

        <div>
          <h3 className="text-label text-fg">Why it was proposed</h3>
          <p className="mt-1 text-body text-fg">
            {p.mode === "exploit" ? "Best bet: the model expects a high value here." : "New ground: chosen to learn where the model is unsure, or to spread the round out."}
          </p>
          <Disclosure summary={<span className="text-caption text-fg-muted">As Kalos wrote it</span>} className="mt-2 border-t-0 [&>summary]:py-1">
            <p className="font-mono text-code break-words text-fg-muted">{p.reason}</p>
          </Disclosure>
        </div>

        {row.flags.length ? (
          <div>
            <h3 className="text-label text-fg">Checks</h3>
            <ul className="mt-1 flex flex-col gap-1.5">
              {row.flags.map((f) => (
                <li key={f.kind} className="flex items-start gap-2 text-body text-fg">
                  <TriangleAlert className="mt-1 size-3.5 shrink-0 text-warn" aria-hidden />
                  <span className="min-w-0">
                    {f.detail}
                    <WhyLine code={f.kind} className="text-caption" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
