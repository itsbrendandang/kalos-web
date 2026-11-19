import { formatNumber } from "@/lib/format";
import { bestSoFarSeries } from "@/lib/overview";
import type { ActiveCampaign } from "@/lib/workbench";

const roundName = (round: number) => (round === 0 ? "Upload" : `Round ${round}`);

/**
 * Measured best-so-far for the campaign home. Ink line and dots, at most
 * three y ticks, no axis title and no card. Learn keeps BestSoFarChart.
 */
export function MeasuredTrend({ campaign, unit }: { campaign: ActiveCampaign; unit: string }) {
  const points = bestSoFarSeries(campaign).filter((point) => point.best != null) as { round: number; best: number; runs: number }[];
  if (points.length < 2) return <p className="text-caption text-overview-fg-muted">The trend appears once a round&apos;s results have been added.</p>;
  const values = points.map((point) => point.best);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const yOf = (value: number) => 10 + ((high - value) / span) * 80;
  const ticks = tickValues(values);
  const last = points[points.length - 1];
  const label = points.map((point) => `${roundName(point.round)} ${formatNumber(point.best)}${unit ? ` ${unit}` : ""}`).join(", ");
  return (
    <figure className="mt-8">
      <figcaption className="mb-4 text-caption text-overview-fg-muted">Best so far, by round</figcaption>
      <div className="relative h-40 text-overview-fg" role="img" aria-label={`Best measured by round: ${label}`}>
        {ticks.map((tick) => (
          <span key={tick} className="absolute left-0 -translate-y-1/2 font-mono text-caption text-overview-fg-muted" style={{ top: `${yOf(tick)}%` }}>
            {formatNumber(tick)}
          </span>
        ))}
        <div className="absolute top-0 right-0 bottom-0 left-10">
          <div className="absolute right-0 bottom-0 left-0 border-t border-overview-divider" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <polyline
              points={points.map((point, index) => `${xOf(index, points.length)},${yOf(point.best)}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((point, index) => (
            <span
              key={point.round}
              className="absolute size-1.5 rounded-full bg-overview-fg"
              style={{ left: `${xOf(index, points.length)}%`, top: `${yOf(point.best)}%`, transform: "translate(-50%, -50%)" }}
            />
          ))}
          <span className="absolute font-mono text-caption text-overview-fg" style={{ right: 0, top: `${yOf(last.best)}%`, transform: "translateY(-120%)" }}>
            {formatNumber(last.best)}
          </span>
        </div>
      </div>
      <div className="mt-2 ml-10 flex justify-between text-caption text-overview-fg-muted">
        {points.map((point) => (
          <span key={point.round}>{roundName(point.round)}</span>
        ))}
      </div>
    </figure>
  );
}

/** At most three ticks: the measured values when there are few, otherwise low, mid, and high. */
function xOf(index: number, count: number): number {
  if (count <= 1) return 50;
  return 6 + (index / (count - 1)) * 88;
}

function tickValues(values: number[]): number[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length <= 3) return [...unique].reverse();
  const low = unique[0];
  const high = unique[unique.length - 1];
  return [high, (low + high) / 2, low];
}
