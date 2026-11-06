"use client";

// The Your data figures. Each is a plain SVG with position or length encodings only: no pie, no area, no colour
// as magnitude, and never a line through runs. Measured values are drawn in the ink colour (--chart-measured),
// the best run is a ring with a text label, and every figure has labelled axes, n, and an aria-label that states
// what it shows. Pure geometry lives in svg.ts and profile.ts; the sentences under the figures in meaning.ts.

import type { ReactNode } from "react";
import { levelsByMedian } from "@/components/campaign/data/meaning";
import { consecutiveBlocks, niceStep, summarize, type Histogram, type ReplicateGroup, type Gap } from "@/components/campaign/data/profile";
import { dataNumber, linear, niceTicks } from "@/components/campaign/data/svg";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = 320;
const TICK = "fill-fg-muted text-caption";
const CAPTION = "fill-fg-muted text-caption";
const COUNT = "fill-fg text-caption tabular-nums";
const GRID = "stroke-chart-grid";
const AXIS = "stroke-border-strong";
const DOT = "fill-chart-measured";
const DOT_R = 2.75;
const BEST_R = 6;
/** Width per level of a strip or bar figure once it is wider than the column: room for an 8-character label. */
const SLOT = 60;

/** Deterministic jitter in [-0.25, 0.25] from a row index, so a strip's dots spread the same way on every render. */
export function jitter(row: number): number {
  const h = Math.imul(row + 1, 2654435761) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.5;
}

/** Labels longer than 8 characters are shortened to 7 and an ellipsis. */
export function shortLabel(s: string): string {
  return s.length > 8 ? `${s.slice(0, 7)}…` : s;
}

/** The ring and "best {value}" label on the best run. `flip` puts the label to the left of the ring. */
function BestMark({ cx, cy, value, flip, unit = "" }: { cx: number | string; cy: number; value: number; flip: boolean; unit?: string }) {
  const dx = flip ? -(BEST_R + 4) : BEST_R + 4;
  return (
    <g data-best={value}>
      <circle cx={cx} cy={cy} r={BEST_R} fill="none" className="stroke-accent" strokeWidth={2} />
      <text x={cx} dx={dx} y={cy + 4} textAnchor={flip ? "end" : "start"} className="fill-fg text-caption">
        best {dataNumber(value)}{unit}
      </text>
    </g>
  );
}

/** Y grid lines with their tick labels, plus the axis caption (the column name) above the axis. */
function YAxis({ ticks, y, x0, x1, name }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number; name?: string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={`y${t}`}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={x0 - 6} y={y(t) + 4} textAnchor="end" className={TICK}>
            {dataNumber(t)}
          </text>
        </g>
      ))}
      {name ? (
        <text x={0} y={10} className={CAPTION}>
          {name}
        </text>
      ) : null}
    </g>
  );
}

/** A y scale whose domain is the round ticks that enclose the values, so the top and bottom of the plot are both labelled. */
export function yScale(values: readonly number[], range: [number, number], count = 3): { ticks: number[]; y: (v: number) => number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return { ticks: [lo], y: linear([lo - 1, lo + 1], range) };
  const step = niceStep(lo, hi, count);
  const round = (v: number) => Number(v.toPrecision(12));
  const first = round(Math.floor(lo / step + 1e-9) * step);
  const ticks: number[] = [first];
  while (ticks[ticks.length - 1] < hi - step * 1e-9) ticks.push(round(first + ticks.length * step));
  return { ticks, y: linear([ticks[0], ticks[ticks.length - 1]], range) };
}

/** Which of `count` evenly spaced x labels to draw so that none overlap: the last always, then every `every`-th counted back from it. */
function labelled(count: number, every: number): (i: number) => boolean {
  return (i) => (count - 1 - i) % every === 0;
}

/**
 * Counts per bin as bars (length = runs), the count above each bar, a "runs" axis with grid lines, and a tick at
 * every edge (every other when there are more than 8). Bins are Sturges' count on round edges (profile.ts).
 */
export function DistributionFigure({ name, hist, n }: { name: string; hist: Histogram; n: number }) {
  const H = 124;
  const pad = { l: 30, r: 20, t: 26, b: 20 };
  const max = Math.max(1, ...hist.counts);
  const yTicks = niceTicks(0, max, 2).filter((t) => t <= max);
  const y = linear([0, Math.max(max, ...yTicks)], [H - pad.b, pad.t]);
  const x = linear([hist.edges[0], hist.edges[hist.edges.length - 1]], [pad.l, W - pad.r]);
  const bins = hist.counts.map((c, i) => ({ c, x0: x(hist.edges[i]), x1: x(hist.edges[i + 1]) }));
  const widest = Math.max(...hist.edges.map((e) => dataNumber(e).length)) * 7 + 6;
  const every = Math.max(hist.edges.length > 8 ? 2 : 1, Math.ceil((widest * hist.edges.length) / (W - pad.l - pad.r)));
  const show = labelled(hist.edges.length, every);
  const label = `Histogram of ${name}: ${n} runs in ${hist.counts.length} ${hist.counts.length === 1 ? "bin" : "bins"} of equal width from ${dataNumber(hist.edges[0])} to ${dataNumber(hist.edges[hist.edges.length - 1])}, most runs in one bin: ${max}. Bin count by Sturges' rule, edges on round numbers.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
      <title>{label}</title>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>
            {formatNumber(t, "count")}
          </text>
        </g>
      ))}
      <text x={0} y={10} className={CAPTION}>
        runs
      </text>
      {bins.map((b, i) => (
        <g key={i}>
          <rect x={b.x0 + 1} width={Math.max(0, b.x1 - b.x0 - 2)} y={y(b.c)} height={y(0) - y(b.c)} className="fill-accent" data-count={b.c} />
          {b.c > 0 ? (
            <text x={(b.x0 + b.x1) / 2} y={y(b.c) - 3} textAnchor="middle" className={COUNT}>
              {formatNumber(b.c, "count")}
            </text>
          ) : null}
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className={AXIS} strokeWidth={1} />
      {hist.edges.map((e, i) =>
        show(i) ? (
          <text key={`e${i}`} x={x(e)} y={H - 6} textAnchor="middle" className={TICK}>
            {dataNumber(e)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** One bar per category level, most common first, the count at the end of each bar and a "runs" axis. */
export function CategoryFigure({ name, levels }: { name: string; levels: { value: string; n: number }[] }) {
  const H = 124;
  const pad = { l: 36, r: 20, t: 26, b: 20 };
  const slot = SLOT;
  const width = Math.max(W, slot * levels.length + pad.l + pad.r);
  const max = Math.max(1, ...levels.map((l) => l.n));
  const yTicks = niceTicks(0, max, 2).filter((t) => t <= max);
  const y = linear([0, Math.max(max, ...yTicks)], [H - pad.b, pad.t]);
  const x = linear([-0.5, levels.length - 0.5], [pad.l, width - pad.r]);
  const label = `Bar chart of ${name}: ${levels.map((l) => `${l.value} ${l.n}`).join(", ")} runs.`;
  const scroll = width > W;
  return (
    <div className={scroll ? "max-w-full overflow-x-auto" : "max-w-sm"}>
      <svg viewBox={`0 0 ${width} ${H}`} width={scroll ? width : undefined} height={scroll ? H : undefined} role="img" aria-label={label} className={scroll ? "block" : "block h-auto w-full overflow-visible"}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>
              {formatNumber(t, "count")}
            </text>
          </g>
        ))}
        <text x={0} y={10} className={CAPTION}>
          runs
        </text>
        {levels.map((l, i) => {
          const w = (x(1) - x(0)) * 0.7;
          return (
            <g key={l.value}>
              <rect x={x(i) - w / 2} width={w} y={y(l.n)} height={y(0) - y(l.n)} className="fill-accent" data-count={l.n} />
              <text x={x(i)} y={y(l.n) - 3} textAnchor="middle" className={COUNT}>
                {formatNumber(l.n, "count")}
              </text>
              <text x={x(i)} y={H - 6} textAnchor="middle" className={TICK}>
                {shortLabel(l.value)}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} className={AXIS} strokeWidth={1} />
      </svg>
    </div>
  );
}

/**
 * Where the runs sit along an input's range: one tick per distinct value, and the untested stretches
 * (`gaps`, wider than a tenth of the range) shaded. Position only.
 */
export function CoverageFigure({ name, min, max, values, gaps }: { name: string; min: number; max: number; values: number[]; gaps: Gap[] }) {
  const H = 40;
  const x = linear([min, max], [6, W - 6]);
  const distinct = [...new Set(values)];
  const gapText = gaps.length ? `${gaps.length} untested ${gaps.length === 1 ? "stretch" : "stretches"}` : "no untested stretch";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Coverage of ${name} from ${dataNumber(min)} to ${dataNumber(max)}: ${distinct.length} distinct tested values, ${gapText}.`} className="block h-auto w-full max-w-sm overflow-visible">
      <line x1={6} x2={W - 6} y1={22} y2={22} className={GRID} strokeWidth={1} />
      {gaps.map((g) => (
        <rect key={`${g.from}-${g.to}`} x={x(g.from)} width={Math.max(1, x(g.to) - x(g.from))} y={16} height={12} className="fill-chart-band" data-gap={`${g.from}-${g.to}`} />
      ))}
      {distinct.map((v) => (
        <line key={v} x1={x(v)} x2={x(v)} y1={14} y2={30} className="stroke-chart-measured" strokeWidth={1} />
      ))}
    </svg>
  );
}

/** Target (y) against one numeric input (x): dots, the best run ringed, ticks on both axes and the axis names. */
export function TargetScatterFigure({ xName, yName, points }: { xName: string; yName: string; points: { x: number; y: number }[] }) {
  const H = 224;
  const pad = { l: 44, r: 16, t: 24, b: 40 };
  const ys = points.map((p) => p.y);
  const { ticks: yTicks, y } = yScale(ys, [H - pad.b, pad.t]);
  const xs = points.map((p) => p.x);
  const xLo = Math.min(...xs);
  const xHi = Math.max(...xs);
  const xTicks = niceTicks(xLo, xHi, 4);
  const x = linear([Math.min(...xTicks, xLo), Math.max(...xTicks, xHi)], [pad.l, W - pad.r]);
  const bestI = ys.indexOf(Math.max(...ys));
  const best = points[bestI];
  const label = `${yName} against ${xName}: ${points.length} runs with both values. Best ${dataNumber(best.y)} at ${xName} ${dataNumber(best.x)}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
      <YAxis ticks={yTicks} y={y} x0={pad.l} x1={W - pad.r} name={yName} />
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className={AXIS} strokeWidth={1} />
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className={AXIS} strokeWidth={1} />
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={x(t)} x2={x(t)} y1={H - pad.b} y2={H - pad.b + 4} className={AXIS} strokeWidth={1} />
          <text x={x(t)} y={H - pad.b + 16} textAnchor="middle" className={TICK}>
            {dataNumber(t)}
          </text>
        </g>
      ))}
      <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" className={CAPTION}>
        {xName} · n = {formatNumber(points.length, "count")}
      </text>
      {points.map((p, i) => (
        <circle key={i} cx={x(p.x)} cy={y(p.y)} r={DOT_R} className={DOT} />
      ))}
      <BestMark cx={x(best.x)} cy={y(best.y)} value={best.y} flip={x(best.x) > W * 0.6} />
    </svg>
  );
}

/**
 * Target (y) at each level of a category input: one strip per level, levels sorted by median target descending,
 * the dots jittered on x by a hash of the row, the median as a short tick, the level and its n under the axis.
 * Wider than the column when there are many levels: it scrolls inside the figure. The aria-label lists every level.
 */
export function CategoryStripFigure({ xName, yName, points }: { xName: string; yName: string; points: { x: string; y: number; row: number }[] }) {
  const H = 236;
  const pad = { l: 44, r: 16, t: 24, b: 52 };
  const levels = levelsByMedian(points);
  const slot = SLOT;
  const width = Math.max(W, slot * levels.length + pad.l + pad.r);
  const ys = points.map((p) => p.y);
  const { ticks: yTicks, y } = yScale(ys, [H - pad.b, pad.t]);
  const x = linear([-0.5, levels.length - 0.5], [pad.l, width - pad.r]);
  const slotW = x(1) - x(0);
  const index = new Map(levels.map((l, i) => [l.value, i]));
  const bestI = ys.indexOf(Math.max(...ys));
  const best = points[bestI];
  const label = `${yName} by ${xName}: ${points.length} runs across ${levels.length} levels, highest median first: ${levels.map((l) => `${l.value} (median ${dataNumber(l.median)}, n = ${l.ys.length})`).join(", ")}. Best ${dataNumber(best.y)} at ${best.x}.`;
  const scroll = width > W;
  const cx = (p: { x: string; row: number }) => x(index.get(p.x) ?? 0) + jitter(p.row) * slotW;
  return (
    <div className={scroll ? "max-w-full overflow-x-auto" : "max-w-sm"}>
      <svg viewBox={`0 0 ${width} ${H}`} width={scroll ? width : undefined} height={scroll ? H : undefined} role="img" aria-label={label} className={scroll ? "block" : "block h-auto w-full overflow-visible"}>
        <YAxis ticks={yTicks} y={y} x0={pad.l} x1={width - pad.r} name={yName} />
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className={AXIS} strokeWidth={1} />
        <line x1={pad.l} x2={width - pad.r} y1={H - pad.b} y2={H - pad.b} className={AXIS} strokeWidth={1} />
        {points.map((p, i) => (
          <circle key={i} cx={cx(p)} cy={y(p.y)} r={DOT_R} className={DOT} />
        ))}
        {levels.map((l, i) => (
          <g key={l.value}>
            <line x1={x(i) - 7} x2={x(i) + 7} y1={y(l.median)} y2={y(l.median)} className="stroke-fg" strokeWidth={2} data-median={l.median} />
            <text x={x(i)} y={H - pad.b + 16} textAnchor="middle" className={TICK}>
              {shortLabel(l.value)}
            </text>
            <text x={x(i)} y={H - pad.b + 30} textAnchor="middle" className={TICK}>
              n = {formatNumber(l.ys.length, "count")}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className={CAPTION}>
          {xName}, highest median first · n = {formatNumber(points.length, "count")}
        </text>
        <BestMark cx={cx(best)} cy={y(best.y)} value={best.y} flip={cx(best) > width * 0.6} />
      </svg>
    </div>
  );
}

/** One panel of the sheet-order figure: its rows as dots at percent positions, so the panel fills its width. */
function RunOrderPanel({
  title,
  rows,
  y,
  yTicks,
  H,
  padB,
  blocks,
  best,
  ariaLabel,
}: {
  title: string | null;
  rows: { row: number; v: number | null }[];
  y: (v: number) => number;
  yTicks: number[];
  H: number;
  padB: number;
  blocks: ReplicateGroup[];
  best: { row: number; v: number } | null;
  ariaLabel: string;
}) {
  const n = rows.length;
  const pos = new Map(rows.map((r, i) => [r.row, i]));
  const px = (i: number) => `${(((i + 0.5) / Math.max(1, n)) * 100).toFixed(2)}%`;
  const mid = Math.floor((n - 1) / 2);
  const axisY = H - padB;
  const present = rows.filter((r): r is { row: number; v: number } => r.v != null);
  return (
    <svg height={H} role="img" aria-label={ariaLabel} className="block w-full overflow-visible">
      {yTicks.map((t) => (
        <line key={t} x1="0%" x2="100%" y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
      ))}
      <line x1="0%" x2="100%" y1={axisY} y2={axisY} className={AXIS} strokeWidth={1} />
      {title ? (
        <text x="0%" y={10} className="fill-fg text-caption">
          {title}
        </text>
      ) : null}
      {present.map((r) => (
        <circle key={r.row} cx={px(pos.get(r.row)!)} cy={y(r.v)} r={DOT_R} className={DOT} />
      ))}
      {best && pos.has(best.row) ? <BestMark cx={px(pos.get(best.row)!)} cy={y(best.v)} value={best.v} flip={pos.get(best.row)! > n * 0.6} /> : null}
      {blocks.map((g, k) => {
        const a = pos.get(g.rows[0]);
        const b = pos.get(g.rows[g.rows.length - 1]);
        if (a == null || b == null) return null;
        const x1 = `${((a / Math.max(1, n)) * 100).toFixed(2)}%`;
        const x2 = `${(((b + 1) / Math.max(1, n)) * 100).toFixed(2)}%`;
        const by = axisY + 3 + (k % 2) * 12;
        return (
          <g key={g.rows[0]} data-block={g.rows.length}>
            <line x1={x1} x2={x2} y1={by} y2={by} className={AXIS} strokeWidth={1} />
            <text x={px((a + b) / 2)} y={by + 10} textAnchor="middle" className={TICK}>
              x{g.rows.length}
            </text>
          </g>
        );
      })}
      {n > 0 ? (
        <>
          <text x="0%" y={H - 4} className={TICK}>
            row {formatNumber(rows[0].row + 1, "count")}
          </text>
          {n > 2 ? (
            <text x={px(mid)} y={H - 4} textAnchor="middle" className={TICK}>
              row {formatNumber(rows[mid].row + 1, "count")}
            </text>
          ) : null}
          {n > 1 ? (
            <text x="100%" y={H - 4} textAnchor="end" className={TICK}>
              row {formatNumber(rows[n - 1].row + 1, "count")}
            </text>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}

/**
 * The target in sheet order: dots only, the best run ringed, consecutive replicate blocks bracketed under the
 * axis with their count. With `origins` (one label per row, null for the sheet itself) the rows are split into
 * one panel per origin, side by side on a shared y axis. Sheet order is not proven run order; the caption says so.
 */
export function RunOrderFigure({ yName, values, groups = [], origins }: { yName: string; values: (number | null)[]; groups?: ReplicateGroup[]; origins?: (string | null)[] }) {
  const H = 204;
  const pad = { t: 24, b: 44 };
  const present = values.map((v, i) => ({ row: i, v })).filter((p): p is { row: number; v: number } => p.v != null);
  const { ticks: yTicks, y } = yScale(present.length ? present.map((p) => p.v) : [0], [H - pad.b, pad.t]);
  const best = present.length ? present.reduce((a, p) => (p.v > a.v ? p : a)) : null;
  const blocks = consecutiveBlocks(groups);
  const labels = origins ? [...new Set(origins)] : [null];
  const panels = (labels.length > 1 ? labels : [null]).map((label) => {
    const rows = values.map((v, i) => ({ row: i, v })).filter((_, i) => labels.length <= 1 || (origins?.[i] ?? null) === label);
    return { label: label ?? "sheet", rows, n: rows.filter((r) => r.v != null).length };
  });
  const summary = `${yName} by row in the sheet: ${present.length} values, ${values.length} rows.`;
  return (
    <div className="flex w-full max-w-3xl items-stretch" role="group" aria-label={summary}>
      <svg width={44} height={H} className="block shrink-0 overflow-visible" aria-hidden>
        {yTicks.map((t) => (
          <text key={t} x={38} y={y(t) + 4} textAnchor="end" className={TICK}>
            {dataNumber(t)}
          </text>
        ))}
        <text x={0} y={10} className={CAPTION}>
          {yName}
        </text>
      </svg>
      <div className="flex min-w-0 flex-1 gap-4">
        {panels.map((p, i) => (
          <div key={p.label} className="min-w-0" style={{ flexGrow: Math.max(1, p.rows.length), flexBasis: 0 }}>
            <RunOrderPanel
              title={panels.length > 1 ? `${p.label}, n = ${formatNumber(p.n, "count")}` : null}
              rows={p.rows}
              y={y}
              yTicks={yTicks}
              H={H}
              padB={pad.b}
              blocks={blocks}
              best={best}
              ariaLabel={panels.length > 1 ? `${p.label}: ${p.n} values of ${yName}, rows ${(p.rows[0]?.row ?? 0) + 1} to ${(p.rows[p.rows.length - 1]?.row ?? 0) + 1}.` : i === 0 ? summary : ""}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Each replicate group as a vertical strip of its target values, groups sorted by median target descending,
 * labelled x{k} under the axis, the best run ringed. Shows at most `limit` groups.
 */
export function ReplicateFigure({ yName, groups, limit = 40 }: { yName: string; groups: ReplicateGroup[]; limit?: number }) {
  const sorted = [...groups]
    .map((g) => ({ g, median: summarize(g.targets)?.median ?? -Infinity }))
    .sort((a, b) => b.median - a.median)
    .map((s) => s.g);
  const shown = sorted.slice(0, limit);
  const H = 204;
  const pad = { l: 44, r: 16, t: 24, b: 36 };
  const all = shown.flatMap((g) => g.targets);
  const { ticks: yTicks, y } = yScale(all.length ? all : [0], [H - pad.b, pad.t]);
  const x = linear([-0.5, shown.length - 0.5], [pad.l, W - pad.r]);
  const bestV = all.length ? Math.max(...all) : null;
  const bestG = shown.findIndex((g) => g.targets.includes(bestV as number));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${yName} for ${groups.length} replicate groups, ${shown.length} shown, highest median first. Each column is one recipe run more than once.`}
      className="block h-auto w-full max-w-sm overflow-visible"
    >
      <YAxis ticks={yTicks} y={y} x0={pad.l} x1={W - pad.r} name={yName} />
      <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className={AXIS} strokeWidth={1} />
      {shown.flatMap((g, i) => g.targets.map((t, k) => <circle key={`${i}-${k}`} cx={x(i)} cy={y(t)} r={DOT_R} className={DOT} />))}
      {shown.map((g, i) =>
        shown.length <= 16 || i % Math.ceil(shown.length / 16) === 0 ? (
          <text key={`l${i}`} x={x(i)} y={H - pad.b + 14} textAnchor="middle" className={TICK}>
            x{g.rows.length}
          </text>
        ) : null,
      )}
      <text x={(pad.l + W - pad.r) / 2} y={H - 6} textAnchor="middle" className={CAPTION}>
        recipes, highest median first · n = {formatNumber(all.length, "count")}
      </text>
      {bestV != null && bestG >= 0 ? <BestMark cx={x(bestG)} cy={y(bestV)} value={bestV} flip={x(bestG) > W * 0.6} /> : null}
    </svg>
  );
}

/** A figure with its caption above and its one sentence of meaning below. */
export function Figure({ caption, sentence, note, className, children }: { caption: string; sentence?: string | null; note?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <figcaption className="text-label text-fg">{caption}</figcaption>
      {children}
      {sentence ? <p className="text-body text-fg">{sentence}</p> : null}
      {note ? <p className="text-caption text-fg-muted">{note}</p> : null}
    </figure>
  );
}
