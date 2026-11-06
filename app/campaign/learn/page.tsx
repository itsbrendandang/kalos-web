"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CorrelationHeatmap } from "@/components/campaign/correlation-heatmap";
import { DriversList } from "@/components/campaign/drivers-list";
import { bandCalibration, calibrationSentence, canPlanNext, promotionLine, rankWords, verdictImpact } from "@/components/campaign/learn";
import { targetName } from "@/components/campaign/target";
import { ChartFrame } from "@/components/kit/chart-frame";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { Metric } from "@/components/kit/metric";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { WhyLine } from "@/components/kit/why-line";
import { RANK_AGREEMENT_GLOSS, trustNumbers } from "@/components/campaign/trust-numbers";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import { coveragePct, reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { learnFailure, type EngineMessage } from "@/lib/engine-error";
import { formatNumber } from "@/lib/format";
import { topDrivers } from "@/lib/overview";
import { parseUnit } from "@/lib/utils";
import { measured, type ActiveCampaign } from "@/lib/workbench";
import { lazyChart } from "@/components/kit/lazy-chart";
import { RoundResults } from "@/components/campaign/round-results";
import { campaignKey, learnedRound, rememberRound, snapshotOf, type RoundRecord } from "@/lib/learn-record";
import { recipeColumns, runLabels } from "@/lib/recipe-identity";
import { displayRound } from "@/lib/campaign-stage";

/**
 * Learn: what this round measured (the recorded runs first, with their recipe,
 * prediction and result), what changed since the previous round, then whether
 * the model can be trusted and what went with the target. Method detail and the
 * raw engine values sit one click down. "Plan round N+1" updates the model with
 * the measured results and opens the next round on Plan; the runs it learned
 * from and the model before and after are kept in this browser (lib/learn-record.ts),
 * because Kalos drops a round's runs once it has learned from them.
 */
const BestSoFarChart = lazyChart(() => import("@/components/campaign/best-so-far-chart").then((m) => m.BestSoFarChart));
const PredVsMeasured = lazyChart(() => import("@/components/campaign/pred-vs-measured").then((m) => m.PredVsMeasured));
const RunLandscape = lazyChart(() => import("@/components/campaign/run-landscape").then((m) => m.RunLandscape));

export default function LearnPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { reanalyze } = useEngineWrites();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Kalos's reason for a failed model update, in plain words (lib/engine-error.ts). Null when nothing failed.
  const [failure, setFailure] = useState<EngineMessage | null>(null);
  // The record of the last learned round, read from this browser once the campaign is known (an effect, so the server render and the first client render agree).
  const [record, setRecord] = useState<{ key: string; round: number; record: RoundRecord | null } | null>(null);
  const c0 = campaign.data?.has_campaign ? campaign.data : null;
  const recordKey = c0 ? campaignKey(c0) : null;
  const recordRound = c0 ? displayRound(c0.round) - 1 : null;
  useEffect(() => {
    if (recordKey == null || recordRound == null) return;
    const t = setTimeout(() => setRecord({ key: recordKey, round: recordRound, record: recordRound >= 1 ? learnedRound(recordKey, recordRound) : null }), 0);
    return () => clearTimeout(t);
  }, [recordKey, recordRound]);

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
          description="Learning starts once Kalos has read a run sheet and a round of runs has been run."
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
  const awaiting = c.pending.filter((r) => r.awaiting).length;
  // The round just learned from; once results are folded in it is the one before the current round.
  const learned = runs.length > 0 ? round : round - 1;
  const nextRound = learned + 1;
  // The recipe identity shared with Plan, Run and Record (lib/recipe-identity.ts).
  const columns = recipeColumns(c.pending.map((r) => r.recipe), d.features, c.features);
  const labels = runLabels(c.pending);
  // Results recorded but not yet learned from: the next update uses them. After the update they live in the browser's record.
  const unlearned = runs.length > 0;
  const stored = record && record.key === recordKey && record.round === recordRound ? record.record : null;
  const shownRecord = unlearned ? null : stored && stored.round === learned ? stored : null;
  const unit = parseUnit(d.target);
  const name = targetName(d.target);
  const verdict = reliabilityVerdict(d);
  const promotion = promotionLine(d.promotion);
  const calibration = bandCalibration(runs, d.conformal_q);
  const coverage = coveragePct(d.conformal_coverage);
  const numbers = trustNumbers(verdict);
  const rank = rankWords(verdict.state);
  const drivers = topDrivers(d.drivers, 8);
  const enabled = canPlanNext(c);
  // Results recorded this round join `c.best` only when the model is re-analyzed, so say so instead of letting two numbers disagree.
  const roundBest = runs.length ? Math.max(...runs.map((r) => r.result as number)) : null;
  const roundBestPending = roundBest != null && (c.best == null || roundBest > c.best);

  async function planNext() {
    setBusy(true);
    setFailure(null);
    // What this update learns from and what it starts from, so Learn can still show them after Kalos drops the runs.
    const pendingRecord: RoundRecord = {
      campaign: campaignKey(c),
      round,
      target: d.target,
      columns,
      runs: runs.map((r) => ({ id: r.id, label: labels.get(r.id) ?? r.id, recipe: r.recipe, pred: r.pred, result: r.result as number, mode: r.mode })),
      before: snapshotOf(d),
      after: null,
      at: new Date().toISOString(),
    };
    try {
      const out = await reanalyze();
      rememberRound({ ...pendingRecord, after: out.analysis.has_data ? snapshotOf(out.analysis) : null });
      router.push("/campaign/plan");
    } catch (err) {
      const copy = learnFailure(err);
      // An expired session cannot be fixed on this page: send the user to sign in, back here.
      if (copy.signIn) router.push(`/sign-in?next=${encodeURIComponent("/campaign/learn")}`);
      setFailure(copy);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {header(
        <div className="flex flex-col items-end gap-1">
          {enabled ? (
            <Button onClick={planNext} disabled={busy}>
              {busy ? "Updating the model..." : `Update the model and plan round ${nextRound}`}
              {busy ? null : <ArrowRight aria-hidden />}
            </Button>
          ) : learned >= 1 ? (
            <Link href="/campaign/plan" className={buttonVariants({ variant: "outline" })}>
              See the plan for round {round}
              <ArrowRight aria-hidden />
            </Link>
          ) : (
            <Link href="/campaign/record" className={buttonVariants({ variant: "outline" })}>
              Record results for round {round}
              <ArrowRight aria-hidden />
            </Link>
          )}
          {enabled ? (
            <p className="text-caption text-fg-muted">Learns from the {formatNumber(runs.length, "count")} {runs.length === 1 ? "result" : "results"} recorded below.</p>
          ) : awaiting > 0 ? (
            <p className="text-caption text-fg-muted">{formatNumber(awaiting, "count")} {awaiting === 1 ? "run is" : "runs are"} still waiting for a result.</p>
          ) : null}
        </div>,
        learned > 0 ? `Learn from round ${learned}` : "Learn",
      )}

      {/* The one callout on this screen: the only thing here the user must act on right now. */}
      {failure ? (
        <Callout tone="bad" title="Could not plan the next round">
          <p>{failure.message}</p>
          <p className="mt-1 text-fg-muted">Your recorded results are safe.</p>
          {failure.engineText ? (
            <Disclosure summary={<span className="text-caption text-fg-muted">As Kalos wrote it</span>} className="mt-2 border-border">
              <p className="break-words text-caption text-fg-muted">{failure.engineText}</p>
            </Disclosure>
          ) : null}
        </Callout>
      ) : null}

      <RoundResults
        round={learned >= 1 ? learned : round}
        target={name}
        unit={unit}
        band={d.conformal_q ?? null}
        columns={columns}
        unlearned={unlearned ? runs.map((r) => ({ id: r.id, label: labels.get(r.id) ?? r.id, recipe: r.recipe, pred: r.pred, result: r.result as number, mode: r.mode })) : null}
        record={shownRecord}
        awaiting={awaiting}
        nextRound={nextRound}
        history={c.history}
        engineRound={c.round}
      />

      <section className="flex flex-col gap-3" aria-label="Verdict">
        <Verdict tone={verdict.state === "reliable" ? "good" : verdict.state === "not-yet" ? "warn" : "neutral"}>
          <span className="font-semibold">{verdict.label}.</span> {verdict.reason}
        </Verdict>
        <WhyLine code={verdict.state} className="ml-7" />
        {verdict.caveat ? <WhyLine code={verdict.caveat} className="ml-7" /> : null}
        <Disclosure summary="How the model was scored" className="ml-7 border-t-0">
          <div className="flex flex-col gap-2 text-body text-fg-muted">
            {numbers ? (
              <p>
                {numbers} {RANK_AGREEMENT_GLOSS}
              </p>
            ) : (
              <p>The model could not be scored on held-out runs.</p>
            )}
            {promotion ? (
              <>
                <p>{promotion.sentence}</p>
                <p>{promotion.fix}</p>
                {promotion.why ? <WhyLine code={promotion.why} /> : null}
              </>
            ) : null}
          </div>
        </Disclosure>
        <p className="ml-7 text-body text-fg">{verdictImpact(verdict.state, promotion == null, nextRound)}</p>
      </section>

      <div className="grid gap-6 sm:grid-cols-3">
        <Metric
          label={`Best ${name}`}
          value={c.best}
          unit={unit}
          qualifier={
            `Measured, from ${formatNumber(c.n_base, "count")} runs.` +
            (roundBestPending ? ` This round's best, ${formatNumber(roundBest)}${unit ? ` ${unit}` : ""}, counts once you plan round ${nextRound}.` : "")
          }
        />
        <Metric label="Puts past runs in the right order" value={rank.word} qualifier={rank.qualifier} />
        <Metric
          label="Measured results inside their likely range"
          value={calibration == null ? "Not reported" : calibration.total === 0 ? "None yet" : `${formatNumber(calibration.inside, "count")} of ${formatNumber(calibration.total, "count")}`}
          qualifier={coverage ? `The range is meant to hold ${coverage} of results.` : undefined}
        />
      </div>

      <Section title={`What went with higher ${name}`} description="Patterns in these runs, strongest first. They show what went together, not proof of cause.">
        {drivers.length ? <DriversList drivers={drivers} targetName={name} /> : <p className="text-body text-fg-muted">Kalos found nothing that went with the result in these runs.</p>}
        <Disclosure summary="How to read this chart">
          <p>
            Each bar is the rank correlation (Spearman) between an input and {name}. The whisker is its 95% interval. A solid bar is a clear signal (significant): the
            interval excludes zero, and the input still stands after correcting for testing many inputs at once. An outline bar could be chance (not significant).
          </p>
        </Disclosure>
      </Section>

      <div>
        <Disclosure summary="Best result by round" meta={`${formatNumber(c.history.length, "count")} ${c.history.length === 1 ? "round" : "rounds"}`}>
          <div className="flex flex-col gap-4">
            <BestSoFarChart campaign={c} unit={unit} />
            <ul className="text-caption text-fg-muted">
              {c.history.map((h) => (
                <li key={h.round} id={`round-${h.round}`} className="scroll-mt-4 py-0.5 tabular-nums">
                  {h.round === 0 ? "Uploaded sheet" : `After round ${h.round}`}: best {formatNumber(h.best)}
                  {unit ? ` ${unit}` : ""}, {formatNumber(h.n_base, "count")} runs
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>
        <Disclosure summary="Predicted against measured" meta="runs the model had not seen">
          <div className="flex flex-col gap-4">
            <p className="text-body text-fg">
              {calibration == null
                ? "Kalos did not report a likely range, so this cannot be checked."
                : calibration.total === 0
                  ? "No measured results to compare with their predictions yet."
                  : calibrationSentence(calibration, d.conformal_coverage)}
            </p>
            <ChartFrame
              title="Predictions for runs the model had not seen"
              unit={unit || undefined}
              n={d.oof.length}
              method="Held-out (out-of-fold) predictions: each dot is a run the model did not see when it predicted it. Dots on the dashed line were predicted exactly."
              state={d.oof.length ? "ready" : "empty"}
              emptyText="Not enough runs to compare yet."
            >
              <PredVsMeasured oof={d.oof} targetName={name} unit={unit} />
            </ChartFrame>
          </div>
        </Disclosure>
        {d.embedding && d.embedding.points.length ? (
          <Disclosure summary="Run landscape" meta="where the runs sit">
            <RunLandscape embedding={d.embedding} targetName={name} unit={unit} />
          </Disclosure>
        ) : null}
        {d.correlation && d.correlation.labels.length > 1 ? (
          <Disclosure summary="How the inputs go together" meta="each pair of inputs">
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
