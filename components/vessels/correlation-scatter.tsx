"use client";

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { ScatterShapeProps } from "recharts";
import { CHART_THEME, tick, tip, axisTitle } from "@/components/charts";
import { seqColor } from "@/components/dashboard/heat-scale";
import { linearRegression, type Vessel } from "@/lib/vessel-data";

interface CorrelationScatterProps {
  vessels: Vessel[];
  titerMin: number;
  titerMax: number;
  selectedIds: Set<number>;
}

interface PointDatum {
  idx: number;
  qP: number;
  finalTiter: number;
}

/** Final titer vs. specific productivity (qP): all vessels + an OLS fit line + R^2. */
export function CorrelationScatter({ vessels, titerMin, titerMax, selectedIds }: CorrelationScatterProps) {
  const data: PointDatum[] = vessels.map((v) => ({ idx: v.idx, qP: v.qP, finalTiter: v.finalTiter }));
  const xs = vessels.map((v) => v.qP);
  const ys = vessels.map((v) => v.finalTiter);
  const { slope, intercept, r2 } = linearRegression(xs, ys);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const hasSelection = selectedIds.size > 0;

  function renderDot(props: ScatterShapeProps) {
    const { cx, cy } = props;
    const point = props.payload as PointDatum;
    if (cx == null || cy == null) return null;
    const selected = !hasSelection || selectedIds.has(point.idx);
    return (
      <circle
        cx={cx}
        cy={cy}
        r={selected ? 3.4 : 2.4}
        fill={selected ? seqColor(point.finalTiter, titerMin, titerMax) : "var(--border)"}
        stroke={selected ? "#ffffff" : "none"}
        strokeWidth={selected ? 0.8 : 0}
      />
    );
  }

  return (
    <div>
      <h3 className="text-[12px] font-bold text-fg">Correlation</h3>
      <p className="mb-1.5 text-[10.5px] text-muted">Final titer vs. specific productivity (qP)</p>
      <ResponsiveContainer width="100%" height={190}>
        <ScatterChart margin={{ top: 4, right: 8, bottom: 8, left: -8 }}>
          <CartesianGrid stroke={CHART_THEME.grid} />
          <XAxis
            type="number"
            dataKey="qP"
            name="qP"
            tick={{ ...tick, fontSize: 9 }}
            tickLine={false}
            axisLine={{ stroke: CHART_THEME.grid }}
            label={axisTitle("qP", "x")}
          />
          <YAxis
            type="number"
            dataKey="finalTiter"
            name="final titer"
            tick={{ ...tick, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <ReferenceLine
            segment={[
              { x: xMin, y: slope * xMin + intercept },
              { x: xMax, y: slope * xMax + intercept },
            ]}
            stroke="var(--blue-deep)"
            strokeDasharray="4 3"
            ifOverflow="extendDomain"
          />
          <Tooltip {...tip} cursor={{ strokeDasharray: "3 3", stroke: CHART_THEME.grid }} />
          <Scatter data={data} shape={renderDot} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="tabular mt-1 font-mono text-[10px] text-muted">
        y = {slope.toFixed(4)}x + {intercept.toFixed(3)} · R² = {r2.toFixed(3)}
      </div>
    </div>
  );
}
