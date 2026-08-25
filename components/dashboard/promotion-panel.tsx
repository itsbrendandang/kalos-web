import { isUnmeasuredFailure, type PopulatedResult } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The fail-closed promotion verdict (`promotion`): whether this analysis
 * clears the same four gates (rank agreement, feasibility AUC, interval
 * ECE, feasibility Brier) the engine's promotion policy has always defined.
 * REPORTED, not enforced - a `false` verdict does not change what this app
 * accepts or renders, only what it says about the analysis.
 *
 * `passed=false` is NOT necessarily an error: it also covers a required gate
 * being unmeasurable on this sheet (e.g. an all-producer upload with no
 * non-producers to score feasibility against), which fails closed by design.
 * So this never uses the red/error tone - amber (the same "not yet trusted"
 * tone as `ReliabilityVerdict`) either way, and `meaning` (the engine's own
 * explanation of what `false` does and does not mean) is always shown next
 * to the verdict rather than only on request. Individual failure lines that
 * name an unmeasured metric get a small neutral tag instead of reading like
 * a miss.
 *
 * Renders nothing when the engine did not report `promotion` (older engine
 * builds).
 */
export function PromotionPanel({ d }: { d: PopulatedResult }) {
  const p = d.promotion;
  if (!p) return null;
  const metricEntries = Object.entries(p.metrics);

  return (
    <div
      className={cn(
        "mt-4 rounded-2xl border-l-4 p-4 text-[13px] leading-relaxed",
        p.passed
          ? "border-l-green/30 border-l-green bg-green-soft text-green"
          : "border-l-amber/30 border-l-amber bg-amber-soft text-amber",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "h-auto rounded-full border-transparent bg-card px-2.5 py-1 text-[11px] font-semibold",
            p.passed ? "text-green" : "text-amber",
          )}
        >
          {p.passed ? "Promotable" : "Not yet promotable"}
        </Badge>
        <span className="font-mono text-[11px] opacity-80">{p.summary}</span>
      </div>
      <p className="mt-2 opacity-90">{p.meaning}</p>
      {p.failures.length ? (
        <ul className="mt-2 flex flex-col gap-1 text-[12px] opacity-90">
          {p.failures.map((f) => (
            <li key={f} className="flex gap-1.5">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current opacity-60" />
              <span>
                {f}
                {isUnmeasuredFailure(f) ? <span className="ml-1 opacity-70">(unmeasured, not a miss)</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {metricEntries.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] opacity-80">
          {metricEntries.map(([k, v]) => (
            <span key={k}>
              {k} {v.toFixed(3)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
