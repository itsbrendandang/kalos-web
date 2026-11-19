"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { BestSoFarChart } from "@/components/campaign/best-so-far-chart";
import {
  calibrationSentence,
  reanalysisFailure,
  reanalyzeBlock,
  roundCalibration,
  roundLesson,
  syncNote,
} from "@/components/campaign/learn";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { ElapsedProgress } from "@/components/kit/job-progress";
import { Section, Panel } from "@/components/kit/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { ValidationDumbbells } from "@/components/viz/charts/validation-dumbbells";
import { Delta, Num } from "@/components/viz/num";
import { useEngineWrites, useReanalysis } from "@/hooks/use-engine";
import { campaignComparisons, type AnalyzeResult } from "@/lib/api";
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
 * best before it and against their predictions (arithmetic, no verdict), then
 * the one action that closes the loop. Re-analysis is synchronous on the
 * engine with no job route, so it shows elapsed time only; it is tracked by
 * the campaign's data provider, so it keeps running across pages.
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
  /** The current analysis: band fields, replicate noise and its provenance (for the chart's source line). */
  analysis: (DumbbellAnalysis & Partial<Pick<AnalyzeResult, "run" | "engine_version" | "seed">> & { dataset?: string; updated?: number }) | null;
  unit: string | null;
  archived: boolean;
  uploadActive: boolean;
  saving: boolean;
}) {
  const { reanalyze } = useEngineWrites();
  const reanalysis = useReanalysis();
  const [failure, setFailure] = useState<ReturnType<typeof reanalysisFailure> | null>(null);
  const [proposed, setProposed] = useState<number | null>(null);

  const lesson = roundLesson(c);
  const next = lesson.round + 1;
  const cal = roundCalibration(c.pending, analysis);
  const coverage = coverageText(analysis?.conformal_coverage);
  const comparisons = campaignComparisons(c);
  const sync = syncNote(c);
  const block = reanalyzeBlock({ campaign: c, running: reanalysis.running, uploadActive, archived, saving });
  const dumbbells = toDumbbellData(c.pending, analysis);
  const measuredU = measuredUncertainty(analysis);
  const nMeasured = measured(c).length;
  // Relative change only for a ratio-scale target with a unit (VIZ_SPEC 2.5).
  const relative = unit != null;

  async function run() {
    setFailure(null);
    setProposed(null);
    try {
      await reanalyze();
      setProposed(next);
    } catch (e) {
      setFailure(reanalysisFailure(e));
    }
  }

  return (
    <Section id="learn" title="Learn and re-propose" description="What this round's measured results show, then fold them into the model and propose the next batch." className="scroll-mt-6">
      <div className="flex flex-col gap-3">
        {lesson.measured === 0 ? (
          <p className="text-body text-fg-muted">No result has been recorded for round {count(lesson.round)} yet, so there is nothing new to compare.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-body text-fg">
              <span>Best measured result this round:</span>
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
                  (that best was <Num value={lesson.priorBest} basis="measured" unit={unit} glyph={false} options={{ uncertainty: measuredU }} />)
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
            {cal == null
              ? "The engine reported no prediction band for this analysis, so the results cannot be checked against one."
              : cal.total === 0
                ? "None of the measured runs has a band from the current analysis to check against."
                : calibrationSentence(cal, analysis?.conformal_coverage)}
            {cal && cal.unscored > 0 ? ` ${plural(cal.unscored, "run")} proposed by an earlier analysis ${cal.unscored === 1 ? "is" : "are"} left out: ${cal.unscored === 1 ? "its" : "their"} band was not stored.` : ""}{" "}
            {cal && cal.total > 0 ? (
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
          source={analysis ? sourceFromAnalysis(analysis, "conformal_q", "predicted", "held-out conformal band") : null}
          stale={
            c.analysis_in_sync === false && nMeasured > 0
              ? { nNew: nMeasured, text: "The analysis predates the results recorded here. The bands shown are the ones it proposed these runs with; re-analyze to fold the results in." }
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
          {c.history.length >= 2 ? (
            <Disclosure summary="Best so far, by round" meta="measured only">
              <BestSoFarChart campaign={c} bare />
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      <Panel className="flex flex-col gap-4">
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
        {reanalysis.running ? (
          <ElapsedProgress
            title="Re-analyzing the campaign"
            startedAt={reanalysis.startedAt}
            note="The engine does not report stages for a re-analysis, so this shows elapsed time only. It usually takes 20 seconds to 2 minutes, and it keeps running if you move to another page in this campaign."
          />
        ) : null}
        {failure ? (
          <Callout
            tone="bad"
            title="The re-analysis did not finish"
            action={
              failure.retry ? (
                <Button variant="outline" size="sm" onClick={() => void run()} disabled={block != null}>
                  <RefreshCw aria-hidden />
                  Try again
                </Button>
              ) : null
            }
          >
            {failure.message}
          </Callout>
        ) : null}
        {proposed != null && !reanalysis.running ? (
          <Callout
            tone="good"
            title={`Round ${count(proposed)} is proposed`}
            action={
              <Link href={campaignHref(campaignId, "predict")} className={buttonVariants({ size: "sm" })}>
                Review round {count(proposed)} on Predict
                <ArrowRight aria-hidden />
              </Link>
            }
          >
            The measured results are folded into the dataset and the model was re-fitted. Check its reliability before starting the new batch.
          </Callout>
        ) : null}
      </Panel>
    </Section>
  );
}
