"use client";

import { AreaChart, Area, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";

/** Compact axis tick label - keeps long raw values (e.g. 22.0363) from clipping the gutter. */
const fmtTick = (v: number) => formatNumber(v);

/**
 * Shared recharts theme, driven by the app-wide design tokens
 * (app/globals.css). Charts built on recharts read from this object so series
 * color, grid, axis, and tooltip styling stay in sync. See DESIGN.md.
 *
 * `series` is `--accent` (the brand chrome color) and `seriesDown` is
 * `--fg-muted`: the charts here are single trend lines or a two-way
 * "highlighted vs. background" split, not categorical or ordered-magnitude
 * encodings. Categorical series use `--chart-1..6` (Okabe-Ito order) and
 * ordered magnitude uses `--chart-seq-1..5` (see
 * components/dashboard/heat-scale.ts). Where two series differ, they also
 * differ by marker shape or dash, never by color alone.
 */
export const CHART_THEME = {
  series: "var(--accent)",
  seriesDown: "var(--fg-muted)",
  grid: "var(--grid)",
  axis: "var(--muted)",
  tooltip: {
    border: "var(--border)",
    background: "var(--card)",
    text: "var(--fg)",
  },
} as const;

const ACCENT = CHART_THEME.series;
const GRAY = CHART_THEME.seriesDown; // neutral background series; --explore (border-strong) is too pale to read as a mark
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

/** Screen-reader fallback: the plotted values as a table. */
function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (typeof v === "number" ? <td key={j}>{formatNumber(v)}</td> : <th key={j} scope="row">{v}</th>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartEmpty() {
  return <p className="py-8 text-center text-caption text-fg-muted">No data to chart yet.</p>;
}

export function ConvergenceChart({ data, yLabel }: { data: { n: number; best: number }[]; yLabel: string }) {
  const config = { best: { label: yLabel, color: ACCENT } } satisfies ChartConfig;
  if (!data.length) return <ChartEmpty />;
  const label = `Best ${yLabel} by experiment count, ${data.length} points, from ${formatNumber(data[0].best)} to ${formatNumber(data[data.length - 1].best)}`;
  return (
    <div>
    <div role="img" aria-label={label}>
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
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={fmtTick} label={axisTitle(yLabel, "y")} />
        <ChartTooltip cursor={{ stroke: GRID }} content={<ChartTooltipContent indicator="line" />} />
        <Area type="linear" dataKey="best" stroke={ACCENT} strokeWidth={2.5} fill="url(#cg)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartContainer>
    </div>
    <ChartTable caption={label} columns={["Experiments", yLabel]} rows={data.map((d) => [String(d.n), d.best])} />
    </div>
  );
}

export function ParetoChart({ all, pareto }: { all: { titer: number; purity: number }[]; pareto: { titer: number; purity: number }[] }) {
  const config = {
    "all runs": { label: "all runs", color: GRAY },
    "Pareto front": { label: "Pareto front", color: ACCENT },
  } satisfies ChartConfig;
  const label = `Titer (mg/L) vs. purity (%): ${all.length} runs, ${pareto.length} on the Pareto front`;
  return (
    <div>
    <div role="img" aria-label={label}>
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="titer" name="titer" tickFormatter={fmtTick} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("titer (mg/L)", "x")} />
        <YAxis type="number" dataKey="purity" name="purity" tickFormatter={fmtTick} tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("purity (%)", "y")} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3", stroke: GRID }} content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Scatter name="all runs" data={all} fill={GRAY} fillOpacity={0.6} shape="circle" isAnimationActive={false} />
        <Scatter name="Pareto front" data={pareto} fill={ACCENT} shape="diamond" line={{ stroke: ACCENT, strokeWidth: 2 }} isAnimationActive={false} />
      </ScatterChart>
    </ChartContainer>
    </div>
    <ChartTable
      caption={label}
      columns={["Series", "Titer (mg/L)", "Purity (%)"]}
      rows={[...all.map((d) => ["all runs", d.titer, d.purity]), ...pareto.map((d) => ["Pareto front", d.titer, d.purity])]}
    />
    </div>
  );
}
