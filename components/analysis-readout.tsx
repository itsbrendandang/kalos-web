import type { PopulatedResult } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Proposals } from "@/components/proposals";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel, ModelCoverage } from "@/components/dashboard/reliability-panel";
import { ReliabilityVerdict } from "@/components/dashboard/reliability-verdict";
import { RunLandscape } from "@/components/dashboard/run-landscape";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
import { ResponseSurface } from "@/components/dashboard/response-surface";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { num } from "@/lib/utils";

/** Grouping header: a bold label, an optional one-line descriptor, and a hairline
 *  that runs to the edge - turns the long dashboard into scannable sections. */
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span> : null}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The shared "reliability + drivers + predicted-vs-measured + proposals" readout
 * (REDESIGN 4.4, 5). Model quality, run structure, predicted landscape, and
 * recommended actions - the single authoritative rendering of an analysis result.
 * Dashboard renders this; no other page should reimplement it.
 */
export function AnalysisReadout({ d }: { d: PopulatedResult }) {
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;
  const hasPredicted = Boolean(d.response_surface || d.correlation);

  return (
    <>
      <section>
        <SectionHead title="Model quality" sub="What the model learned, and how far to trust it." />
        <ReliabilityVerdict d={d} />
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.85fr_0.95fr]">
          <Card className="flex flex-col">
            <div className="text-[15px] font-semibold text-fg">Process drivers</div>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              Signed correlation of each input with {d.target}, held out across recipe groups. Colored bars are
              statistically distinguishable from noise (95% CI excludes zero); gray bars are within noise.
            </p>
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
              <p className="py-10 text-center text-[12px] text-muted">no drivers</p>
            )}
          </Card>

          <ReliabilityPanel d={d} />
        </div>
        <ModelCoverage d={d} />
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
          title="Recommended actions"
          sub={`The next batch to run, ranked by the acquisition function${
            d.conformal_q != null ? ` · ± ${num(d.conformal_q, 2)} conformal band` : ""
          }.`}
        />
        <p className="mb-3 text-[12.5px] leading-5 text-muted">
          The optimizer&rsquo;s next-best experiments, chosen to balance expected improvement against uncertainty.
        </p>
        <Card>
          {d.proposals.length ? (
            <Proposals
              cols={d.proposal_features}
              rows={d.proposals}
              predHead={`pred. ${d.target} · vs best`}
              predFn={(p) => {
                const band = d.conformal_q ?? p.std;
                const delta = p.pred - d.best;
                const v = p.pred - band >= d.best ? "beats" : p.pred + band <= d.best ? "below" : "~best";
                return `${num(p.pred, 2)} ± ${num(p.std, 2)}  (${delta >= 0 ? "+" : "−"}${num(Math.abs(delta), 2)} ${v})`;
              }}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
          )}
        </Card>
      </section>
    </>
  );
}
