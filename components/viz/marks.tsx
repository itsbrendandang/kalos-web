/*
 * The canonical marks (VIZ_SPEC 3.2). Measured: filled ink, solid, drawn on
 * top, r=4 (r=5 where it must outrank a prediction on the same row).
 * Predicted: hollow accent ring filled with the surface, dashed lines, interval
 * bars with caps, bands in --chart-band. Reference lines are DOTTED; dashes are
 * reserved for predictions. Every color is a CSS variable, so dark mode needs no
 * re-render.
 */
import type { SVGProps } from "react";

type At = { x: number; y: number };

export function MeasuredDot({ x, y, r = 4, ...rest }: At & { r?: number } & Omit<SVGProps<SVGCircleElement>, "x" | "y">) {
  return <circle cx={x} cy={y} r={r} fill="var(--chart-measured)" {...rest} />;
}

export function PredictedDot({ x, y, r = 4, ...rest }: At & { r?: number } & Omit<SVGProps<SVGCircleElement>, "x" | "y">) {
  return <circle cx={x} cy={y} r={r} fill="var(--surface)" stroke="var(--chart-predicted)" strokeWidth={1.5} {...rest} />;
}

/** A run started but not measured yet: hollow ink, dashed. */
export function PendingDot({ x, y, r = 4 }: At & { r?: number }) {
  return <circle cx={x} cy={y} r={r} fill="var(--surface)" stroke="var(--chart-measured)" strokeWidth={1.25} strokeDasharray="2 2" />;
}

/** A muted diamond: a derived statistic or baseline (no interval from the engine). */
export function DerivedDiamond({ x, y, s = 5, hollow = false }: At & { s?: number; hollow?: boolean }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z`}
      fill={hollow ? "var(--surface)" : "var(--chart-reference)"}
      stroke="var(--chart-reference)"
      strokeWidth={1.25}
    />
  );
}

/** Interval bar with 6px caps, vertical (x fixed) or horizontal (y fixed). */
export function IntervalBar({
  orientation,
  at,
  from,
  to,
  color = "var(--chart-predicted)",
  width = 1.5,
  cap = 6,
}: {
  orientation: "vertical" | "horizontal";
  at: number;
  from: number;
  to: number;
  color?: string;
  width?: number;
  cap?: number;
}) {
  const h = cap / 2;
  if (orientation === "vertical")
    return (
      <g stroke={color} strokeWidth={width} aria-hidden>
        <line x1={at} x2={at} y1={from} y2={to} />
        <line x1={at - h} x2={at + h} y1={from} y2={from} />
        <line x1={at - h} x2={at + h} y1={to} y2={to} />
      </g>
    );
  return (
    <g stroke={color} strokeWidth={width} aria-hidden>
      <line y1={at} y2={at} x1={from} x2={to} />
      <line y1={at - h} y2={at + h} x1={from} x2={from} />
      <line y1={at - h} y2={at + h} x1={to} x2={to} />
    </g>
  );
}

/** Dotted reference rule with an optional direct label at its end. */
export function RefLine({
  x1,
  x2,
  y1,
  y2,
  label,
  labelAt = "end",
}: {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  label?: string;
  labelAt?: "end" | "start";
}) {
  const horizontal = y1 === y2;
  return (
    <g aria-hidden>
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke="var(--chart-reference)" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
      {label ? (
        <text
          x={horizontal ? (labelAt === "end" ? x2 : x1) : x1 + 4}
          y={horizontal ? y1 - 5 : Math.min(y1, y2) + 10}
          textAnchor={horizontal ? (labelAt === "end" ? "end" : "start") : "start"}
          className="fill-fg-muted text-caption"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Measured-outside-band flag: an x glyph in --warn. */
export function OutsideGlyph({ x, y, s = 4 }: At & { s?: number }) {
  return (
    <g stroke="var(--warn)" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <line x1={x - s} x2={x + s} y1={y - s} y2={y + s} />
      <line x1={x - s} x2={x + s} y1={y + s} y2={y - s} />
    </g>
  );
}

/** An invisible 24x24 hit target around a small mark. */
export function HitTarget({ x, y, ...rest }: At & Omit<SVGProps<SVGRectElement>, "x" | "y">) {
  return <rect x={x - 12} y={y - 12} width={24} height={24} fill="transparent" {...rest} />;
}
