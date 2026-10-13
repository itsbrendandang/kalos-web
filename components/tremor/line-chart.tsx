// Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0 (see ./NOTICE).
// Source: src/components/LineChart/LineChart.tsx [v1.0.0].
// Modified: recharts 3; Kalos tokens (muted grid, one accent by default);
// selection, legend slider and tooltipCallback removed; typed props; an
// `indexFormatter` for x ticks and the tooltip title, and `showDots` for short
// series (a handful of rounds reads better with every point marked).

"use client";

import type { ReactNode } from "react";
import { CartesianGrid, Label, Line, LineChart as RechartsLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { AXIS_LABEL_CLASS, AXIS_TICK_CLASS, ChartLegend, ChartTooltipBox } from "@/components/tremor/chart-parts";
import { constructCategoryColors, getColorClassName, getYAxisDomain, type ChartColor } from "@/components/tremor/chart-utils";

type Datum = Record<string, string | number | null | undefined>;

export type LineChartProps = {
  data: Datum[];
  /** The x key. */
  index: string;
  /** One line per category key. */
  categories: string[];
  colors?: ChartColor[];
  valueFormatter?: (value: number) => string;
  indexFormatter?: (value: string | number) => string;
  showXAxis?: boolean;
  showYAxis?: boolean;
  showGridLines?: boolean;
  yAxisWidth?: number;
  showTooltip?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  autoMinValue?: boolean;
  minValue?: number;
  maxValue?: number;
  allowDecimals?: boolean;
  connectNulls?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  legendPosition?: "left" | "center" | "right";
  /** Replaces the default tooltip body for the hovered x. */
  customTooltip?: (datum: Datum) => ReactNode;
  className?: string;
  /** Short text alternative for the plot (the data should also be available as text nearby). */
  "aria-label"?: string;
};

export function LineChart({
  data,
  index,
  categories,
  colors = ["accent"],
  valueFormatter = (v) => String(v),
  indexFormatter = (v) => String(v),
  showXAxis = true,
  showYAxis = true,
  showGridLines = true,
  yAxisWidth = 56,
  showTooltip = true,
  showLegend = true,
  showDots = false,
  autoMinValue = false,
  minValue,
  maxValue,
  allowDecimals = true,
  connectNulls = false,
  xAxisLabel,
  yAxisLabel,
  legendPosition = "right",
  customTooltip,
  className,
  "aria-label": ariaLabel,
}: LineChartProps) {
  const categoryColors = constructCategoryColors(categories, colors);
  const color = (c: string) => categoryColors.get(c) ?? "accent";
  const paddingValue = !showXAxis && !showYAxis ? 0 : 20;

  return (
    <div className={cn("flex h-80 w-full flex-col", className)}>
      {showLegend ? <ChartLegend align={legendPosition} items={categories.map((c) => ({ name: c, color: color(c), swatch: "line" }))} /> : null}
      <div className="min-h-0 flex-1" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          <RechartsLineChart
            data={data}
            margin={{ bottom: xAxisLabel ? 24 : 4, left: yAxisLabel ? 16 : 0, right: 12, top: 8 }}
          >
            {showGridLines ? <CartesianGrid className="stroke-chart-grid stroke-1" horizontal vertical={false} /> : null}
            <XAxis
              padding={{ left: paddingValue, right: paddingValue }}
              hide={!showXAxis}
              dataKey={index}
              interval="equidistantPreserveStart"
              tick={{ transform: "translate(0, 6)", className: AXIS_TICK_CLASS }}
              tickFormatter={indexFormatter}
              fill=""
              stroke=""
              className={AXIS_TICK_CLASS}
              tickLine={false}
              axisLine={false}
              minTickGap={5}
            >
              {xAxisLabel ? (
                <Label position="insideBottom" offset={-18} className={AXIS_LABEL_CLASS}>
                  {xAxisLabel}
                </Label>
              ) : null}
            </XAxis>
            <YAxis
              width={yAxisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              type="number"
              domain={getYAxisDomain(autoMinValue, minValue, maxValue)}
              tick={{ transform: "translate(-3, 0)", className: AXIS_TICK_CLASS }}
              fill=""
              stroke=""
              className={AXIS_TICK_CLASS}
              tickFormatter={valueFormatter}
              allowDecimals={allowDecimals}
            >
              {yAxisLabel ? (
                <Label position="insideLeft" style={{ textAnchor: "middle" }} angle={-90} offset={-10} className={AXIS_LABEL_CLASS}>
                  {yAxisLabel}
                </Label>
              ) : null}
            </YAxis>
            {showTooltip ? (
              <Tooltip
                wrapperStyle={{ outline: "none" }}
                isAnimationActive={false}
                cursor={{ className: "stroke-border-strong", strokeWidth: 1 }}
                offset={20}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const datum = payload[0].payload as Datum;
                  const title = label == null ? "" : indexFormatter(label);
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
              <Line
                key={category}
                name={category}
                type="linear"
                dataKey={category}
                className={getColorClassName(color(category), "stroke")}
                stroke=""
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                isAnimationActive={false}
                connectNulls={connectNulls}
                dot={showDots ? { r: 3.5, strokeWidth: 2, className: cn("stroke-surface", getColorClassName(color(category), "fill")) } : false}
                activeDot={{ r: 5, strokeWidth: 2, className: cn("stroke-surface", getColorClassName(color(category), "fill")) }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
