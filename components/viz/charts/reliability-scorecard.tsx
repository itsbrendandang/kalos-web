"use client";

import { scaleLinear } from "@visx/scale";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { DerivedDiamond, HitTarget, IntervalBar, MeasuredDot } from "@/components/viz/marks";
import { CircleDashed } from "lucide-react";
import { SourceButton } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatCorr, formatState, formatValue, type NumState } from "@/lib/num";
import type { Source } from "@/lib/source";
import { describeScorecard, rhoText, scorecardTable, sourceFooter, topkLabel, topkText, topkValue, type ScoreRow, type ScorecardData } from "@/lib/viz-data/reliability-scorecard";

const FIELD: Record<ScoreRow["key"], string> = {
  cv: "cv_spearman, cv_ci95, cv_spearman_per_repeat",
  "group-mean": "cv_group_mean_baseline.spearman",
  logo: "cv_logo.spearman",
  producers: "reliability.producer_spearman",
};

/**
 * C8 ReliabilityScorecard: the model's held-out rank agreement (rho, its 95%
 * CI from the engine and one tick per CV repeat) on one axis with the
 * baselines it should beat (muted diamonds: engine statistics with no CI) and
 * the engine's trust floor as a dotted rule. Rows the engine declined to
 * score are listed with its reason, never plotted. Promotion gates live
 * beside it (components/predict/trust-panel.tsx).
 */
export function ReliabilityScorecard({
  data,
  source,
  stale,
  width,
  bare = true,
}: {
  data: ScorecardData;
  source: Source;
  stale?: { nNew: number } | null;
  width?: number;
  bare?: boolean;
}) {
  const insufficient = data.verdict.rho == null;
  const tk = topkText(data.topk);
  // "95%" comes from the engine's ci95 field via formatCorr, never typed here.
  const ciCoverage = data.verdict.ci ? formatCorr(data.verdict.rho, data.verdict.ci).coverage : null;
  const c = (v: number | null) => (v != null ? formatValue(v, { quantity: "count" }).text : null);
  const evidence = [
    data.evidence.n != null ? `${c(data.evidence.n)} rows` : null,
    data.evidence.groups != null ? `${c(data.evidence.groups)} CV groups` : null,
    data.evidence.repeats != null ? `${c(data.evidence.repeats)} ${data.evidence.repeats === 1 ? "repeat" : "repeats"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <ChartFrame
      bare={bare}
      title="Held-out rank agreement"
      subtitle="How well the model orders runs it did not see, against simple baselines and the engine's trust floor."
      state={insufficient ? { kind: "insufficient", text: data.verdict.reason } : { kind: "ready" }}
      stale={stale}
      width={width}
      height={64 + Math.max(1, data.rows.length) * 44}
      description={describeScorecard(data)}
      data={insufficient ? null : scorecardTable(data)}
      legend={
        <>
          <LegendItem mark="measured">
            Model ρ{ciCoverage ? ` with its ${ciCoverage} CI from the engine` : ""}
            {data.rows[0]?.repeats.length ? "; ticks: one per CV repeat" : ""}
          </LegendItem>
          {data.rows.length > 1 ? <LegendItem mark="derived">Baseline or subset ρ (no CI reported)</LegendItem> : null}
          {data.floor != null ? <LegendItem mark="reference">Trust floor (engine)</LegendItem> : null}
          {data.unscored.length || tk || data.repeatCaption ? (
            <ul className="flex basis-full flex-col gap-1 pt-1 text-body">
              {data.unscored.map((r) => (
                <StateLine key={r.key} label={r.label} state={r.state} />
              ))}
              {data.topk && "kind" in data.topk ? (
                <StateLine label={topkLabel(data.topk)} state={data.topk} />
              ) : tk ? (
                <li className="grid gap-x-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <span className="text-fg">{topkLabel(data.topk)}</span>
                  <span className="tabular-nums text-fg-muted">
                    {topkValue(data.topk)}
                    <span className="block text-caption">of the true top held-out recipes, how many the model&apos;s own top picks caught</span>
                  </span>
                </li>
              ) : null}
              {data.repeatCaption ? <li className="text-caption text-fg-muted">{data.repeatCaption}</li> : null}
            </ul>
          ) : null}
        </>
      }
      footer={
        <span className="inline-flex flex-wrap items-center gap-1">
          {sourceFooter(source, data.evidence.n, `grouped cross-validation${evidence ? ` (${evidence})` : ""}, Spearman ρ`)}
          <SourceButton source={source} />
        </span>
      }
    >
      {(w) => <ScorecardSvg width={w} data={data} source={source} />}
    </ChartFrame>
  );
}

/** A row the engine did not score: its label, the state word and the engine's reason verbatim. */
function StateLine({ label, state }: { label: string; state: NumState }) {
  const reason = state.kind === "not-scored" ? state.reason : state.kind === "na" ? state.reason : null;
  return (
    <li className="grid gap-x-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <span className="text-fg">{label}</span>
      <span className="flex items-start gap-1.5 text-fg-muted">
        {state.kind === "not-scored" ? <CircleDashed className="mt-1 size-3.5 shrink-0" aria-hidden /> : null}
        <span>
          {formatState(state).text}
          {reason ? `: ${reason}` : ""}
        </span>
      </span>
    </li>
  );
}

function ScorecardSvg({ width, data, source }: { width: number; data: ScorecardData; source: Source }) {
  const { tip, markProps, close } = useChartTip();
  const wide = width >= 640;
  const labelW = wide ? 200 : 0;
  const valueW = wide ? 210 : 0;
  const top = 28;
  const rowH = wide ? 44 : 56;
  const bottom = data.floor != null ? 22 : 8;
  const x0 = labelW + 6;
  const x1 = width - valueW - 12;
  const x = scaleLinear<number>({ domain: data.domain, range: [x0, x1] });
  const ticks = x.ticks(wide ? 6 : 4).filter((t) => t >= data.domain[0] && t <= data.domain[1]);
  const height = top + data.rows.length * rowH + bottom;
  const tickText = (t: number) => formatCorr(t).value;

  const tipFor = (r: ScoreRow) => (
    <div className="flex flex-col gap-1">
      <span className="text-label text-fg">{r.label}</span>
      <TipRow label="ρ">{rhoText(r)}</TipRow>
      {r.key === "cv" && !r.ci ? <span className="text-fg-muted">No interval reported</span> : null}
      {r.repeats.length ? <TipRow label="Per repeat">{r.repeats.map((v) => formatCorr(v).value).join(", ")}</TipRow> : null}
      {data.floor != null ? <TipRow label="Trust floor">{formatCorr(data.floor).value}</TipRow> : null}
      {r.note ? <span className="text-fg-muted">{r.note}</span> : null}
      <TipSource>
        {FIELD[r.key]} · {source.label}
      </TipSource>
    </div>
  );

  return (
    <div className="relative">
      <svg width={width} height={height} role="img" aria-label={describeScorecard(data)} className="block overflow-visible">
        <g aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + data.rows.length * rowH} stroke="var(--chart-grid)" strokeWidth={t === 0 ? 1.5 : 1} />
              <text x={x(t)} y={top - 10} textAnchor="middle" className="fill-fg-muted text-caption tabular-nums">
                {tickText(t)}
              </text>
            </g>
          ))}
          {wide ? (
            <text x={0} y={top - 10} className="fill-fg-muted text-caption">
              Held-out rank agreement (ρ)
            </text>
          ) : null}
        </g>
        {data.rows.map((r, i) => {
          const yTop = top + i * rowH;
          const cy = wide ? yTop + rowH / 2 : yTop + 36;
          const cx = x(r.rho ?? 0);
          const label = `${r.label}: ${rhoText(r)}${r.note ? `, ${r.note}` : ""}`;
          return (
            <g key={r.key}>
              <g aria-hidden>
                <text x={0} y={wide ? cy - 2 : yTop + 15} className="fill-fg text-label">
                  {r.label}
                </text>
                {r.note && wide ? (
                  <text x={0} y={cy + 13} className="fill-fg-muted text-caption">
                    {r.note}
                  </text>
                ) : null}
                <text x={width} y={wide ? cy + 4 : yTop + 15} textAnchor="end" className="fill-fg text-label tabular-nums">
                  {rhoText(r)}
                </text>
              </g>
              {r.ci ? <IntervalBar orientation="horizontal" at={cy} from={x(r.ci[0])} to={x(r.ci[1])} color="var(--chart-measured)" /> : null}
              {r.repeats.map((v, k) => (
                <line key={k} x1={x(v)} x2={x(v)} y1={cy + 7} y2={cy + 13} stroke="var(--chart-measured)" strokeWidth={1} aria-hidden />
              ))}
              {r.key === "cv" ? <MeasuredDot x={cx} y={cy} r={5} aria-hidden /> : <DerivedDiamond x={cx} y={cy} />}
              <HitTarget x={cx} y={cy} {...markProps(cx, cy, tipFor(r), label)} />
            </g>
          );
        })}
        {data.floor != null ? (
          <g aria-hidden>
            <line
              x1={x(data.floor)}
              x2={x(data.floor)}
              y1={top - 4}
              y2={top + data.rows.length * rowH + 4}
              stroke="var(--chart-reference)"
              strokeWidth={1.5}
              strokeDasharray="1 3"
              strokeLinecap="round"
            />
            <text x={x(data.floor)} y={height - 4} textAnchor="middle" className="fill-fg-muted text-caption tabular-nums">
              trust floor {formatCorr(data.floor).value}
            </text>
          </g>
        ) : null}
      </svg>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}
