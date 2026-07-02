"use client";

import {
  AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

const ACCENT = "#111111";
const CLAY = "#9ca3af";
const GRAY = "#9ca3af";
const GRID = "#ededed";
const INK = "#6b7280";

const tick = { fontSize: 11, fill: INK, fontFamily: "var(--font-jbmono)" } as const;
const tip = {
  contentStyle: {
    fontSize: 12, fontFamily: "var(--font-jbmono)", borderRadius: 8,
    border: "1px solid #e5e5e5", background: "#fff", color: "#0a0a0a",
  },
} as const;
const axisTitle = (value: string, side: "x" | "y") =>
  side === "x"
    ? { value, position: "insideBottom" as const, offset: -4, style: { fontSize: 11, fill: INK } }
    : { value, angle: -90, position: "insideLeft" as const, style: { fontSize: 11, fill: INK } };

export function ConvergenceChart({ data, yLabel }: { data: { n: number; best: number }[]; yLabel: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
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
        <Tooltip {...tip} />
        <Area type="linear" dataKey="best" stroke={ACCENT} strokeWidth={2.5} fill="url(#cg)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ParetoChart({ all, pareto }: { all: { titer: number; purity: number }[]; pareto: { titer: number; purity: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="titer" name="titer" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("titer (mg/L)", "x")} />
        <YAxis type="number" dataKey="purity" name="purity" tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("purity (%)", "y")} />
        <Tooltip {...tip} cursor={{ strokeDasharray: "3 3", stroke: GRID }} />
        <Legend wrapperStyle={{ fontSize: 11, color: INK }} />
        <Scatter name="all runs" data={all} fill={GRAY} shape="circle" isAnimationActive={false} />
        <Scatter name="Pareto front" data={pareto} fill={ACCENT} line={{ stroke: ACCENT, strokeWidth: 2 }} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function DriversBar({ drivers }: { drivers: { name: string; rho: number }[] }) {
  const data = [...drivers].reverse();
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 14, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" domain={[-0.6, 0.7]} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis type="category" dataKey="name" width={118} tick={{ ...tick, fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip {...tip} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
        <Bar dataKey="rho" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.rho >= 0 ? ACCENT : CLAY} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PredScatter({ oof }: { oof: [number, number][] }) {
  const data = oof.map(([measured, predicted]) => ({ measured, predicted }));
  const vals = data.flatMap((d) => [d.measured, d.predicted]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="measured" name="measured" domain={[lo, hi]} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} label={axisTitle("measured", "x")} />
        <YAxis type="number" dataKey="predicted" name="predicted" domain={[lo, hi]} tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("predicted", "y")} />
        <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} stroke={GRAY} strokeDasharray="5 5" ifOverflow="extendDomain" />
        <Tooltip {...tip} cursor={{ strokeDasharray: "3 3", stroke: GRID }} />
        <Scatter data={data} fill={ACCENT} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
