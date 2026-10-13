"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { batchExceptions, orderBatch, targetIsNonNegative, type BatchItem } from "@/components/campaign/plan-batch";
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
import { formatBand, formatNumber } from "@/lib/format";
import { parseUnit } from "@/lib/utils";

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
  const { shown, total } = batchExceptions(items, { incumbent, band, nonNegative: targetIsNonNegative(d.best, d.oof) });
  const flagged = new Set(shown.map((e) => e.rank));
  const chosen = items.filter((i) => !skipped.has(i.index));
  const beats = items.filter((i) => i.beatsBest);
  const rest = items.filter((i) => !i.beatsBest);

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
      setBusy(false);
    }
  }

  const row = (item: BatchItem) => (
    <RecipeRow
      key={item.index}
      item={item}
      features={d.proposal_features}
      unit={unit}
      incumbent={incumbent}
      band={band}
      coverage={d.conformal_coverage}
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
        <Callout tone="bad" title="Could not start these runs">
          The engine did not accept the batch, so nothing was started. Try again.
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
                <ul className="mt-1 divide-y divide-border border-y border-border">{beats.map(row)}</ul>
              </div>
            ) : null}
            {rest.length > 0 ? (
              <div>
                {beats.length > 0 ? <h3 className="text-label text-fg-muted">Not predicted to beat the current best ({rest.length})</h3> : null}
                <ul className="mt-1 divide-y divide-border border-y border-border">{rest.map(row)}</ul>
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

function RecipeRow({
  item,
  features,
  unit,
  incumbent,
  band,
  coverage,
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
  checked: boolean;
  flagged: boolean;
  onToggle: () => void;
}) {
  const { rank, proposal: p } = item;
  const recipe = proposalRecipe(p, features);
  const main = features.filter((f) => f in recipe);
  const others = Object.keys(recipe).filter((k) => !features.includes(k));
  const setpoint = (k: string) => (
    <span key={k} className="whitespace-nowrap">
      <span className="text-fg-muted">{k}</span> <span className="text-fg tabular-nums">{formatNumber(recipe[k])}</span>
    </span>
  );
  return (
    <li className="flex gap-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={`Run recipe ${rank}`}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <div className="grid min-w-0 flex-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-label text-fg">Recipe {rank}</span>
            <ModeBadge mode={p.mode} />
            {flagged ? <Badge tone="warn">Check</Badge> : null}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-body">{main.map(setpoint)}</p>
          {others.length ? (
            <details className="mt-1 text-caption text-fg-muted">
              <summary className="cursor-pointer select-none hover:text-fg">
                {others.length} other {others.length === 1 ? "setpoint" : "setpoints"}
              </summary>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{others.map(setpoint)}</p>
            </details>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-heading text-fg tabular-nums">
            {formatNumber(p.pred)}
            {unit ? <span className="ml-1 text-body font-normal text-fg-muted">{unit}</span> : null}
          </p>
          <p className="text-caption text-fg-muted tabular-nums">{band != null ? formatBand(band, coverage) : "no prediction band reported"}</p>
          {incumbent != null ? (
            <p className="text-caption text-fg-muted tabular-nums">{formatNumber(p.pred - incumbent, "value", { sign: true })} vs best</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
