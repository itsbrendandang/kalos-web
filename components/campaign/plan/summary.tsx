import type { ReactNode } from "react";
import { MeasuredValue } from "@/components/campaign/plan/marks";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { BAND_CAVEAT, bandLabel, type PlanAnalysis } from "@/components/campaign/plan-view";
import { constraintNote } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The four numbers the batch rests on, separated by hairlines rather than boxes. */
export function BatchSummary({ d, m }: { d: PlanAnalysis; m: BatchModel }) {
  const { incumbent, band, unit } = m;
  const constraint = constraintNote(d.constraint);
  const div = d.batch_diversity;
  return (
    <section aria-label="Batch summary">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-4 @3xl:grid-cols-4">
        <SummaryCell label="Proposed experiments" caption={div ? `model-generated, ${formatNumber(div.returned, "count")} of ${formatNumber(div.requested, "count")} requested` : "model-generated"}>
          <span className="text-title tabular-nums">{formatNumber(m.rows.length, "count")}</span>
        </SummaryCell>
        <SummaryCell label={`Best ${m.name}`} caption={incumbent != null ? m.ctx.incumbentLabel : "no reproducible best for this fit"}>
          {incumbent != null ? <MeasuredValue value={formatNumber(incumbent)} unit={unit || undefined} className="text-title" /> : <span className="text-heading text-fg-muted">n/a</span>}
        </SummaryCell>
        <SummaryCell label="Prediction band" caption={band != null ? `${bandLabel(d.conformal_coverage)}, same width for every proposal. ${BAND_CAVEAT}` : "not reported"}>
          <span className={cn("tabular-nums", band != null ? "text-title" : "text-heading text-fg-muted")}>{band != null ? `± ${formatNumber(band)}` : "Not reported"}</span>
        </SummaryCell>
        <SummaryCell label="Constraints" caption={d.proposal_gating ? (d.proposal_gating.gated ? "filtered by likely feasibility" : "no feasibility filter") : undefined}>
          <span className="text-heading">{d.constraint == null ? "Not reported" : constraint == null ? "None requested" : d.constraint.applied ? "Applied" : "Not applied"}</span>
        </SummaryCell>
      </dl>
    </section>
  );
}

function SummaryCell({ label, caption, children }: { label: string; caption?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0">{children}</span>
        {caption ? <span className="text-caption text-fg-muted">{caption}</span> : null}
      </dd>
    </div>
  );
}
