import { SlidersHorizontal, TestTubeDiagonal } from "lucide-react";
import { coveragePct, driverSelectionNote, incumbentLabel, proposalIncumbent, type PopulatedResult } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { SectionHead } from "@/components/ui/section-head";
import { EmptyState } from "@/components/ui/honest-state";
import { Proposals } from "@/components/proposals";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel, ModelCoverage } from "@/components/dashboard/reliability-panel";
import { ReliabilityVerdict } from "@/components/dashboard/reliability-verdict";
import { PromotionPanel } from "@/components/dashboard/promotion-panel";
import { EvaluationChecks } from "@/components/dashboard/evaluation-checks";
import { ProposalDisclosures } from "@/components/dashboard/proposal-disclosures";
import { RunLandscape } from "@/components/dashboard/run-landscape";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
import { ResponseSurface } from "@/components/dashboard/response-surface";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { num } from "@/lib/utils";
import { AnalysisDiagnostics } from "@/components/dashboard/analysis-diagnostics";

/**
 * The shared "reliability + drivers + predicted-vs-measured + proposals" readout.
 * Model quality, run structure, predicted landscape, and
 * recommended actions - the single authoritative rendering of an analysis result.
 * Dashboard renders this; no other page should reimplement it.
 */
export function AnalysisReadout({ d }: { d: PopulatedResult }) {
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;
  const hasPredicted = Boolean(d.response_surface || d.correlation);
  const incumbent = proposalIncumbent(d);

  return (
    <>
      <section>
        <SectionHead title="Model quality" sub="What the model learned, and how far to trust it." />
        <ReliabilityVerdict d={d} />
        <PromotionPanel d={d} />
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.85fr_0.95fr]">
          <Card className="flex flex-col">
            <div className="text-[15px] font-semibold text-fg">Process drivers</div>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              Signed correlation of each input with {d.target}, held out across recipe groups - an association, not a
              proven cause. Colored bars are statistically significant (95% CI excludes zero and survive
              multiple-testing correction); gray bars are not.
            </p>
            {driverSelectionNote(d.driver_selection) ? (
              <p className="mt-1 text-[12px] leading-snug text-muted">{driverSelectionNote(d.driver_selection)}</p>
            ) : null}
            {d.drivers.length ? (
              <>
                <div className="mt-3">
                  <DriversTornado drivers={d.drivers} target={d.target} />
                </div>
                <DriverInsights
                  target={d.target}
                  drivers={d.drivers}
                  n={d.n}
                  nonProducers={nonProducers}
                  provenance={d.provenance}
                  proposals={d.proposals}
                  proposalFeatures={d.proposal_features}
                  clearsFloor={d.reliability?.clears_floor ?? null}
                />
              </>
            ) : (
              <EmptyState
                icon={SlidersHorizontal}
                title="No drivers yet"
                description="This analysis did not return any input/target correlations to show."
                className="mt-2"
              />
            )}
          </Card>

          <ReliabilityPanel d={d} />
        </div>
        <ModelCoverage d={d} />
        <EvaluationChecks d={d} />
        <AnalysisDiagnostics d={d} />
      </section>

      <section>
        <SectionHead title="Run structure" sub="Where the uploaded runs sit, and how the measured target is distributed." />
        {d.embedding ? (
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.85fr_0.95fr]">
            <RunLandscape d={d} />
            <TargetDistribution d={d} />
          </div>
        ) : (
          <TargetDistribution d={d} />
        )}
      </section>

      {hasPredicted ? (
        <section>
          <SectionHead title="Predicted landscape" sub="The model's view of the recipe space, and how the inputs relate." />
          {d.response_surface && d.correlation ? (
            <div className="grid items-stretch gap-4 lg:grid-cols-[1.85fr_0.95fr]">
              <ResponseSurface d={d} />
              <CorrelationHeatmap d={d} />
            </div>
          ) : (
            <>
              <ResponseSurface d={d} />
              <CorrelationHeatmap d={d} />
            </>
          )}
        </section>
      ) : null}

      <section id="next-experiments">
        <SectionHead
          title="Recommended from your last analysis"
          sub={`The next batch to run, ranked by the acquisition function${
            d.conformal_q != null
              ? ` · ± ${num(d.conformal_q, 2)} conformal band${coveragePct(d.conformal_coverage) ? ` (${coveragePct(d.conformal_coverage)})` : ""}`
              : ""
          }.`}
        />
        <p className="mb-3 text-[12.5px] leading-5 text-muted">
          The optimizer&rsquo;s next-best experiments, chosen to balance expected improvement against uncertainty.
        </p>
        <ProposalDisclosures d={d} />
        <p className="mb-3 text-[12px] text-muted">
          {incumbent == null
            ? "Comparison unavailable: the engine reported no reproducible incumbent for this replicate-aware fit."
            : `Compared with the ${incumbentLabel(d)}: ${num(incumbent, 2)}.`}
        </p>
        <Card>
          {d.proposals.length ? (
            <Proposals
              cols={d.proposal_features}
              rows={d.proposals}
              predHead={`pred. ${d.target} · vs best`}
              predFn={(p) => {
                const band = d.conformal_q ?? p.std;
                const feas = p.p_feasible != null ? `  P(feasible) ${num(p.p_feasible, 2)}` : "";
                if (incumbent == null) return `${num(p.pred, 2)} ± ${num(p.std, 2)}  (comparison unavailable)${feas}`;
                const delta = p.pred - incumbent;
                const v = p.pred - band >= incumbent ? "beats" : p.pred + band <= incumbent ? "below" : "~best";
                return `${num(p.pred, 2)} ± ${num(p.std, 2)}  (${delta >= 0 ? "+" : "−"}${num(Math.abs(delta), 2)} ${v})${feas}`;
              }}
            />
          ) : (
            <EmptyState icon={TestTubeDiagonal} title="No proposals" description="This analysis did not return any recommended recipes." />
          )}
        </Card>
      </section>
    </>
  );
}
