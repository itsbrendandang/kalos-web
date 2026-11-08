import type { ReactNode } from "react";
import { MeasuredMark } from "@/components/campaign/plan/marks";
import { cn } from "@/lib/utils";
import type { CampaignOverview } from "@/lib/campaign-overview";
import { FAILED_RUNS_UNAVAILABLE } from "@/lib/campaign-overview";
import { formatNumber } from "@/lib/format";

function countText(n: number | null, label: string): string {
  if (n == null) return `${label} unavailable`;
  return `${formatNumber(n, "count")} ${label}`;
}

function Fact({ label, children, detail, className }: { label: string; children: ReactNode; detail?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-label text-overview-fg-muted">{label}</div>
      <div className="mt-1 text-overview-fg">{children}</div>
      {detail ? <div className="mt-1 text-caption text-overview-fg-muted">{detail}</div> : null}
    </div>
  );
}

/**
 * Persistent measured summary. It stays above the stages and does not repeat
 * inside the selected panel. Baseline is unavailable until a control contract
 * exists, so the control delta is suppressed.
 */
export function SummaryStrip({ model }: { model: CampaignOverview }) {
  const unit = model.objective.unit;
  const best = model.bestMeasured.value;
  return (
    <section aria-label="Measured summary" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-3">
        <Fact
          label="Best measured"
          detail={
            <>
              Measured, not predicted. Replicate type and count for this value are not reported.
              {model.measuredChange.fromPreviousRound ? (
                <>
                  {" "}
                  Measured change {formatNumber(model.measuredChange.fromPreviousRound.delta, "value", { sign: true })}
                  {unit ? ` ${unit}` : ""} {model.measuredChange.fromPreviousRound.context}. Not a control comparison.
                </>
              ) : null}
            </>
          }
        >
          <span className="inline-flex items-baseline gap-2">
            <MeasuredMark ink="neutral" className="self-center" />
            <span className={best == null ? "text-overview-heading" : "font-mono text-overview-metric tabular-nums"}>{best == null ? "Unavailable" : formatNumber(best)}</span>
            {best != null && unit ? <span className="text-body text-overview-fg-muted">{unit}</span> : null}
          </span>
        </Fact>
        <Fact label="Baseline" detail={model.baseline.reason}>
          <span className="text-overview-heading">Baseline unavailable</span>
        </Fact>
        <Fact
          label="Measured change"
          detail="Versus a control. Suppressed because the baseline is unavailable. This is not a significance claim."
        >
          <span className="text-overview-heading">Baseline unavailable</span>
        </Fact>
      </div>
      <div className="grid grid-cols-1 gap-4 border-t border-overview-divider pt-4 md:grid-cols-2 xl:grid-cols-4">
        <Fact
          label={model.round.display == null ? "Round" : `Round ${model.round.display}`}
          detail={`Draft batch ${model.draft.proposals == null ? "unavailable" : formatNumber(model.draft.proposals, "count") + " proposals"}. Candidate and control counts are not separate fields. ${FAILED_RUNS_UNAVAILABLE}`}
        >
          <p className="flex flex-wrap gap-x-2 text-body">
            <span>{countText(model.round.completed, "completed")}</span>
            <span aria-hidden>·</span>
            <span>{countText(model.round.pending, "pending")}</span>
            <span aria-hidden>·</span>
            <span>Failed unavailable</span>
          </p>
        </Fact>
        <Fact
          label="Ranking reliability"
          detail={
            model.ranking.rho == null
              ? model.ranking.reason
              : `${model.ranking.reason} Held-out Spearman ${formatNumber(model.ranking.rho, "corr")}${
                  model.ranking.ci ? `, 95% CI ${formatNumber(model.ranking.ci[0], "corr")} to ${formatNumber(model.ranking.ci[1], "corr")}` : ", no interval reported"
                }. ${model.ranking.groupCount == null ? "Group count not reported." : `${formatNumber(model.ranking.groupCount, "count")} groups.`}`
          }
        >
          <p className="text-overview-heading">{model.ranking.label}</p>
        </Fact>
        <Fact
          label="Promotion checks"
          detail={
            model.promotion.verdict === "not-evaluated"
              ? "Promotion not evaluated. No checks is not approval."
              : `${model.promotion.detail}. ${model.promotion.failureCount == null ? "" : `${formatNumber(model.promotion.failureCount, "count")} failed. `}Passed count is not inferred. Promotion is a separate decision.`
          }
        >
          <p className="text-overview-heading">
            {model.promotion.verdict === "not-evaluated" ? "Not evaluated" : model.promotion.verdict === "eligible" ? "Eligible" : "Not eligible"}
          </p>
        </Fact>
        <Fact label="Permission to start" detail={model.start.reason}>
          <p className="text-overview-heading">{model.start.label}</p>
        </Fact>
      </div>
    </section>
  );
}
