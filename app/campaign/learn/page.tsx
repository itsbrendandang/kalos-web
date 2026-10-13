"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BestSoFarChart } from "@/components/campaign/best-so-far-chart";
import { CorrelationHeatmap } from "@/components/campaign/correlation-heatmap";
import { DriversList } from "@/components/campaign/drivers-list";
import { bandCalibration, calibrationSentence, canPlanNext, promotionLine } from "@/components/campaign/learn";
import { PredVsMeasured } from "@/components/campaign/pred-vs-measured";
import { RunLandscape } from "@/components/campaign/run-landscape";
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
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber, formatRange } from "@/lib/format";
import { topDrivers } from "@/lib/overview";
import { parseUnit } from "@/lib/utils";
import { measured, type ActiveCampaign } from "@/lib/workbench";

/**
 * Learn: what the round taught the model. The verdict comes first, then the
 * measured best so far, whether the results landed in their predicted bands,
 * the drivers, and model detail one click down. "Plan round N+1" re-analyzes
 * with the measured results and opens the next batch on Plan.
 */
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
  const unit = parseUnit(d.target);
  const name = targetName(d.target);
  const verdict = reliabilityVerdict(d);
  const promotion = promotionLine(d.promotion);
  const calibration = bandCalibration(runs, d.conformal_q);
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
            {busy ? "Planning..." : `Plan round ${learned + 1}`}
            {busy ? null : <ArrowRight aria-hidden />}
          </Button>
          {enabled ? null : <p className="text-caption text-fg-muted">Record at least one result first.</p>}
        </div>,
        learned > 0 ? `Learn from round ${learned}` : "Learn",
      )}

      {failed ? (
        <Callout tone="bad" title="Could not plan the next round">
          The engine did not accept the re-analysis. Your recorded results are safe; try again.
        </Callout>
      ) : null}

      <div className="flex flex-col gap-2">
        <Verdict
          tone={verdict.state === "reliable" ? "good" : verdict.state === "not-yet" ? "warn" : "neutral"}
          detailLabel="Numbers behind this"
          detail={
            verdict.rho != null ? (
              <p>
                Rank agreement between predicted and measured order on held-out runs: {formatNumber(verdict.rho, "corr")}
                {verdict.ci ? `, 95% CI ${formatRange(verdict.ci[0], verdict.ci[1], "corr")}` : ""}
                {verdict.floor != null ? `. The trust floor is ${formatNumber(verdict.floor, "corr")}.` : "."}
              </p>
            ) : (
              <p>The model could not be scored on held-out runs.</p>
            )
          }
        >
          <span className="font-semibold">{verdict.label}.</span> {verdict.reason}
        </Verdict>
        {promotion ? <p className="ml-7 text-body text-fg-muted">{promotion}</p> : null}
      </div>

      <Section title="Best so far" description="The highest measured value, never a prediction.">
        <Metric
          size="lg"
          label={`Best ${name}`}
          value={c.best}
          unit={unit}
          qualifier={
            `Measured, from ${formatNumber(c.n_base, "count")} runs in the dataset.` +
            (roundBestPending ? ` The best result recorded this round, ${formatNumber(roundBest)}${unit ? ` ${unit}` : ""}, is counted once you plan round ${learned + 1}.` : "")
          }
        />
        <BestSoFarChart campaign={c} unit={unit} />
        <ul className="text-caption text-fg-muted">
          {c.history.map((h) => (
            <li key={h.round} id={`round-${h.round}`} className="scroll-mt-4 py-0.5 tabular-nums">
              {h.round === 0 ? "Uploaded data" : `After round ${h.round}`}: best {formatNumber(h.best)}
              {unit ? ` ${unit}` : ""}, {formatNumber(h.n_base, "count")} runs
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Did the results land where predicted?">
        <p className="text-body text-fg">
          {calibration == null
            ? "The engine did not report a prediction band, so this cannot be checked."
            : calibration.total === 0
              ? "No measured results to compare with their predictions yet."
              : calibrationSentence(calibration, d.conformal_coverage)}
        </p>
      </Section>

      <Section
        title="What moves the target"
        description={`Associations in these runs, not proof of cause. Ranked by strength of rank correlation with ${name}. Significant means the interval excludes zero and the input still stands after correcting for testing many inputs at once.`}
      >
        {drivers.length ? <DriversList drivers={drivers} targetName={name} /> : <p className="text-body text-fg-muted">This analysis reported no drivers.</p>}
      </Section>

      <Section title="Predicted against measured">
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
      </Section>

      <div>
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
