"use client";

import {
  AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, Cell,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmt } from "@/lib/utils";

/** Compact axis tick label - keeps long raw values (e.g. 22.0363) from clipping the gutter. */
const fmtTick = (v: number) => fmt(v, 1);

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
const CLAY = CHART_THEME.seriesDown;
const GRAY = CHART_THEME.seriesDown;
const GRID = CHART_THEME.grid;
const INK = CHART_THEME.axis;

export const tick = { fontSize: 11, fill: INK, fontFamily: "var(--font-jbmono)" } as const;
export const tip = {
  contentStyle: {
    fontSize: 12,
    fontFamily: "var(--font-jbmono)",
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

/**
 * Best-measured-so-far vs. round, for the campaign progress strip on /decide.
 * Deliberately plain (no yLabel/axis titles) so it stays compact under a
 * header that already states the target and unit - see the ProgressPanel
 * wrapper in app/decide/page.tsx.
 */
export function ProgressChart({ data }: { data: { round: number; best: number }[] }) {
  const config = { best: { label: "best", color: ACCENT } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <AreaChart data={data} margin={{ top: 4, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity={0.2} />
            <stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="round" allowDecimals={false} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={fmtTick} />
        <ChartTooltip
          cursor={{ stroke: GRID }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(round) => `round ${round}`}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">{fmt(Number(value), 2)}</span>
                </div>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="best"
          stroke={ACCENT}
          strokeWidth={2.5}
          fill="url(#progress-fill)"
          dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
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

/**
 * `significant` must come from the engine (`Driver.significant` in
 * lib/api.ts - CI excludes zero AND survives FDR correction), never be
 * re-derived here. Non-significant bars render at reduced opacity so a
 * driver that failed either test can never look the same as one that
 * passed - see the caption the caller renders alongside this chart.
 */
export function DriversBar({ drivers }: { drivers: { name: string; rho: number; significant: boolean }[] }) {
  const data = [...drivers].reverse();
  const config = { rho: { label: "correlation" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[230px] w-full">
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 14, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" domain={[-0.6, 0.7]} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis type="category" dataKey="name" width={118} tick={{ ...tick, fontSize: 10 }} tickLine={false} axisLine={false} />
        <ChartTooltip cursor={{ fill: CHART_THEME.hoverCursor }} content={<ChartTooltipContent indicator="dot" />} />
        <Bar dataKey="rho" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.rho >= 0 ? ACCENT : CLAY} fillOpacity={d.significant ? 1 : 0.35} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function PredScatter({ oof }: { oof: [number, number][] }) {
  if (oof.length === 0) {
    return <p className="py-10 text-center text-[12px] text-muted">not enough held-out points</p>;
  }
  const data = oof.map(([measured, predicted]) => ({ measured, predicted }));
  const vals = data.flatMap((d) => [d.measured, d.predicted]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const config = { predicted: { label: "predicted", color: ACCENT } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="measured" name="measured" domain={[lo, hi]} tickFormatter={fmtTick} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("measured", "x")} />
        <YAxis type="number" dataKey="predicted" name="predicted" domain={[lo, hi]} tickFormatter={fmtTick} tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("predicted", "y")} />
        <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={GRAY} strokeDasharray="5 5" ifOverflow="extendDomain" />
        <ChartTooltip cursor={{ strokeDasharray: "3 3", stroke: GRID }} content={<ChartTooltipContent indicator="dot" />} />
        <Scatter data={data} fill={ACCENT} fillOpacity={0.4} stroke={ACCENT} strokeOpacity={0.55} strokeWidth={0.5} isAnimationActive={false} />
      </ScatterChart>
    </ChartContainer>
  );
}
