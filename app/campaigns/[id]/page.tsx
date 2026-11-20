"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { HowItWorks, WhatKalosNeeds } from "@/components/home/how-it-works";
import { CycleStepper } from "@/components/kit/cycle-stepper";
import { NextCard } from "@/components/kit/next-card";
import { PageHeader } from "@/components/kit/page-header";
import { SourceLine, formatTimestamp, shortHash } from "@/components/kit/source-line";
import { CampaignActivity } from "@/components/overview/activity";
import { EvidenceRow } from "@/components/overview/evidence-row";
import { ScaleTrackLine } from "@/components/overview/scale-track";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaign, useCampaignDetail, useCampaignId, useLatest } from "@/hooks/use-engine";
import { campaignStage, cycleSteps } from "@/lib/campaign-stage";
import { formatValue } from "@/lib/num";
import { analysisSource } from "@/lib/overview";
import { goalOf } from "@/lib/report-package";
import { campaignHref, stageHref } from "@/lib/routes";
import { BestSoFarChart } from "@/components/campaign/best-so-far-chart";

const count = (v: number | null | undefined) => formatValue(v, { quantity: "count" }).text;

/**
 * One campaign at a glance: where the round is (the Harmonize, Predict,
 * Validate stepper), the engine's one next action, the three pieces of
 * evidence (measured best, this round's runs, model reliability), the
 * measured best-so-far trend, and where every number came from. Everything is
 * read from GET /api/campaigns/{id} and its analysis; nothing is mocked.
 */
export default function OverviewPage() {
  const id = useCampaignId();
  const detail = useCampaignDetail();
  const campaign = useCampaign();
  const latest = useLatest();

  // A failed detail request is shown by the app shell (connection problem or "not found").
  if (!detail.data || !campaign.data || latest.status === "loading") return <OverviewSkeleton />;

  const meta = detail.data.campaign;
  const summary = campaign.data;
  const active = summary.has_campaign ? summary : null;
  const analysis = latest.data?.has_data ? latest.data : null;
  // When the analysis failed to load, the engine's own stage still decides; `seeded` stands in for "has an analysis".
  const stage = campaignStage(latest.data ?? { has_data: meta.seeded }, summary, id);
  const steps = cycleSteps(stage, id);
  const target = active?.target ?? analysis?.target ?? null;
  const badges = (
    <>
      {meta.is_default ? <Badge variant="outline">Default</Badge> : null}
      {meta.archived ? <Badge tone="warn">Archived, read-only</Badge> : null}
    </>
  );

  if (!target) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="No data yet"
          title={meta.name}
          meta={badges}
          description="This campaign has no runs yet. Start with Harmonize: bring the runs you already have and choose the one target to maximize."
        />
        <CycleStepper steps={steps} round={stage.round} />
        <CampaignActivity harmonizeHref={campaignHref(id, "harmonize")} />
        <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />
        <WhatKalosNeeds className="pt-2" />
        <HowItWorks />
      </div>
    );
  }

  const source = analysisSource(latest.data, active?.pending);
  const goal = goalOf(analysis, active).direction;
  const outOfSync = active?.analysis_in_sync === false;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={stage.round != null ? `Round ${count(stage.round)}` : undefined}
        title={meta.name}
        meta={badges}
        description={
          <>
            {goal === "minimize" ? "Minimize" : "Maximize"} <span className="font-mono text-code text-fg">{target}</span>
            {active ? `, ${count(active.n_base)} measured rows in the model` : ""}
            {source.dataset ? `, from ${source.dataset}` : ""}.
          </>
        }
      />
      <CycleStepper steps={steps} round={stage.round} />
      <CampaignActivity harmonizeHref={campaignHref(id, "harmonize")} />
      <NextCard action={stage.next.action} href={stage.next.href} reason={stage.next.reason} />
      <EvidenceRow campaign={active} analysis={analysis} analysisFailed={latest.status === "error"} predictHref={campaignHref(id, "predict")} />
      {active ? <BestSoFarChart campaign={active} analysis={analysis} /> : null}
      <ScaleTrackLine campaignId={id} />
      {outOfSync ? (
        <p className="flex items-start gap-2 text-body text-fg-muted">
          <Info className="mt-1 size-4 shrink-0" aria-hidden />
          <span>
            The analysis {source.timestamp != null ? `from ${formatTimestamp(source.timestamp)} ` : ""}predates this round&apos;s changes (runs started or
            results recorded since), so the reliability above describes the campaign as it was then. The measured values on this page are current.{" "}
            <Link href={stageHref(id, "learn")} className="text-accent hover:underline">
              Re-analyze on Validate
            </Link>{" "}
            once the results are in.
          </span>
        </p>
      ) : null}
      <SourceLine
        parts={[
          { label: "Dataset", value: source.dataset },
          { label: "Analysis", value: analysis ? formatTimestamp(source.timestamp) : null },
          { label: "Engine", value: source.engineVersion },
          { label: "Provenance", value: source.provenance ? shortHash(source.provenance) : null, title: source.provenance ?? undefined },
        ]}
        className="border-t border-border pt-4"
      />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading the campaign">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <LoadingSkeleton variant="chart" />
    </div>
  );
}
