"use client";

import Link from "next/link";
import { MeasuredMark, PredictedValue } from "@/components/campaign/plan/marks";
import { MeasuredTrend } from "@/components/campaign/overview/measured-trend";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { OVERVIEW_STAGE_LABEL, overviewStageForLoop, type CampaignOverview, type OverviewStage } from "@/lib/campaign-overview";
import { formatNumber } from "@/lib/format";
import type { ActiveCampaign } from "@/lib/workbench";

function NextAction({ href, label }: { href: string; label: string }) {
  const filled = label.startsWith("Record");
  return (
    <div className="mt-10">
      <Link
        href={href}
        className={cn(
          buttonVariants(),
          "min-h-11",
          filled
            ? "rounded bg-overview-action text-overview-on-action hover:bg-overview-action"
            : "rounded border-overview-border bg-transparent text-overview-fg hover:bg-transparent",
        )}
      >
        {label}
      </Link>
    </div>
  );
}

function actionFor(model: CampaignOverview, stage: OverviewStage): { href: string; label: string } {
  if (model.loopNext && overviewStageForLoop(model.loopNext.stage) === stage) {
    return { href: model.loopNext.href, label: model.loopNext.action };
  }
  if (stage === "conditions") {
    return {
      href: "/campaign/setup",
      label: model.conditions.panel === "empty" ? "Upload data" : "Review setup",
    };
  }
  if (stage === "results") {
    if (model.results.pending != null && model.results.pending > 0) {
      return { href: "/campaign/record", label: `Record ${formatNumber(model.results.pending, "count")} results` };
    }
    return { href: model.hasCampaign ? "/campaign/run" : "/campaign/plan", label: model.hasCampaign ? "Review runs" : "Review plan" };
  }
  if (stage === "learning") {
    return { href: "/campaign/learn", label: model.fit.panel === "empty" ? "Review data" : "View model evidence" };
  }
  if (stage === "experiments") {
    return { href: "/campaign/plan", label: "Review batch" };
  }
  return { href: "/campaign/learn", label: "View model evidence" };
}

export function StagePanel({
  model,
  stage,
  campaign,
  onRetry,
  busy,
}: {
  model: CampaignOverview;
  stage: OverviewStage;
  campaign: ActiveCampaign | null;
  onRetry: () => void;
  busy: boolean;
}) {
  const action = actionFor(model, stage);
  return (
    <div className="mt-8 flex flex-col">
      <div className="flex flex-col gap-1">
        <h2 className="text-overview-heading text-overview-fg">{OVERVIEW_STAGE_LABEL[stage]}</h2>
        <p className="text-caption text-overview-fg-muted">
          {model.round.display == null ? "Round" : `Round ${model.round.display}`}
          {" · "}
          {model.versions.dataset ?? "Dataset unavailable"}
        </p>
      </div>
      <StageBody model={model} stage={stage} campaign={campaign} onRetry={onRetry} busy={busy} />
      <NextAction {...action} />
    </div>
  );
}

function StageBody({
  model,
  stage,
  campaign,
  onRetry,
  busy,
}: {
  model: CampaignOverview;
  stage: OverviewStage;
  campaign: ActiveCampaign | null;
  onRetry: () => void;
  busy: boolean;
}) {
  if (stage === "conditions") return <Conditions model={model} onRetry={onRetry} busy={busy} />;
  if (stage === "results") return <Results model={model} campaign={campaign} onRetry={onRetry} busy={busy} />;
  if (stage === "learning") return <Learning model={model} onRetry={onRetry} busy={busy} />;
  if (stage === "experiments") return <Experiments model={model} onRetry={onRetry} busy={busy} />;
  return <Promotion model={model} onRetry={onRetry} busy={busy} />;
}

function Conditions({ model, onRetry, busy }: { model: CampaignOverview; onRetry: () => void; busy: boolean }) {
  if (model.conditions.panel === "loading") return <LoadingSkeleton rows={4} label="Loading conditions" />;
  if (model.conditions.panel === "error") {
    return <ErrorState title="Couldn't load conditions" description="Couldn't load conditions. Your data is unchanged." onRetry={onRetry} busy={busy} retryLabel="Retry" />;
  }
  if (model.conditions.panel === "empty") {
    return <p className="text-body text-overview-fg">Define the campaign. No factors, bounds, or control are invented here.</p>;
  }
  return (
    <div className="flex flex-col gap-3 text-body">
      <p>
        Outcome {model.objective.label ?? "not reported"}
        {model.objective.unit ? ` (${model.objective.unit})` : ". Unit not reported"}
        . Direction not reported.
      </p>
      {model.conditions.blockedReason ? <p>{model.conditions.blockedReason}</p> : null}
      {model.conditions.factors.length ? (
        <ul className="flex flex-col gap-1">
          {model.conditions.factors.map((factor) => (
            <li key={factor.name}>
              <span className="font-mono">{factor.name}</span>
              {factor.searchRange ? (
                <span className="text-overview-fg-muted"> search range {formatNumber(factor.searchRange[0])} to {formatNumber(factor.searchRange[1])}</span>
              ) : (
                <span className="text-overview-fg-muted"> bounds not reported</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Factors not reported.</p>
      )}
      <p>Held-fixed values are not a field on the campaign response.</p>
      <p>{model.conditions.validationStatus ? `Column-role validation ${model.conditions.validationStatus.replaceAll("_", " ")}.` : "Column roles not reported."}</p>
      <p>Missing: {model.conditions.missing.join(", ")}.</p>
    </div>
  );
}

function Results({ model, campaign, onRetry, busy }: { model: CampaignOverview; campaign: ActiveCampaign | null; onRetry: () => void; busy: boolean }) {
  if (model.results.panel === "loading") return <LoadingSkeleton variant="table" label="Loading results" />;
  if (model.results.panel === "error") {
    return <ErrorState title="Couldn't load runs" description="Couldn't load runs. Your data is unchanged." onRetry={onRetry} busy={busy} retryLabel="Retry" />;
  }
  if (model.results.panel === "empty") return <p className="text-body">No measured results yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 text-body">
        {model.results.awaiting.map((run) => (
          <li key={run.id} className="flex max-w-[360px] items-baseline justify-between gap-4 py-2">
            <span className="font-mono">{run.id}</span>
            <span className="text-overview-fg-muted">○ Pending</span>
          </li>
        ))}
        {model.results.measured.map((run) => (
          <li key={run.id} className="flex items-baseline gap-2">
            <MeasuredMark ink="neutral" className="self-center" />
            <span className="font-mono text-caption">{run.id}</span>
            <span className="font-mono tabular-nums">{formatNumber(run.result)}</span>
            <span className="text-overview-fg-muted">measured</span>
          </li>
        ))}
        {model.results.awaiting.length === 0 && model.results.measured.length === 0 ? <li>Run rows were not included in this response.</li> : null}
      </ul>
      {campaign ? <MeasuredTrend campaign={campaign} unit={model.objective.unit ?? ""} /> : null}
    </div>
  );
}

function Learning({ model, onRetry, busy }: { model: CampaignOverview; onRetry: () => void; busy: boolean }) {
  if (model.fit.panel === "loading") return <LoadingSkeleton rows={4} label="Loading model evidence" />;
  if (model.fit.panel === "error") {
    return (
      <ErrorState title="Couldn't load model evidence" description="Couldn't load model evidence. Your data is unchanged. This is not a failed model." onRetry={onRetry} busy={busy} retryLabel="Retry" />
    );
  }
  if (model.fit.panel === "empty") return <p className="text-body">No model fit yet.</p>;
  return (
    <div className="flex flex-col gap-2 text-body">
      {model.fit.blockedReason ? <p>{model.fit.blockedReason}</p> : null}
      {model.fit.workflowStale ? <p>This analysis is older than the campaign. It is not the current fit.</p> : null}
      <p>{model.ranking.label}. {model.ranking.reason}</p>
      <p>
        {model.ranking.rho == null ? "Rank correlation not reported." : `Held-out Spearman ${formatNumber(model.ranking.rho, "corr")}.`}{" "}
        {model.ranking.ci ? `95% CI ${formatNumber(model.ranking.ci[0], "corr")} to ${formatNumber(model.ranking.ci[1], "corr")}.` : "Interval not reported."}{" "}
        {model.ranking.groupCount == null ? "Group count not reported." : `${formatNumber(model.ranking.groupCount, "count")} groups.`}
      </p>
      <p>{model.interval.note}</p>
    </div>
  );
}

function Experiments({ model, onRetry, busy }: { model: CampaignOverview; onRetry: () => void; busy: boolean }) {
  if (model.proposals.panel === "loading") return <LoadingSkeleton rows={4} label="Loading the batch" />;
  if (model.proposals.panel === "error") {
    return <ErrorState title="Couldn't load the batch" description="Couldn't load the batch. Your data is unchanged." onRetry={onRetry} busy={busy} retryLabel="Retry" />;
  }
  if (model.proposals.panel === "empty") return <p className="text-body">No draft batch.</p>;
  return (
    <div className="flex flex-col gap-3 text-body">
      {model.proposals.blockedReason ? <p>{model.proposals.blockedReason}</p> : null}
      <p>
        {model.draft.proposals == null ? "Proposal count unavailable." : `${formatNumber(model.draft.proposals, "count")} proposals.`} Candidate and control counts are not separate fields. Nothing starts from this page.
      </p>
      <ul className="flex flex-col gap-1">
        {model.proposals.predicted.map((row) => (
          <li key={row.label}>
            {row.pred == null ? (
              <span>{row.label} prediction not reported. Not measured.</span>
            ) : (
              <PredictedValue ink="neutral" value={formatNumber(row.pred)} unit={model.objective.unit || undefined} label="predicted, not measured" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Promotion({ model, onRetry, busy }: { model: CampaignOverview; onRetry: () => void; busy: boolean }) {
  if (model.gates.panel === "loading") return <LoadingSkeleton rows={4} label="Loading promotion checks" />;
  if (model.gates.panel === "error") {
    return <ErrorState title="Couldn't load promotion checks" description="Couldn't load promotion checks. Your data is unchanged." onRetry={onRetry} busy={busy} retryLabel="Retry" />;
  }
  if (model.promotion.verdict === "not-evaluated") {
    return <p className="text-body">Promotion not evaluated. No checks is not approval, and it does not block starting experiments.</p>;
  }
  return (
    <div className="flex flex-col gap-2 text-body">
      <p>{model.promotion.verdict === "eligible" ? "Eligible" : "Not eligible"}. {model.promotion.detail}.</p>
      {model.promotion.line ? <p>{model.promotion.line}</p> : null}
      {model.promotion.meaning ? <p>{model.promotion.meaning}</p> : null}
      <p>Per-check thresholds, populations, and timestamps were not returned. A passed count is not inferred. Ranking reliability and permission to start stay separate.</p>
    </div>
  );
}
