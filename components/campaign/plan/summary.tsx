import type { ReactNode } from "react";
import { MeasuredValue } from "@/components/campaign/plan/marks";
import type { BatchModel } from "@/components/campaign/plan/use-batch-model";
import { BAND_CAVEAT, bandLabel, bandSentence, type PlanAnalysis } from "@/components/campaign/plan-view";
import { constraintNote } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The four numbers the round rests on, separated by hairlines rather than boxes. */
export function BatchSummary({ d, m }: { d: PlanAnalysis; m: BatchModel }) {
  const { incumbent, band, unit } = m;
  const constraint = constraintNote(d.constraint);
  const div = d.batch_diversity;
  return (
    <section aria-label="Round summary">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-4 @3xl:grid-cols-4">
        <SummaryCell label="Proposed recipes" caption={div ? `proposed by the model, ${formatNumber(div.returned, "count")} of ${formatNumber(div.requested, "count")} asked for` : "proposed by the model"}>
          <span className="text-title tabular-nums">{formatNumber(m.rows.length, "count")}</span>
        </SummaryCell>
        <SummaryCell label={`Best ${m.name}`} caption={incumbent != null ? m.ctx.incumbentLabel : "no repeated best to compare with"}>
          {incumbent != null ? <MeasuredValue value={formatNumber(incumbent)} unit={unit || undefined} className="text-title" /> : <span className="text-heading text-fg-muted">n/a</span>}
        </SummaryCell>
        <SummaryCell label={bandLabel(d.conformal_coverage)} caption={band != null ? `${bandSentence(d.conformal_coverage) ?? BAND_CAVEAT} Same width for every recipe.` : "not reported"}>
          <span className={cn("tabular-nums", band != null ? "text-title" : "text-heading text-fg-muted")}>{band != null ? `± ${formatNumber(band)}` : "Not reported"}</span>
        </SummaryCell>
        <SummaryCell label="Limits you asked for" caption={d.proposal_gating ? (d.proposal_gating.gated ? "recipes unlikely to work were left out" : "no recipe was left out for being unlikely to work") : undefined}>
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
