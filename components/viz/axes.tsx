"use client";

/*
 * Axis wrappers: token classes, ticks formatted through lib/num (never
 * toFixed), horizontal gridlines only unless asked. visx draws; we style.
 */
import { AxisBottom, AxisLeft } from "@visx/axis";
import type { AnyD3Scale } from "@visx/scale";
import { formatValue, formatVolume, type Quantity } from "@/lib/num";

export type TickFormat = (v: number) => string;

/** Tick labels for a quantity: shared decimals across the ticks so they align. */
export function tickFormatter(ticks: number[], quantity: Quantity = "target"): TickFormat {
  if (quantity === "volume") return (v) => formatVolume(v).text;
  if (quantity === "pct") return (v) => formatValue(v, { quantity: "pct" }).text;
  if (quantity === "corr" || quantity === "score") return (v) => formatValue(v, { quantity }).value;
  // d3 ticks are round numbers; show the fewest decimals that keep every tick distinct and aligned.
  const decimals = Math.min(6, Math.max(0, ...ticks.map((t) => (String(Number(t.toPrecision(12))).split(".")[1] ?? "").length)));
  return (v) => formatValue(v, { decimals }).value;
}

const tickLabel = () => ({ className: "fill-fg-muted text-caption tabular-nums", fontSize: 12, fontFamily: "inherit" }) as const;

export function XAxis({ scale, top, ticks, format, label, numTicks = 5 }: { scale: AnyD3Scale; top: number; ticks?: number[]; format: TickFormat; label?: string; numTicks?: number }) {
  return (
    <AxisBottom
      scale={scale}
      top={top}
      tickValues={ticks}
      numTicks={numTicks}
      tickFormat={(v) => format(Number(v))}
      stroke="var(--chart-grid)"
      tickStroke="var(--chart-grid)"
      tickLabelProps={() => ({ ...tickLabel(), textAnchor: "middle", dy: "0.25em" })}
      label={label}
      labelProps={{ className: "fill-fg-muted text-caption", fontSize: 12, textAnchor: "middle" }}
      labelOffset={14}
    />
  );
}

export function YAxis({ scale, left = 0, ticks, format, label, numTicks = 5 }: { scale: AnyD3Scale; left?: number; ticks?: number[]; format: TickFormat; label?: string; numTicks?: number }) {
  return (
    <AxisLeft
      scale={scale}
      left={left}
      tickValues={ticks}
      numTicks={numTicks}
      tickFormat={(v) => format(Number(v))}
      hideAxisLine
      hideTicks
      tickLabelProps={() => ({ ...tickLabel(), textAnchor: "end", dx: "-0.25em", dy: "0.33em" })}
      label={label}
      labelProps={{ className: "fill-fg-muted text-caption", fontSize: 12, textAnchor: "middle" }}
      labelOffset={36}
    />
  );
}

/** Horizontal gridlines at the given y ticks. */
export function HGrid({ scale, ticks, x1, x2 }: { scale: (v: number) => number | undefined; ticks: number[]; x1: number; x2: number }) {
  return (
    <g aria-hidden>
      {ticks.map((t) => {
        const y = scale(t) ?? 0;
        return <line key={t} x1={x1} x2={x2} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />;
      })}
    </g>
  );
}
