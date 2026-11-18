"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CampaignJourney } from "@/components/campaign/campaign-journey";
import { ToolFinder } from "@/components/workbench/tool-finder";
import { ProcessGuide } from "@/components/workbench/process-guide";
import { OutcomeDistribution } from "@/components/campaign/science-charts";
import { finitePairs } from "@/lib/science-viz";
import { ChartFrame } from "@/components/kit/chart-frame";
import { KpiCard } from "@/components/kit/kpi-card";
import { NextCard } from "@/components/kit/next-card";
import { PageHeader } from "@/components/kit/page-header";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber, formatRange } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { bestSoFarSeries, topDrivers } from "@/lib/overview";
import { parseUnit } from "@/lib/utils";
import { campaignView, type ActiveCampaign } from "@/lib/workbench";
import { lazyChart } from "@/components/kit/lazy-chart";

/**
 * A tool-first workspace, followed by the live campaign: the round, the next
 * step, four headline numbers, the best-so-far trend and the top drivers.
 * Everything comes from /api/latest and /api/campaign; demo data appears only
 * when the engine confirms there is no campaign and demo mode is on, labelled.
 */
const BarChart = lazyChart(() => import("@/components/tremor/bar-chart").then((m) => m.BarChart));
const LineChart = lazyChart(() => import("@/components/tremor/line-chart").then((m) => m.LineChart));
const PredVsMeasured = lazyChart(() => import("@/components/campaign/pred-vs-measured").then((m) => m.PredVsMeasured));

export default function OverviewPage() {
  return <div className="flex flex-col gap-7"><ToolFinder /><ProcessGuide pathname="/" /><CampaignOverview /></div>;
}

function CampaignOverview() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);

  if (view.state === "error" || latest.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader headingLevel={2} title="Campaign overview" />
        <ErrorState
          title="Could not reach the analysis service"
          description="The campaign could not be loaded because the engine did not answer. This is a connection problem, not an empty campaign."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </div>
    );
  }
  if (view.state === "loading" || !latest.data) return <OverviewSkeleton />;

  const demo = view.state === "data" && view.demo;
  const active = view.state === "data" ? view.campaign : null;
  const analysis = !demo && latest.data.has_data ? latest.data : null;
  const stage = campaignStage(demo ? { has_data: true } : latest.data, active ?? { has_campaign: false });
  const target = active?.target ?? analysis?.target ?? null;

  if (!target) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader headingLevel={2} title="Start a campaign" description="Upload the runs you already have. Kalos fits a model to them and proposes the first batch to try." />
        <CampaignJourney stage={stage} />
        <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />
      </div>
    );
  }

  const unit = parseUnit(target);
  const heldOut = finitePairs(analysis?.oof ?? []);
  return (
    <div className="flex flex-col gap-7">
      <section aria-label="Current campaign" className="flex flex-col gap-6 border-t border-border pt-7">
      <PageHeader
        headingLevel={2}
        eyebrow="Your campaign"
        title="Campaign overview"
        meta={demo ? <ExampleBadge /> : null}
        description={
          analysis
            ? `Maximize ${target}. Fitted to ${analysis.dataset}, ${formatNumber(active?.n_base ?? analysis.n, "count")} measured runs so far.`
            : `Maximize ${target}. ${formatNumber(active?.n_base, "count")} measured runs so far.`
        }
        action={
          <Link href="/campaign/run" className={buttonVariants({ variant: "outline" })}>
            View runs
            <ArrowUpRight aria-hidden />
          </Link>
        }
      />
      <Kpis active={active} analysis={analysis} target={target} unit={unit} round={stage.round} />
      <CampaignJourney stage={stage} />
      <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-heading text-fg">What the evidence shows</h2>
          <p className="text-caption text-fg-muted">Measured outcomes, not predictions</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <BestSoFarChart active={active} target={target} unit={unit} />
          <DriversChart analysis={analysis} target={target} />
        </div>
      </div>
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-heading text-fg">Understand the model, not just the best result</h2><Link href="/campaign/learn" className="text-caption text-fg-muted underline underline-offset-4">Open full diagnostics</Link></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartFrame title="Prediction versus measurement" n={heldOut.length} unit={unit || undefined} method="The engine's held-out pairs. Each dot compares a measured outcome with a prediction made without that run. The dashed line is perfect agreement." state={heldOut.length > 1 ? "ready" : "insufficient"} insufficientText="At least two held-out pairs are needed. No predicted points are invented.">
            <PredVsMeasured oof={heldOut} targetName={target} unit={unit} />
            <p className="mt-2 text-caption text-fg-muted">Held-out predictions, not in-sample fit. Closer to the diagonal means closer agreement.</p>
            <details className="mt-3 text-caption text-fg-muted"><summary className="cursor-pointer">View held-out pairs</summary><table className="mt-2 w-full text-left"><thead><tr><th>Pair</th><th>Measured</th><th>Predicted</th></tr></thead><tbody>{heldOut.map(([measured,predicted],i)=><tr key={i}><td>{i+1}</td><td>{formatNumber(measured)}</td><td>{formatNumber(predicted)}</td></tr>)}</tbody></table></details>
          </ChartFrame>
          <OutcomeDistribution oof={heldOut} target={target} unit={unit} />
        </div>
      </div>
      </section>
    </div>
  );
}

function Kpis({
  active,
  analysis,
  target,
  unit,
  round,
}: {
  active: ActiveCampaign | null;
  analysis: PopulatedResult | null;
  target: string;
  unit: string;
  round: number | null;
}) {
  const delta = active ? bestDeltaFromPreviousRound(active) : null;
  const verdict = analysis ? reliabilityVerdict(analysis) : null;
  const verdictTone = verdict?.state === "reliable" ? "good" : verdict?.state === "not-yet" ? "warn" : "neutral";
  return (
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiCard
        label={`Best ${target}`}
        value={active?.best ?? analysis?.best ?? null}
        unit={unit}
        delta={delta ? { value: delta.delta, context: delta.previousRound === 0 ? "vs uploaded data" : `vs round ${delta.previousRound}`, better: "up" } : null}
        qualifier="Measured, not predicted"
      />
      <KpiCard
        label="Model reliability"
        value={verdict?.rho ?? null}
        quantity="corr"
        badge={verdict ? <Badge tone={verdictTone}>{verdict.label}</Badge> : null}
        qualifier={
          !verdict
            ? "Appears after an analysis"
            : verdict.ci
              ? `Rank agreement on held-out runs, 95% CI ${formatRange(verdict.ci[0], verdict.ci[1], "corr")}`
              : "Rank agreement on held-out runs; no interval reported"
        }
      />
      <KpiCard
        label="Runs in flight"
        value={active?.n_awaiting ?? 0}
        quantity="count"
        qualifier={`${formatNumber(active?.n_measured ?? 0, "count")} measured this round`}
      />
      <KpiCard
        label="Round"
        value={round}
        quantity="count"
        qualifier={`${formatNumber(active?.n_base ?? analysis?.n, "count")} runs in the dataset`}
      />
    </section>
  );
}

function BestSoFarChart({ active, target, unit }: { active: ActiveCampaign | null; target: string; unit: string }) {
  const series = active ? bestSoFarSeries(active) : [];
  const measured = series.filter((p) => p.best != null).length;
  const roundName = (r: string | number) => (Number(r) === 0 ? "Upload" : `Round ${r}`);
  return (
    <ChartFrame
      title="Best so far, by round"
      unit={unit || undefined}
      n={active?.n_base}
      method="The highest measured value in the dataset after each round's results were added. Round 0 is the uploaded run sheet. Measured values only, never predictions."
      state={!active ? "empty" : measured < 2 ? "insufficient" : "ready"}
      emptyText="The trend appears once the campaign has rounds."
      insufficientText="The trend appears after the first round's results are added to the model."
    >
      <LineChart
        className="h-64"
        data={series}
        index="round"
        categories={["best"]}
        showLegend={false}
        showDots
        autoMinValue
        connectNulls
        valueFormatter={(v) => formatNumber(v)}
        indexFormatter={roundName}
        xAxisLabel="Round"
        yAxisLabel={target}
        aria-label={`Best ${target} by round: ${series.map((p) => `${roundName(p.round)} ${formatNumber(p.best)}`).join(", ")}`}
        customTooltip={(d) => (
          <p className="text-fg-muted">
            Best <span className="text-fg tabular-nums">{formatNumber(typeof d.best === "number" ? d.best : null)}</span>
            {unit ? ` ${unit}` : ""} from {formatNumber(typeof d.runs === "number" ? d.runs : null, "count")} runs
          </p>
        )}
      />
    </ChartFrame>
  );
}

function DriversChart({ analysis, target }: { analysis: PopulatedResult | null; target: string }) {
  const bars = analysis ? topDrivers(analysis.drivers) : [];
  return (
    <ChartFrame
      title="Top process drivers"
      unit="rank correlation"
      n={analysis ? (analysis.driver_selection?.n_units ?? analysis.n) : null}
      method="Spearman rank correlation of each input with the target across measured runs, with its 95% confidence interval. Significant means the interval excludes zero and the input survives a correction for testing many inputs at once. An association in these runs, not proof of cause."
      state={bars.length ? "ready" : "empty"}
      emptyText={analysis ? "This analysis reported no drivers." : "Drivers appear after the first analysis."}
    >
      <BarChart
        className="h-64"
        data={bars}
        index="name"
        categories={["rho"]}
        layout="vertical"
        minValue={-1}
        maxValue={1}
        referenceValue={0}
        errorKey="ci"
        valueFormatter={(v) => formatNumber(v, "corr")}
        barStyle={(d) => (d.significant ? { color: "accent" } : { color: "muted", outline: true })}
        legend={[
          { name: "Significant", color: "accent", swatch: "solid" },
          { name: "Not significant", color: "muted", swatch: "outline" },
        ]}
        legendPosition="left"
        xAxisLabel={`Correlation with ${target}`}
        aria-label={`Top drivers: ${bars.map((b) => `${b.name} ${formatNumber(b.rho, "corr")}${b.significant ? ", significant" : ", not significant"}`).join("; ")}`}
        customTooltip={(d) => (
          <div className="space-y-0.5 text-fg-muted">
            <p>
              Correlation <span className="text-fg tabular-nums">{formatNumber(Number(d.rho), "corr")}</span>
            </p>
            <p>95% CI {formatRange(Number(d.lo), Number(d.hi), "corr")}</p>
            <p className="text-fg">{d.significant ? "Significant" : "Not significant"}</p>
          </div>
        )}
      />
    </ChartFrame>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the campaign">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <LoadingSkeleton variant="card" rows={4} className="lg:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-2">
        <LoadingSkeleton variant="chart" />
        <LoadingSkeleton variant="chart" />
      </div>
    </div>
  );
}
