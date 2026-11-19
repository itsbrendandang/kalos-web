import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { MeasuredMark, MeasuredValue } from "@/components/campaign/plan/marks";
import { Badge } from "@/components/ui/badge";
import { reliabilityVerdict, type PopulatedResult } from "@/lib/api";
import { bestDeltaFromPreviousRound } from "@/lib/campaign-stage";
import { formatNumber, formatRange } from "@/lib/format";
import { bestReached, historyLabel, newerBest } from "@/lib/overview";
import { cn } from "@/lib/utils";
import type { ActiveCampaign } from "@/lib/workbench";

/**
 * The Overview's three pieces of evidence, side by side with hairline rules:
 * the measured best so far, where this round's runs stand, and whether the
 * model can be trusted. Every number comes from the campaign summary or the
 * analysis; whatever the engine did not send reads n/a.
 */
export function EvidenceRow({
  campaign,
  analysis,
  analysisFailed,
  unit,
  predictHref,
}: {
  campaign: ActiveCampaign | null;
  analysis: PopulatedResult | null;
  /** The analysis request failed (a connection problem, not a verdict). */
  analysisFailed: boolean;
  unit: string;
  predictHref: string;
}) {
  return (
    <section aria-label="Evidence" className="grid rounded-xl border border-border bg-surface md:grid-cols-3">
      <Cell className="border-border max-md:border-b md:border-r">
        <BestCell campaign={campaign} unit={unit} />
      </Cell>
      <Cell className="border-border max-md:border-b md:border-r">
        <RunsCell campaign={campaign} />
      </Cell>
      <Cell>
        <ReliabilityCell analysis={analysis} failed={analysisFailed} href={predictHref} />
      </Cell>
    </section>
  );
}

function Cell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-col gap-1 p-panel", className)}>{children}</div>;
}

function Big({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-metric text-fg tabular-nums">{children}</span>
      {unit ? <span className="text-body text-fg-muted">{unit}</span> : null}
    </p>
  );
}

function BestCell({ campaign, unit }: { campaign: ActiveCampaign | null; unit: string }) {
  const best = campaign?.best ?? null;
  const reached = campaign ? bestReached(campaign) : null;
  const delta = campaign ? bestDeltaFromPreviousRound(campaign) : null;
  const newer = campaign ? newerBest(campaign) : null;
  return (
    <>
      <p className="flex items-center gap-1.5 text-label text-fg-muted">
        <MeasuredMark />
        Best {campaign?.target ?? "result"} {newer ? "in the model" : "so far"}, measured
      </p>
      <Big unit={best != null ? unit : undefined}>{formatNumber(best)}</Big>
      <p className="text-caption text-fg-muted">
        {best == null
          ? "No measured best reported yet."
          : reached
            ? reached.round === 0
              ? `From the uploaded sheet, best of ${formatNumber(reached.runs, "count")} measured runs.`
              : `Reached after ${historyLabel(reached.round).toLowerCase()}'s results, with ${formatNumber(reached.runs, "count")} measured runs in the model.`
            : `Best of ${formatNumber(campaign?.n_base, "count")} measured runs.`}
      </p>
      {delta ? (
        <p className="text-caption text-fg-muted">
          <span className="text-fg tabular-nums">{formatNumber(delta.delta, "value", { sign: true })}</span>
          {unit ? ` ${unit}` : ""} {delta.previousRound === 0 ? "vs the uploaded sheet" : `vs round ${delta.previousRound}`}, measured
        </p>
      ) : null}
      {newer ? (
        <p className="mt-1 text-caption text-fg-muted">
          Higher result recorded this round, not in the model until the next re-analysis:{" "}
          <MeasuredValue value={formatNumber(newer.value)} unit={unit || undefined} className="text-label" />
        </p>
      ) : null}
    </>
  );
}

function RunsCell({ campaign }: { campaign: ActiveCampaign | null }) {
  if (!campaign) {
    return (
      <>
        <p className="text-label text-fg-muted">Results this round</p>
        <Big>n/a</Big>
        <p className="text-caption text-fg-muted">No runs until the campaign has a run sheet.</p>
      </>
    );
  }
  const awaiting = campaign.n_awaiting;
  const recorded = campaign.n_measured;
  const started = awaiting + recorded;
  return (
    <>
      <p className="text-label text-fg-muted">Results this round</p>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-metric text-fg tabular-nums">{formatNumber(recorded, "count")}</span>
        <span className="text-body text-fg-muted">
          {started === 0 ? "runs started" : `of ${formatNumber(started, "count")} recorded`}
        </span>
      </p>
      <p className="text-caption text-fg-muted">
        {started === 0
          ? "Start the proposed batch on Predict; each run then waits here for its measured result."
          : `${formatNumber(awaiting, "count")} awaiting a measured result from the lab.`}{" "}
        {formatNumber(campaign.n_base, "count")} measured runs are in the model.
      </p>
    </>
  );
}

function ReliabilityCell({ analysis, failed, href }: { analysis: PopulatedResult | null; failed: boolean; href: string }) {
  const verdict = analysis ? reliabilityVerdict(analysis) : null;
  const tone = verdict?.state === "reliable" ? "good" : verdict?.state === "not-yet" ? "warn" : "neutral";
  const promotion = analysis?.promotion;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-fg-muted">Model reliability</p>
        {verdict ? <Badge tone={tone}>{verdict.label}</Badge> : null}
      </div>
      <Big>{formatNumber(verdict?.rho, "corr")}</Big>
      <p className="text-caption text-fg-muted">
        {failed && !analysis
          ? "Could not load the analysis. This is a connection problem, not a verdict."
          : !verdict
            ? "Appears after the first analysis."
            : verdict.rho == null
              ? verdict.reason
              : `Rank agreement on held-out runs${verdict.ci ? `, 95% CI ${formatRange(verdict.ci[0], verdict.ci[1], "corr")}` : ", no interval reported"}${verdict.floor != null ? `; trust floor ${formatNumber(verdict.floor, "corr")}` : ""}.`}
      </p>
      {promotion ? (
        <p className="text-caption text-fg-muted">
          Promotion check {promotion.passed ? "passed" : "not passed"} (reported, not enforced).
        </p>
      ) : null}
      {analysis ? (
        <Link href={href} className="mt-1 inline-flex w-fit items-center gap-1 text-label text-accent hover:underline">
          See the evidence on Predict
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </>
  );
}
