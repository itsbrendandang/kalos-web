"use client";

import { ScatterChart, Scatter, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { CHART_THEME, tick, tip } from "@/components/charts";
import type { PopulatedResult } from "@/lib/api";
import { fmt } from "@/lib/utils";
import { seqColor, SEQ_GRADIENT_CSS } from "@/components/dashboard/heat-scale";

type Point = { x: number; y: number; target: number };

/**
 * Scatter plot of the engine's low-dimensional embedding of every run
 * (positioned by recipe similarity, colored by target). Non-producer runs
 * (target === 0) are real data too - they stay plotted, rendered as hollow
 * rings instead of filled dots so they read distinctly without relying on
 * color alone.
 *
 * Renders nothing when the current analysis has no `embedding`: older
 * analyses predate this field, and the honest move is an absent card, not a
 * fabricated placeholder.
 */
export function RunLandscape({ d }: { d: PopulatedResult }) {
  const embedding = d.embedding;
  if (!embedding || embedding.points.length === 0) return null;

  const points: Point[] = embedding.points.map(([x, y, target]) => ({ x, y, target }));
  const producers = points.filter((p) => p.target > 0);
  const nonProducerCount = points.length - producers.length;
  const targets = producers.map((p) => p.target);
  const min = targets.length ? Math.min(...targets) : 0;
  const max = targets.length ? Math.max(...targets) : 0;

  return (
    <Card className="flex h-full flex-col">
      <div className="text-[15px] font-semibold text-fg">Run landscape</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        {embedding.method.toUpperCase()} projection of {points.length} runs, positioned by recipe similarity and
        colored by {d.target}.
      </p>

      <div className="mt-3 flex flex-1 flex-col rounded-[10px] border border-border bg-bg p-3">
        <div className="min-h-[220px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 14, bottom: 8, left: -6 }}>
              <CartesianGrid stroke={CHART_THEME.grid} />
              <XAxis
                type="number"
                dataKey="x"
                name="dim 1"
                tick={tick}
                tickLine={false}
                axisLine={{ stroke: CHART_THEME.grid }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="dim 2"
                tick={tick}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip {...tip} cursor={{ strokeDasharray: "3 3", stroke: CHART_THEME.grid }} />
              <Scatter data={points} isAnimationActive={false}>
                {points.map((p, i) =>
                  p.target === 0 ? (
                    <Cell key={i} fill="var(--bg)" stroke={CHART_THEME.seriesDown} strokeWidth={1.5} />
                  ) : (
                    <Cell key={i} fill={seqColor(p.target, min, max)} stroke="none" />
                  ),
                )}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
          {producers.length > 0 ? (
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span className="font-mono">{fmt(min, 2)}</span>
              <span className="h-2 w-20 rounded-full" style={{ background: SEQ_GRADIENT_CSS }} />
              <span className="font-mono">{fmt(max, 2)}</span>
              <span className="max-w-[16ch] truncate" title={d.target}>
                {d.target}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-muted">no producing runs to scale color by</span>
          )}
          {nonProducerCount > 0 ? (
            <div className="flex items-center gap-1.5 text-[10px] whitespace-nowrap text-muted">
              <span className="inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-explore-deep bg-bg" />
              non-producer ({nonProducerCount})
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
