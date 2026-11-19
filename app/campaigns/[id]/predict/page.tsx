"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FileWarning, Info } from "lucide-react";
import { engineBatch, targetIsNonNegative } from "@/components/campaign/plan-batch";
import { ApproveDialog } from "@/components/campaign/plan/approve-dialog";
import { Comparison } from "@/components/campaign/plan/comparison";
import { ResponseSurface2D } from "@/components/campaign/plan/response-surface";
import { parseSurface } from "@/components/campaign/plan/surface-model";
import { RecommendationCards, RecommendationsTable, type PlanContext, type PlanRow, type RowState } from "@/components/campaign/plan/recommendations";
import {
  boundaryChecks,
  runFacts,
  COMPARE_MAX,
  COMPARE_MIN,
  diversitySummary,
  observedRanges,
  recipeFlags,
  recipeKeys,
  activeRejection,
  rejectionCopy,
  toggleCompare,
  type ObservedRange,
  type SetpointValue,
  type UploadRejection,
} from "@/components/campaign/plan-view";
import { targetName } from "@/components/campaign/target";
import { BatchNotes } from "@/components/predict/batch-notes";
import { DriversSection } from "@/components/predict/drivers-section";
import { BandChoice, SetupRefusal } from "@/components/predict/band-choice";
import { predictHeadline, setupNotes, trustTone, unitHint, type PredictAnalysis } from "@/components/predict/predict-view";
import { TrustPanel } from "@/components/predict/trust-panel";
import { Callout } from "@/components/kit/callout";
import { CycleStepper } from "@/components/kit/cycle-stepper";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { SourceLine, formatTimestamp, shortHash } from "@/components/kit/source-line";
import { Verdict } from "@/components/kit/verdict";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BatchIntervalStrip } from "@/components/viz/charts/batch-interval-strip";
import { RecipeSetpointMatrix } from "@/components/viz/charts/recipe-setpoint-matrix";
import { SliceProfiler } from "@/components/viz/charts/slice-profiler";
import { SourceButton } from "@/components/viz/num";
import { RefusalBlock } from "@/components/viz/refusal";
import { useCampaign, useCampaignId, useEngineWrites, useLastRejection, useLatest } from "@/hooks/use-engine";
import { incumbentLabel, proposalIncumbent, proposalRecipe, reliabilityVerdict, targetUnitOf, type Campaign } from "@/lib/api";
import { campaignStage, cycleSteps, type CampaignStage } from "@/lib/campaign-stage";
import { EXPLORATION_LABEL, batchTrustOf, modelRefusalOf } from "@/lib/proposal-trust";
import { formatValue } from "@/lib/num";
import { campaignHref } from "@/lib/routes";
import { sourceFromAnalysis } from "@/lib/source";
import { cn } from "@/lib/utils";
import {
  DISTANCE_METHOD,
  MODEL_BASED,
  PER_PROPOSAL_METHOD,
  bandName,
  coverageLabel,
  distanceText,
  goalGain,
  improvementIncumbent,
  toBatchStripModel,
  type BatchStripModel,
} from "@/lib/viz-data/batch-interval-strip";
import { toSliceProfiler } from "@/lib/viz-data/slice-profiler";
import { toSetpointMatrixModel, type RangeInput } from "@/lib/viz-data/recipe-setpoint-matrix";

const count = (n: number) => formatValue(n, { quantity: "count" }).text;

/** The stale state every evidence chart shows when the analysis predates campaign changes (VIZ_SPEC 2.6). */
const staleOf = (active: ActiveCampaign | null | undefined): { nNew: number } | null =>
  active?.analysis_in_sync === false ? { nNew: active.pending.filter((r) => r.result != null).length } : null;

type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

/**
 * Predict, cycle step 2: first whether the model can be trusted (the engine's
 * reliability, calibration, band and promotion verdicts), then what goes with
 * the target, then the proposed batch to review, approve and start. Nothing
 * starts without the explicit approval step. Once runs from this batch are in
 * flight the page says so and points to Validate instead of offering the
 * batch again. Every number is an engine field (see components/predict).
 */
export default function PredictPage() {
  const id = useCampaignId();
  const latest = useLatest();
  const campaign = useCampaign();
  const { rejection, setRejection } = useLastRejection();

  if (latest.status === "error" || campaign.status === "error") {
    return (
      <Page>
        <PageHeader title="Predict" />
        <ErrorState
          title="Could not reach the analysis engine"
          description="The request failed before the engine could respond, so there is no model or batch to show. This is a connection problem, not a result: your data and any started runs are unaffected."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </Page>
    );
  }
  if (!latest.data || !campaign.data) return <PredictSkeleton />;

  const stage = campaignStage(latest.data, campaign.data, id);

  if (!latest.data.has_data) {
    const rejected = activeRejection(rejection, null);
    return (
      <Page>
        <PredictHeader stage={stage} id={id} />
        {rejected ? (
          <RejectedUpload rejection={rejected} id={id} />
        ) : (
          <EmptyState
            title="No model yet"
            description="Kalos fits a model to the runs you already have, then shows here how far it can be trusted and which experiments it proposes. Start by harmonizing a run sheet."
            action={
              <Link href={campaignHref(id, "harmonize")} className={buttonVariants({ size: "sm" })}>
                Go to Harmonize
              </Link>
            }
          />
        )}
      </Page>
    );
  }

  const d = latest.data as PredictAnalysis;
  const round = stage.round ?? 1;
  const active = campaign.data.has_campaign ? campaign.data : null;
  // After a start the analysis no longer matches the campaign until it is re-analyzed on Validate, so the old batch is not offered again.
  const started = active != null && active.pending.length > 0 && active.analysis_in_sync !== true;

  if (started) return <Started d={d} id={id} stage={stage} round={round} active={active} />;

  return (
    <Batch
      key={`${d.campaign_generation}-${d.dataset}-${d.updated}`}
      d={d}
      id={id}
      stage={stage}
      round={round}
      rejection={activeRejection(rejection, d.dataset)}
      onKeepPrevious={() => setRejection(null)}
      active={active}
    />
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="@container flex flex-col gap-8">{children}</div>;
}

/** Title, the H/P/V stepper with Predict active, and the one primary action. */
function PredictHeader({ stage, id, round, dataset, action }: { stage: CampaignStage; id: string; round?: number; dataset?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          dataset ? (
            <>
              Step 2 of 3 <span aria-hidden>·</span> <span className="font-mono text-code">{dataset}</span>
            </>
          ) : (
            "Step 2 of 3"
          )
        }
        title={round != null ? `Predict round ${round}` : "Predict"}
        action={action ? <div className="hidden flex-col items-end gap-1 sm:flex">{action}</div> : undefined}
      />
      <CycleStepper steps={cycleSteps(stage, id)} round={stage.round} active="predict" />
    </div>
  );
}

function PredictSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-live="polite" aria-label="Loading the model and the proposed batch">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <h1 className="text-title text-fg">Predict</h1>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-6 w-80 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function RejectedUpload({ rejection, id }: { rejection: UploadRejection; id: string }) {
  const copy = rejectionCopy(rejection);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-border bg-surface p-panel">
      <FileWarning className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{copy.title}</p>
        <p className="mt-1 text-body text-fg">{copy.body}</p>
        {copy.suggestion ? <p className="mt-1 text-body text-fg-muted">{copy.suggestion}</p> : null}
        <Link href={campaignHref(id, "harmonize")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
          Upload a different sheet
        </Link>
      </div>
    </div>
  );
}

function GoToValidate({ id, className }: { id: string; className?: string }) {
  return (
    <Link href={campaignHref(id, "validate")} className={buttonVariants({ className })}>
      Go to Validate
      <ArrowRight />
    </Link>
  );
}

/** Runs from this batch are in flight: say so, point to Validate, and keep the evidence the batch was proposed on. */
function Started({ d, id, stage, round, active }: { d: PredictAnalysis; id: string; stage: CampaignStage; round: number; active: ActiveCampaign }) {
  const verdict = reliabilityVerdict(d);
  const awaiting = active.n_awaiting;
  return (
    <Page>
      <PredictHeader stage={stage} id={id} round={round} dataset={d.dataset} action={<GoToValidate id={id} />} />
      <div className="flex flex-col gap-2">
        <Verdict tone={awaiting > 0 ? "neutral" : "good"}>{predictHeadline({ state: verdict.state, proposals: null, inFlight: awaiting, round })}</Verdict>
        <p className="max-w-[72ch] text-body text-fg-muted">
          {count(active.pending.length)} {active.pending.length === 1 ? "run was" : "runs were"} started from this batch
          {active.n_measured > 0 ? `, ${count(active.n_measured)} with a measured result` : ""}. A new batch is proposed after the results are folded into the model on Validate, so this one is not offered again.
        </p>
        <GoToValidate id={id} className="w-full sm:hidden" />
      </div>
      <TrustPanel d={d} stale={staleOf(active)} />
      <DriversSection d={d} targetName={targetName(d.target)} />
      <Section
        id="predict-batch"
        title="The batch these runs came from"
        description="The proposals as the engine made them, with the measured result of each started run once it is recorded. Rows without a started run were not started."
      >
        <StartedBatch d={d} active={active} />
      </Section>
      <SliceDisclosure d={d} />
      <SurfaceDisclosure d={d} />
      <ProvenancePanel d={d} />
      <PredictSource d={d} />
    </Page>
  );
}

function Batch({
  d,
  id,
  stage,
  round,
  rejection,
  onKeepPrevious,
  active,
}: {
  d: PredictAnalysis;
  id: string;
  stage: CampaignStage;
  round: number;
  rejection: UploadRejection | null;
  onKeepPrevious: () => void;
  active: ActiveCampaign | null;
}) {
  const { startRuns } = useEngineWrites();
  // Unticked proposals, by the engine's index: empty means every proposal is selected to run.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [compare, setCompare] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);
  const compareRef = useRef<HTMLHeadingElement>(null);
  // Set once the engine confirmed a start. If the campaign refresh after it failed, the page would still show
  // this batch; keeping Start disabled here prevents starting the same runs twice.
  const [startedHere, setStartedHere] = useState(false);

  const name = targetName(d.target);
  const unit = targetUnitOf(d);
  const incumbent = proposalIncumbent(d);
  const gated = d.proposal_gating ? d.proposal_gating.gated : null;
  const [highlight, setHighlight] = useState<string | null>(null);
  // The chosen per-proposal band coverage (engine interval_levels); null = the engine's first level.
  const [coverage, setCoverage] = useState<number | null>(null);
  const verdict = reliabilityVerdict(d);
  const ranges = useMemo(() => observedRanges(d), [d]);
  const diversity = diversitySummary(d.batch_diversity, d.proposal_notice);
  const modelRefusal = modelRefusalOf(d);
  const setup = useMemo(() => setupNotes(d), [d]);
  const runs = active?.pending;
  const strip = useMemo(() => toBatchStripModel(d, { target: name, unit, runs: runs ?? [], coverage }), [d, name, unit, runs, coverage]);
  const band = strip.halfWidth;
  const goal = strip.goal;

  const rows: PlanRow[] = useMemo(() => {
    const nonNegative = targetIsNonNegative(d.best, d.oof ?? []);
    return engineBatch(d.proposals ?? [], incumbent, goal).map((item) => {
      const recipe = proposalRecipe(item.proposal, d.proposal_features) as Record<string, SetpointValue>;
      const sr = strip.rows[item.index];
      const iv = sr.interval;
      const interval = strip.intervals.kind === "per-proposal" ? (iv.kind === "value" ? { lo: iv.lo, hi: iv.hi, coverage: iv.coverage } : null) : undefined;
      return {
        item,
        id: `P${item.rank}`,
        recipe,
        flags: recipeFlags(item.proposal, recipe, { incumbent, band, nonNegative, ranges, constraint: d.constraint, feasibilityGated: gated, interval, goal }),
        checks: boundaryChecks(recipe, ranges),
        gain: incumbent == null ? null : goalGain(item.proposal.pred, incumbent, goal),
        strip: sr,
      };
    });
  }, [d, incumbent, band, ranges, gated, goal, strip]);

  const others = useMemo(() => [...new Set(rows.flatMap((r) => recipeKeys(d.proposal_features, r.recipe).other))].sort((a, b) => a.localeCompare(b)), [rows, d.proposal_features]);
  const ctx: PlanContext = {
    target: name,
    unit,
    features: d.proposal_features,
    others,
    ranges,
    band,
    coverage: strip.coverage,
    incumbent,
    incumbentLabel: incumbentLabel(d),
    constraint: d.constraint,
    gated,
    sourceFor: (r) => sourceFromAnalysis(d, `proposals[${r.item.index}].pred`, "predicted", bandMethodOf(strip)),
    incumbentSource: sourceFromAnalysis(d, d.noise?.replicate_aware ? "noise.best_reproducible" : "best", "measured"),
    model: strip,
  };

  const chosen = rows.filter((r) => !skipped.has(r.item.index));
  const compared = compare.map((rank) => rows.find((r) => r.item.rank === rank)).filter((r): r is PlanRow => r != null);
  const blocked = rejection != null;
  const canStart = chosen.length > 0 && !blocked && !startedHere;
  const startHint = startedHere
    ? "Runs started; follow them on Validate"
    : blocked
      ? "Choose an option in the upload note first"
      : chosen.length === 0
        ? "Select at least one proposal to run"
        : null;
  // Announce selection changes once the user pauses, not on every tick.
  const selectionText = `${count(chosen.length)} of ${count(rows.length)} selected to run${compare.length ? `, ${count(compare.length)} in comparison` : ""}`;
  const announced = useDebounced(selectionText, 600);

  const toggleSet = (set: (f: (prev: Set<number>) => Set<number>) => void, key: number) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const state = (row: PlanRow): RowState => ({
    included: !skipped.has(row.item.index),
    onInclude: () => toggleSet(setSkipped, row.item.index),
    compared: compare.includes(row.item.rank),
    compareDisabled: compare.length >= COMPARE_MAX,
    onCompare: () => setCompare((c) => toggleCompare(c, row.item.rank)),
    expanded: expanded.has(row.item.rank),
    onExpand: () => toggleSet(setExpanded, row.item.rank),
  });

  async function start(): Promise<boolean> {
    try {
      await startRuns(
        chosen.map(({ item: { proposal: p } }) => ({ recipe: proposalRecipe(p, d.proposal_features), pred: p.pred, std: p.std, mode: p.mode, reason: p.reason })),
      );
      setStartedHere(true);
      return true;
    } catch {
      return false;
    }
  }

  const primary = (className?: string) =>
    startedHere ? (
      <GoToValidate id={id} className={className} />
    ) : (
      <Button onClick={() => setApproving(true)} disabled={!canStart} className={className}>
        Review and start {chosen.length > 0 ? count(chosen.length) : ""}
      </Button>
    );

  const checkedInputs = Object.keys(ranges).filter((k) => rows.some((r) => k in r.recipe));
  const uncheckedInputs = [...d.proposal_features, ...others].filter((k) => !ranges[k] && rows.some((r) => typeof r.recipe[k] === "number"));

  return (
    <Page>
      <PredictHeader
        stage={stage}
        id={id}
        round={round}
        dataset={d.dataset}
        action={
          <>
            {primary()}
            {startHint && !startedHere ? <span className="text-caption text-fg-muted">{startHint}</span> : null}
          </>
        }
      />

      <Verdict tone={modelRefusal ? "warn" : trustTone(verdict.state)}>
        {predictHeadline({ state: verdict.state, proposals: rows.length, round, refused: modelRefusal?.reasons[0] ?? null })}
      </Verdict>

      {rejection ? (
        <Callout
          tone="warn"
          title={`Your last upload, ${rejection.name}, was not used`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onKeepPrevious}>
                Keep planning from {d.dataset}
              </Button>
              <Link href={campaignHref(id, "harmonize")} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Go to Harmonize
              </Link>
            </div>
          }
        >
          {rejectionCopy(rejection).body} The model and proposals below are still from {d.dataset}. Choose whether to keep planning from it.
        </Callout>
      ) : null}

      {startedHere ? (
        <Verdict tone="good">
          Runs started. Record their results on{" "}
          <Link href={campaignHref(id, "validate")} className="text-accent underline underline-offset-4">
            Validate
          </Link>
          ; if this page has not switched to the runs in flight, check there before starting anything again.
        </Verdict>
      ) : null}

      <TrustPanel d={d} calloutTaken={rejection != null} stale={staleOf(active)} />

      <DriversSection d={d} targetName={name} />

      <Section
        id="predict-batch"
        title="Proposed experiments"
        description={`Model-generated proposals for ${name}, in the order the engine proposed them. Untick any you will not run. Use Compare on ${COMPARE_MIN} to ${COMPARE_MAX} to see them side by side.`}
      >
        {setup.refused ? <SetupRefusal refusal={setup.refused} id={id} /> : null}

        <BatchNotes
          d={d}
          flags={rows.map((r) => ({ rank: r.item.rank, flags: r.flags }))}
          ranges={ranges}
          checkedInputs={checkedInputs}
          uncheckedInputs={uncheckedInputs}
          hasRows={rows.length > 0}
          setup={setup}
          bandMode={strip.intervals.kind}
        />

        {rows.length > 0 ? (
          <>
            <BandChoice mode={strip.intervals} onChange={setCoverage} />
            <BatchCharts d={d} strip={strip} active={active} highlight={highlight} onHighlight={setHighlight} />
          </>
        ) : null}

        {rows.length === 0 && modelRefusal ? (
          <RefusalBlock
            title={modelRefusal.title}
            reasons={modelRefusal.reasons}
            fix={modelRefusal.fix ? [modelRefusal.fix] : undefined}
            footer={
              <>
                Kalos does not propose recipes from a model it cannot check: a batch from it would be no better than a space-filling design, and could look like a recommendation.
                {modelRefusal.code ? <span className="font-mono text-code"> ({modelRefusal.code})</span> : null}
              </>
            }
          />
        ) : rows.length === 0 && setup.refused ? null : rows.length === 0 ? (
          <EmptyState
            title="The engine proposed no experiments"
            description={diversity?.short ? `${diversity.headline} ${diversity.notes.join(" ")}` : "This analysis returned an empty batch."}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-border py-2">
              <p className="text-label text-fg">
                {count(chosen.length)} of {count(rows.length)} selected to run
                {compare.length ? <span className="text-fg-muted">, {count(compare.length)} in comparison</span> : null}
              </p>
              <span className="sr-only" aria-live="polite">
                {announced}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {compare.length === 1 ? <span className="text-caption text-fg-muted">Select one more to compare</span> : null}
                {compared.length >= COMPARE_MIN ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      compareRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                      compareRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    Go to comparison
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setSkipped(chosen.length === rows.length ? new Set(rows.map((r) => r.item.index)) : new Set())}>
                  {chosen.length === rows.length ? "Deselect all" : "Select all"}
                </Button>
              </div>
            </div>
            <div className="hidden @4xl:block">
              <RecommendationsTable rows={rows} ctx={ctx} state={state} />
            </div>
            <div className="@4xl:hidden">
              <RecommendationCards rows={rows} ctx={ctx} state={state} />
            </div>
          </>
        )}

        {compared.length >= COMPARE_MIN ? (
          <Comparison headingRef={compareRef} rows={compared} ctx={ctx} onRemove={(rank) => setCompare((c) => c.filter((r) => r !== rank))} onClear={() => setCompare([])} />
        ) : null}

        <p className="flex items-start gap-2 text-caption text-fg-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Model-generated proposals. Predicted values{strip.intervals.kind !== "none" ? " and bands" : ""} are the model&apos;s estimates from {count(d.n)} measured {d.n === 1 ? "run" : "runs"}, not
            results; how far the model ranks held-out runs correctly is under &ldquo;Can the model be trusted?&rdquo; above.
            {unitHint(d) ? <span className="block">{unitHint(d)}</span> : null}
          </span>
        </p>
      </Section>

      <SliceDisclosure d={d} rows={rows} />
      <SurfaceDisclosure d={d} rows={rows} />
      <ProvenancePanel d={d} />
      <PredictSource d={d} />

      {rows.length > 0 ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg px-4 py-3 sm:hidden">
          <span className="text-label text-fg">
            {count(chosen.length)} of {count(rows.length)} selected
            {startHint ? <span className="block text-caption text-fg-muted">{startHint}</span> : null}
          </span>
          {primary()}
        </div>
      ) : null}

      <ApproveDialog open={approving} onOpenChange={setApproving} rows={chosen} ctx={ctx} round={round} onStart={start} />
    </Page>
  );
}

/**
 * The batch as two linked charts: C2 (predicted value and band per proposal
 * against the incumbent, with any measured result) and C3 (where each recipe
 * sits on each input's range). Hovering a proposal in either highlights it in
 * both. Every value is an engine field (lib/viz-data adapters).
 */
function BatchCharts({
  d,
  strip,
  active,
  highlight: controlled,
  onHighlight,
}: {
  d: PredictAnalysis;
  /** The batch at the chosen coverage (toBatchStripModel), shared with the table so both show the same band. */
  strip: BatchStripModel;
  active: ActiveCampaign | null;
  highlight?: string | null;
  onHighlight?: (key: string | null) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const highlight = controlled !== undefined ? controlled : own;
  const setHighlight = onHighlight ?? setOwn;
  const ranges = useMemo(() => observedRanges(d), [d]);
  const matrix = useMemo(() => {
    const proposals = (d.proposals ?? []).map((p, i) => ({ key: `P${i + 1}`, n: i + 1, values: proposalRecipe(p, d.proposal_features) as Record<string, number | string> }));
    const rangeInputs: Record<string, RangeInput> = Object.fromEntries(Object.entries(ranges).map(([k, r]: [string, ObservedRange]) => [k, { min: r.min, max: r.max, source: r.source, n: r.n }]));
    return toSetpointMatrixModel(d, proposals, rangeInputs);
  }, [d, ranges]);
  const verdict = reliabilityVerdict(d);
  const trust = batchTrustOf(d);
  const nRecorded = active?.pending.filter((r) => r.result != null).length ?? 0;
  const stale = active?.analysis_in_sync === false ? { nNew: nRecorded, text: nRecorded > 0 ? undefined : "The campaign changed since this analysis. Re-analyze on Validate to update." } : null;
  const src = sourceFromAnalysis(d, "proposals", "predicted", bandMethodOf(strip));
  const footer = (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      From: {src.label} · n = {count(d.n)} runs ·{" "}
      {strip.intervals.kind === "per-proposal"
        ? `${bandName(strip)} (proposals[].intervals)`
        : strip.halfWidth != null
          ? `${coverageLabel(strip.coverage)}, half-width ${formatValue(strip.halfWidth).text}`
          : "no held-out band reported"}
      {d.engine_version ? ` · engine ${d.engine_version}` : ""}
      <SourceButton source={src} />
    </span>
  );
  const matrixSource = sourceFromAnalysis(d, "proposals[].recipe", "setting");
  const matrixLabel = `${matrixSource.label}${d.engine_version ? ` · engine ${d.engine_version}` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <BatchIntervalStrip
        model={strip}
        highlight={highlight}
        onHighlight={setHighlight}
        sourceFor={(r) => sourceFromAnalysis(d, `proposals[${r.index}].pred`, "predicted", bandMethodOf(strip))}
        stale={stale}
        warning={
          trust?.kind === "exploration"
            ? `Every proposal is ${EXPLORATION_LABEL}.${trust.message ? ` ${trust.message}` : ""}`
            : verdict.state === "not-judged"
              ? "Not judged: too few runs. Treat these as exploration, not forecasts."
              : verdict.state !== "reliable"
                ? "Not yet reliable: treat these as exploration, not forecasts."
                : undefined
        }
        footer={footer}
      />
      {strip.intervals.kind === "per-proposal" ? (
        <p className="text-caption text-fg-muted">
          Each proposal has its own band ({PER_PROPOSAL_METHOD}); its caveat is under the strip. Explore proposals are chosen to learn; exploit proposals for a {strip.goal === "minimize" ? "low" : "high"} predicted value. The engine&apos;s reason for each is under its details.
        </p>
      ) : strip.halfWidth != null ? (
        <p className="text-caption text-fg-muted">
          The engine reports one band width for the whole batch; its caveat is under the strip. Explore proposals are chosen to learn; exploit proposals for a {strip.goal === "minimize" ? "low" : "high"} predicted value. The engine&apos;s reason for each is under its details.
        </p>
      ) : (
        <p className="text-caption text-fg-muted">The engine reported no prediction band, so predictions are shown without an interval and the model σ is not turned into one.</p>
      )}
      {strip.hasImprovement ? (
        <p className="text-caption text-fg-muted">
          The chance the model&apos;s mean {strip.goal === "minimize" ? "goes below" : "beats"} the incumbent, the expected improvement and the quantiles are {MODEL_BASED}
          {(() => {
            const inc = improvementIncumbent(strip.rows.find((r) => r.pImprove ?? r.ei)?.pImprove ?? strip.rows.find((r) => r.ei)?.ei ?? null, strip.unit);
            return inc ? `, compared with the ${inc}` : "";
          })()}
          {strip.goal === "minimize" ? "; with the goal to minimize they measure going below it" : ""}. They are context: the engine chose the batch by its own acquisition, not by these numbers.
        </p>
      ) : null}
      <DistanceDisclosure strip={strip} />
      <RecipeSetpointMatrix
        model={matrix}
        highlight={highlight}
        onHighlight={setHighlight}
        sourceLabel={matrixLabel}
        stale={stale}
        footer={
          <span className="inline-flex flex-wrap items-center gap-x-1">
            From: {matrixSource.label} · {matrix.proposals.length} proposals · ranges from the engine&apos;s feature_ranges, else the measured runs
            {matrix.incumbentLabel ? " · incumbent from response_surface.fixed_recipe" : ""}
            <SourceButton source={matrixSource} />
          </span>
        }
      />
    </div>
  );
}

/** The method word a proposal's source popover names for its band. */
function bandMethodOf(strip: BatchStripModel): string | undefined {
  if (strip.intervals.kind === "per-proposal") return `per-recipe band (${PER_PROPOSAL_METHOD})`;
  return strip.halfWidth != null ? "held-out conformal band" : undefined;
}

/** The batch of a campaign whose runs are in flight, with its own band coverage choice. */
function StartedBatch({ d, active }: { d: PredictAnalysis; active: ActiveCampaign }) {
  const [coverage, setCoverage] = useState<number | null>(null);
  const name = targetName(d.target);
  const unit = targetUnitOf(d);
  const runs = active.pending;
  const strip = useMemo(() => toBatchStripModel(d, { target: name, unit, runs, coverage }), [d, name, unit, runs, coverage]);
  return (
    <>
      <BandChoice mode={strip.intervals} onChange={setCoverage} />
      <BatchCharts d={d} strip={strip} active={active} />
    </>
  );
}

/**
 * How far each proposal sits from any measured run (`nearest_training_distance`),
 * with the engine's typical spacing between measured runs as the scale. An
 * extrapolation signal only: exact ratios of engine numbers, no threshold, no verdict.
 */
function DistanceDisclosure({ strip }: { strip: BatchStripModel }) {
  const rows = strip.rows.filter((r) => r.nnDistance != null);
  if (!rows.length) return null;
  const median = strip.nnMedian != null ? formatValue(strip.nnMedian, { fallbackSigFigs: 2 }).value : null;
  return (
    <Disclosure summary="How far each proposal is from the measured runs" meta="extrapolation signal">
      <div className="flex flex-col gap-3">
        <p className="text-body text-fg">
          {median != null ? `Typical spacing between measured runs: ${median} (the engine's median distance from each measured run to its nearest other one).` : "The engine did not report the typical spacing between measured runs."}
        </p>
        <ul className="grid grid-cols-[max-content_max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-body tabular-nums">
          {rows.map((r) => {
            const t = distanceText(r.nnDistance, strip.nnMedian);
            return (
              <li key={r.key} className="contents">
                <span className="font-mono text-code text-fg">{r.key}</span>
                <span className="text-right text-fg">{t.value}</span>
                <span className="text-fg-muted">{t.ratio ?? ""}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-fg-muted">{DISTANCE_METHOD} Further from the data means the model is reaching further from what it has seen. Kalos sets no cut-off.</p>
      </div>
    </Disclosure>
  );
}

/** The engine's 1D model slices (R2), mounted only when opened. Absent on older analyses. */
function SliceDisclosure({ d, rows = [] }: { d: PredictAnalysis; rows?: PlanRow[] }) {
  const data = useMemo(
    () =>
      toSliceProfiler(
        d,
        (rows.length ? rows.map((r) => ({ key: r.id, recipe: r.recipe })) : (d.proposals ?? []).map((p, i) => ({ key: `P${i + 1}`, recipe: proposalRecipe(p, d.proposal_features) as Record<string, number | string> }))),
      ),
    [d, rows],
  );
  if (data.state === "absent") return null;
  return (
    <Disclosure summary="How the model responds to one input at a time" meta={data.state === "ready" ? "model prediction" : "not computed"}>
      <SliceProfiler data={data} target={targetName(d.target)} unit={targetUnitOf(d)} source={sourceFromAnalysis(d, "slices", "predicted", "GP posterior mean and band, other inputs held at the incumbent")} bare />
    </Disclosure>
  );
}

/** The response surface: a model prediction (mean and the engine's σ grid when sent), mounted only when opened. */
function SurfaceDisclosure({ d, rows = [] }: { d: PredictAnalysis; rows?: PlanRow[] }) {
  const surface = useMemo(() => parseSurface(d.response_surface), [d.response_surface]);
  const points = useMemo(
    () =>
      surface == null
        ? []
        : rows.flatMap((r) => {
            const x = r.recipe[surface.x.name];
            const y = r.recipe[surface.y.name];
            return typeof x === "number" && typeof y === "number" ? [{ id: r.id, x, y }] : [];
          }),
    [rows, surface],
  );
  const reasons = d.visualization_reasons;
  const raw = reasons && typeof reasons === "object" ? (reasons as Record<string, unknown>).response_surface : null;
  const reason = typeof raw === "string" && raw ? raw : null;
  if (!surface && !reason) return null;
  return (
    <Disclosure summary="How the model responds to two inputs" meta={surface ? "model prediction" : "not computed"}>
      <ResponseSurface2D
        surface={d.response_surface}
        target={targetName(d.target)}
        unit={targetUnitOf(d)}
        proposals={points}
        source={sourceFromAnalysis(d, "response_surface", "predicted")}
        reason={reason}
      />
    </Disclosure>
  );
}

function ProvenancePanel({ d }: { d: PredictAnalysis }) {
  const facts = runFacts(d.run);
  const prov = d.proposal_provenance;
  if (prov?.config_sha256) facts.push({ label: "Config fingerprint", value: prov.config_sha256.slice(0, 12) });
  if (prov?.provenance_sha256) facts.push({ label: "Batch provenance", value: prov.provenance_sha256 });
  if (prov?.model_artifact_stored != null) facts.push({ label: "Model stored", value: prov.model_artifact_stored ? "Yes" : "No: the fit is reproduced from the inputs and seed" });
  return (
    <Disclosure summary="How this batch was made" meta={facts.length ? undefined : "not reported"}>
      {facts.length ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-body">
          {facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-fg-muted">{f.label}</dt>
              <dd className="min-w-0 break-words text-body text-fg">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body text-fg-muted">The engine did not report how this analysis was produced.</p>
      )}
    </Disclosure>
  );
}

/** Where the numbers on this page come from. Anything the engine did not send reads n/a. */
function PredictSource({ d }: { d: PredictAnalysis }) {
  const prov = d.proposal_provenance;
  const hash = prov?.provenance_sha256 ?? null;
  return (
    <SourceLine
      className="border-t border-border pt-4"
      parts={[
        { label: "Analysis of", value: d.dataset },
        { label: "provenance", value: hash ? shortHash(hash) : null, title: hash ?? undefined },
        { label: "seed", value: d.seed ?? prov?.seed ?? null },
        { label: "engine", value: d.engine_version ?? prov?.engine_version ?? null },
        { label: "analyzed", value: formatTimestamp(d.timestamp ?? d.updated) },
      ]}
    />
  );
}

/** `value`, but only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
