import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import type { PopulatedResult } from "@/lib/api";
import { divColor, divText } from "@/components/dashboard/heat-scale";

/** First token of a feature name, clipped - for the tight column headers (full name on hover). */
function abbrev(name: string, max = 6): string {
  const first = name.replace(/_+/g, " ").trim().split(" ")[0] || name;
  return first.length > max ? first.slice(0, max) : first;
}

/**
 * Spearman correlation heatmap over the kept features and the target
 * (`d.correlation`). Blue = positive, gray = negative, near-white ~0 - the same
 * sign convention as the drivers tornado, so the two read consistently. Renders
 * nothing when the analysis predates the field.
 */
export function CorrelationHeatmap({ d }: { d: PopulatedResult }) {
  const corr = d.correlation;
  if (!corr || corr.labels.length < 2) return null;
  const { labels, matrix } = corr;
  const n = labels.length;

  return (
    <Card className="flex h-full flex-col">
      <div className="text-[15px] font-semibold text-fg">Feature correlation</div>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        Spearman correlation among the inputs and {d.target}. Blue is positive, gray is negative.
      </p>

      <div className="mt-3 flex flex-1 flex-col justify-center overflow-x-auto rounded-[10px] border border-border bg-bg p-3">
        <div
          className="grid min-w-[240px] gap-[2px]"
          style={{ gridTemplateColumns: `minmax(52px, 0.9fr) repeat(${n}, minmax(18px, 1fr))` }}
        >
          <div />
          {labels.map((l) => (
            <div key={`head-${l}`} className="truncate text-center font-mono text-[9px] text-muted" title={l}>
              {abbrev(l)}
            </div>
          ))}
          {matrix.map((row, i) => (
            <Fragment key={`row-${i}`}>
              <div className="flex items-center justify-end truncate pr-1 text-[10px] text-muted" title={labels[i]}>
                {abbrev(labels[i], 12)}
              </div>
              {row.map((v, j) => (
                <div
                  key={`cell-${i}-${j}`}
                  className="tabular flex aspect-square items-center justify-center rounded-[3px] font-mono text-[9px]"
                  style={{ background: divColor(v), color: divText(v) }}
                  title={`${labels[i]} vs ${labels[j]}: ${v.toFixed(2)}`}
                >
                  {v.toFixed(2)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </Card>
  );
}
