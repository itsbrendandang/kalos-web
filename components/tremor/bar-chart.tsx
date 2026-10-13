// Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0 (see ./NOTICE).
// Source: src/components/BarChart/BarChart.tsx.
// Modified: recharts 3; Kalos tokens; selection, legend slider, percent mode
// and tooltipCallback removed; typed props. Added for Kalos: `errorKey`
// draws a recharts ErrorBar (an interval per bar, e.g. a 95% CI), and
// `barStyle` styles single bars (colour plus solid or outline fill), so a
// state such as "not significant" is told by shape and the legend's words,
// not colour alone.

"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { AXIS_LABEL_CLASS, AXIS_TICK_CLASS, ChartLegend, ChartTooltipBox, type LegendEntry } from "@/components/tremor/chart-parts";
import { constructCategoryColors, getColorClassName, getYAxisDomain, type ChartColor } from "@/components/tremor/chart-utils";

type Datum = Record<string, string | number | boolean | null | undefined | [number, number]>;

export type BarStyle = { color: ChartColor; outline?: boolean };

export type BarChartProps = {
  data: Datum[];
  index: string;
  categories: string[];
  colors?: ChartColor[];
  valueFormatter?: (value: number) => string;
  /** Formats the category axis ticks (e.g. to truncate long names). */
  indexFormatter?: (value: string) => string;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showGridLines?: boolean;
  /** Defaults to 56, or for vertical layout the widest category label. */
  yAxisWidth?: number;
  showTooltip?: boolean;
  showLegend?: boolean;
  /** Overrides the default legend (one entry per category). */
  legend?: LegendEntry[];
  autoMinValue?: boolean;
  minValue?: number;
  maxValue?: number;
  allowDecimals?: boolean;
  barCategoryGap?: string | number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  /** "vertical" draws horizontal bars (categories down the y axis). */
  layout?: "vertical" | "horizontal";
  type?: "default" | "stacked";
  legendPosition?: "left" | "center" | "right";
  /** Datum key holding [below, above] distances from the value, drawn as an interval. */
  errorKey?: string;
  /** Per-bar colour and fill, for single-series charts. */
  barStyle?: (datum: Datum) => BarStyle;
  /** A value-axis reference line, e.g. 0 for signed values. */
  referenceValue?: number;
  customTooltip?: (datum: Datum) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

const CAPTION_PX = 12; // text-caption, 0.75rem
const MAX_LABEL_PX = 220;

/** Widest tick label in px, measured at the caption font; 0.6em per char where no canvas exists. */
function measureLabels(labels: string[]): number {
  const ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (ctx) ctx.font = `${CAPTION_PX}px ${getComputedStyle(document.body).fontFamily}`;
  return Math.max(0, ...labels.map((l) => (ctx ? ctx.measureText(l).width : l.length * 0.6 * CAPTION_PX)));
}

export function BarChart({
  data,
  index,
  categories,
  colors = ["accent"],
  valueFormatter = (v) => String(v),
  indexFormatter = (v) => v,
  showXAxis = true,
  showYAxis = true,
  showGridLines = true,
  yAxisWidth,
  showTooltip = true,
  showLegend = true,
  legend,
  autoMinValue = false,
  minValue,
  maxValue,
  allowDecimals = true,
  barCategoryGap,
  xAxisLabel,
  yAxisLabel,
  layout = "horizontal",
  type = "default",
  legendPosition = "right",
  errorKey,
  barStyle,
  referenceValue,
  customTooltip,
  className,
  "aria-label": ariaLabel,
}: BarChartProps) {
  const categoryColors = constructCategoryColors(categories, colors);
  const color = (c: string) => categoryColors.get(c) ?? "accent";
  const vertical = layout === "vertical";
  const domain = getYAxisDomain(autoMinValue, minValue, maxValue);
  const axisWidth =
    yAxisWidth ?? (vertical ? Math.min(MAX_LABEL_PX, Math.ceil(measureLabels(data.map((d) => indexFormatter(String(d[index])))) + 12)) : 56);
  const valueAxis = { type: "number" as const, domain, tickFormatter: valueFormatter, allowDecimals };
  const categoryAxis = { dataKey: index, type: "category" as const, tickFormatter: indexFormatter, interval: 0 as const };

  return (
    <div className={cn("flex h-80 w-full flex-col", className)}>
      {showLegend ? (
        <ChartLegend align={legendPosition} items={legend ?? categories.map((c) => ({ name: c, color: color(c), swatch: "solid" as const }))} />
      ) : null}
      <div className="min-h-0 flex-1" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          <RechartsBarChart
            data={data}
            layout={layout}
            barCategoryGap={barCategoryGap}
            margin={{ bottom: xAxisLabel ? 24 : 4, left: yAxisLabel ? 16 : 0, right: 16, top: 4 }}
          >
            {showGridLines ? <CartesianGrid className="stroke-chart-grid stroke-1" horizontal={!vertical} vertical={vertical} /> : null}
            <XAxis
              hide={!showXAxis}
              tick={{ transform: vertical ? undefined : "translate(0, 6)", className: AXIS_TICK_CLASS }}
              fill=""
              stroke=""
              className={AXIS_TICK_CLASS}
              tickLine={false}
              axisLine={false}
              minTickGap={5}
              {...(vertical ? valueAxis : categoryAxis)}
            >
              {xAxisLabel ? (
                <Label position="insideBottom" offset={-18} className={AXIS_LABEL_CLASS}>
                  {xAxisLabel}
                </Label>
              ) : null}
            </XAxis>
            <YAxis
              width={axisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              fill=""
              stroke=""
              className={AXIS_TICK_CLASS}
              tick={{ transform: "translate(-3, 0)", className: AXIS_TICK_CLASS }}
              {...(vertical ? categoryAxis : valueAxis)}
            >
              {yAxisLabel ? (
                <Label position="insideLeft" style={{ textAnchor: "middle" }} angle={-90} offset={-10} className={AXIS_LABEL_CLASS}>
                  {yAxisLabel}
                </Label>
              ) : null}
            </YAxis>
            {referenceValue != null ? (
              <ReferenceLine {...(vertical ? { x: referenceValue } : { y: referenceValue })} className="stroke-border-strong" stroke="" />
            ) : null}
            {showTooltip ? (
              <Tooltip
                wrapperStyle={{ outline: "none" }}
                isAnimationActive={false}
                cursor={{ className: "fill-subtle" }}
                offset={20}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const datum = payload[0].payload as Datum;
                  const title = String(label ?? "");
                  return customTooltip ? (
                    <ChartTooltipBox label={title}>{customTooltip(datum)}</ChartTooltipBox>
                  ) : (
                    <ChartTooltipBox
                      label={title}
                      rows={payload.map((p) => ({
                        name: String(p.dataKey),
                        value: typeof p.value === "number" ? valueFormatter(p.value) : String(p.value ?? ""),
                        color: color(String(p.dataKey)),
                      }))}
                    />
                  );
                }}
              />
            ) : null}
            {categories.map((category) => (
              <Bar
                key={category}
                name={category}
                dataKey={category}
                stackId={type === "stacked" ? "stack" : undefined}
                isAnimationActive={false}
                fill=""
                className={barStyle ? undefined : getColorClassName(color(category), "fill")}
                radius={2}
              >
                {barStyle
                  ? data.map((d, i) => {
                      const s = barStyle(d);
                      return (
                        <Cell
                          key={i}
                          fill=""
                          stroke=""
                          strokeWidth={s.outline ? 1.5 : 0}
                          className={s.outline ? cn("fill-transparent", getColorClassName(s.color, "stroke")) : getColorClassName(s.color, "fill")}
                        />
                      );
                    })
                  : null}
                {errorKey ? (
                  <ErrorBar dataKey={errorKey} width={6} strokeWidth={1.5} className="stroke-fg" stroke="" direction={vertical ? "x" : "y"} />
                ) : null}
              </Bar>
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
