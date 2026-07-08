"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { CHART_THEME, tick, tip } from "@/components/charts";
import type { PopulatedResult } from "@/lib/api";
import { fmt } from "@/lib/utils";

type Bin = { label: string; count: number; isZero: boolean };

/** Equal-width bins over the producing (target > 0) values only; the zero bin is added separately. */
function buildProducerBins(values: number[]): Bin[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: fmt(min, 1), count: values.length, isZero: false }];

  const binCount = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(values.length))));
  const width = (max - min) / binCount;
  const counts = new Array<number>(binCount).fill(0);
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    counts[idx] += 1;
  }
  return counts.map((count, i) => ({ label: fmt(min + width * (i + 0.5), 1), count, isZero: false }));
}

/**
 * Histogram of measured target values from the held-out (`oof`) points -
 * purely derived from data already on `PopulatedResult`, no engine
 * dependency. The zero bin (non-producers) gets a distinct bar color and an
 * honest caption computed from the actual counts, never a fixed threshold.
 */
export function TargetDistribution({ d }: { d: PopulatedResult }) {
  const measured = d.oof.map(([m]) => m);
  const total = measured.length;

  if (total === 0) {
    return (
      <Card className="flex h-full flex-col">
        <div className="text-[15px] font-semibold text-fg">Target distribution</div>
        <p className="mt-1 text-[12px] leading-snug text-muted">Distribution of measured {d.target} across held-out runs.</p>
        <p className="flex flex-1 items-center justify-center py-10 text-center text-[12px] text-muted">
          not enough held-out points
        </p>
      </Card>
    );
  }

  const nonProducers = measured.filter((v) => v === 0).length;
  const producers = measured.filter((v) => v > 0);
  const pct = ((nonProducers / total) * 100).toFixed(0);

  const data: Bin[] = [{ label: "0", count: nonProducers, isZero: true }, ...buildProducerBins(producers)];

  return (
    <Card className="flex h-full flex-col">
      <div className="text-[15px] font-semibold text-fg">Target distribution</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        Measured {d.target} across {total} held-out run{total === 1 ? "" : "s"}.
      </p>

      <div className="mt-3 flex flex-1 flex-col rounded-[10px] border border-border bg-bg p-3">
        <div className="min-h-[160px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ ...tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART_THEME.grid }} />
              <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={28} />
              <Tooltip {...tip} cursor={{ fill: CHART_THEME.hoverCursor }} />
              <Bar dataKey="count" name="runs" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((bin, i) => (
                  <Cell key={i} fill={bin.isZero ? CHART_THEME.seriesDown : CHART_THEME.series} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted">
        <span className="font-mono">
          {nonProducers} of {total} runs ({pct}%)
        </span>{" "}
        produced zero measurable {d.target}.
      </p>
    </Card>
  );
}
