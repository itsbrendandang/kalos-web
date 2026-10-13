"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { ChartTooltipBox } from "@/components/tremor/chart-parts";
import { formatNumber } from "@/lib/format";

type Embedding = { method: string; points: [number, number, number][] };

/** 1..5, the step of the sequential ramp for a value in [min, max]; the ramp keeps the highest values most visible in both themes. */
const step = (v: number, min: number, max: number) => (max > min ? Math.min(5, 1 + Math.floor(((v - min) / (max - min)) * 5)) : 3);

/**
 * Every run positioned by recipe similarity (the engine's 2D projection),
 * coloured by the target on the sequential ramp. The axes have no meaningful
 * scale, so they carry titles but no ticks. Runs at zero are real data: they
 * stay, as hollow rings, so they read without colour.
 */
export function RunLandscape({ embedding, targetName, unit }: { embedding: Embedding; targetName: string; unit: string }) {
  const points = embedding.points.map(([x, y, target]) => ({ x, y, target }));
  const positive = points.filter((p) => p.target > 0).map((p) => p.target);
  const min = positive.length ? Math.min(...positive) : 0;
  const max = positive.length ? Math.max(...positive) : 0;
  const zeros = points.length - positive.length;
  const suffix = unit ? ` (${unit})` : "";
  return (
    <div>
      <p className="mb-2 text-caption text-fg-muted">
        {points.length} runs placed by recipe similarity ({embedding.method.toUpperCase()} projection), coloured by {targetName}
        {suffix}. Nearby points have similar recipes.
      </p>
      <div role="img" aria-label={`${points.length} runs by recipe similarity, coloured by ${targetName}`} className="h-64 w-full">
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid className="stroke-chart-grid stroke-1" />
            <XAxis type="number" dataKey="x" tick={false} tickLine={false} axisLine={false} height={8} />
            <YAxis type="number" dataKey="y" tick={false} tickLine={false} axisLine={false} width={8} />
            <Tooltip
              isAnimationActive={false}
              cursor={{ strokeDasharray: "3 3", className: "stroke-border-strong" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as { target: number };
                return <ChartTooltipBox label="Run">{<p className="text-fg tabular-nums">{formatNumber(d.target)}{unit ? ` ${unit}` : ""}</p>}</ChartTooltipBox>;
              }}
            />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p, i) =>
                p.target > 0 ? (
                  <Cell key={i} fill={`var(--chart-seq-${step(p.target, min, max)})`} stroke="none" />
                ) : (
                  <Cell key={i} fill="var(--surface)" stroke="var(--fg-muted)" strokeWidth={1.5} />
                ),
              )}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
        {positive.length ? (
          <span className="flex items-center gap-2 tabular-nums">
            {formatNumber(min)}
            <span className="flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} className="h-2.5 w-5 first:rounded-l-sm last:rounded-r-sm" style={{ background: `var(--chart-seq-${s})` }} />
              ))}
            </span>
            {formatNumber(max)}
          </span>
        ) : null}
        {zeros > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full border-[1.5px] border-fg-muted bg-surface" />
            {zeros} {zeros === 1 ? "run" : "runs"} at zero
          </span>
        ) : null}
      </div>
    </div>
  );
}
