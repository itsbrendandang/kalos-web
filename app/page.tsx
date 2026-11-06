"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NextStepCard } from "@/components/assist/next-step-card";
import { useNextStepCard } from "@/hooks/use-assist";
import { agentStatus } from "@/lib/agent";
import type { AssistNext } from "@/lib/assist";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Disclosure } from "@/components/kit/disclosure";
import { KpiCard } from "@/components/kit/kpi-card";
import { lazyChart } from "@/components/kit/lazy-chart";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Badge, ExampleBadge, ModeBadge } from "@/components/ui/badge";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { proposalRecipe, reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber, formatRange } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { bestSoFarSeries, topDrivers } from "@/lib/overview";
import { driverLine, trustPlain, type Trust } from "@/lib/plain";
import { cn, parseUnit } from "@/lib/utils";
import { campaignView, type ActiveCampaign } from "@/lib/workbench";
import { aimLine } from "@/lib/objective";
import { EXPERIMENTS_ROUTE } from "@/lib/routes";

/**
 * Campaign Overview. It answers one question, "what should I run next, and can
 * I trust it?", in this order: one verdict sentence, one primary action, the
 * proposed batch, then every number and chart behind a single Disclosure.
 * Everything comes from /api/latest and /api/campaign; demo data appears only
 * when the engine confirms there is no campaign and demo mode is on, labelled.
 */
const BarChart = lazyChart(() => import("@/components/tremor/bar-chart").then((m) => m.BarChart));
const LineChart = lazyChart(() => import("@/components/tremor/line-chart").then((m) => m.LineChart));

export default function OverviewPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  // The engine's guide (GET /api/assist/next) when it has one; the stage logic below otherwise.
  const guide = useNextStepCard();
  const engineNext = guide.source === "engine" ? guide.next : null;

  if (view.state === "error" || latest.status === "error") {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Overview" />
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
      <div className="flex flex-col gap-10">
        <PageHeader title="Start a campaign" />
        <NextStep tone="accent" sentence={stage.next.reason} action={stage.next.action} href={stage.next.href} next={engineNext} />
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
  const proposals = analysis?.proposals ?? [];
  // The batch is the next thing to run only while the plan step is the current one.
  const planning = analysis != null && stage.next.stage === "plan" && proposals.length > 0;
  const bestLine =
    best != null
      ? `Best measured so far: ${formatNumber(best)}${unit ? ` ${unit}` : ""}, from ${formatNumber(runs, "count")} runs. Measured, not predicted.`
      : "No measured result yet.";

  const sentence = planning ? batchSentence(proposals.length, trust) : stage.next.reason;
  const tone = !planning ? "accent" : trust?.level === "good" ? "good" : trust?.level === "warn" ? "warn" : "neutral";
  const detail = trust ? (
    <div className="flex flex-col gap-2">
      <p>{trust.sentence}</p>
      <p>{trust.gloss}</p>
      {verdict?.rho != null ? (
        <p>
          Rank agreement on held-out runs is {formatNumber(verdict.rho, "corr")}
          {verdict.ci ? ` (95% interval ${formatRange(verdict.ci[0], verdict.ci[1], "corr")})` : ""}. 1 means the model orders every unseen run
          correctly, 0 means no better than chance.
        </p>
      ) : null}
    </div>
  ) : (
    "Appears once the model has been fitted to your data."
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={stage.round ? `Round ${stage.round}` : undefined}
        title={aimLine(target)}
        description={bestLine}
        meta={demo ? <ExampleBadge /> : null}
      />

      <NextStep
        tone={tone}
        sentence={sentence}
        action={stage.next.action}
        href={stage.next.href}
        detail={detail}
        trust={trust}
        next={engineNext}
      />

      {planning && analysis ? <Batch analysis={analysis} target={target} round={stage.round} /> : null}

      <Disclosure summary="Numbers, trend and drivers" meta={runs != null ? `${formatNumber(runs, "count")} runs` : undefined}>
        <div className="flex flex-col gap-8 pb-2">
          <Kpis active={active} analysis={analysis} target={target} unit={unit} round={stage.round} />
          <p className="text-body text-fg-muted">
            {agentStatus(active).headline}.{" "}
            <Link href="/agent" className="text-accent hover:underline">
              Ask Kalos
            </Link>
          </p>
          {trendReady ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <BestSoFarChart active={active} target={target} unit={unit} />
              <DriversChart analysis={analysis} target={target} />
            </div>
          ) : (
            <DriversChart analysis={analysis} target={target} />
          )}
          {lines.length ? (
            <Section title="What seems to move your result" description={`Patterns across your ${formatNumber(runs, "count")} runs. These show what goes together, not proof of cause.`}>
              <ul className="divide-y divide-border">
                {lines.map((l) => (
                  <li key={l.name} className="flex items-start gap-3 py-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-label",
                        l.clear ? "bg-accent text-accent-fg" : "border border-border-strong text-fg-muted",
                      )}
                      aria-hidden
                    >
                      {l.up ? "↑" : "↓"}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-code text-fg">{l.name}</span>
                      <span className="block text-body text-fg-muted">{l.sentence}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      </Disclosure>
      <Link href={EXPERIMENTS_ROUTE.href} className="text-body text-accent hover:underline">
        See all five stages
      </Link>
    </div>
  );
}

/** One verdict sentence about the batch, with the trust level in plain words. */
function batchSentence(n: number, trust: Trust | null): string {
  const head = `Run the ${n} proposed ${n === 1 ? "recipe" : "recipes"}`;
  if (trust?.level === "good") return `${head}: the model ranks unseen runs well enough to trust them.`;
  if (trust?.level === "warn") return `${head} as a test: the model is not yet reliable enough to lean on.`;
  return `${head} as a test: there are not enough held-out runs to judge the model yet.`;
}

/** The one verdict sentence, the one primary action, and the trust level beside it. */
function NextStep({
  tone,
  sentence,
  action,
  href,
  detail,
  trust,
  next,
}: {
  tone: "accent" | "good" | "warn" | "neutral";
  sentence: string;
  action: string;
  href: string;
  detail?: ReactNode;
  trust?: Trust | null;
  /** The engine's guide, when it sent one: its sentence, route and blockers win over the local ones. */
  next?: AssistNext | null;
}) {
  const aside = trust ? (
    <p className="flex flex-wrap items-center gap-2 text-label text-fg-muted">
      Can you trust it?
      <Badge tone={trust.level === "good" ? "good" : trust.level === "warn" ? "warn" : "neutral"}>{trust.word}</Badge>
    </p>
  ) : null;
  const card: AssistNext = next ?? { step: sentence, why: "", action_route: href, blockers: [], action };
  return <NextStepCard next={card} tone={tone} aside={aside} detail={detail} />;
}

/** The proposed batch: one row per recipe, the inputs as the lab sets them, the predicted value and the mode. */
function Batch({ analysis, target, round }: { analysis: PopulatedResult; target: string; round: number | null }) {
  const features = analysis.proposal_features;
  const n = analysis.proposals.length;
  return (
    <Section
      title="Proposed batch"
      description={`${n} ${n === 1 ? "recipe" : "recipes"} for ${round ? `round ${round}` : "the next round"}. Explore runs test unfamiliar settings; Exploit runs are the model's best bet.`}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            {features.map((f) => (
              <TableHead key={f} numeric className="font-mono text-code">
                {f}
              </TableHead>
            ))}
            <TableHead numeric>Predicted {target}</TableHead>
            <TableHead>Mode</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analysis.proposals.map((p, i) => {
            const recipe = proposalRecipe(p, features);
            return (
              <TableRow key={i}>
                <TableCell className="text-fg-muted tabular-nums">{i + 1}</TableCell>
                {features.map((f) => (
                  <TableCell key={f} numeric className="tabular-nums">
                    {formatNumber(recipe[f])}
                  </TableCell>
                ))}
                <TableCell numeric className="font-medium text-fg tabular-nums">
                  {formatNumber(p.pred)}
                </TableCell>
                <TableCell>
                  <ModeBadge mode={p.mode} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
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
    <section aria-label="Key numbers" className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-border [&>*]:lg:pl-6 [&>*:first-child]:lg:pl-0">
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
    <div className="flex flex-col gap-10" role="status" aria-label="Loading the campaign">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-full max-w-2xl" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <LoadingSkeleton variant="table" rows={3} />
    </div>
  );
}
