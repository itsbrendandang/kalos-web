import { MeasuredMark, PredictedMark } from "@/components/campaign/plan/marks";
import { comparisonScale } from "@/components/campaign/learn";
import { formatNumber } from "@/lib/format";
import { shortId } from "@/lib/workbench";

export type ComparisonRow = {
  id: string;
  pred: number;
  /** The conformal half-width that applies to this run, or null when none does. */
  halfWidth: number | null;
  result: number;
};

/**
 * Predicted against measured, one row per measured run: the prediction is a
 * hollow ring with its band as a light bar, the measured result a filled ink
 * dot. The two are never the same mark. Plain HTML on a shared value axis, so
 * it stays crisp and readable at any width; the numbers are in the Record
 * table and in each row's accessible label.
 */
export function PredVsMeasured({ rows, targetName, unit, coverage }: { rows: ComparisonRow[]; targetName: string; unit: string; coverage: string | null }) {
  const scale = comparisonScale(rows);
  if (!scale) return null;
  const at = (v: number) => `${((v - scale.lo) / (scale.hi - scale.lo)) * 100}%`;
  const band = coverage ? `${coverage} band` : "prediction band";
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col" aria-label={`Predicted and measured ${targetName} for ${rows.length} measured ${rows.length === 1 ? "run" : "runs"}`}>
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[4.5rem_1fr] items-center gap-3 border-b border-border py-2 last:border-b-0"
            aria-label={`Run ${shortId(r.id)}: predicted ${formatNumber(r.pred)}${r.halfWidth != null ? `, ${band} ${formatNumber(r.pred - r.halfWidth)} to ${formatNumber(r.pred + r.halfWidth)}` : ", no band"}; measured ${formatNumber(r.result)}${unit ? ` ${unit}` : ""}`}
          >
            <span className="font-mono text-code text-fg-muted" aria-hidden>
              {shortId(r.id)}
            </span>
            <span className="relative block h-6" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-px bg-chart-grid" />
              {r.halfWidth != null ? (
                <span
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-chart-band"
                  style={{ left: at(r.pred - r.halfWidth), width: `${((2 * r.halfWidth) / (scale.hi - scale.lo)) * 100}%` }}
                />
              ) : null}
              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at(r.pred) }}>
                <PredictedMark className="block size-3" halo />
              </span>
              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: at(r.result) }}>
                <MeasuredMark className="block size-3" halo />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3" aria-hidden>
        <span />
        <span className="relative block h-4 text-caption text-fg-muted tabular-nums">
          {scale.ticks.map((t, i) => (
            <span
              key={t}
              className={i === 0 ? "absolute" : i === scale.ticks.length - 1 ? "absolute -translate-x-full" : "absolute -translate-x-1/2"}
              style={{ left: at(t) }}
            >
              {formatNumber(t)}
            </span>
          ))}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-[5.25rem] text-caption text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <PredictedMark /> predicted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-chart-band" aria-hidden /> {band}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MeasuredMark /> measured
        </span>
        <span>
          {targetName}
          {unit ? ` (${unit})` : ""}
        </span>
      </p>
    </div>
  );
}
