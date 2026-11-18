"use client";

import {
  AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
/**
 * Shared recharts theme, driven by the app-wide design tokens
 * (app/globals.css). Every chart on every surface reads from this object so
 * series color, grid, axis, and tooltip styling stay in sync across the app.
 * See DESIGN.md for the token reference.
 *
 * `series` points at `--accent` (the brand blue chrome color), not a
 * `--chart-*` step: none of the charts below encode ORDERED MAGNITUDE (that
 * role belongs to `--chart-1..5`, reserved for heatmaps/response surfaces -
 * see components/dashboard/heat-scale.ts) or UNORDERED CATEGORIES (that role
 * belongs to `--series-1..6`, the Okabe-Ito palette, for multi-series
 * overlays like per-vessel kinetic traces). Every chart here is either a
 * single trend line or a two-way "highlighted vs. background" split
 * (Pareto front / the rest, positive / negative correlation, zero-producer /
 * normal run) - a plain accent-vs-explore emphasis pair, the same pairing
 * the rest of the app already uses for "selected vs. not". Pulling from
 * --chart-1 (the *lightest*, near-white step of the sequential ramp) here -
 * as this file previously did - both misused a magnitude-only token for a
 * non-magnitude encoding and rendered as a washed-out, low-contrast line.
 */
export const CHART_THEME = {
  series: "var(--accent)",
  seriesDown: "var(--explore)",
  grid: "var(--grid)",
  axis: "var(--muted)",
  hoverCursor: "color-mix(in oklch, var(--accent) 6%, transparent)",
  tooltip: {
    border: "var(--border)",
    background: "var(--card)",
    text: "var(--fg)",
  },
} as const;

const ACCENT = CHART_THEME.series;
const GRAY = CHART_THEME.seriesDown;
const GRID = CHART_THEME.grid;
const INK = CHART_THEME.axis;

export const tick = { fontSize: 11, fill: INK, fontFamily: "var(--font-geist-mono)" } as const;
export const tip = {
  contentStyle: {
    fontSize: 12,
    fontFamily: "var(--font-geist-mono)",
    borderRadius: 8,
    border: `1px solid ${CHART_THEME.tooltip.border}`,
    background: CHART_THEME.tooltip.background,
    color: CHART_THEME.tooltip.text,
  },
} as const;
export const axisTitle = (value: string, side: "x" | "y") =>
  side === "x"
    ? { value, position: "insideBottom" as const, offset: -4, style: { fontSize: 11, fill: INK } }
    : { value, angle: -90, position: "insideLeft" as const, style: { fontSize: 11, fill: INK } };

export function ConvergenceChart({ data, yLabel }: { data: { n: number; best: number }[]; yLabel: string }) {
  const config = { best: { label: yLabel, color: ACCENT } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity={0.18} />
            <stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="n" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("experiments", "x")} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle(yLabel, "y")} />
        <ChartTooltip cursor={{ stroke: GRID }} content={<ChartTooltipContent indicator="line" />} />
        <Area type="linear" dataKey="best" stroke={ACCENT} strokeWidth={2.5} fill="url(#cg)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
  );
}

export function ParetoChart({ all, pareto }: { all: { titer: number; purity: number }[]; pareto: { titer: number; purity: number }[] }) {
  const config = {
    "all runs": { label: "all runs", color: GRAY },
    "Pareto front": { label: "Pareto front", color: ACCENT },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="titer" name="titer" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("titer (mg/L)", "x")} />
        <YAxis type="number" dataKey="purity" name="purity" tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("purity (%)", "y")} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3", stroke: GRID }} content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Scatter name="all runs" data={all} fill={GRAY} shape="circle" isAnimationActive={false} />
        <Scatter name="Pareto front" data={pareto} fill={ACCENT} line={{ stroke: ACCENT, strokeWidth: 2 }} isAnimationActive={false} />
      </ScatterChart>
    </ChartContainer>
  );
}
