import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BasisGlyph, Delta, Num, NumState, SourceButton } from "@/components/viz/num";
import { cvTopKNote, reliabilityVerdict, targetUnitOf, type PopulatedResult } from "@/lib/api";
import { formatCorr, formatValue } from "@/lib/num";
import { bestTile, historyLabel, newerBest, nextTile, runsTile } from "@/lib/overview";
import { sourceFromAnalysis, sourceFromCampaign } from "@/lib/source";
import { cn } from "@/lib/utils";
import { bandName, markInterval, rangeText } from "@/lib/viz-data/progress-chart";
import type { ActiveCampaign } from "@/lib/workbench";

/**
 * The Overview's hero tiles (VIZ_SPEC 6): best measured (the only text-metric
 * number on the page), the next batch's predicted range (text-title, with the
 * engine's coverage), model reliability (verdict, rho with its CI, the
 * engine's floor) and run counts. Every tile has a source; whatever the
 * engine did not send reads n/a, never 0.
 */
export function EvidenceRow({
  campaign,
  analysis,
  analysisFailed,
  predictHref,
}: {
  campaign: ActiveCampaign | null;
  analysis: PopulatedResult | null;
  /** The analysis request failed (a connection problem, not a verdict). */
  analysisFailed: boolean;
  predictHref: string;
}) {
  // The engine's target_unit (setup, then header); a campaign without an analysis falls back to its header.
  const unit = analysis ? targetUnitOf(analysis) : campaign ? targetUnitOf({ target: campaign.target }) : null;
  return (
    <section aria-label="Evidence" className="grid rounded-xl border border-border bg-surface sm:grid-cols-2 lg:grid-cols-4">
      <Tile className="border-border max-lg:border-b sm:border-r">
        <BestTileView campaign={campaign} analysis={analysis} unit={unit} />
      </Tile>
      <Tile className="border-border max-lg:border-b lg:border-r">
        <NextTileView campaign={campaign} analysis={analysis} failed={analysisFailed} unit={unit} href={predictHref} />
      </Tile>
      <Tile className="border-border max-sm:border-b sm:border-r">
        <ReliabilityTile analysis={analysis} failed={analysisFailed} />
      </Tile>
      <Tile>
        <RunsTileView campaign={campaign} />
      </Tile>
    </section>
  );
}

function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-col gap-1.5 p-panel", className)}>{children}</div>;
}

function TileHead({ children, source }: { children: ReactNode; source?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-label text-fg-muted">{children}</p>
      {source}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function BestTileView({ campaign, analysis, unit }: { campaign: ActiveCampaign | null; analysis: PopulatedResult | null; unit: string | null }) {
  if (!campaign) {
    return (
      <>
        <TileHead>Best measured</TileHead>
        <NumState state={{ kind: "na", reason: "no run sheet yet" }} className="text-title" />
      </>
    );
  }
  const t = bestTile(campaign, analysis);
  const newer = newerBest(campaign);
  const field = t.single != null ? "noise.best_reproducible" : "campaign.best";
  const source = t.single != null && analysis ? sourceFromAnalysis(analysis, field, "measured") : sourceFromCampaign(field, "measured");
  const f = formatValue(t.value, { unit, basis: "measured" });
  return (
    <>
      <TileHead source={t.value != null ? <SourceButton source={source} full={f.full} /> : null}>
        <BasisGlyph basis="measured" />
        {cap(t.label)}
      </TileHead>
      {t.value != null ? <Num value={t.value} basis="measured" unit={unit} size="metric" glyph={false} /> : <NumState state={{ kind: "na", reason: "no measured best reported yet" }} className="text-title" />}
      {t.delta ? <Delta current={t.delta.current} baseline={t.delta.baseline} unit={unit} baselineLabel={t.delta.baselineLabel} /> : null}
      {t.single != null ? (
        <p className="text-caption text-fg-muted tabular-nums">
          Best single run {formatValue(t.single, { unit, basis: "measured" }).text}
        </p>
      ) : null}
      <p className="text-caption text-fg-muted">
        {t.value == null
          ? "No measured best reported yet."
          : t.reached
            ? t.reached.round === 0
              ? `From the uploaded sheet, ${formatValue(t.reached.runs, { quantity: "count" }).text} measured rows.`
              : `${historyLabel(t.reached.round)}, ${formatValue(t.reached.runs, { quantity: "count" }).text} measured rows in the model.`
            : `${formatValue(campaign.n_base, { quantity: "count" }).text} measured rows in the model.`}
      </p>
      {newer ? (
        <p className="text-caption text-fg-muted">
          Higher result recorded this round, not in the model until the next re-analysis:{" "}
          <Num value={newer.value} basis="measured" unit={unit} size="body" glyph={false} /> (run {newer.runId.slice(0, 7)})
        </p>
      ) : null}
    </>
  );
}

function NextTileView({
  campaign,
  analysis,
  failed,
  unit,
  href,
}: {
  campaign: ActiveCampaign | null;
  analysis: PopulatedResult | null;
  failed: boolean;
  unit: string | null;
  href: string;
}) {
  const t = campaign ? nextTile(campaign, analysis) : ({ kind: "none", reason: "No runs until the campaign has a run sheet." } as const);
  if (t.kind === "none") {
    return (
      <>
        <TileHead>
          <BasisGlyph basis="predicted" />
          Next batch, predicted
        </TileHead>
        <NumState state={{ kind: "na" }} className="text-title" />
        <p className="text-caption text-fg-muted">{failed && !analysis ? "Could not load the analysis. This is a connection problem, not a result." : t.reason}</p>
      </>
    );
  }
  const source = analysis ? sourceFromAnalysis(analysis, t.kind === "proposed" ? "proposals[].pred ± conformal_q" : "campaign.pending[].pred ± conformal_q", "predicted", bandName(t.coverage)) : null;
  const topInterval = markInterval(t.top.lo, t.top.hi, t.coverage);
  const top = formatValue(t.top.pred, { unit, interval: topInterval, basis: "predicted" });
  return (
    <>
      <TileHead source={source ? <SourceButton source={source} /> : null}>
        <BasisGlyph basis="predicted" />
        {t.kind === "proposed" ? "Next batch, predicted" : "This round's batch, predicted"}
      </TileHead>
      <p className="text-title font-normal text-fg tabular-nums">{rangeText(t.lo, t.hi, unit, t.halfWidth)}</p>
      <p className="text-caption text-fg-muted tabular-nums">
        {t.withIntervals ? `Across the ${t.n} ${t.n === 1 ? "recipe's" : "recipes'"} ${bandName(t.coverage)}s` : `Across ${t.n} predictions, no interval reported`}
      </p>
      <p className="text-caption text-fg-muted tabular-nums">Top pick {top.text}</p>
      <p className="text-caption text-fg-muted">
        {t.kind === "proposed" ? "Proposed, not run." : "Started, awaiting the lab."}
        {t.stale ? " From the previous analysis." : ""}
      </p>
      <Link href={href} className="mt-auto inline-flex w-fit items-center gap-1 pt-1 text-label text-accent hover:underline">
        {t.kind === "proposed" ? "Review on Predict" : "See it on Predict"}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </>
  );
}

function ReliabilityTile({ analysis, failed }: { analysis: PopulatedResult | null; failed: boolean }) {
  const verdict = analysis ? reliabilityVerdict(analysis) : null;
  const tone = verdict?.state === "reliable" ? "good" : verdict?.state === "not-yet" ? "warn" : "neutral";
  const rho = verdict ? formatCorr(verdict.rho, verdict.ci) : null;
  const source = analysis ? sourceFromAnalysis(analysis, "reliability.spearman", "derived", "grouped cross-validation, Spearman rank correlation") : null;
  return (
    <>
      <TileHead source={source ? <SourceButton source={source} full={rho?.full} /> : null}>
        <BasisGlyph basis="derived" />
        Model reliability
      </TileHead>
      {verdict ? (
        <p>
          <Badge tone={tone}>{verdict.label}</Badge>
        </p>
      ) : (
        <NumState state={{ kind: "na" }} className="text-title" />
      )}
      {verdict && rho ? (
        rho.state === "value" ? (
          <p className="text-body text-fg tabular-nums">
            <span className="font-medium">ρ {rho.value}</span>
            {rho.interval ? <span className="text-caption text-fg-muted"> {rho.interval} {rho.coverage} CI</span> : <span className="text-caption text-fg-muted"> no interval reported</span>}
          </p>
        ) : (
          <NumState state={{ kind: "not-scored", reason: verdict.reason }} className="text-caption" />
        )
      ) : null}
      <p className="text-caption text-fg-muted">
        {failed && !analysis
          ? "Could not load the analysis. This is a connection problem, not a verdict."
          : !verdict
            ? "Appears after the first analysis."
            : verdict.rho == null
              ? "Rank agreement on held-out runs could not be measured."
              : `Rank agreement on held-out runs; trust floor ${verdict.floor != null ? formatValue(verdict.floor, { quantity: "corr" }).text : "n/a"}.`}
      </p>
      {analysis?.cv_topk ? (
        <p className="text-caption text-fg-muted tabular-nums">
          Top-k caught: <span className="text-fg">{cvTopKNote(analysis.cv_topk)}</span>
        </p>
      ) : null}
      {analysis?.promotion ? <p className="text-caption text-fg-muted">Promotion check {analysis.promotion.passed ? "passed" : "not passed"} (reported, not enforced).</p> : null}
    </>
  );
}

function RunsTileView({ campaign }: { campaign: ActiveCampaign | null }) {
  const t = runsTile(campaign);
  const count = (v: number | null) => formatValue(v, { quantity: "count" }).text;
  return (
    <>
      <TileHead source={campaign ? <SourceButton source={sourceFromCampaign("campaign.n_base, n_measured, n_awaiting, history[0].n_base", "measured")} /> : null}>
        <BasisGlyph basis="measured" />
        Runs
      </TileHead>
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-title font-semibold text-fg">{count(t.inModel)}</span>
        <span className="text-body text-fg-muted">measured in the model</span>
      </p>
      <ul className="flex flex-col gap-0.5 text-caption text-fg-muted tabular-nums">
        <li>
          <span className="text-fg">{count(t.recorded)}</span> recorded this round, not in the model yet
        </li>
        <li>
          <span className="text-fg">{count(t.awaiting)}</span> awaiting a result
        </li>
        <li>
          <span className="text-fg">{count(t.fromUpload)}</span> from the uploaded sheet
        </li>
      </ul>
    </>
  );
}
