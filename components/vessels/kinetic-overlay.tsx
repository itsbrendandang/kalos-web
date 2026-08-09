"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { CHART_THEME, tick } from "@/components/charts";
import { HOURS, type KineticChannel, type Vessel } from "@/lib/vessel-data";

const TICKS = [0, 48, 96, 144, 192, 240, 288, 336];

// --- per-vessel visual identity -------------------------------------------
// Vessels are an UNORDERED category here (this is a "which trace is which
// reactor" overlay, not a magnitude encoding), so per DESIGN.md this is the
// one place in the vessel views that reaches for --series-1..6 (Okabe-Ito,
// colorblind-safe) instead of the single-hue --chart ramp used everywhere
// else vessels are colored by titer (the table sparklines, the correlation
// scatter). --series-2/--series-5 are flagged in app/globals.css as too weak
// to carry meaning by hue alone, so every trace ALSO gets a dash pattern -
// 6 colors x 8 dash rhythms = 48 unique (color, dash) pairs, matching the
// max vessel count 1:1 with zero collisions, so no two vessels in the same
// chart are ever identical in a greyscale render (dash differs whenever hue
// repeats). Assigned from the vessel's own `idx` (not selection order), so a
// given vessel keeps the same signature across all five kinetic panels.
const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

const DASH_PATTERNS = [
  undefined, // solid
  "6 3",
  "2 2",
  "9 2 2 2",
  "1 3",
  "10 3 2 3",
  "4 2 1 2",
  "12 4",
] as const;

function traceStyle(vesselIdx: number): { stroke: string; dash?: string } {
  const rank = (vesselIdx - 1 + SERIES_COLORS.length * DASH_PATTERNS.length) % (SERIES_COLORS.length * DASH_PATTERNS.length);
  const stroke = SERIES_COLORS[rank % SERIES_COLORS.length];
  const dash = DASH_PATTERNS[Math.floor(rank / SERIES_COLORS.length) % DASH_PATTERNS.length];
  return { stroke, dash };
}

interface KineticOverlayProps {
  title: string;
  sub: string;
  channel: KineticChannel;
  vessels: Vessel[];
  selectedIds: Set<number>;
  yTickFormatter?: (v: number) => string;
}

/**
 * Kinetic-trace overlay for one channel (titer / viability / VCD / pH) across
 * all vessels: single axis, one line per vessel with a stable color + dash
 * identity (see `traceStyle` above). Selected vessels are drawn last and
 * emphasized (full opacity, >=2px stroke); the rest are dimmed to a flat
 * neutral background line so the selection reads at a glance.
 */
export function KineticOverlay({ title, sub, channel, vessels, selectedIds, yTickFormatter }: KineticOverlayProps) {
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
            const style = traceStyle(v.idx);
            return (
              <Line
                key={v.idx}
                dataKey={`v${v.idx}`}
                stroke={emphasized ? style.stroke : "var(--border)"}
                strokeDasharray={emphasized ? style.dash : undefined}
                strokeWidth={emphasized ? 2.2 : 1.2}
                strokeOpacity={emphasized ? 0.92 : 0.35}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[9.5px] leading-snug text-muted">
        {hasSelection ? `${selectedIds.size} selected vessel${selectedIds.size === 1 ? "" : "s"}` : "All vessels"} -
        each line is a distinct vessel, identified by color and dash pattern (not color alone).
      </p>
    </div>
  );
}
