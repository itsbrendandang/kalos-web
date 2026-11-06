"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { NextStepCard } from "@/components/assist/next-step-card";
import { Conversation } from "@/components/assist/conversation";
import { ProposedRecipes } from "@/components/campaign/proposed-recipes";
import { useViewMode } from "@/hooks/use-view-mode";
import { useNextStepCard } from "@/hooks/use-assist";
import { agentStatus } from "@/lib/agent";
import type { AssistNext } from "@/lib/assist";
import { whyLine } from "@/lib/why";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Disclosure } from "@/components/kit/disclosure";
import { KpiCard } from "@/components/kit/kpi-card";
import { lazyChart } from "@/components/kit/lazy-chart";
import { PageHeader } from "@/components/kit/page-header";
import { WordsLine } from "@/components/kit/term";
import { Section } from "@/components/kit/section";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaign, useLatest } from "@/hooks/use-engine";
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage } from "@/lib/campaign-stage";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { bestSoFarSeries, topDrivers } from "@/lib/overview";
import { driverLine, trustPlain, type Trust } from "@/lib/plain";
import { RANK_AGREEMENT_GLOSS, trustNumbers } from "@/components/campaign/trust-numbers";
import { cn, parseUnit } from "@/lib/utils";
import { campaignView, type ActiveCampaign } from "@/lib/workbench";
import { aimLine } from "@/lib/objective";
import { EXPERIMENTS_ROUTE } from "@/lib/routes";

/**
 * Campaign Overview. It answers one question, "what should I run next, and can
 * I trust it?", in this order: one verdict sentence, one primary action, the
 * proposed recipes, then every number and chart behind a single Disclosure.
 * Everything comes from /api/latest and /api/campaign; demo data appears only
 * when the engine confirms there is no campaign and demo mode is on, labelled.
 */
const BarChart = lazyChart(() => import("@/components/tremor/bar-chart").then((m) => m.BarChart));
const LineChart = lazyChart(() => import("@/components/tremor/line-chart").then((m) => m.LineChart));

export default function OverviewPage() {
  const mode = useViewMode();
  // Simple view: Overview is a conversation with Kalos; the full page below is one link away.
  if (mode === "simple") return <Conversation />;
  return <FullOverview />;
}

function FullOverview() {
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
          title="Could not reach Kalos"
          description="The campaign could not be loaded because Kalos did not answer. This is a connection problem, not an empty campaign."
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
        <WordsLine />
        <NextStep tone="accent" sentence={stage.next.reason} why={stage.next.why} action={stage.next.action} href={stage.next.href} next={engineNext} />
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
  // The proposed recipes are the next thing to run only while the plan step is the current one.
  const planning = analysis != null && stage.next.stage === "plan" && proposals.length > 0;
  const bestLine =
    best != null
      ? `Best measured so far: ${formatNumber(best)}${unit ? ` ${unit}` : ""}, from ${formatNumber(runs, "count")} runs. Measured, not predicted.`
      : "No measured result yet.";

  const sentence = planning ? batchSentence(proposals.length, trust) : stage.next.reason;
  const tone = !planning ? "accent" : trust?.level === "good" ? "good" : trust?.level === "warn" ? "warn" : "neutral";
  const numbers = verdict ? trustNumbers(verdict) : null;
  const detail = trust ? (
    <div className="flex flex-col gap-2">
      <p className="text-label text-fg">How the model was scored</p>
      <p>{trust.gloss}</p>
      {numbers ? (
        <p>
          {numbers} {RANK_AGREEMENT_GLOSS}
        </p>
      ) : null}
    </div>
  ) : (
    "Appears once the model has learned from your runs."
  );

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={stage.round ? `Round ${stage.round}` : undefined}
        title={aimLine(target)}
        description={bestLine}
        meta={demo ? <ExampleBadge /> : null}
      />
      <WordsLine />

      <NextStep
        tone={tone}
        sentence={sentence}
        why={planning && verdict ? verdict.state : stage.next.why}
        action={stage.next.action}
        href={stage.next.href}
        detail={detail}
        trust={trust}
        next={engineNext}
      />

      {planning && analysis ? <ProposedRecipes analysis={analysis} target={target} round={stage.round} /> : null}

      <Disclosure summary="Numbers, trend and what went with the result" meta={runs != null ? `${formatNumber(runs, "count")} runs` : undefined}>
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

/** One verdict sentence about the proposed recipes, with the trust level in plain words. */
function batchSentence(n: number, trust: Trust | null): string {
  const head = `Run the ${n} proposed ${n === 1 ? "recipe" : "recipes"}`;
  if (trust?.level === "good") return `${head}: the model put your past runs in the right order most of the time, so its suggestions are worth running.`;
  if (trust?.level === "warn") return `${head} as a test: the model cannot yet put your past runs in the right order, so its suggestions are closer to guesses.`;
  return `${head} as a test: too few past runs could be tested to tell whether the model is any good yet.`;
}

/** The one verdict sentence, the one primary action, and the trust level beside it. */
function NextStep({
  tone,
  sentence,
  why,
  action,
  href,
  detail,
  trust,
  next,
}: {
  tone: "accent" | "good" | "warn" | "neutral";
  sentence: string;
  why: string;
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
  // Without the engine's guide, the local step carries its own "Why this matters" line from lib/why.ts (never written inline).
  const card: AssistNext = next ?? { step: sentence, why: "", why_it_matters: whyLine(why) ?? undefined, action_route: href, blockers: [], action };
  return <NextStepCard next={card} tone={tone} aside={aside} detail={detail} />;
}


/** Under the verdict label: how often the model put past runs in the right order, in words. */
function rankWords(state: "reliable" | "not-yet" | "insufficient"): string {
  if (state === "reliable") return "It put past runs in the right order most of the time";
  if (state === "not-yet") return "It put past runs in the right order about as often as not";
  return "Too few past runs could be tested";
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
        label="Can the model be trusted?"
        value={verdict ? verdict.label : null}
        badge={verdict ? <Badge tone={verdictTone}>{verdict.state === "reliable" ? "Yes" : verdict.state === "not-yet" ? "Not yet" : "Cannot tell"}</Badge> : null}
        qualifier={!verdict ? "Appears once the model has learned from your runs" : rankWords(verdict.state)}
      />
      <KpiCard
        bare
        label="Runs in the lab"
        value={active?.n_awaiting ?? 0}
        quantity="count"
        qualifier={`${formatNumber(active?.n_measured ?? 0, "count")} measured this round`}
      />
      <KpiCard
        bare
        label="Round"
        value={round}
        quantity="count"
        qualifier={`${formatNumber(active?.n_base ?? analysis?.n, "count")} runs in the sheet`}
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
      title={`What went with higher ${target}`}
      n={analysis ? (analysis.driver_selection?.n_units ?? analysis.n) : null}
      method="Spearman rank correlation of each input with the target across measured runs, with its 95% confidence interval. A clear signal means the interval excludes zero and the input survives a correction for testing many inputs at once. An association in these runs, not proof of cause."
      state={bars.length ? "ready" : "empty"}
      emptyText={analysis ? "Kalos found nothing that went with the result in these runs." : "This appears once the model has learned from your runs."}
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
          { name: "Clear signal", color: "accent", swatch: "solid" },
          { name: "Could be chance", color: "muted", swatch: "outline" },
        ]}
        legendPosition="left"
        xAxisLabel={`How strongly it went with ${target}`}
        aria-label={`What went with ${target}: ${bars.map((b) => `${b.name} ${formatNumber(b.rho, "corr")}${b.significant ? ", clear signal" : ", could be chance"}`).join("; ")}`}
        customTooltip={(d) => (
          <div className="space-y-0.5 text-fg-muted">
            <p>
              Went with {target} <span className="text-fg tabular-nums">{formatNumber(Number(d.rho), "corr")}</span>
            </p>
            <p className="text-fg">{d.significant ? "Clear signal" : "Could be chance"}</p>
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
