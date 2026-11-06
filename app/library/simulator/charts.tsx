"use client";

import { CartesianGrid, Label, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_LABEL_CLASS, AXIS_TICK_CLASS, ChartLegend, ChartTooltipBox } from "@/components/tremor/chart-parts";
import { formatNumber } from "@/lib/format";

const tickFmt = (v: number) => formatNumber(v);

/** Best value found so far against runs made: one line, position encodes the value. */
export function ConvergenceChart({ data }: { data: { n: number; best: number }[] }) {
  return (
    <div role="img" aria-label={`Best value after each round: ${data.map((d) => `${d.n} runs ${formatNumber(d.best)}`).join(", ")}`} className="h-64 w-full">
      <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
          <CartesianGrid className="stroke-chart-grid stroke-1" vertical={false} />
          <XAxis type="number" dataKey="n" domain={["dataMin", "dataMax"]} allowDecimals={false} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
            <Label position="insideBottom" offset={-18} className={AXIS_LABEL_CLASS}>Runs made</Label>
          </XAxis>
          <YAxis type="number" dataKey="best" domain={["auto", "auto"]} width={56} tickFormatter={tickFmt} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
            <Label position="insideLeft" style={{ textAnchor: "middle" }} angle={-90} offset={-2} className={AXIS_LABEL_CLASS}>Best value found</Label>
          </YAxis>
          <Tooltip
            isAnimationActive={false}
            cursor={{ strokeDasharray: "3 3", className: "stroke-border-strong" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { n: number; best: number };
              return <ChartTooltipBox label={`${d.n} runs`} rows={[{ name: "Best so far", value: formatNumber(d.best), color: "accent" }]} />;
            }}
          />
          <Line type="stepAfter" dataKey="best" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type Point = { titer: number; purity: number };

/** Every run as a dot, the trade-off front as the accent dots joined by a line; the rest are muted. */
export function ParetoChart({ all, pareto }: { all: Point[]; pareto: Point[] }) {
  const front = [...pareto].sort((a, b) => a.titer - b.titer);
  const onFront = new Set(front.map((p) => `${p.titer}|${p.purity}`));
  const rest = all.filter((p) => !onFront.has(`${p.titer}|${p.purity}`));
  return (
    <div className="flex w-full flex-col">
      <ChartLegend
        items={[
          { name: "On the trade-off front", color: "accent", swatch: "solid" },
          { name: "Other runs", color: "muted", swatch: "solid" },
        ]}
      />
      <div role="img" aria-label={`Titer against purity for ${all.length} runs, ${front.length} on the trade-off front`} className="h-64 w-full">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid className="stroke-chart-grid stroke-1" />
            <XAxis type="number" dataKey="titer" name="titer" tickFormatter={tickFmt} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
              <Label position="insideBottom" offset={-18} className={AXIS_LABEL_CLASS}>Titer (made-up units)</Label>
            </XAxis>
            <YAxis type="number" dataKey="purity" name="purity" width={56} tickFormatter={tickFmt} tickLine={false} axisLine={false} fill="" stroke="" className={AXIS_TICK_CLASS}>
              <Label position="insideLeft" style={{ textAnchor: "middle" }} angle={-90} offset={-2} className={AXIS_LABEL_CLASS}>Purity (%)</Label>
            </YAxis>
            <Tooltip
              isAnimationActive={false}
              cursor={{ strokeDasharray: "3 3", className: "stroke-border-strong" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as Point;
                const isFront = onFront.has(`${d.titer}|${d.purity}`);
                return (
                  <ChartTooltipBox
                    label={isFront ? "On the trade-off front" : "Run"}
                    rows={[
                      { name: "Titer", value: formatNumber(d.titer), color: isFront ? "accent" : "muted" },
                      { name: "Purity", value: `${formatNumber(d.purity)}%`, color: isFront ? "accent" : "muted" },
                    ]}
                  />
                );
              }}
            />
            <Scatter name="Other runs" data={rest} fill="var(--fg-muted)" isAnimationActive={false} />
            <Scatter name="On the trade-off front" data={front} fill="var(--accent)" line={{ stroke: "var(--accent)", strokeWidth: 1.5 }} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
