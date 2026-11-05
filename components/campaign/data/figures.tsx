"use client";

// The Your data figures. Each is a plain SVG with position or length encodings only: no pie, no area,
// no colour as magnitude. Measured values are drawn in the ink colour (--chart-measured), and every figure
// carries an aria-label that states what it shows. Pure geometry lives in svg.ts and profile.ts.

import { dataNumber, linear, niceTicks } from "@/components/campaign/data/svg";
import { type Histogram, type ReplicateGroup, type Gap } from "@/components/campaign/data/profile";

const W = 320;
const TICK = "fill-fg-muted text-caption";
const GRID = "stroke-chart-grid";
const DOT = "fill-chart-measured";

/** Counts per equal-width bin, as bars (length = runs). The axis is the input's own range. */
export function DistributionFigure({ name, hist, n }: { name: string; hist: Histogram; n: number }) {
  const H = 96;
  const plotH = 60;
  const max = Math.max(1, ...hist.counts);
  const x = linear([hist.edges[0], hist.edges[hist.edges.length - 1]], [0, W]);
  const bins = hist.counts.map((c, i) => ({ c, x0: x(hist.edges[i]), x1: x(hist.edges[i + 1]) }));
  const label = `Histogram of ${name}: ${n} runs, ${dataNumber(hist.edges[0])} to ${dataNumber(hist.edges[hist.edges.length - 1])}, most runs in one bin: ${max}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
      <line x1={0} x2={W} y1={plotH} y2={plotH} className={GRID} strokeWidth={1} />
      {bins.map((b, i) => (
        <rect
          key={i}
          x={b.x0 + 1}
          width={Math.max(0, b.x1 - b.x0 - 2)}
          y={plotH - (b.c / max) * (plotH - 4)}
          height={(b.c / max) * (plotH - 4)}
          className="fill-accent"
          data-count={b.c}
        />
      ))}
      <text x={0} y={H - 4} className={TICK} textAnchor="start">{dataNumber(hist.edges[0])}</text>
      <text x={W} y={H - 4} className={TICK} textAnchor="end">{dataNumber(hist.edges[hist.edges.length - 1])}</text>
    </svg>
  );
}

/** One bar per category level, most common first. The label sits under each bar. */
export function CategoryFigure({ name, levels }: { name: string; levels: { value: string; n: number }[] }) {
  const H = 96;
  const plotH = 60;
  const max = Math.max(1, ...levels.map((l) => l.n));
  const slot = W / Math.max(1, levels.length);
  const label = `Bar chart of ${name}: ${levels.map((l) => `${l.value} ${l.n}`).join(", ")} runs.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
      <line x1={0} x2={W} y1={plotH} y2={plotH} className={GRID} strokeWidth={1} />
      {levels.map((l, i) => {
        const h = (l.n / max) * (plotH - 4);
        return (
          <g key={l.value}>
            <rect x={i * slot + slot * 0.15} width={slot * 0.7} y={plotH - h} height={h} className="fill-accent" data-count={l.n} />
            <text x={i * slot + slot / 2} y={H - 4} textAnchor="middle" className={TICK}>
              {l.value.length > 8 ? `${l.value.slice(0, 7)}…` : l.value}
            </text>
          </g>
        );
      })}
    </svg>
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

/** Target (y) against one input (x): numeric inputs by position; category inputs as strips at each level. */
export function TargetScatterFigure({
  xName,
  yName,
  points,
  levels,
}: {
  xName: string;
  yName: string;
  points: { x: number | string; y: number }[];
  levels?: string[];
}) {
  const W2 = 320;
  const H = 200;
  const pad = { l: 40, r: 8, t: 8, b: 28 };
  const ys = points.map((p) => p.y);
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  const yTicks = niceTicks(yLo, yHi, 3);
  const y = linear([Math.min(...yTicks, yLo), Math.max(...yTicks, yHi)], [H - pad.b, pad.t]);
  const categorical = levels !== undefined;
  const xNums = points.map((p) => p.x).filter((v): v is number => typeof v === "number");
  const xLo = categorical ? -0.5 : Math.min(...xNums);
  const xHi = categorical ? (levels?.length ?? 1) - 0.5 : Math.max(...xNums);
  const x = linear([xLo, xHi], [pad.l, W2 - pad.r]);
  const xTicks = categorical ? [] : niceTicks(xLo, xHi, 4);
  const toX = (v: number | string) => (categorical ? x(levels!.indexOf(String(v))) : x(Number(v)));
  const label = `${yName} against ${xName}: ${points.length} runs with both values.`;
  return (
    <svg viewBox={`0 0 ${W2} ${H}`} role="img" aria-label={label} className="block h-auto w-full max-w-sm overflow-visible">
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.l} x2={W2 - pad.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>{dataNumber(t)}</text>
        </g>
      ))}
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} className={GRID} strokeWidth={1} />
      {xTicks.map((t) => (
        <text key={`x${t}`} x={x(t)} y={H - 8} textAnchor="middle" className={TICK}>{dataNumber(t)}</text>
      ))}
      {categorical
        ? levels!.map((l, i) => (
            <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className={TICK}>{l.length > 8 ? `${l.slice(0, 7)}…` : l}</text>
          ))
        : null}
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.x)} cy={y(p.y)} r={2.75} className={DOT} />
      ))}
    </svg>
  );
}

/** The target in sheet order, joined in sequence. Sheet order is not proven run order; the caption says so. */
export function RunOrderFigure({ yName, values }: { yName: string; values: (number | null)[] }) {
  const W2 = 320;
  const H = 180;
  const pad = { l: 40, r: 8, t: 8, b: 24 };
  const present = values.filter((v): v is number => v != null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const yTicks = niceTicks(lo, hi, 3);
  const y = linear([Math.min(...yTicks, lo), Math.max(...yTicks, hi)], [H - pad.b, pad.t]);
  const x = linear([1, values.length], [pad.l, W2 - pad.r]);
  const path = values
    .map((v, i) => (v == null ? null : `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W2} ${H}`} role="img" aria-label={`${yName} by row in the sheet: ${present.length} values, ${values.length} rows.`} className="block h-auto w-full max-w-sm overflow-visible">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W2 - pad.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>{dataNumber(t)}</text>
        </g>
      ))}
      <polyline points={path} fill="none" className="stroke-chart-reference" strokeWidth={1} />
      {values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i + 1)} cy={y(v)} r={2.25} className={DOT} />))}
      <text x={pad.l} y={H - 4} className={TICK}>row 1</text>
      <text x={W2 - pad.r} y={H - 4} textAnchor="end" className={TICK}>row {values.length}</text>
    </svg>
  );
}

/** Each replicate group as a vertical strip of its target values (position on y). Shows at most `limit` groups. */
export function ReplicateFigure({ yName, groups, limit = 40 }: { yName: string; groups: ReplicateGroup[]; limit?: number }) {
  const shown = groups.slice(0, limit);
  const W2 = 320;
  const H = 180;
  const pad = { l: 40, r: 8, t: 8, b: 16 };
  const all = shown.flatMap((g) => g.targets);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const yTicks = niceTicks(lo, hi, 3);
  const y = linear([Math.min(...yTicks, lo), Math.max(...yTicks, hi)], [H - pad.b, pad.t]);
  const x = linear([-0.5, shown.length - 0.5], [pad.l, W2 - pad.r]);
  return (
    <svg
      viewBox={`0 0 ${W2} ${H}`}
      role="img"
      aria-label={`${yName} for ${groups.length} replicate groups, ${shown.length} shown. Each column is one recipe run more than once.`}
      className="block h-auto w-full max-w-sm overflow-visible"
    >
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W2 - pad.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className={TICK}>{dataNumber(t)}</text>
        </g>
      ))}
      {shown.flatMap((g, i) => g.targets.map((t, k) => <circle key={`${i}-${k}`} cx={x(i)} cy={y(t)} r={2.75} className={DOT} />))}
    </svg>
  );
}
