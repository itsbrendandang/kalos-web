"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { BestSoFarChart } from "@/components/campaign/best-so-far-chart";
import { MeasuredValue } from "@/components/campaign/plan/marks";
import { PredVsMeasured, type ComparisonRow } from "@/components/campaign/pred-vs-measured";
import {
  calibrationSentence,
  compareWord,
  reanalysisFailure,
  reanalyzeBlock,
  roundCalibration,
  roundLesson,
  runBand,
  syncNote,
  type BandAnalysis,
} from "@/components/campaign/learn";
import { Callout } from "@/components/kit/callout";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Disclosure } from "@/components/kit/disclosure";
import { ElapsedProgress } from "@/components/kit/job-progress";
import { Section, Panel } from "@/components/kit/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { useEngineWrites, useReanalysis } from "@/hooks/use-engine";
import { campaignComparisons, coveragePct } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { campaignHref } from "@/lib/routes";
import { measured, shortId, type ActiveCampaign } from "@/lib/workbench";

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n, "count")} ${n === 1 ? one : many}`;
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
  analysis: BandAnalysis | null;
  unit: string;
  archived: boolean;
  uploadActive: boolean;
  saving: boolean;
}) {
  const { reanalyze } = useEngineWrites();
  const reanalysis = useReanalysis();
  const [failure, setFailure] = useState<ReturnType<typeof reanalysisFailure> | null>(null);
  const [proposed, setProposed] = useState<number | null>(null);

  const lesson = roundLesson(c);
  const runs = measured(c);
  const next = lesson.round + 1;
  const cal = roundCalibration(c.pending, analysis);
  const coverage = coveragePct(analysis?.conformal_coverage);
  const comparisons = campaignComparisons(c);
  const sync = syncNote(c);
  const block = reanalyzeBlock({ campaign: c, running: reanalysis.running, uploadActive, archived, saving });
  const u = unit ? ` ${unit}` : "";

  const rows: ComparisonRow[] = runs
    .filter((r) => r.result != null && Number.isFinite(r.result))
    .map((r) => ({ id: r.id, pred: r.pred, halfWidth: runBand(r, analysis).halfWidth, result: r.result as number }));

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
          <p className="text-body text-fg-muted">No result has been recorded for round {formatNumber(lesson.round, "count")} yet, so there is nothing new to compare.</p>
        ) : (
          <p className="text-body text-fg">
            Best measured result this round:{" "}
            <MeasuredValue value={formatNumber(lesson.roundBest)} unit={unit || undefined} label="measured" />
            {lesson.roundBestRun ? <span className="text-fg-muted"> (run <span className="font-mono text-code">{shortId(lesson.roundBestRun)}</span>)</span> : null}
            {lesson.delta != null ? (
              <>
                , {lesson.delta === 0 ? "" : `${formatNumber(Math.abs(lesson.delta))}${u} `}
                {compareWord(lesson.delta)} the best measured before this round, {formatNumber(lesson.priorBest)}
                {u}.
              </>
            ) : (
              <>. There is no measured best from before this round to compare it with.</>
            )}{" "}
            <span className="text-fg-muted">It counts toward the best so far once the results are folded in by a re-analysis.</span>
          </p>
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

      {rows.length > 0 ? (
        <ChartFrame
          title="Predicted against measured, this round"
          unit={unit || undefined}
          n={rows.length}
          method="One row per measured run. The ring is the model's prediction and the light bar its conformal band from the analysis that proposed the run; the filled dot is the measured result."
          height={0}
        >
          <PredVsMeasured rows={rows} targetName={c.target} unit={unit} coverage={coverage} />
        </ChartFrame>
      ) : null}

      {comparisons.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-label text-fg">Earlier rounds, folded in</h3>
          <ul className="flex flex-col gap-0.5 text-body text-fg">
            {comparisons.map((cmp) => {
              const delta = cmp.baseline_best != null && cmp.current_best != null ? cmp.current_best - cmp.baseline_best : null;
              return (
                <li key={cmp.comparison_type} className="tabular-nums">
                  Best measured after round {formatNumber(cmp.current_round, "count")}: {formatNumber(cmp.current_best)}
                  {u}, against {formatNumber(cmp.baseline_best)}
                  {u} in {roundName(cmp.baseline_round)}
                  {delta != null ? ` (${formatNumber(delta, "value", { sign: true })}${cmp.baseline_best! > 0 ? `, ${formatNumber(delta / cmp.baseline_best!, "pct", { sign: true })}` : ""})` : ""}
                  <span className="text-fg-muted">, {plural(cmp.n_runs_added, "run")} added.</span>
                </li>
              );
            })}
          </ul>
          {c.history.length >= 2 ? (
            <Disclosure summary="Best so far, by round" meta="measured only">
              <BestSoFarChart campaign={c} unit={unit} />
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      <Panel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[60ch]">
            <h3 className="text-heading text-fg">Re-analyze and propose round {formatNumber(next, "count")}</h3>
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
              {reanalysis.running ? "Re-analyzing..." : `Re-analyze and propose round ${formatNumber(next, "count")}`}
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
            title={`Round ${formatNumber(proposed, "count")} is proposed`}
            action={
              <Link href={campaignHref(campaignId, "predict")} className={buttonVariants({ size: "sm" })}>
                Review round {formatNumber(proposed, "count")} on Predict
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
