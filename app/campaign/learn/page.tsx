"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CorrelationHeatmap } from "@/components/campaign/correlation-heatmap";
import { DriversList } from "@/components/campaign/drivers-list";
import { bandCalibration, calibrationSentence, canPlanNext, promotionLine, verdictImpact } from "@/components/campaign/learn";
import { targetName } from "@/components/campaign/target";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import { coveragePct, reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber, formatRange } from "@/lib/format";
import { topDrivers } from "@/lib/overview";
import { parseUnit } from "@/lib/utils";
import { measured, type ActiveCampaign } from "@/lib/workbench";
import { lazyChart } from "@/components/kit/lazy-chart";

/**
 * Learn: can the model be trusted, and what does that change? One verdict
 * leads, then at most three numbers, then the process drivers. Method detail
 * and the raw engine values sit one click down. "Plan round N+1" re-analyzes
 * with the measured results and opens the next batch on Plan.
 */
const BestSoFarChart = lazyChart(() => import("@/components/campaign/best-so-far-chart").then((m) => m.BestSoFarChart));
const PredVsMeasured = lazyChart(() => import("@/components/campaign/pred-vs-measured").then((m) => m.PredVsMeasured));
const RunLandscape = lazyChart(() => import("@/components/campaign/run-landscape").then((m) => m.RunLandscape));

export default function LearnPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { reanalyze } = useEngineWrites();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const header = (action?: React.ReactNode, title = "Learn") => (
    <PageHeader title={title} description="What the results taught the model, and whether to trust it." action={action} />
  );

  if (latest.status === "error" || campaign.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <ErrorState
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </div>
    );
  }
  if (!latest.data || !campaign.data) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading">
        {header()}
        <LoadingSkeleton variant="card" rows={2} />
        <LoadingSkeleton variant="chart" />
      </div>
    );
  }
  if (!latest.data.has_data || !campaign.data.has_campaign) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <EmptyState
          title="Nothing to learn from yet"
          description="Learning starts once a run sheet is analyzed and a batch has been run."
          action={
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Upload a run sheet
            </Link>
          }
        />
      </div>
    );
  }

  const d: PopulatedResult = latest.data;
  const c: ActiveCampaign = campaign.data;
  const round = campaignStage(d, c).round ?? 1;
  const runs = measured(c);
  // The round just learned from; once results are folded in it is the one before the current round.
  const learned = runs.length > 0 ? round : round - 1;
  const nextRound = learned + 1;
  const unit = parseUnit(d.target);
  const name = targetName(d.target);
  const verdict = reliabilityVerdict(d);
  const promotion = promotionLine(d.promotion);
  const calibration = bandCalibration(runs, d.conformal_q);
  const coverage = coveragePct(d.conformal_coverage);
  const drivers = topDrivers(d.drivers, 8);
  const enabled = canPlanNext(c);
  // Results recorded this round join `c.best` only when the model is re-analyzed, so say so instead of letting two numbers disagree.
  const roundBest = runs.length ? Math.max(...runs.map((r) => r.result as number)) : null;
  const roundBestPending = roundBest != null && (c.best == null || roundBest > c.best);

  async function planNext() {
    setBusy(true);
    setFailed(false);
    try {
      await reanalyze();
      router.push("/campaign/plan");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {header(
        <div className="flex flex-col items-end gap-1">
          <Button onClick={planNext} disabled={!enabled || busy}>
            {busy ? "Planning..." : `Plan round ${nextRound}`}
            {busy ? null : <ArrowRight aria-hidden />}
          </Button>
          {enabled ? null : <p className="text-caption text-fg-muted">Record at least one result first.</p>}
        </div>,
        learned > 0 ? `Learn from round ${learned}` : "Learn",
      )}

      {/* The one callout on this screen: the only thing here the user must act on right now. */}
      {failed ? (
        <Callout tone="bad" title="Could not plan the next round">
          The engine did not accept the re-analysis. Your recorded results are safe; try again.
        </Callout>
      ) : null}

      <section className="flex flex-col gap-3" aria-label="Verdict">
        <Verdict
          tone={verdict.state === "reliable" ? "good" : verdict.state === "not-yet" ? "warn" : "neutral"}
          detailLabel="How the model was scored"
          detail={
            <div className="flex flex-col gap-2">
              {verdict.rho != null ? (
                <p>
                  Ranking agreement on held-out runs: {formatNumber(verdict.rho, "corr")}
                  {verdict.ci ? `, 95% range ${formatRange(verdict.ci[0], verdict.ci[1], "corr")}` : ""}
                  {verdict.floor != null ? `. The trust floor is ${formatNumber(verdict.floor, "corr")}.` : "."}
                </p>
              ) : (
                <p>The model could not be scored on held-out runs.</p>
              )}
              {promotion ? <p>{promotion}</p> : null}
            </div>
          }
        >
          <span className="font-semibold">{verdict.label}.</span> {verdict.reason}
        </Verdict>
        <p className="ml-7 text-body text-fg">{verdictImpact(verdict.state, promotion == null, nextRound)}</p>
      </section>

      <div className="grid gap-6 sm:grid-cols-3">
        <Metric
          label={`Best ${name}`}
          value={c.best}
          unit={unit}
          qualifier={
            `Measured, from ${formatNumber(c.n_base, "count")} runs.` +
            (roundBestPending ? ` This round's best, ${formatNumber(roundBest)}${unit ? ` ${unit}` : ""}, counts once you plan round ${nextRound}.` : "")
          }
        />
        <Metric
          label="Ranking on held-out runs"
          value={verdict.rho}
          quantity="corr"
          qualifier={verdict.ci ? `95% range ${formatRange(verdict.ci[0], verdict.ci[1], "corr")}` : "Not enough runs to measure yet"}
        />
        <Metric
          label="Measured runs inside their predicted band"
          value={calibration == null ? "Not reported" : calibration.total === 0 ? "None yet" : `${formatNumber(calibration.inside, "count")} of ${formatNumber(calibration.total, "count")}`}
          qualifier={coverage ? `The band is meant to hold ${coverage} of runs.` : undefined}
        />
      </div>

      <Section
        title="What moves the target"
        description={`Associations in these runs, strongest first. They are not proof of cause.`}
      >
        {drivers.length ? <DriversList drivers={drivers} targetName={name} /> : <p className="text-body text-fg-muted">This analysis reported no drivers.</p>}
        <Disclosure summary="How to read this chart">
          <p>
            Each bar is the rank correlation between an input and {name}. The whisker is its 95% range. A solid bar is significant: the range excludes zero, and the input still
            stands after correcting for testing many inputs at once. An outline bar is not significant.
          </p>
        </Disclosure>
      </Section>

      <div>
        <Disclosure summary="Best result by round" meta={`${formatNumber(c.history.length, "count")} ${c.history.length === 1 ? "round" : "rounds"}`}>
          <div className="flex flex-col gap-4">
            <BestSoFarChart campaign={c} unit={unit} />
            <ul className="text-caption text-fg-muted">
              {c.history.map((h) => (
                <li key={h.round} id={`round-${h.round}`} className="scroll-mt-4 py-0.5 tabular-nums">
                  {h.round === 0 ? "Uploaded data" : `After round ${h.round}`}: best {formatNumber(h.best)}
                  {unit ? ` ${unit}` : ""}, {formatNumber(h.n_base, "count")} runs
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>
        <Disclosure summary="Predicted against measured" meta="held-out runs">
          <div className="flex flex-col gap-4">
            <p className="text-body text-fg">
              {calibration == null
                ? "The engine did not report a prediction band, so this cannot be checked."
                : calibration.total === 0
                  ? "No measured results to compare with their predictions yet."
                  : calibrationSentence(calibration, d.conformal_coverage)}
            </p>
            <ChartFrame
              title="Held-out predictions"
              unit={unit || undefined}
              n={d.oof.length}
              method="Each dot is a run the model did not see when it predicted it. Dots on the dashed line were predicted exactly."
              state={d.oof.length ? "ready" : "empty"}
              emptyText="Not enough held-out runs to compare yet."
            >
              <PredVsMeasured oof={d.oof} targetName={name} unit={unit} />
            </ChartFrame>
          </div>
        </Disclosure>
        {d.embedding && d.embedding.points.length ? (
          <Disclosure summary="Run landscape" meta="where the runs sit">
            <RunLandscape embedding={d.embedding} targetName={name} unit={unit} />
          </Disclosure>
        ) : null}
        {d.correlation && d.correlation.labels.length > 1 ? (
          <Disclosure summary="Input correlations" meta="how the inputs relate">
            <CorrelationHeatmap labels={d.correlation.labels} matrix={d.correlation.matrix} />
          </Disclosure>
        ) : null}
      </div>

      <Link href="/library/scale-up" className="inline-flex w-fit items-center gap-1.5 text-label text-accent hover:underline">
        Predict at a larger scale
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
