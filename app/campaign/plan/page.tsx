"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, FileWarning, Info, TriangleAlert } from "lucide-react";
import { orderBatch, targetIsNonNegative } from "@/components/campaign/plan-batch";
import { ApproveDialog } from "@/components/campaign/plan/approve-dialog";
import { Comparison } from "@/components/campaign/plan/comparison";
import { MarkLegend, MeasuredValue } from "@/components/campaign/plan/marks";
import { RecommendationCards, RecommendationsTable, type PlanContext, type PlanRow, type RowState } from "@/components/campaign/plan/recommendations";
import {
  bandLabel,
  boundaryChecks,
  COMPARE_MAX,
  COMPARE_MIN,
  diversitySummary,
  groupFlags,
  observedRanges,
  recipeFlags,
  recipeKeys,
  rejectionCopy,
  stripDomain,
  toggleCompare,
  type PlanAnalysis,
  type SetpointValue,
  type UploadRejection,
} from "@/components/campaign/plan-view";
import { targetName } from "@/components/campaign/target";
import { Callout } from "@/components/kit/callout";
import { TONE_ICON, TONE_TEXT, type Tone } from "@/components/kit/tone";
import { Verdict } from "@/components/kit/verdict";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/honest-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaign, useEngineWrites, useLastRejection, useLatest } from "@/hooks/use-engine";
import { constraintNote, designBoxExclusionsNote, incumbentLabel, proposalIncumbent, proposalRecipe, reliabilityVerdict, type Campaign } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";
import { cn, parseUnit } from "@/lib/utils";

const plural = (n: number, one: string) => `${formatNumber(n, "count")} ${n === 1 ? one : `${one}s`}`;

/**
 * Plan round N: review the model-generated batch, compare candidates, choose
 * which to run, then approve and start them. Nothing starts without the
 * explicit approval step. Every number is an engine field or is computed from
 * runs the engine returned; see components/campaign/plan-view.ts. Once runs
 * are started the page says so and points to Run; re-proposing lives on Learn.
 */
export default function PlanPage() {
  const latest = useLatest();
  const campaign = useCampaign();
  const { rejection, setRejection } = useLastRejection();

  if (latest.status === "error" || campaign.status === "error") {
    return (
      <Page>
        <PlanHeader />
        <ErrorState
          title="Could not reach the analysis engine"
          description="The request failed before the engine could respond, so there are no proposals to show. This is a connection problem, not a result: your data and any started runs are unaffected."
          onRetry={() => {
            void latest.refresh();
            void campaign.refresh();
          }}
          busy={latest.refreshing || campaign.refreshing}
        />
      </Page>
    );
  }
  if (!latest.data || !campaign.data) return <PlanSkeleton />;

  if (!latest.data.has_data) {
    return (
      <Page>
        <PlanHeader />
        {rejection ? (
          <RejectedUpload rejection={rejection} />
        ) : (
          <EmptyState
            title="No proposals yet"
            description="Upload a run sheet. Kalos fits a model to the runs you already have, then proposes the first batch of experiments here."
            action={
              <Link href="/campaign/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Upload a run sheet
              </Link>
            }
          />
        )}
      </Page>
    );
  }

  const d = latest.data as PlanAnalysis;
  const stage = campaignStage(d, campaign.data);
  const round = stage.round ?? 1;
  const active = campaign.data.has_campaign ? campaign.data : null;
  // After a start the analysis no longer matches the campaign until Learn re-analyzes, so the old batch is not offered again.
  const started = active != null && active.pending.length > 0 && active.analysis_in_sync !== true;

  if (started) return <Started d={d} round={round} active={active} />;

  return (
    <Batch
      key={`${d.campaign_generation}-${d.dataset}-${d.updated}`}
      d={d}
      round={round}
      stageDetail={stage.steps.find((s) => s.key === "plan")?.detail ?? ""}
      rejection={rejection}
      onKeepPrevious={() => setRejection(null)}
    />
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="@container flex flex-col gap-6">{children}</div>;
}

function PlanHeader({ round, eyebrow, meta, action }: { round?: number; eyebrow?: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-label text-fg-muted">{eyebrow}</p> : null}
        <h1 className="text-title text-fg">{round != null ? `Plan round ${round}` : "Plan"}</h1>
        {meta}
      </div>
      {action ? <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">{action}</div> : null}
    </header>
  );
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-label="Loading the proposed batch">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <h1 className="text-title text-fg">Plan</h1>
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 bg-surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function RejectedUpload({ rejection }: { rejection: UploadRejection }) {
  const copy = rejectionCopy(rejection);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <FileWarning className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-label text-fg">{copy.title}</p>
        <p className="mt-1 text-body text-fg">{copy.body}</p>
        {copy.suggestion ? <p className="mt-1 text-body text-fg-muted">{copy.suggestion}</p> : null}
        <Link href="/campaign/setup" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>
          Upload a different sheet
        </Link>
      </div>
    </div>
  );
}

function Started({ d, round, active }: { d: PlanAnalysis; round: number; active: Extract<Campaign, { has_campaign: true }> }) {
  return (
    <Page>
      <PlanHeader
        round={round}
        eyebrow={<DatasetEyebrow name={d.dataset} />}
        action={
          <Link href="/campaign/run" className={buttonVariants()}>
            View runs in flight
          </Link>
        }
      />
      <Verdict tone="good">
        {plural(active.pending.length, "run")} started for round {round}.{" "}
        {active.n_awaiting > 0 ? `${formatNumber(active.n_awaiting, "count")} awaiting results.` : "All have results."}
      </Verdict>
      <p className="text-body text-fg-muted">Follow them on Run, and record each result as it comes back. Planning the next round happens on Learn.</p>
      <Link href="/campaign/run" className={cn(buttonVariants(), "w-full sm:hidden")}>
        View runs in flight
      </Link>
    </Page>
  );
}

function DatasetEyebrow({ name }: { name: string }) {
  return (
    <>
      Campaign <span aria-hidden>·</span> <span className="font-mono text-code">{name}</span>
    </>
  );
}

function Batch({
  d,
  round,
  stageDetail,
  rejection,
  onKeepPrevious,
}: {
  d: PlanAnalysis;
  round: number;
  stageDetail: string;
  rejection: UploadRejection | null;
  onKeepPrevious: () => void;
}) {
  const { startRuns } = useEngineWrites();
  // Unticked proposals, by the engine's index: empty means every proposal is selected to run.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [compare, setCompare] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);
  const compareRef = useRef<HTMLHeadingElement>(null);

  const name = targetName(d.target);
  const unit = parseUnit(d.target);
  const incumbent = proposalIncumbent(d);
  const band = d.conformal_q ?? null;
  const verdict = reliabilityVerdict(d);
  const ranges = useMemo(() => observedRanges(d), [d]);
  const diversity = diversitySummary(d.batch_diversity, d.proposal_notice);

  const rows: PlanRow[] = useMemo(() => {
    const nonNegative = targetIsNonNegative(d.best, d.oof);
    return orderBatch(d.proposals, incumbent).map((item) => {
      const recipe = proposalRecipe(item.proposal, d.proposal_features) as Record<string, SetpointValue>;
      return {
        item,
        id: `P${item.rank}`,
        recipe,
        flags: recipeFlags(item.proposal, recipe, { incumbent, band, nonNegative, ranges, constraint: d.constraint }),
        checks: boundaryChecks(recipe, ranges),
        gain: incumbent == null ? null : item.proposal.pred - incumbent,
      };
    });
  }, [d, incumbent, band, ranges]);

  const others = useMemo(() => [...new Set(rows.flatMap((r) => recipeKeys(d.proposal_features, r.recipe).other))].sort((a, b) => a.localeCompare(b)), [rows, d.proposal_features]);
  const ctx: PlanContext = {
    target: name,
    unit,
    features: d.proposal_features,
    others,
    ranges,
    band,
    coverage: d.conformal_coverage,
    incumbent,
    incumbentLabel: incumbentLabel(d),
    domain: stripDomain(
      rows.map((r) => r.item.proposal.pred),
      band,
      incumbent,
    ),
    constraint: d.constraint,
  };

  const chosen = rows.filter((r) => !skipped.has(r.item.index));
  const compared = compare.map((rank) => rows.find((r) => r.item.rank === rank)).filter((r): r is PlanRow => r != null);
  const grouped = groupFlags(rows.map((r) => ({ rank: r.item.rank, flags: r.flags })));
  const blocked = rejection != null;
  const canStart = chosen.length > 0 && !blocked;
  const startHint = blocked ? "Resolve the upload note first" : chosen.length === 0 ? "Select at least one proposal to run" : null;

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
      return true;
    } catch {
      return false;
    }
  }

  const reviewButton = (className?: string) => (
    <Button onClick={() => setApproving(true)} disabled={!canStart} className={className}>
      Review and start {chosen.length > 0 ? formatNumber(chosen.length, "count") : ""}
    </Button>
  );

  const verdictTone: Tone = verdict.state === "reliable" ? "good" : verdict.state === "not-yet" ? "warn" : "neutral";
  const VerdictIcon = TONE_ICON[verdictTone];
  const constraint = constraintNote(d.constraint);
  const boxNote = designBoxExclusionsNote(d.design_box_exclusions);
  const checkedInputs = Object.keys(ranges).filter((k) => rows.some((r) => k in r.recipe));
  const uncheckedInputs = [...d.proposal_features, ...others].filter((k) => !ranges[k] && rows.some((r) => typeof r.recipe[k] === "number"));

  return (
    <Page>
      <PlanHeader
        round={round}
        eyebrow={<DatasetEyebrow name={d.dataset} />}
        meta={
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-label text-fg-muted">
            <li>
              Stage <span className="text-fg">Plan</span>
              {stageDetail ? <span>, {stageDetail}</span> : null}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <VerdictIcon className={cn("size-4", TONE_TEXT[verdictTone])} aria-hidden />
              Model ranking <span className="text-fg">{verdict.label.toLowerCase()}</span>
              {verdict.rho != null ? <span className="tabular-nums">(ρ {formatNumber(verdict.rho, "corr")})</span> : null}
            </li>
            <li>
              Target <span className="font-mono text-code text-fg">{d.target}</span>
            </li>
          </ul>
        }
        action={
          <>
            {reviewButton()}
            {startHint ? <span className="text-caption text-fg-muted">{startHint}</span> : null}
          </>
        }
      />

      {rejection ? (
        <Callout
          tone="warn"
          title={`These proposals are from ${d.dataset}, not ${rejection.name}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onKeepPrevious}>
                Keep planning from {d.dataset}
              </Button>
              <Link href="/campaign/setup" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Go to Setup
              </Link>
            </div>
          }
        >
          {rejectionCopy(rejection).body} Starting is paused until you choose.
        </Callout>
      ) : null}

      <section aria-label="Batch summary">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border @3xl:grid-cols-4">
          <SummaryCell label="Proposed experiments" caption={diversity && d.batch_diversity ? `model-generated, ${formatNumber(d.batch_diversity.returned, "count")} of ${formatNumber(d.batch_diversity.requested, "count")} requested` : "model-generated"}>
            <span className="text-title tabular-nums">{formatNumber(rows.length, "count")}</span>
          </SummaryCell>
          <SummaryCell label={`Best ${name}`} caption={incumbent != null ? ctx.incumbentLabel : "no reproducible best for this fit"}>
            {incumbent != null ? <MeasuredValue value={formatNumber(incumbent)} unit={unit || undefined} className="text-title" /> : <span className="text-heading text-fg-muted">n/a</span>}
          </SummaryCell>
          <SummaryCell label="Prediction band" caption={band != null ? `${bandLabel(d.conformal_coverage)}, same width for every proposal` : "the engine did not report one"}>
            <span className={cn("tabular-nums", band != null ? "text-title" : "text-heading text-fg-muted")}>{band != null ? `± ${formatNumber(band)}` : "Not reported"}</span>
          </SummaryCell>
          <SummaryCell
            label="Constraints"
            caption={d.proposal_gating ? (d.proposal_gating.gated ? "gated by predicted feasibility" : "no feasibility gate") : undefined}
          >
            <span className="text-heading">{d.constraint == null ? "Not reported" : constraint == null ? "None requested" : d.constraint.applied ? "Applied" : "Not applied"}</span>
          </SummaryCell>
        </dl>
      </section>

      <section aria-labelledby="plan-notes-title" className="flex flex-col gap-2">
        <h2 id="plan-notes-title" className="text-heading text-fg">
          Before you start
        </h2>
        <ul className="flex flex-col gap-1.5">
          {grouped.map((g) => (
            <Note key={g.kind} tone="warn">
              <span className="font-medium">{g.ranks.map((r) => `P${r}`).join(", ")}</span>: {g.label}.
            </Note>
          ))}
          {grouped.length === 0 && rows.length > 0 ? <Note tone="good">No proposal triggered a check.</Note> : null}
          {diversity ? (
            <Note tone={diversity.short ? "warn" : "neutral"} detail={diversity.notes.join(" ")}>
              {diversity.headline}
            </Note>
          ) : (
            <Note tone="neutral">The engine did not report how distinct this batch is.</Note>
          )}
          {checkedInputs.length || uncheckedInputs.length ? (
            <Note
              tone="neutral"
              detail={uncheckedInputs.length ? `The engine returns no range for ${uncheckedInputs.join(", ")}, so ${uncheckedInputs.length === 1 ? "it is" : "they are"} not checked.` : undefined}
            >
              {checkedInputs.length
                ? `Edge-of-range checks use the values tried for ${checkedInputs.join(" and ")} in the measured runs.`
                : "No input has a known range, so no edge-of-range checks were run."}
            </Note>
          ) : null}
          {constraint ? <Note tone="neutral">{constraint}</Note> : null}
          {boxNote ? <Note tone="neutral">{boxNote}</Note> : null}
        </ul>
      </section>

      <section aria-labelledby="plan-batch-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="plan-batch-title" className="text-heading text-fg">
            Proposed experiments
          </h2>
          <p className="max-w-[72ch] text-body text-fg-muted">
            Model-generated proposals for {name}, sorted by predicted value. Untick any you will not run. Use Compare on {COMPARE_MIN} to {COMPARE_MAX} to see them side by side.
          </p>
          <MarkLegend className="mt-1" />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="The engine proposed no experiments"
            description={diversity?.short ? `${diversity.headline} ${diversity.notes.join(" ")}` : "This analysis returned an empty batch."}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-border py-2">
              <p className="text-label text-fg" aria-live="polite">
                {formatNumber(chosen.length, "count")} of {formatNumber(rows.length, "count")} selected to run
                {compare.length ? <span className="text-fg-muted">, {formatNumber(compare.length, "count")} in comparison</span> : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {compare.length === 1 ? <span className="text-caption text-fg-muted">Select one more to compare</span> : null}
                {compared.length >= COMPARE_MIN ? (
                  <Button variant="outline" size="sm" onClick={() => compareRef.current?.focus()}>
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
      </section>

      {compared.length >= COMPARE_MIN ? (
        <Comparison headingRef={compareRef} rows={compared} ctx={ctx} onRemove={(rank) => setCompare((c) => c.filter((r) => r !== rank))} onClear={() => setCompare([])} />
      ) : null}

      <p className="flex items-start gap-2 text-caption text-fg-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Model-generated proposals. Predicted values and bands are the model&apos;s estimates from {plural(d.n, "measured run")}, not results, and this optimizer has not been
          validated against lab outcomes. How well the model ranked held-out runs is on{" "}
          <Link href="/campaign/learn" className="text-accent underline-offset-4 hover:underline">
            Learn
          </Link>
          .
        </span>
      </p>

      {rows.length > 0 ? (
        <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg px-4 py-3 sm:hidden">
          <span className="text-label text-fg">
            {formatNumber(chosen.length, "count")} of {formatNumber(rows.length, "count")} selected
            {startHint ? <span className="block text-caption text-fg-muted">{startHint}</span> : null}
          </span>
          {reviewButton()}
        </div>
      ) : null}

      <ApproveDialog open={approving} onOpenChange={setApproving} rows={chosen} ctx={ctx} round={round} onStart={start} />
    </Page>
  );
}

function SummaryCell({ label, caption, children }: { label: string; caption?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface p-3 sm:p-4">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0">{children}</span>
        {caption ? <span className="text-caption text-fg-muted">{caption}</span> : null}
      </dd>
    </div>
  );
}

function Note({ tone, children, detail }: { tone: Tone; children: ReactNode; detail?: ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlert : tone === "bad" ? CircleAlert : TONE_ICON[tone];
  return (
    <li className="flex items-start gap-2 text-body text-fg">
      <Icon className={cn("mt-1 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
      <span className="min-w-0">
        {children}
        {detail ? <span className="block text-caption text-fg-muted">{detail}</span> : null}
      </span>
    </li>
  );
}
