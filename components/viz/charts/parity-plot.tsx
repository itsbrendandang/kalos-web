"use client";

import { useId } from "react";
import { scaleLinear } from "@visx/scale";
import { XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { HitTarget, MeasuredDot, OutsideGlyph } from "@/components/viz/marks";
import { SourceButton } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { conformalInterval, coverageText, formatCorr, formatDelta, formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import { bandText, describeParity, flatNote, insideText, parityTable, type ParityData, type ParityPoint } from "@/lib/viz-data/parity-plot";
import { sourceFooter } from "@/lib/viz-data/reliability-scorecard";

/**
 * C6 ParityPlot: held-out predicted vs measured, with the engine's conformal
 * band drawn around the diagonal (y = x +/- conformal_q). Points are filled
 * ink (the measured truth anchors each pair); pairs outside the band become a
 * warn x and are counted exactly. Square, identical axes, dotted diagonal.
 */
export function ParityPlot({
  data,
  target,
  unit = null,
  source,
  stale,
  width,
  bare = true,
}: {
  data: ParityData;
  target: string;
  unit?: string | null;
  source: Source;
  stale?: { nNew: number } | null;
  width?: number;
  bare?: boolean;
}) {
  const s = data.state;
  const state =
    s.kind === "ready" ? ({ kind: "ready" } as const) : s.kind === "not-scored" ? ({ kind: "not-scored", reason: s.reason } as const) : ({ kind: s.kind, text: s.text } as const);
  const cov = data.band ? coverageText(data.band.coverage) : null;
  const anyOutside = data.points.some((p) => p.inside === false);
  const inside = insideText(data);
  return (
    <ChartFrame
      bare={bare}
      title="Predictions on runs the model had not seen"
      subtitle={data.rho.value != null ? `Rank agreement ${formatCorr(data.rho.value, data.rho.ci).text}` : "Rank agreement not reported"}
      state={state}
      stale={stale}
      width={width}
      height={360}
      description={describeParity(data, target, unit)}
      data={parityTable(data, unit)}
      legend={
        <>
          <LegendItem mark="measured">Held-out run (measured, predicted)</LegendItem>
          {data.band ? <LegendItem mark="band">{bandText(data, unit)}</LegendItem> : <span>{bandText(data, unit)}</span>}
          <LegendItem mark="reference">Perfect agreement (y = x)</LegendItem>
          {anyOutside && !data.dense ? <LegendItem mark="outside">Outside the band</LegendItem> : null}
          {inside || data.flat || data.band ? (
            <span className="flex basis-full flex-col gap-1 text-caption text-fg-muted">
              {inside ? (
                <span className="text-fg">
                  {inside}.{" "}
                  <span className="text-fg-muted">
                    The band&apos;s width comes from these same held-out errors, so about {cov ?? "its stated share"} inside is expected by construction.
                  </span>
                </span>
              ) : null}
              {data.band ? <span>The same half-width applies to every proposal; its coverage on new proposals is not guaranteed.</span> : null}
              {data.flat ? <span>{flatNote(data)}</span> : null}
              {data.dense ? <span>Dense plot: marks are translucent and outside-band runs are listed in the Data table.</span> : null}
            </span>
          ) : null}
        </>
      }
      footer={
        <span className="inline-flex flex-wrap items-center gap-1">
          {sourceFooter(source, data.points.length || null, data.band ? "held-out conformal band" : "out-of-fold predictions")}
          <SourceButton source={source} />
        </span>
      }
    >
      {(w) => <ParitySvg width={w} data={data} target={target} unit={unit} source={source} />}
    </ChartFrame>
  );
}

const M = { top: 12, right: 14, bottom: 44, left: 56 };

function ParitySvg({ width, data, target, unit, source }: { width: number; data: ParityData; target: string; unit: string | null; source: Source }) {
  const clip = useId().replace(/:/g, "");
  const { tip, markProps, close } = useChartTip();
  const size = Math.max(220, Math.min(width, 460));
  const inner = size - M.left - M.right;
  const [lo, hi] = data.domain;
  const x = scaleLinear<number>({ domain: [lo, hi], range: [0, inner] });
  const y = scaleLinear<number>({ domain: [lo, hi], range: [inner, 0] });
  const ticks = x.ticks(5);
  const fmt = tickFormatter(ticks, "target");
  const q = data.band?.halfWidth ?? null;
  const cov = data.band?.coverage ?? null;
  const focusable = data.points.length <= MAX_FOCUSABLE_MARKS;
  const interactive = !data.dense;
  const u = unit ? ` (${unit})` : "";
  const covWord = coverageText(cov);

  const band =
    q != null
      ? [
          [lo, lo - q],
          [hi, hi - q],
          [hi, hi + q],
          [lo, lo + q],
        ]
          .map(([a, b]) => `${x(a)},${y(b)}`)
          .join(" ")
      : null;

  const tipFor = (p: ParityPoint) => {
    const pred = formatValue(p.predicted, { basis: "predicted", unit, interval: conformalInterval(p.predicted, q, cov) });
    return (
      <div className="flex flex-col gap-1">
        <TipRow label="Measured">{formatValue(p.measured, { basis: "measured", unit }).text}</TipRow>
        <TipRow label="Predicted (held-out)">{pred.text}</TipRow>
        <TipRow label="Error">{formatDelta(p.predicted, p.measured, { unit, uncertainty: q, relative: false }).text}</TipRow>
        {p.inside != null ? (
          <TipRow label="Band">{`${p.inside ? "inside" : "outside"} the ${covWord ? `${covWord} ` : ""}held-out band`}</TipRow>
        ) : (
          <span className="text-fg-muted">No held-out band reported</span>
        )}
        <TipSource>oof[{p.index}] · {source.label}</TipSource>
      </div>
    );
  };

  // Draw inside-band runs first, outside-band ones on top so a warning is never hidden.
  const ordered = [...data.points].sort((a, b) => Number(a.inside === false) - Number(b.inside === false));

  return (
    <div className="relative">
      <svg
        width={size}
        height={inner + M.top + M.bottom}
        role="img"
        aria-label={describeParity(data, target, unit)}
        className="block max-w-full overflow-visible"
      >
        <defs>
          <clipPath id={`${clip}-plot`}>
            <rect x={0} y={0} width={inner} height={inner} />
          </clipPath>
        </defs>
        <g transform={`translate(${M.left},${M.top})`}>
          <g aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={0} y2={inner} stroke="var(--chart-grid)" />
                <line x1={0} x2={inner} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              </g>
            ))}
          </g>
          {band ? <polygon points={band} fill="var(--chart-band)" clipPath={`url(#${clip}-plot)`} aria-hidden /> : null}
          <line
            x1={x(lo)}
            y1={y(lo)}
            x2={x(hi)}
            y2={y(hi)}
            stroke="var(--chart-reference)"
            strokeWidth={1.25}
            strokeDasharray="1 3"
            strokeLinecap="round"
            aria-hidden
          />
          <g clipPath={`url(#${clip}-plot)`}>
            {ordered.map((p) => {
              const cx = x(p.measured);
              const cy = y(p.predicted);
              const outside = p.inside === false && !data.dense;
              const label = `Held-out run ${p.index}: measured ${formatValue(p.measured, { unit }).text}, predicted ${formatValue(p.predicted, { unit }).text}${p.inside === false ? ", outside the band" : ""}`;
              return (
                <g key={p.index}>
                  {outside ? <OutsideGlyph x={cx} y={cy} s={3.5} /> : <MeasuredDot x={cx} y={cy} r={3.5} opacity={data.dense ? 0.5 : 1} aria-hidden />}
                  {interactive ? <HitTarget x={cx} y={cy} {...markProps(cx + M.left, cy + M.top, tipFor(p), label, focusable)} /> : null}
                </g>
              );
            })}
          </g>
          <XAxis scale={x} top={inner} ticks={ticks} format={fmt} label={`Measured ${target}${u}`} />
          <YAxis scale={y} ticks={ticks} format={fmt} label={`Predicted, held-out${u}`} />
        </g>
      </svg>
      <ChartTooltip tip={tip} onClose={close} width={width} />
    </div>
  );
}
