"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RecordForm } from "@/components/campaign/record-form";
import { RunsTable } from "@/components/campaign/runs-table";
import { analysisHash } from "@/components/campaign/learn";
import { CycleStepper } from "@/components/kit/cycle-stepper";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { formatTimestamp, shortHash, SourceLine } from "@/components/kit/source-line";
import { LearnSection } from "@/components/validate/learn-section";
import { RunCatalog } from "@/components/validate/run-catalog";
import { TrackRecordSection } from "@/components/validate/track-record-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { LegendItem } from "@/components/viz/frame";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useCampaignDetail, useCampaignId, useLatest, useUploadJob } from "@/hooks/use-engine";
import { isJobActive, targetUnitOf, type PopulatedResult } from "@/lib/api";
import { campaignStage, cycleSteps, displayRound } from "@/lib/campaign-stage";
import { coverageText, formatValue, parseUnit } from "@/lib/num";
import { toDumbbellData } from "@/lib/viz-data/validation-dumbbells";
import { campaignHref } from "@/lib/routes";
import { inFlight, measured } from "@/lib/workbench";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/**
 * Validate, cycle step 3: the engine's run, record and learn stages on one
 * page. In the lab (awaiting runs and their predictions), Record results
 * (measured values, versioned corrections with a reason), and Learn and
 * re-propose (what the round showed, then the re-analysis that folds the
 * results in and proposes the next round). Live engine data only.
 */
export default function ValidatePage() {
  const id = useCampaignId();
  const campaign = useCampaign();
  const latest = useLatest();
  const detail = useCampaignDetail();
  const upload = useUploadJob();
  const [saving, setSaving] = useState(false);
  const scrolled = useRef(false);

  const c = campaign.data?.has_campaign ? campaign.data : null;
  const analysis: PopulatedResult | null = latest.data?.has_data ? latest.data : null;
  const stage = campaign.data ? campaignStage(latest.data ?? { has_data: false }, campaign.data, id) : null;
  const round = stage?.round ?? (c ? displayRound(c.round) : null);
  const loading = campaign.status === "loading" || (latest.status === "loading" && !latest.data);
  const ready = !loading && campaign.status === "data" && c != null && (c.pending.length > 0 || c.history.length >= 2);

  // The sections render after the engine answers, so the browser's own jump to
  // #record / #learn on a fresh load finds nothing: do it once they exist.
  useEffect(() => {
    if (!ready || scrolled.current) return;
    scrolled.current = true;
    const target = window.location.hash.slice(1);
    if (target === "run" || target === "record" || target === "learn" || target === "reanalyze" || target === "run-log" || target === "track-record") document.getElementById(target)?.scrollIntoView();
  }, [ready]);

  const top = (
    <>
      <PageHeader
        eyebrow={round != null ? `Step 3 of 3 · Round ${count(round)}` : "Step 3 of 3"}
        title="Validate"
        description="Run the batch in the lab, record what you measure, then fold the results into the model and propose the next round."
      />
      {stage ? <CycleStepper steps={cycleSteps(stage, id)} round={round} active="validate" /> : null}
    </>
  );

  if (campaign.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        {top}
        <ErrorState onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading">
        {top}
        <LoadingSkeleton variant="table" rows={4} />
        <LoadingSkeleton variant="card" rows={2} />
      </div>
    );
  }

  const started = c?.pending.length ?? 0;
  if (!c || (started === 0 && c.history.length < 2)) {
    const hasAnalysis = analysis != null;
    return (
      <div className="flex flex-col gap-6">
        {top}
        <EmptyState
          title="No runs started yet"
          description={
            hasAnalysis
              ? "Validate starts once a batch is running in the lab. Review the proposed batch on Predict and start the recipes you will run."
              : "Validate starts once a run sheet is analyzed and a batch is started. Upload prior runs on Harmonize first."
          }
          action={
            <Link href={campaignHref(id, hasAnalysis ? "predict" : "harmonize")} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {hasAnalysis ? "Go to Predict" : "Go to Harmonize"}
            </Link>
          }
        />
      </div>
    );
  }

  // The analysis' target unit (user setup, then the header) when it is loaded; the header otherwise.
  const unit = analysis ? targetUnitOf(analysis) : parseUnit(c.target).unit;
  const awaiting = inFlight(c);
  const labBands = toDumbbellData(awaiting, analysis);
  const labCov = coverageText(labBands.coverage);
  const done = measured(c);
  const archived = detail.data?.campaign.archived ?? false;
  const drivers = analysis?.drivers.map((d) => d.name) ?? [];
  const hash = analysisHash(analysis);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        {top}
        {analysis ? (
          <SourceLine
            parts={[
              { label: "Analysis of", value: analysis.dataset },
              { label: "analyzed", value: formatTimestamp(analysis.timestamp ?? analysis.updated) },
              { label: "engine", value: analysis.engine_version ?? null },
              { label: "provenance", value: hash ? shortHash(hash) : null, title: hash ?? undefined },
            ]}
          />
        ) : latest.status === "error" ? (
          <p className="flex flex-wrap items-center gap-2 text-caption text-fg-muted">
            Could not load the current analysis, so prediction bands are not shown.
            <Button variant="link" size="sm" onClick={() => void latest.refresh()} disabled={latest.refreshing}>
              {latest.refreshing ? "Trying again..." : "Try again"}
            </Button>
          </p>
        ) : null}
        {archived ? <p className="text-body text-fg">This campaign is archived, so it is read-only: results cannot be recorded and it cannot be re-analyzed.</p> : null}
        <nav aria-label="On this page" className="flex flex-wrap gap-x-5 gap-y-1 text-label">
          <a href="#run" className="text-accent hover:underline">In the lab</a>
          <a href="#record" className="text-accent hover:underline">Record results</a>
          <a href="#learn" className="text-accent hover:underline">Learn and re-propose</a>
          <a href="#run-log" className="text-accent hover:underline">Run log</a>
        </nav>
      </div>

      <Section
        id="run"
        title="In the lab"
        className="scroll-mt-6"
        description={
          awaiting.length > 0
            ? `${count(awaiting.length)} of ${count(started)} started ${started === 1 ? "run is" : "runs are"} awaiting a measured result. The values here are the model's predictions, not measurements.`
            : started > 0
              ? `All ${count(started)} started ${started === 1 ? "run is" : "runs are"} back from the lab.`
              : "No runs are in the lab. Start the next batch on Predict."
        }
      >
        {awaiting.length > 0 ? (
          <>
            <RunsTable runs={awaiting} drivers={drivers} analysis={analysis} featureRanges={analysis?.feature_ranges ?? null} target={c.target} unit={unit} />
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
              <LegendItem mark="predicted">Predicted by the engine</LegendItem>
              <span>
                {labBands.bandAvailable
                  ? `Band: the ${[labCov, "held-out band"].filter(Boolean).join(" ")} the engine recorded when the run started.${labBands.legacy > 0 ? " Runs started before that show the current analysis' band, labelled as such." : ""}`
                  : "No prediction band recorded for these runs."}
              </span>
            </p>
          </>
        ) : started === 0 ? (
          <Link href={campaignHref(id, "predict")} className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}>
            Go to Predict
          </Link>
        ) : null}
      </Section>

      <Section
        id="record"
        title="Record results"
        className="scroll-mt-6"
        description={
          started > 0
            ? `${count(done.length)} of ${count(started)} recorded. A recorded value can be corrected with a reason; the engine keeps every version.`
            : "Results are recorded here once a batch is running."
        }
      >
        {started > 0 ? <RecordForm campaignId={id} runs={c.pending} analysis={analysis} best={c.best} target={c.target} unit={unit} readOnly={archived} onSavingChange={setSaving} /> : null}
      </Section>

      <RunCatalog runs={c.pending} target={c.target} unit={unit} />
      <LearnSection
        campaignId={id}
        campaign={c}
        analysis={analysis}
        unit={unit}
        archived={archived}
        uploadActive={isJobActive(upload.job)}
        saving={saving}
      />
      <TrackRecordSection campaignId={id} unit={unit} />
    </div>
  );
}
