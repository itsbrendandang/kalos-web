"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { CHART_THEME, tick } from "@/components/charts";
import { seqColor, SEQ_GRADIENT_CSS } from "@/components/dashboard/heat-scale";
import { HOURS, type KineticChannel, type Vessel } from "@/lib/vessel-data";

const TICKS = [0, 48, 96, 144, 192, 240, 288, 336];

interface KineticOverlayProps {
  title: string;
  sub: string;
  channel: KineticChannel;
  vessels: Vessel[];
  titerMin: number;
  titerMax: number;
  selectedIds: Set<number>;
  yTickFormatter?: (v: number) => string;
}

/**
 * Kinetic-trace overlay for one channel (titer / viability / VCD / pH) across all
 * vessels: single axis, one line per vessel colored sequentially by final titer
 * (light -> dark). Selected vessels are drawn last and emphasized (full opacity,
 * thicker stroke); the rest are dimmed so the selection reads at a glance.
 */
export function KineticOverlay({
  title,
  sub,
  channel,
  vessels,
  titerMin,
  titerMax,
  selectedIds,
  yTickFormatter,
}: KineticOverlayProps) {
  const data = HOURS.map((t, i) => {
    const point: Record<string, number> = { t };
    vessels.forEach((v) => {
      point[`v${v.idx}`] = v.series[channel][i];
    });
    return point;
  });

  const hasSelection = selectedIds.size > 0;
  // Draw dimmed (non-selected) traces first, emphasized ones last so they sit on top.
  const ordered = [...vessels].sort((a, b) => {
    const aSel = selectedIds.has(a.idx) ? 1 : 0;
    const bSel = selectedIds.has(b.idx) ? 1 : 0;
    return aSel - bSel;
  });

  return (
    <div>
      <h3 className="text-[12px] font-bold text-fg">{title}</h3>
      <p className="mb-1.5 text-[10.5px] text-muted">{sub}</p>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 8, left: -14 }}>
          <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[0, 336]}
            ticks={TICKS}
            tickFormatter={(v: number) => `${v}h`}
            tick={{ ...tick, fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: CHART_THEME.grid }}
          />
          <YAxis
            tick={{ ...tick, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={yTickFormatter}
          />
          {ordered.map((v) => {
            const emphasized = !hasSelection || selectedIds.has(v.idx);
            return (
              <Line
                key={v.idx}
                dataKey={`v${v.idx}`}
                stroke={seqColor(v.finalTiter, titerMin, titerMax)}
                strokeWidth={emphasized ? 1.6 : 1}
                strokeOpacity={emphasized ? 0.9 : 0.15}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex items-center gap-1.5 text-[9.5px] text-muted">
        low
        <span className="h-1.5 w-14 rounded-full" style={{ background: SEQ_GRADIENT_CSS }} />
        high · final titer
      </div>
    </div>
  );
}
