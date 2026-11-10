"use client";

import { CartesianGrid, Label, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_LABEL_CLASS, AXIS_TICK_CLASS, ChartTooltipBox } from "@/components/tremor/chart-parts";
import { formatNumber } from "@/lib/format";

/**
 * Held-out predictions against what was measured, one dot per run, with the
 * "perfect agreement" diagonal dashed. `oof` pairs are [measured, predicted].
 */
export function PredVsMeasured({ oof, targetName, unit }: { oof: [number, number][]; targetName: string; unit: string }) {
  const data = oof.map(([measured, predicted]) => ({ measured, predicted })).filter((d) => Number.isFinite(d.measured) && Number.isFinite(d.predicted));
  if (!data.length) return <p className="text-caption text-fg-muted">No held-out predictions to plot yet.</p>;
  const vals = data.flatMap((d) => [d.measured, d.predicted]);
  const rawLo = Math.min(...vals);
  const rawHi = Math.max(...vals);
  const pad = (rawHi - rawLo || Math.abs(rawHi) || 1) * 0.05;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const suffix = unit ? ` (${unit})` : "";
  return (
    <div role="img" aria-label={`Predicted against measured ${targetName} for ${data.length} held-out runs`} className="h-72 w-full">
      <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 16 }}>
          <CartesianGrid className="stroke-chart-grid stroke-1" />
          <XAxis type="number" dataKey="measured" domain={[lo, hi]} tickFormatter={(v: number) => formatNumber(v)} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
            <Label position="insideBottom" offset={-18} className={AXIS_LABEL_CLASS}>{`Measured ${targetName}${suffix}`}</Label>
          </XAxis>
          <YAxis type="number" dataKey="predicted" domain={[lo, hi]} width={56} tickFormatter={(v: number) => formatNumber(v)} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
            <Label position="insideLeft" style={{ textAnchor: "middle" }} angle={-90} offset={-10} className={AXIS_LABEL_CLASS}>{`Predicted ${targetName}${suffix}`}</Label>
          </YAxis>
          <ReferenceLine segment={[{ x: lo, y: lo }, { x: hi, y: hi }]} className="stroke-chart-reference" stroke="" strokeDasharray="5 5" ifOverflow="extendDomain" />
          <Tooltip
            isAnimationActive={false}
            cursor={{ strokeDasharray: "3 3", className: "stroke-border-strong" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { measured: number; predicted: number };
              return (
                <ChartTooltipBox
                  label="Held-out run"
                  rows={[
                    { name: "Measured", value: formatNumber(d.measured), color: "accent" },
                    { name: "Predicted", value: formatNumber(d.predicted), color: "muted" },
                  ]}
                />
              );
            }}
          />
          <Scatter data={data} fill="var(--chart-predicted)" fillOpacity={0.6} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
