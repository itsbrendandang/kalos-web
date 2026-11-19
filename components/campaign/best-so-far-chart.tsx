"use client";

import { useEffect, useRef, useState } from "react";
import { ChartFrame } from "@/components/kit/chart-frame";
import { MeasuredMark } from "@/components/campaign/plan/marks";
import { formatNumber } from "@/lib/format";
import { bestSoFarSeries, historyLabel, niceTicks, type BestSoFarPoint } from "@/lib/overview";
import type { ActiveCampaign } from "@/lib/workbench";

const HEIGHT = 240;
const M = { top: 24, right: 16, bottom: 40, left: 64 };
/** Space between the y axis (and right edge) and the first (and last) round, so end labels never clip. */
const PAD_X = 32;

/**
 * Measured best-so-far by round (campaign.history): a step line in the
 * measured ink with a filled dot per round, because the best holds until a
 * later measured run beats it. Never a prediction, so no accent and no rings;
 * a round with no measured best is a gap, not a zero. Drawn in plain SVG so
 * the marks follow the measured/predicted encoding exactly.
 */
export function BestSoFarChart({ campaign, unit, className }: { campaign: Pick<ActiveCampaign, "history" | "target" | "n_base">; unit: string; className?: string }) {
  const series = bestSoFarSeries(campaign);
  const measuredRounds = series.filter((p) => p.best != null).length;
  return (
    <ChartFrame
      title="Best so far, by round"
      unit={unit || undefined}
      n={campaign.n_base}
      method="The highest measured value in the campaign after each round's results were added to the model. The first point is the uploaded sheet. Measured values only, never predictions."
      state={measuredRounds < 2 ? "insufficient" : "ready"}
      insufficientText="Only the uploaded sheet so far. The trend appears once a round's measured results are added to the model by a re-analysis."
      height={measuredRounds < 2 ? 88 : HEIGHT}
      className={className}
    >
      <Plot series={series} target={campaign.target} unit={unit} />
    </ChartFrame>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Plot({ series, target, unit }: { series: BestSoFarPoint[]; target: string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const values = series.map((p) => p.best).filter((v): v is number => v != null);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const innerW = Math.max(0, width - M.left - M.right - 2 * PAD_X);
  const innerH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + PAD_X + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  // Show every k-th round label so they never collide.
  const every = Math.max(1, Math.ceil(series.length / Math.max(1, Math.floor(innerW / 84))));

  // Step segments between consecutive measured points; a missing best breaks the line.
  const path: string[] = [];
  series.forEach((p, i) => {
    if (p.best == null) return;
    const prev = series[i - 1];
    if (i > 0 && prev?.best != null) path.push(`H ${x(i)} V ${y(p.best)}`);
    else path.push(`M ${x(i)} ${y(p.best)}`);
  });
  const last = [...series].reverse().find((p) => p.best != null);
  const lastIndex = last ? series.lastIndexOf(last) : -1;
  const summary = series.map((p) => `${historyLabel(p.round)} ${formatNumber(p.best)}`).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-caption text-fg-muted">
        <MeasuredMark /> Measured best so far{unit ? ` (${unit})` : ""}. Predictions are never drawn here.
      </p>
      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Measured best ${target} by round: ${summary}`} className="overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-caption tabular-nums">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            <text
              transform={`translate(14 ${M.top + innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-fg-muted text-caption"
            >
              {target}
            </text>
            {series.map((p, i) =>
              i % every === 0 || i === series.length - 1 ? (
                <text key={p.round} x={x(i)} y={HEIGHT - M.bottom + 24} textAnchor="middle" className="fill-fg-muted text-caption">
                  {p.round === 0 ? "Upload" : `Round ${p.round}`}
                </text>
              ) : null,
            )}
            <path d={path.join(" ")} fill="none" stroke="var(--chart-measured)" strokeWidth={2} strokeLinejoin="round" />
            {series.map((p, i) =>
              p.best == null ? (
                <text key={p.round} x={x(i)} y={M.top + innerH - 6} textAnchor="middle" className="fill-fg-muted text-caption">
                  n/a
                  <title>{`${historyLabel(p.round)}: the engine reported no measured best`}</title>
                </text>
              ) : (
                <g key={p.round}>
                  <circle cx={x(i)} cy={y(p.best)} r={6} fill="var(--surface)" />
                  <circle cx={x(i)} cy={y(p.best)} r={4.5} fill="var(--chart-measured)">
                    <title>{`${historyLabel(p.round)}: best ${formatNumber(p.best)}${unit ? ` ${unit}` : ""}, measured, from ${formatNumber(p.runs, "count")} runs`}</title>
                  </circle>
                </g>
              ),
            )}
            {last?.best != null ? (
              <text x={x(lastIndex)} y={y(last.best) - 12} textAnchor="middle" className="fill-fg text-label tabular-nums">
                {formatNumber(last.best)}
              </text>
            ) : null}
          </svg>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>Measured best {target} by round</caption>
        <thead>
          <tr>
            <th scope="col">Round</th>
            <th scope="col">Measured best</th>
            <th scope="col">Runs</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.round}>
              <th scope="row">{historyLabel(p.round)}</th>
              <td>{formatNumber(p.best)}</td>
              <td>{formatNumber(p.runs, "count")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
