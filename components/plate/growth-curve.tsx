"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CHART_THEME, tick, tip, axisTitle } from "@/components/charts";
import { gompertz, HOURS, type GompertzParams, type Well } from "@/lib/plate-data";

interface GrowthCurveProps {
  well: Well;
  /** The partner well sharing this well's replicate pair, if any. */
  partner: Well | undefined;
  /** Shared Gompertz base params for this well's pair, used to draw the fit line. */
  base: GompertzParams;
}

const LEGEND_ITEMS = [
  { label: "replicate A", color: "#9aa7c7" },
  { label: "replicate B", color: "#c3cbe3" },
  { label: "Gompertz fit", color: CHART_THEME.series },
];

/**
 * Fixed-order legend (A, B, fit) rendered via Legend's `content` prop - Recharts'
 * default legend lists series in the reverse of their <Line> declaration order, and
 * declaration order here is A/B/fit so the emphasized fit line paints last (on top,
 * correct z-order over the muted replicates).
 */
function GrowthLegend() {
  return (
    <ul className="mt-1.5 flex justify-end gap-4 text-[11px]" style={{ color: CHART_THEME.axis }}>
      {LEGEND_ITEMS.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-[18px] border-t-2" style={{ borderColor: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** OD vs time (0-24h): replicate A/B (muted) + the shared Gompertz fit (emphasized). */
export function GrowthCurve({ well, partner, base }: GrowthCurveProps) {
  const data = HOURS.map((t, i) => ({
    t,
    repA: well.replicate === "A" ? well.curve[i] : (partner?.curve[i] ?? null),
    repB: well.replicate === "B" ? well.curve[i] : (partner?.curve[i] ?? null),
    fit: gompertz(t, base),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 14, bottom: 16, left: -6 }}>
        <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[0, 24]}
          ticks={[0, 4, 8, 12, 16, 20, 24]}
          tickFormatter={(v: number) => `${v}h`}
          tick={tick}
          tickLine={false}
          axisLine={{ stroke: CHART_THEME.grid }}
          label={axisTitle("time", "x")}
        />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} label={axisTitle("OD", "y")} />
        <Tooltip {...tip} />
        <Legend content={<GrowthLegend />} />
        <Line
          type="monotone"
          dataKey="repA"
          name="replicate A"
          stroke="#9aa7c7"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="repB"
          name="replicate B"
          stroke="#c3cbe3"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="fit"
          name="Gompertz fit"
          stroke={CHART_THEME.series}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
