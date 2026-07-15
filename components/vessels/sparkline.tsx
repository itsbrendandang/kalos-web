interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

/** Minimal inline SVG trend line for a table cell - one channel's kinetic trace. */
export function Sparkline({ values, color, width = 64, height = 22 }: SparklineProps) {
  if (values.length <= 1) {
    // Nothing to draw a trend from - a flat baseline instead of dividing by
    // `values.length - 1` (which would be zero or negative).
    const y = height / 2;
    return (
      <svg width={width} height={height} className="block" aria-hidden>
        <line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={1.4} />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="block" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
