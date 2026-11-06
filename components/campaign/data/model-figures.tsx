"use client";

// The model figures for "The model". The response slice draws the engine's posterior mean as a line (the
// model's best guess), the band as mean +/- one posterior sd (how sure the model is here; the legend says so in
// plain words, the disclosure in the-model.tsx in the engine's), and measured runs as hollow rings. "What the
// model leans on" is plain rows: a length bar for the engine's relevance share, and the shape in words.
import type { ReactNode } from "react";
import { dataNumber, linear, niceTicks } from "@/components/campaign/data/svg";
import type { ShapeRow, Slice } from "@/components/campaign/data/model-math";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = 320;
const H = 220;
const PAD = { l: 44, r: 8, t: 8, b: 30 };
const TICK = "fill-fg-muted text-caption";

export function SliceFigure({ slice, target }: { slice: Slice; target: string }) {
  const x0 = slice.xs[0];
  const x1 = slice.xs[slice.xs.length - 1];
  const yTicks = niceTicks(slice.yRange[0], slice.yRange[1], 3);
  const yDomain: [number, number] = [Math.min(...yTicks, slice.yRange[0]), Math.max(...yTicks, slice.yRange[1])];
  const x = linear([x0, x1], [PAD.l, W - PAD.r]);
  const y = linear(yDomain, [H - PAD.b, PAD.t]);
  const xTicks = niceTicks(x0, x1, 4);
  const line = slice.xs.map((v, i) => `${x(v).toFixed(1)},${y(slice.mean[i]).toFixed(1)}`).join(" ");
  const band =
    slice.lo && slice.hi
      ? [
          ...slice.xs.map((v, i) => `${x(v).toFixed(1)},${y(slice.hi![i]).toFixed(1)}`),
          ...slice.xs.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `${x(v).toFixed(1)},${y(slice.lo![i]).toFixed(1)}`),
        ].join(" ")
      : null;
  const held = slice.yHeld != null ? `${slice.yName} held at ${dataNumber(slice.yHeld)}` : `${slice.yName} at the middle of its range`;
  const label = `Predicted ${target} against ${slice.xName}, with ${held}. ${slice.lo ? "Shaded: how sure the model is at each point; wider is less sure." : "No shading: Kalos did not say how sure the model is here."} ${slice.runsNear.length} measured runs near that value.`;
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-chart-grid" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>{dataNumber(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={H - 10} textAnchor="middle" className={TICK}>{dataNumber(t)}</text>
        ))}
        {band ? <polygon points={band} className="fill-chart-band" data-band="sd" /> : null}
        <polyline points={line} fill="none" className="stroke-chart-predicted" strokeWidth={2} />
        {slice.runsNear.map(([rx, rt], i) => (
          <circle key={i} cx={x(rx)} cy={y(rt)} r={3.25} fill="none" className="stroke-chart-measured" strokeWidth={1.25} />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-2 text-caption text-fg-muted">
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-chart-predicted" aria-hidden />
          Predicted by the model (its best guess)
        </span>
        {slice.lo ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-5 bg-chart-band" aria-hidden />
            Shaded: how sure the model is here, at most ±{dataNumber(slice.bandHalf)}. It is not the run-to-run spread.
          </span>
        ) : null}
        <span className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full border-[1.5px] border-chart-measured" aria-hidden />
          Measured runs near {slice.yHeld != null ? `${slice.yName} ${dataNumber(slice.yHeld)}` : "the held value"}: {formatNumber(slice.runsNear.length, "count")}
        </span>
      </figcaption>
    </figure>
  );
}

/** A relevance share as a percentage; anything under half a percent reads "under 1%", never "0%". */
export const shareWords = (share: number) => (share < 0.005 ? "under 1%" : formatNumber(share, "pct"));

/** What the model leans on, from the engine's shape reading: a length bar (the share of relevance), the shape in words, and the rank-miss flag. */
export function DriverList({ rows }: { rows: ShapeRow[] }) {
  const max = Math.max(...rows.map((r) => r.share), 0) || 1;
  return (
    <ol className="divide-y divide-border">
      {rows.map((r, i) => (
        <li key={r.name} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="min-w-0">
            <p className="flex items-baseline gap-2 text-label text-fg">
              <span className="text-fg-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 break-words font-mono text-code">{r.name}</span>
            </p>
            <p className="mt-0.5 pl-5 text-caption text-fg-muted">{r.sentence}</p>
          </div>
          <div className="min-w-0">
            <div role="img" aria-label={`${r.name}: the model leans on it for ${formatNumber(r.share, "pct")}`} className="relative h-3 w-full rounded-sm bg-subtle">
              <div className="absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${(r.share / max) * 100}%` }} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted">
              <span className="tabular-nums text-fg">{shareWords(r.share)} of what the model leans on</span>
              {r.missedBySpearman ? <span>Asking only whether more is better would have missed this shape.</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A figure with a plain caption above, and a note below. Shared by the model's figures. */
export function ModelFigure({ caption, note, children, className }: { caption: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="text-label text-fg">{caption}</figcaption>
      {children}
      {note ? <div className="text-caption text-fg-muted">{note}</div> : null}
    </figure>
  );
}
