"use client";

import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { ChartFrame, LegendItem } from "@/components/viz/frame";
import { HGrid, XAxis, YAxis, tickFormatter } from "@/components/viz/axes";
import { HitTarget } from "@/components/viz/marks";
import { Num } from "@/components/viz/num";
import { ChartTooltip, TipRow, TipSource, useChartTip } from "@/components/viz/tooltip";
import { formatValue } from "@/lib/num";
import type { Source } from "@/lib/source";
import { MAX_FOCUSABLE_MARKS } from "@/lib/viz-thresholds";
import {
  coordText,
  dataAspect,
  describeLandscape,
  equalAspectDomains,
  landscapeTable,
  seqStep,
  targetDecimals,
  targetText,
  type LandscapeProps,
} from "@/lib/viz-data/run-landscape";

/*
 * Every run in the fit placed by recipe similarity: the engine's PCA of the
 * standardized inputs (VIZ_SPEC 5, "Retained, restyled"). Each run is a
 * measured result, so each is a filled dot with an ink outline, shaded on the
 * sequential ramp by its measured target. Both axes use the same units per
 * pixel, so on-screen distance is projection distance. The axes are unitless.
 */

const HEIGHT = 340;
const M = { top: 8, right: 16, bottom: 52, left: 60 };
const AXIS = "(similarity, unitless)";

export function RunLandscape({ data, source, width: fixedWidth, bare = true }: { data: LandscapeProps; source: Source; width?: number; bare?: boolean }) {
  const { tip, markProps, close } = useChartTip();
  const description = describeLandscape(data);
  const d = targetDecimals(data);
  const unit = data.unit;
  const focusable = data.points.length <= MAX_FOCUSABLE_MARKS;
  // Highest values drawn last, so they sit on top where points overlap.
  const ordered = [...data.points].sort((a, b) => a.target - b.target);
  const n = formatValue(data.points.length, { quantity: "count" }).text;
  const method = `${data.method.toUpperCase()} of the ${data.encoding === "standardized_continuous_one_hot_categorical" ? "standardized numeric and one-hot categorical inputs" : "inputs"}${data.nFeatures != null ? ` (${formatValue(data.nFeatures, { quantity: "count" }).text} dimensions)` : ""}`;

  return (
    <ChartFrame
      bare={bare}
      title="Runs by recipe similarity"
      subtitle={`Nearby points have similar recipes. Each dot is one measured run, shaded by ${data.targetName}.`}
      height={HEIGHT}
      width={fixedWidth}
      description={description}
      data={landscapeTable(data)}
      legend={
        <>
          <LegendItem mark="measured">Measured run</LegendItem>
          {data.min != null && data.max != null ? <Ramp min={targetText(data.min, d)} max={targetText(data.max, d)} unit={unit} name={data.targetName} /> : null}
          {data.skipped > 0 ? <span>{formatValue(data.skipped, { quantity: "count" }).text} not plotted (no finite value from the engine)</span> : null}
        </>
      }
      footer={`From: ${source.label} · n = ${n} runs · ${method}${source.engineVersion ? ` · engine ${source.engineVersion}` : ""}`}
    >
      {(width) => {
        const innerH = HEIGHT - M.top - M.bottom;
        // Equal units per pixel on both axes: the plot is only as wide as the projection's own shape needs.
        const innerW = Math.max(0, Math.min(width - M.left - M.right, Math.max(innerH, innerH * dataAspect(data))));
        const svgW = innerW + M.left + M.right;
        const dom = equalAspectDomains(data.points, innerW, innerH);
        const x = scaleLinear<number>({ domain: dom.x, range: [0, innerW] });
        const y = scaleLinear<number>({ domain: dom.y, range: [innerH, 0] });
        const xt = x.ticks(innerW < 360 ? 4 : 6);
        const yt = y.ticks(5);
        return (
          <div className="relative">
            <svg width={svgW} height={HEIGHT} role="img" aria-label={description} className="block">
              <Group left={M.left} top={M.top}>
                <HGrid scale={y} ticks={yt} x1={0} x2={innerW} />
                <XAxis scale={x} top={innerH} ticks={xt} format={tickFormatter(xt)} label={`PC1 ${AXIS}`} />
                <YAxis scale={y} ticks={yt} format={tickFormatter(yt)} label={`PC2 ${AXIS}`} />
                {ordered.map((p) => {
                  const cx = x(p.pc1);
                  const cy = y(p.pc2);
                  const content = (
                    <div className="flex flex-col gap-1">
                      <p className="pr-5 text-label text-fg">Run {formatValue(p.index + 1, { quantity: "count" }).text} (fit order)</p>
                      <TipRow label={`${data.targetName}, measured`}>
                        <Num value={p.target} basis="measured" unit={unit} options={{ decimals: d }} />
                      </TipRow>
                      <TipRow label="PC1">
                        <Num value={p.pc1} glyph={false} options={{ quantity: "score" }} />
                      </TipRow>
                      <TipRow label="PC2">
                        <Num value={p.pc2} glyph={false} options={{ quantity: "score" }} />
                      </TipRow>
                      <TipSource>
                        embedding.points[{p.index}] · {source.label}
                        {source.engineVersion ? ` · engine ${source.engineVersion}` : ""}
                      </TipSource>
                    </div>
                  );
                  const label = `Run ${p.index + 1}: measured ${targetText(p.target, d)}${unit ? ` ${unit}` : ""}, PC1 ${coordText(p.pc1)}, PC2 ${coordText(p.pc2)}`;
                  return (
                    <g key={p.index}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={4.5}
                        fill={`var(--chart-seq-${data.min != null && data.max != null ? seqStep(p.target, data.min, data.max) : 3})`}
                        stroke="var(--chart-measured)"
                        strokeWidth={0.75}
                        aria-hidden
                      />
                      <HitTarget x={cx} y={cy} {...markProps(cx + M.left, cy + M.top, content, label, focusable)} />
                    </g>
                  );
                })}
              </Group>
            </svg>
            <ChartTooltip tip={tip} onClose={close} width={width} />
          </div>
        );
      }}
    </ChartFrame>
  );
}

/** The sequential key: lowest and highest measured value at the ends of five equal-width steps. */
function Ramp({ min, max, unit, name }: { min: string; max: string; unit: string | null; name: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 tabular-nums">
      <span>{name}:</span>
      <span>{min}</span>
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="h-2.5 w-5 border-y border-border first:rounded-l-sm first:border-l last:rounded-r-sm last:border-r" style={{ background: `var(--chart-seq-${s})` }} />
        ))}
      </span>
      <span>
        {max}
        {unit ? `\u00A0${unit}` : ""}
      </span>
      <span>(5 equal steps, lowest to highest measured)</span>
    </span>
  );
}
