import { formatNumber } from "@/lib/format";

/** The engine's name for the target's column in the correlation grid. */
export const isTargetLabel = (label: string): boolean => /^target(_mean)?$/i.test(label);

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
export function CorrelationHeatmap({ labels: raw, matrix, target }: { labels: string[]; matrix: number[][]; /** The target's name: the engine labels its column `target_mean`, which is not a column of the sheet. */ target?: string }) {
  const labels = raw.map((l) => (target && isTargetLabel(l) ? target : l));
  return (
    <div>
      <p className="mb-2 text-caption text-fg-muted">
        How strongly each pair of inputs, and each input and the target, went together across the runs, from -1 to +1. Blue means more of one went with more of the other, grey means
        more of one went with less of the other; a deeper fill is a stronger pattern.
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
