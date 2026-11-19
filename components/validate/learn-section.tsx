"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { BestSoFarChart } from "@/components/campaign/best-so-far-chart";
import { calibrationSentence, reanalysisErrorCopy, reanalyzeBlock, roundCalibration, roundLesson, syncNote } from "@/components/campaign/learn";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { JobProgress } from "@/components/kit/job-progress";
import { Section, Panel } from "@/components/kit/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { ValidationDumbbells } from "@/components/viz/charts/validation-dumbbells";
import { Delta, Num } from "@/components/viz/num";
import { useEngineWrites, useReanalysis } from "@/hooks/use-engine";
import { campaignComparisons, type AnalyzeResult } from "@/lib/api";
import { EngineError } from "@/lib/engine-error";
import { coverageText, formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { sourceFromAnalysis } from "@/lib/source";
import { measuredUncertainty, toDumbbellData, type DumbbellAnalysis } from "@/lib/viz-data/validation-dumbbells";
import { measured, shortId, type ActiveCampaign } from "@/lib/workbench";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const roundName = (r: number) => (r === 0 ? "the uploaded data" : `round ${r}`);

/**
 * Learn and re-propose: what this round's measured results say against the
 * best before it (in the campaign goal's direction) and against the bands the
 * engine recorded when the runs started (arithmetic, no verdict), then the one
 * action that closes the loop. Re-analysis is an engine background job
 * (POST /reanalyze/jobs): the engine's own stage and progress, Cancel, and an
 * error that persists across navigation until dismissed (all tracked by the
 * campaign's data provider, so it keeps running across pages).
 */
export function LearnSection({
  campaignId,
  campaign: c,
  analysis,
  unit,
  archived,
  uploadActive,
  saving,
}: {
  campaignId: string;
  campaign: ActiveCampaign;
  /** The current analysis: legacy band fields, replicate noise and its provenance (for the chart's source line). */
  analysis: (DumbbellAnalysis & Partial<Pick<AnalyzeResult, "run" | "engine_version" | "seed">> & { dataset?: string; updated?: number }) | null;
  unit: string | null;
  archived: boolean;
  uploadActive: boolean;
  saving: boolean;
}) {
  const { reanalyze } = useEngineWrites();
  const reanalysis = useReanalysis();
  const [proposed, setProposed] = useState<number | null>(null);
  const [localFailure, setLocalFailure] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailure, setCancelFailure] = useState<string | null>(null);

  const lesson = roundLesson(c);
  const next = lesson.round + 1;
  const cal = roundCalibration(c.pending, analysis);
  const coverage = coverageText(cal.coverage);
  const comparisons = campaignComparisons(c);
  const sync = syncNote(c);
  const block = reanalyzeBlock({ campaign: c, running: reanalysis.running, uploadActive, archived, saving });
  const dumbbells = toDumbbellData(c.pending, analysis);
  const measuredU = measuredUncertainty(analysis);
  const nMeasured = measured(c).length;
  const minimize = lesson.goal === "minimize";
  // Relative change only for a ratio-scale target with a unit (VIZ_SPEC 2.5).
  const relative = unit != null;

  const job = reanalysis.job?.kind === "reanalyze" ? reanalysis.job : null;
  const error = reanalysis.error;
  const copy = error ? reanalysisErrorCopy(error) : null;
  const succeeded = !error && !reanalysis.running && job?.state === "succeeded";
  const cancelled = !error && !reanalysis.running && job?.state === "cancelled";

  async function run() {
    setProposed(null);
    setLocalFailure(null);
    setCancelFailure(null);
    try {
      const out = await reanalyze();
      if (out.kind === "succeeded") setProposed(next);
    } catch (e) {
      // A refusal before queueing is kept by the provider (useReanalysis().error); anything else is shown here.
      if (!(e instanceof EngineError)) setLocalFailure(reanalysisErrorCopy(e).message);
    }
  }

  async function cancel() {
    setCancelling(true);
    setCancelFailure(null);
    try {
      await reanalysis.cancel();
    } catch {
      setCancelFailure("The cancel request did not reach the engine. The re-analysis may still be running; try again.");
    } finally {
      setCancelling(false);
    }
  }

  function dismiss() {
    setProposed(null);
    setLocalFailure(null);
    reanalysis.dismiss();
  }

  return (
    <Section id="learn" title="Learn and re-propose" description="What this round's measured results show, then fold them into the model and propose the next batch." className="scroll-mt-6">
      <div className="flex flex-col gap-3">
        {lesson.measured === 0 ? (
          <p className="text-body text-fg-muted">No result has been recorded for round {count(lesson.round)} yet, so there is nothing new to compare.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-body text-fg">
              <span>{minimize ? "Best (lowest) measured result this round:" : "Best measured result this round:"}</span>
              <Num value={lesson.roundBest} basis="measured" unit={unit} size="title" options={{ uncertainty: measuredU }} />
              {lesson.roundBestRun ? (
                <span className="text-fg-muted">
                  (run <span className="font-mono text-code">{shortId(lesson.roundBestRun)}</span>)
                </span>
              ) : null}
            </p>
            {lesson.delta != null ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-body text-fg-muted">
                <Delta current={lesson.roundBest} baseline={lesson.priorBest} unit={unit} relative={relative} baselineLabel="the best measured before this round" options={{ uncertainty: measuredU }} />
                <span>
                  (that best was <Num value={lesson.priorBest} basis="measured" unit={unit} glyph={false} options={{ uncertainty: measuredU }} />
                  {minimize ? "; the goal is to minimize, so lower is better" : ""})
                </span>
              </p>
            ) : (
              <p className="text-body text-fg-muted">There is no measured best from before this round to compare it with.</p>
            )}
            <p className="text-caption text-fg-muted">It counts toward the best so far once the results are folded in by a re-analysis.</p>
          </div>
        )}
        {lesson.measured > 0 ? (
          <p className="text-body text-fg">
            {cal.total === 0
              ? "None of the measured runs has a band the engine recorded when it started, so the results are not checked against one."
              : calibrationSentence(cal, cal.coverage)}
            {cal.total > 0 && cal.unscored > 0
              ? ` ${plural(cal.unscored, "other measured run")} ${cal.unscored === 1 ? "has" : "have"} no recorded band and ${cal.unscored === 1 ? "is" : "are"} left out.`
              : ""}{" "}
            {cal.total > 0 ? (
              <span className="text-fg-muted">
                {coverage
                  ? `Over many runs, about ${coverage} of results are expected inside a ${coverage} band; a handful of runs cannot confirm or rule that out.`
                  : "A handful of runs cannot confirm or rule out how often the band holds."}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {dumbbells.runs.length > 0 ? (
        <ValidationDumbbells
          data={dumbbells}
          target={c.target}
          unit={unit}
          source={analysis ? sourceFromAnalysis(analysis, "campaign.pending[].prediction_at_start", "predicted", "held-out conformal band recorded at start") : null}
          stale={
            c.analysis_in_sync === false && nMeasured > 0
              ? { nNew: nMeasured, text: "The analysis predates the results recorded here. The bands shown are the ones recorded when the runs started; re-analyze to fold the results in." }
              : null
          }
        />
      ) : null}

      {comparisons.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-label text-fg">Earlier rounds, folded in</h3>
          <ul className="flex flex-col gap-1 text-body text-fg">
            {comparisons.map((cmp) => (
              <li key={cmp.comparison_type} className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span>Best measured after round {count(cmp.current_round)}:</span>
                <Num value={cmp.current_best} basis="measured" unit={unit} options={{ uncertainty: measuredU }} />
                <Delta current={cmp.current_best} baseline={cmp.baseline_best} unit={unit} relative={relative} baselineLabel={`${roundName(cmp.baseline_round)} (${formatValue(cmp.baseline_best, { unit, uncertainty: measuredU }).text})`} options={{ uncertainty: measuredU }} />
                <span className="text-fg-muted">{plural(cmp.n_runs_added, "run")} added.</span>
              </li>
            ))}
          </ul>
          {minimize ? <p className="text-caption text-fg-muted">The goal is to minimize, so the best is the lowest measured value.</p> : null}
          {c.history.length >= 2 ? (
            <Disclosure summary="Best so far, by round" meta="measured only">
              <BestSoFarChart campaign={c} bare />
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      <Panel id="reanalyze" className="flex scroll-mt-6 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[60ch]">
            <h3 className="text-heading text-fg">Re-analyze and propose round {count(next)}</h3>
            <p className="mt-1 text-body text-fg-muted">
              {lesson.measured > 0
                ? `Folds the ${plural(lesson.measured, "measured result")} into the dataset, re-fits the model and proposes the next batch on Predict.`
                : "Folds measured results into the dataset, re-fits the model and proposes the next batch on Predict."}{" "}
              {lesson.awaiting > 0
                ? `The ${plural(lesson.awaiting, "run")} still awaiting a result ${lesson.awaiting === 1 ? "stays" : "stay"} in flight: not folded in and not proposed again. Record ${lesson.awaiting === 1 ? "it" : "them"} later and ${lesson.awaiting === 1 ? "it joins" : "they join"} a later re-analysis.`
                : ""}
            </p>
            {sync ? <p className="mt-2 text-body text-fg">{sync}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={() => void run()} disabled={block != null}>
              {reanalysis.running ? "Re-analyzing..." : `Re-analyze and propose round ${count(next)}`}
            </Button>
            {block && !reanalysis.running ? <p className="max-w-72 text-right text-caption text-fg-muted">{block}</p> : null}
          </div>
        </div>
        {reanalysis.running && job ? (
          <>
            <JobProgress job={job} onCancel={() => void cancel()} cancelling={cancelling} pollTrouble={reanalysis.pollTrouble} />
            {cancelFailure ? (
              <p role="alert" className="text-caption text-bad">
                {cancelFailure}
              </p>
            ) : null}
          </>
        ) : null}
        {copy && error ? (
          <Callout
            tone="bad"
            title="The re-analysis did not finish"
            action={
              <div className="flex flex-wrap gap-2">
                {copy.retry ? (
                  <Button variant="outline" size="sm" onClick={() => void run()} disabled={block != null}>
                    <RefreshCw aria-hidden />
                    Try again
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  Dismiss
                </Button>
              </div>
            }
          >
            <p>{copy.message}</p>
            <Disclosure summary="Engine details" className="mt-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
                <dt className="text-fg-muted">Code</dt>
                <dd>
                  <code className="font-mono text-code">{error.code}</code>
                </dd>
                {error.message ? (
                  <>
                    <dt className="text-fg-muted">Engine message</dt>
                    <dd className="text-fg">{error.message}</dd>
                  </>
                ) : null}
                {job?.id ? (
                  <>
                    <dt className="text-fg-muted">Job</dt>
                    <dd>
                      <code className="font-mono text-code">{job.id}</code>
                    </dd>
                  </>
                ) : null}
              </dl>
            </Disclosure>
          </Callout>
        ) : localFailure ? (
          <Callout
            tone="bad"
            title="The re-analysis did not start"
            action={
              <Button variant="outline" size="sm" onClick={() => void run()} disabled={block != null}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
            }
          >
            {localFailure}
          </Callout>
        ) : cancelled ? (
          <Callout
            title="The re-analysis was cancelled"
            action={
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Dismiss
              </Button>
            }
          >
            Nothing was written: the recorded results and the current analysis are unchanged. Re-analyze again when you are ready.
          </Callout>
        ) : succeeded ? (
          <Callout
            tone="good"
            title={proposed != null ? `Round ${count(proposed)} is proposed` : "The re-analysis finished and the next batch is proposed"}
            action={
              <div className="flex flex-wrap gap-2">
                <Link href={campaignHref(campaignId, "predict")} className={buttonVariants({ size: "sm" })}>
                  {proposed != null ? `Review round ${count(proposed)} on Predict` : "Review the new batch on Predict"}
                  <ArrowRight aria-hidden />
                </Link>
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  Dismiss
                </Button>
              </div>
            }
          >
            The measured results are folded into the dataset and the model was re-fitted. Check its reliability before starting the new batch.
          </Callout>
        ) : null}
      </Panel>
    </Section>
  );
}
