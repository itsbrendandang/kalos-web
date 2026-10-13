import { formatNumber } from "@/lib/format";

/** Fill for a correlation: accent for positive, neutral grey for negative, capped so ink text stays legible on it in both themes. */
const fill = (v: number) => {
  const pct = Math.round(Math.min(1, Math.abs(v)) * 60);
  return `color-mix(in oklch, ${v >= 0 ? "var(--accent)" : "var(--fg-muted)"} ${pct}%, var(--surface))`;
};

/**
 * Rank correlations among the inputs and the target. Cells are a fixed 40px
 * and only ever hold a 2-decimal number that fits; the grid scrolls inside its
 * box on narrow screens. Names are shown in full, never clipped. The sign is
 * told by the "+" or "-" in the number as well as by the fill.
 */
export function CorrelationHeatmap({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  return (
    <div>
      <p className="mb-2 text-caption text-fg-muted">
        Rank correlation between each pair of inputs and the target. Accent fill is a positive correlation, grey a negative one; a deeper fill is a stronger one.
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-caption tabular-nums">
          <thead>
            <tr>
              <td />
              {labels.map((l) => (
                <th key={l} scope="col" className="h-28 w-10 align-bottom font-normal text-fg-muted">
                  <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={labels[i]}>
                <th scope="row" className="pr-2 text-right font-normal whitespace-nowrap text-fg-muted">
                  {labels[i]}
                </th>
                {row.map((v, j) => (
                  <td
                    key={labels[j]}
                    title={`${labels[i]} and ${labels[j]}: ${formatNumber(v, "corr", { sign: true })}`}
                    className="h-10 w-10 overflow-hidden rounded-sm text-center text-fg"
                    style={{ background: fill(v) }}
                  >
                    {formatNumber(v, "corr", { sign: true })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
