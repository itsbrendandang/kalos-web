"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { agentStatus } from "@/lib/agent";
import { Disclosure } from "@/components/kit/disclosure";
import { driverLine, trustPlain } from "@/lib/plain";

import { ChartFrame } from "@/components/kit/chart-frame";
import { KpiCard } from "@/components/kit/kpi-card";
import { NextCard } from "@/components/kit/next-card";
import { PageHeader } from "@/components/kit/page-header";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber, formatRange } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { bestSoFarSeries, topDrivers } from "@/lib/overview";
import { cn, parseUnit } from "@/lib/utils";
import { campaignView, type ActiveCampaign } from "@/lib/workbench";
import { lazyChart } from "@/components/kit/lazy-chart";

/**
 * Campaign Overview, the pinned first tab: where the round is, the one next
 * step, four headline numbers, the best-so-far trend and the top drivers.
 * Everything comes from /api/latest and /api/campaign; demo data appears only
 * when the engine confirms there is no campaign and demo mode is on, labelled.
 */
const BarChart = lazyChart(() => import("@/components/tremor/bar-chart").then((m) => m.BarChart));
const LineChart = lazyChart(() => import("@/components/tremor/line-chart").then((m) => m.LineChart));

export default function OverviewPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);

  if (view.state === "error" || latest.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Campaign overview" />
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
        <PageHeader title="Start a campaign" description="Upload the runs you already have. Kalos fits a model to them and proposes the first batch to try." />
        <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />
      </div>
    );
  }

  const unit = parseUnit(target);
  const trendReady = active != null && bestSoFarSeries(active).filter((p) => p.best != null).length >= 2;
  const verdict = analysis ? reliabilityVerdict(analysis) : null;
  const trust = verdict ? trustPlain(verdict) : null;
  const shapes = new Map((analysis?.gp_shapes?.available ? analysis.gp_shapes.features : []).map((f) => [f.name, f]));
  const lines = analysis ? topDrivers(analysis.drivers, 5).map((b) => driverLine(analysis.drivers.find((d) => d.name === b.name)!, target, shapes.get(b.name))) : [];
  const best = active?.best ?? analysis?.best ?? null;
  const runs = active?.n_base ?? analysis?.n ?? null;
  const nProposed = analysis?.proposals?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={stage.round ? `Round ${stage.round}` : undefined}
        title={`Goal: raise ${target}`}
        meta={demo ? <ExampleBadge /> : null}
      />

      <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />

      <section aria-label="Where things stand" className="grid gap-4 md:grid-cols-2">
        <div className="glass flex flex-col gap-1 p-6">
          <p className="text-label text-fg-muted">Your best result so far</p>
          <p className="flex items-baseline gap-2">
            <span className="text-display tabular-nums text-fg">{formatNumber(best)}</span>
            {unit ? <span className="text-heading font-normal text-fg-muted">{unit}</span> : null}
          </p>
          <p className="text-body text-fg-muted">
            Best measured result among your {formatNumber(runs, "count")} runs, including any history you uploaded. Not a prediction.
          </p>
          {active && bestDeltaFromPreviousRound(active) ? <Delta d={bestDeltaFromPreviousRound(active)!} /> : null}
        </div>
        <div className="glass flex flex-col gap-2 p-6">
          <p className="text-label text-fg-muted">Can you trust the suggestions?</p>
          {trust ? (
            <>
              <p className="flex items-center gap-2">
                <Badge tone={trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral"}>{trust.word}</Badge>
              </p>
              <p className="text-body text-fg-muted">{trust.sentence}</p>
              {verdict?.rho != null ? (
                <Disclosure summary="The numbers behind this">
                  <p className="pb-3 text-body text-fg-muted">
                    Rank agreement on held-out runs is {formatNumber(verdict.rho, "corr")}
                    {verdict.ci ? ` (95% interval ${formatRange(verdict.ci[0], verdict.ci[1], "corr")})` : ""}. 1 means the model orders every unseen run correctly, 0 means no better than chance.
                  </p>
                </Disclosure>
              ) : null}
            </>
          ) : (
            <p className="text-body text-fg-muted">Appears once the model has been fitted to your data.</p>
          )}
        </div>
      </section>

      {lines.length ? (
        <Disclosure summary="What seems to move your result" meta={`${lines.length} inputs`}>
          <p className="pb-2 text-body text-fg-muted">Patterns across your {formatNumber(runs, "count")} runs. These show what goes together, not proof of cause.</p>
          <ul className="divide-y divide-border pb-2">
            {lines.map((l) => (
              <li key={l.name} className="flex items-start gap-3 py-3.5">
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-label", l.clear ? "bg-accent text-accent-fg" : "border border-border-strong text-fg-muted")} aria-hidden>
                  {l.up ? "↑" : "↓"}
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-code text-fg">{l.name}</span>
                  <span className="block text-body text-fg-muted">{l.sentence}</span>
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {agentStatus(active).state === "waiting" ? <LabStrip active={active} demo={demo} /> : null}

      <Disclosure summary="Detailed charts and numbers" meta={nProposed ? `${nProposed} proposed recipes` : undefined}>
        <div className="flex flex-col gap-6 pb-2">
          <Kpis active={active} analysis={analysis} target={target} unit={unit} round={stage.round} />
          {trendReady ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <BestSoFarChart active={active} target={target} unit={unit} />
              <DriversChart analysis={analysis} target={target} />
            </div>
          ) : (
            <DriversChart analysis={analysis} target={target} />
          )}
        </div>
      </Disclosure>

    </div>
  );
}

function Delta({ d }: { d: { delta: number; previousRound: number } }) {
  const up = d.delta > 0;
  return (
    <p className="text-body text-fg">
      {d.delta === 0 ? "No change" : `${up ? "Up" : "Down"} ${formatNumber(Math.abs(d.delta))}`}{" "}
      <span className="text-fg-muted">{d.previousRound === 0 ? "from your uploaded data" : `from round ${d.previousRound}`}</span>
    </p>
  );
}

function LabStrip({ active, demo }: { active: ActiveCampaign | null; demo: boolean }) {
  const status = agentStatus(active);
  const live = status.state === "waiting";
  return (
    <Link href="/agent" className="flex items-center gap-3 rounded-2xl glass px-5 py-4 transition-colors hover:bg-subtle">
      <span className={cn("size-2.5 shrink-0 rounded-full", live ? "bg-accent" : "bg-border-strong")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-heading text-fg">{status.headline}</span>
        <span className="ml-2 text-body text-fg-muted">{demo ? "Example data" : live ? "In the lab right now" : null}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-label text-accent">
        Open agent <ArrowRight className="size-4" aria-hidden />
      </span>
    </Link>
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
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl glass p-5 lg:grid-cols-4 lg:divide-x lg:divide-border [&>*]:lg:pl-6 [&>*:first-child]:lg:pl-0">
      <KpiCard
        bare
        label={`Best ${target}`}
        value={active?.best ?? analysis?.best ?? null}
        unit={unit}
        delta={delta ? { value: delta.delta, context: delta.previousRound === 0 ? "vs uploaded data" : `vs round ${delta.previousRound}`, better: "up" } : null}
        qualifier="Measured, not predicted"
      />
      <KpiCard
        bare
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
        bare
        label="Runs in flight"
        value={active?.n_awaiting ?? 0}
        quantity="count"
        qualifier={`${formatNumber(active?.n_measured ?? 0, "count")} measured this round`}
      />
      <KpiCard
        bare
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
