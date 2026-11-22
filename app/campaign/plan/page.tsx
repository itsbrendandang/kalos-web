"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { batchExceptions, orderBatch, targetIsNonNegative, type BatchItem } from "@/components/campaign/plan-batch";
import { predictionScale, type PredictionScale } from "@/components/campaign/prediction-scale";
import { targetName } from "@/components/campaign/target";
import { Callout } from "@/components/kit/callout";
import { Disclosure } from "@/components/kit/disclosure";
import { PageHeader } from "@/components/kit/page-header";
import { Section } from "@/components/kit/section";
import { Verdict } from "@/components/kit/verdict";
import { Badge, ModeBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign, useEngineWrites, useLatest } from "@/hooks/use-engine";
import { incumbentLabel, proposalIncumbent, proposalRecipe, reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { campaignStage } from "@/lib/campaign-stage";
import { formatBand, formatNumber, formatSetpoint } from "@/lib/format";
import { cn, parseUnit } from "@/lib/utils";

/** The proposal cards: as many 300px-minimum columns as fit. */
const CARD_GRID = "mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4";

const plural = (n: number, one: string) => `${formatNumber(n, "count")} ${n === 1 ? one : `${one}s`}`;

/**
 * Plan round N: review the proposed batch and start it. Every recipe starts
 * accepted; untick the ones you will not run. The engine cannot re-score an
 * edited recipe, so setpoints are read-only. Once runs are started the page
 * says so and points to Run; re-proposing lives on Learn.
 */
export default function PlanPage() {
  const latest = useLatest();
  const campaign = useCampaign();

  const header = (title: string, description?: string, action?: React.ReactNode) => (
    <PageHeader title={title} description={description} action={action} />
  );

  if (latest.status === "error" || campaign.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        {header("Plan")}
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
        {header("Plan")}
        <LoadingSkeleton variant="rows" rows={5} />
      </div>
    );
  }
  if (!latest.data.has_data) {
    return (
      <div className="flex flex-col gap-6">
        {header("Plan")}
        <EmptyState
          title="No batch to plan yet"
          description="Upload a run sheet and Kalos will propose the first batch."
          action={
            <Link href="/campaign/setup" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Upload a run sheet
            </Link>
          }
        />
      </div>
    );
  }

  const d = latest.data;
  const stage = campaignStage(d, campaign.data);
  const round = stage.round ?? 1;
  const active = campaign.data.has_campaign ? campaign.data : null;
  // After a start the analysis no longer matches the campaign until Learn re-analyzes, so the old batch is not offered again.
  const started = active != null && active.pending.length > 0 && active.analysis_in_sync !== true;

  if (started) {
    return (
      <div className="flex flex-col gap-6">
        {header(
          `Plan round ${round}`,
          undefined,
          <Link href="/campaign/run" className={buttonVariants()}>
            View runs in flight
          </Link>,
        )}
        <Verdict tone="good">
          {plural(active.pending.length, "run")} started for round {round}. {active.n_awaiting > 0 ? `${formatNumber(active.n_awaiting, "count")} awaiting results.` : "All have results."}
        </Verdict>
        <p className="text-body text-fg-muted">
          Follow them on Run, and record each result as it comes back. Planning the next round happens on Learn.
        </p>
      </div>
    );
  }

  return <Batch key={`${d.campaign_generation}-${d.dataset}-${d.updated}`} d={d} round={round} />;
}

function Batch({ d, round }: { d: PopulatedResult; round: number }) {
  const { startRuns } = useEngineWrites();
  // Unticked recipes, by the engine's index: empty means the whole batch is accepted.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const unit = parseUnit(d.target);
  const name = targetName(d.target);
  const incumbent = proposalIncumbent(d);
  const band = d.conformal_q ?? null;
  const verdict = reliabilityVerdict(d);
  const items = orderBatch(d.proposals, incumbent);
  const { shown, total } = batchExceptions(items, { incumbent, band, nonNegative: targetIsNonNegative(d.best, d.oof), ranges: d.feature_ranges, features: d.proposal_features });
  const flagged = new Set(shown.map((e) => e.rank));
  const chosen = items.filter((i) => !skipped.has(i.index));
  const beats = items.filter((i) => i.beatsBest);
  const rest = items.filter((i) => !i.beatsBest);
  const scale = predictionScale(
    items.map((i) => i.proposal.pred),
    band,
    incumbent,
  );

  function toggle(index: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function start() {
    setBusy(true);
    setFailed(false);
    try {
      await startRuns(
        chosen.map(({ proposal: p }) => ({ recipe: proposalRecipe(p, d.proposal_features), pred: p.pred, std: p.std, mode: p.mode, reason: p.reason })),
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const row = (item: BatchItem) => (
    <RecipeCard
      key={item.index}
      item={item}
      features={d.proposal_features}
      unit={unit}
      incumbent={incumbent}
      band={band}
      coverage={d.conformal_coverage}
      scale={scale}
      checked={!skipped.has(item.index)}
      flagged={flagged.has(item.rank)}
      onToggle={() => toggle(item.index)}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Plan round ${round}`}
        description={`Review the batch Kalos proposes for ${name}, untick any recipe you will not run, then start the rest.`}
        action={
          <Button onClick={start} disabled={chosen.length === 0 || busy}>
            {busy ? "Starting..." : `Start ${plural(chosen.length, "run")}`}
          </Button>
        }
      />

      {failed ? (
        <Callout tone="bad" title="Could not confirm these runs started">
          The engine did not confirm the batch. Check Run to see whether any runs started before you try again.
        </Callout>
      ) : null}

      <Verdict tone={verdict.state === "reliable" ? "good" : verdict.state === "not-yet" ? "warn" : "neutral"}>
        <span className="font-semibold">{verdict.label}.</span> {verdict.reason}
      </Verdict>

      {shown.length ? (
        <div>
          <p className="text-label text-fg">Check before you start</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {shown.map((e) => (
              <li key={e.rank} className="flex items-start gap-2 text-body text-fg">
                <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
                {e.text}
              </li>
            ))}
          </ul>
          {total > shown.length ? (
            <p className="mt-2 text-caption text-fg-muted">Showing the {shown.length} most serious of {total} recipes with a note.</p>
          ) : null}
        </div>
      ) : null}

      <Section
        title="Proposed batch"
        description={
          incumbent == null
            ? "Sorted by predicted value. There is no reproducible best run to compare against for this fit."
            : `Sorted by predicted value. Compared with the ${incumbentLabel(d)} of ${formatNumber(incumbent)}${unit ? ` ${unit}` : ""}.`
        }
      >
        {items.length === 0 ? (
          <EmptyState title="No recipes proposed" description="This analysis did not return a batch." />
        ) : (
          <div className="flex flex-col gap-5">
            {incumbent != null && beats.length === 0 ? (
              <p className="text-body text-fg-muted">
                None of these recipes is predicted to beat the current best, so this batch mostly explores.
              </p>
            ) : null}
            {incumbent != null && beats.length > 0 ? (
              <div>
                <h3 className="text-label text-fg-muted">Predicted to beat the current best ({beats.length})</h3>
                <ul className={CARD_GRID}>{beats.map(row)}</ul>
              </div>
            ) : null}
            {rest.length > 0 ? (
              <div>
                {beats.length > 0 ? <h3 className="text-label text-fg-muted">Not predicted to beat the current best ({rest.length})</h3> : null}
                <ul className={CARD_GRID}>{rest.map(row)}</ul>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Disclosure summary="Method details" meta="model uncertainty per recipe">
        <ul className="flex flex-col gap-1.5 text-body text-fg-muted">
          {items.map(({ rank, proposal: p }) => (
            <li key={rank}>
              Recipe {rank}: model standard deviation {formatNumber(p.std)}
              {p.p_feasible != null ? `, estimated chance of being feasible ${formatNumber(p.p_feasible, "pct")}` : ""}. {p.reason}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-fg-muted">
          The model standard deviation is the model&apos;s own spread. The prediction band shown on each recipe is the one to use when judging a prediction.
        </p>
      </Disclosure>
    </div>
  );
}

function RecipeCard({
  item,
  features,
  unit,
  incumbent,
  band,
  coverage,
  scale,
  checked,
  flagged,
  onToggle,
}: {
  item: BatchItem;
  features: string[];
  unit: string;
  incumbent: number | null;
  band: number | null;
  coverage: number | undefined;
  scale: PredictionScale | null;
  checked: boolean;
  flagged: boolean;
  onToggle: () => void;
}) {
  const { rank, proposal: p } = item;
  const recipe = proposalRecipe(p, features);
  const main = features.filter((f) => f in recipe);
  const others = Object.keys(recipe).filter((k) => !features.includes(k));
  const setpoint = (k: string) => (
    <div key={k} className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-fg-muted" title={k}>
        {k}
      </dt>
      <dd className="text-fg tabular-nums" title={String(recipe[k])}>{formatSetpoint(recipe[k])}</dd>
    </div>
  );
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface shadow-card",
        checked ? "border-border hover:border-border-strong" : "border-dashed border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={checked} onChange={onToggle} className="size-4 shrink-0 accent-accent" />
            <span className="text-heading font-normal text-fg">
              <span className="sr-only">Run </span>Recipe {rank}
            </span>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ModeBadge mode={p.mode} />
            {flagged ? <Badge tone="warn">Check</Badge> : null}
            {!checked ? <span className="text-caption text-fg-muted">Not in this batch</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-heading font-normal text-fg tabular-nums">
            {formatNumber(p.pred)}
            {unit ? <span className="ml-1 text-body text-fg-muted">{unit}</span> : null}
          </p>
          <p className="text-caption text-fg-muted">predicted</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        {scale ? <PredictionBar pred={p.pred} band={band} incumbent={incumbent} scale={scale} /> : null}
        <p className="mt-2 text-caption text-fg-muted tabular-nums">
          {band != null ? formatBand(band, coverage) : "No prediction band reported"}
          {incumbent != null ? ` · ${formatNumber(p.pred - incumbent, "value", { sign: true })} vs best` : ""}
        </p>
        <dl className="mt-4 flex flex-col gap-1 border-t border-dashed border-border pt-3 text-caption">{main.map(setpoint)}</dl>
        {others.length ? (
          <details className="mt-2 text-caption text-fg-muted">
            <summary className="cursor-pointer select-none hover:text-fg">
              {others.length} other {others.length === 1 ? "setpoint" : "setpoints"}
            </summary>
            <dl className="mt-1 flex flex-col gap-1">{others.map(setpoint)}</dl>
          </details>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Where this recipe's prediction sits, on the axis shared by the whole batch:
 * the prediction band as a soft accent segment, the prediction as an accent
 * dot (predicted), and the best measured run as an ink tick (measured).
 */
function PredictionBar({ pred, band, incumbent, scale }: { pred: number; band: number | null; incumbent: number | null; scale: PredictionScale }) {
  const x = scale.at(pred);
  const hasBand = band != null && Number.isFinite(band) && band > 0;
  const [b0, b1] = hasBand ? [scale.at(pred - band), scale.at(pred + band)] : [x, x];
  const best = incumbent != null && Number.isFinite(incumbent) ? scale.at(incumbent) : null;
  const label = `Predicted ${formatNumber(pred)}${hasBand ? `, band ${formatNumber(pred - band)} to ${formatNumber(pred + band)}` : ""}${
    best != null ? `, best measured run ${formatNumber(incumbent)}` : ""
  }, on a scale from ${formatNumber(scale.lo)} to ${formatNumber(scale.hi)}`;
  return (
    <div role="img" aria-label={label} className="relative h-12">
      <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-subtle" />
      {hasBand ? <div className="absolute top-2 h-1.5 rounded-full bg-chart-band" style={{ left: `${b0}%`, width: `${b1 - b0}%` }} /> : null}
      {best != null ? (
        <>
          <span className="absolute top-0.5 h-4 w-0.5 -translate-x-1/2 rounded-full bg-chart-measured" style={{ left: `${best}%` }} />
          {/* Keep the label inside the card near either end of the bar. */}
          <span
            className={cn(
              "absolute top-6 text-caption whitespace-nowrap text-fg-muted",
              best < 15 ? "" : best > 85 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${best}%` }}
          >
            best {formatNumber(incumbent)}
          </span>
        </>
      ) : null}
      <span
        className="absolute top-2.75 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-surface bg-chart-predicted"
        style={{ left: `${x}%` }}
      />
    </div>
  );
}
