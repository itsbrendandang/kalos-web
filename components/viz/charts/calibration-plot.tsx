"use client";

import { scaleLinear } from "@visx/scale";
import { XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, DataTableView, LegendItem } from "@/components/viz/frame";
import { HitTarget, MeasuredDot, PredictedDot } from "@/components/viz/marks";
import { SourceButton } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { calibrationTable, describeCalibration, levelText, type CalLevel, type CalibrationData } from "@/lib/viz-data/calibration-plot";
import { sourceFooter } from "@/lib/viz-data/reliability-scorecard";

type Ready = Extract<CalibrationData, { state: "ready" | "table" }>;

/**
 * C7 CalibrationPlot: a reliability diagram of the model's OWN uncertainty
 * bands on held-out runs (reliability.calibration). Nominal coverage on x,
 * held-out coverage on y, a dotted diagonal for "means what it says". The
 * engine's levels are measured coverage, so they are filled ink joined by a
 * solid line; an alternative-scale series (when the engine scored one) is
 * hollow and dashed. Region meaning is text, not fill. Renders nothing when
 * the engine sent no calibration (absent rule).
 */
export function CalibrationPlot({
  data,
  source,
  stale,
  width,
  bare = true,
}: {
  data: CalibrationData;
  source: Source;
  stale?: { nNew: number } | null;
  width?: number;
  bare?: boolean;
}) {
  if (data.state === "absent") return null;
  const title = "Does the model's own uncertainty hold up?";
  const footer = (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sourceFooter(source, data.state === "not-scored" ? null : data.n, "held-out coverage of the model's uncertainty bands")}
      <SourceButton source={source} />
    </span>
  );
  if (data.state === "not-scored") {
    return <ChartFrame bare={bare} title={title} subtitle="Not scored" state={{ kind: "not-scored", reason: data.reason }} footer={footer}>{() => null}</ChartFrame>;
  }
  const subtitle = [data.headline, data.ece != null ? `ECE ${formatValue(data.ece, { quantity: "score" }).value}` : null, data.reading?.replace(/:.*$/, "")]
    .filter(Boolean)
    .join(" · ");
  const table = calibrationTable(data);
  return (
    <ChartFrame
      bare={bare}
      title={title}
      subtitle={subtitle}
      stale={stale}
      width={width}
      height={360}
      description={describeCalibration(data)}
      data={data.state === "ready" ? table : null}
      legend={
        <>
          {data.state === "ready" ? (
            <>
              <LegendItem mark="measured">Held-out coverage at each nominal level</LegendItem>
              {data.alt ? <LegendItem mark="predicted">{data.alt.label} (dashed)</LegendItem> : null}
              <LegendItem mark="reference">Means what it says (y = x)</LegendItem>
            </>
          ) : null}
          <span className="flex basis-full flex-col gap-1 text-caption text-fg-muted">
            {data.reading ? <span className="text-fg">{data.reading}.</span> : null}
            {data.coarse ? <span>Few held-out runs; coverage estimates are coarse.</span> : null}
            <span>This checks the model&apos;s own uncertainty bands, the ones behind its per-run spread, not the held-out band on the predictions.</span>
          </span>
        </>
      }
      footer={footer}
    >
      {(w) => (data.state === "table" ? table ? <DataTableView data={table} /> : null : <CalibrationSvg width={w} data={data} source={source} />)}
    </ChartFrame>
  );
}

const M = { top: 12, right: 14, bottom: 44, left: 52 };

function CalibrationSvg({ width, data, source }: { width: number; data: Ready; source: Source }) {
  const { tip, markProps, close } = useChartTip();
  const size = Math.max(220, Math.min(width, 460));
  const inner = size - M.left - M.right;
  const [lo, hi] = data.domain;
  const x = scaleLinear<number>({ domain: [lo, hi], range: [0, inner] });
  const y = scaleLinear<number>({ domain: [lo, hi], range: [inner, 0] });
  const ticks = x.ticks(5);
  const fmt = tickFormatter(ticks, "pct");
  const path = (ls: CalLevel[]) => ls.map((l, i) => `${i ? "L" : "M"}${x(l.nominal)},${y(l.empirical)}`).join(" ");
  const pct = (v: number) => formatValue(v, { quantity: "pct" }).text;

  const tipFor = (l: CalLevel, i: number, series: string, field: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-label text-fg">{series}</span>
      <TipRow label="Nominal band">{pct(l.nominal)}</TipRow>
      <TipRow label="Held-out coverage">{levelText(l)}</TipRow>
      <TipRow label="Reads">{l.empirical > l.nominal ? "wider than stated" : l.empirical < l.nominal ? "narrower than stated" : "as stated"}</TipRow>
      <TipSource>
        {field}[{i}] · {source.label}
      </TipSource>
    </div>
  );

  return (
    <div className="relative">
      <svg width={size} height={inner + M.top + M.bottom} role="img" aria-label={describeCalibration(data)} className="block max-w-full overflow-visible">
        <g transform={`translate(${M.left},${M.top})`}>
          <g aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={0} y2={inner} stroke="var(--chart-grid)" />
                <line x1={0} x2={inner} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              </g>
            ))}
          </g>
          <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" aria-hidden />
          <g aria-hidden className="fill-fg-muted text-caption">
            <text x={6} y={14}>
              Above the line: bands too wide
            </text>
            <text x={inner - 6} y={inner - 8} textAnchor="end">
              Below the line: bands too narrow
            </text>
          </g>
          {data.alt ? (
            <g>
              <path d={path(data.alt.levels)} fill="none" stroke="var(--chart-predicted)" strokeWidth={1.5} strokeDasharray="4 3" aria-hidden />
              {data.alt.levels.map((l, i) => (
                <g key={`alt-${l.nominal}`}>
                  <PredictedDot x={x(l.nominal)} y={y(l.empirical)} aria-hidden />
                  <HitTarget x={x(l.nominal)} y={y(l.empirical)} {...markProps(x(l.nominal) + M.left, y(l.empirical) + M.top, tipFor(l, i, data.alt!.label, "alternative_scale.calibration.levels"), `${data.alt!.label}: ${pct(l.nominal)} nominal, ${levelText(l)}`)} />
                </g>
              ))}
              {data.alt.levels.length ? (
                <text
                  x={x(data.alt.levels[data.alt.levels.length - 1].nominal) - 8}
                  y={y(data.alt.levels[data.alt.levels.length - 1].empirical) + 16}
                  textAnchor="end"
                  className="fill-fg-muted text-caption"
                  aria-hidden
                >
                  {data.alt.label}
                </text>
              ) : null}
            </g>
          ) : null}
          <path d={path(data.levels)} fill="none" stroke="var(--chart-measured)" strokeWidth={2} aria-hidden />
          {data.levels.map((l, i) => (
            <g key={l.nominal}>
              <MeasuredDot x={x(l.nominal)} y={y(l.empirical)} aria-hidden />
              <HitTarget
                x={x(l.nominal)}
                y={y(l.empirical)}
                {...markProps(x(l.nominal) + M.left, y(l.empirical) + M.top, tipFor(l, i, "Model", "reliability.calibration.levels"), `${pct(l.nominal)} nominal band: ${levelText(l)}`)}
              />
            </g>
          ))}
          <XAxis scale={x} top={inner} ticks={ticks} format={fmt} label="Nominal coverage of the model's band" />
          <YAxis scale={y} ticks={ticks} format={fmt} label="Held-out coverage" />
        </g>
      </svg>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}
