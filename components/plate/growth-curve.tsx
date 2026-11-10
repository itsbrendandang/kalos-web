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
  { label: "replicate A", color: "var(--chart-measured)", dash: "solid" },
  { label: "replicate B", color: "var(--fg-muted)", dash: "dashed" },
  { label: "Gompertz fit", color: CHART_THEME.series, dash: "solid" },
];

/**
 * Fixed-order legend (A, B, fit) rendered via Legend's `content` prop - Recharts'
 * default legend lists series in the reverse of their <Line> declaration order, and
 * declaration order here is A/B/fit so the emphasized fit line paints last (on top,
 * correct z-order over the muted replicates).
 */
function GrowthLegend() {
  return (
    <ul className="mt-1.5 flex flex-wrap justify-end gap-x-4 gap-y-1 text-caption" style={{ color: CHART_THEME.axis }}>
      {LEGEND_ITEMS.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-[18px] border-t-2" style={{ borderColor: it.color, borderTopStyle: it.dash as "solid" | "dashed" }} />
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

  const label = `Optical density vs. time for well ${well.id}${partner ? ` and replicate ${partner.id}` : ""}, with the shared Gompertz fit`;
  return (
    <div>
    <div role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 14, bottom: 16, left: 4 }}>
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
        <YAxis tick={tick} tickLine={false} axisLine={false} width={52} label={axisTitle("OD", "y")} />
        <Tooltip {...tip} />
        <Legend content={<GrowthLegend />} />
        <Line
          type="monotone"
          dataKey="repA"
          name="replicate A"
          stroke="var(--chart-measured)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="repB"
          name="replicate B"
          stroke="var(--fg-muted)"
          strokeDasharray="5 3"
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
    </div>
    <div className="sr-only">
    <table>
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">Hour</th>
          <th scope="col">Replicate A OD</th>
          <th scope="col">Replicate B OD</th>
          <th scope="col">Gompertz fit OD</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.t}>
            <th scope="row">{d.t}</th>
            <td>{d.repA == null ? "" : d.repA.toFixed(3)}</td>
            <td>{d.repB == null ? "" : d.repB.toFixed(3)}</td>
            <td>{d.fit.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
    </div>
  );
}
