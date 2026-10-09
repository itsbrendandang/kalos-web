"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, FlaskConical, RefreshCw, SlidersHorizontal, Upload } from "lucide-react";
import {
  coveragePct,
  driverSelectionNote,
  getCampaign,
  getLatest,
  isReliable,
  logResult,
  proposalIncumbent,
  reanalyze,
  startRuns,
  type Campaign,
  type CampaignRun,
  type LatestResult,
  type PopulatedResult,
  type Proposal,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/honest-state";
import { PageHeader, Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { CampaignProgress } from "@/components/dashboard/campaign-progress";
import { AnalysisDiagnostics } from "@/components/dashboard/analysis-diagnostics";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel, ModelCoverage } from "@/components/dashboard/reliability-panel";
import { PromotionPanel } from "@/components/dashboard/promotion-panel";
import { EvaluationChecks } from "@/components/dashboard/evaluation-checks";
import { ProposalDisclosures } from "@/components/dashboard/proposal-disclosures";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { RunLandscape } from "@/components/dashboard/run-landscape";
import { ResponseSurface } from "@/components/dashboard/response-surface";
import { ScaleUpTimeline } from "@/components/scale-up-timeline";
import { cn, num, parseUnit } from "@/lib/utils";

/**
 * Decision-first landing (prototype). The scientist's job is "what do I run
 * next, and can I trust it" - so the recommended batch is the hero, the trust
 * verdict is a compact chip beside it, and every diagnostic (drivers,
 * reliability detail, run structure) collapses behind a disclosure. Same real
 * engine data as /results (getLatest -> /api/latest); this only reorders the
 * priority so the decision reads first and the analysis supports it.
 */
export default function Decide() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function refresh() {
    setBusy(true);
    setErr(false);
    try {
      const [d, c] = await Promise.all([getLatest(), getCampaign()]);
      setData(d);
      setCampaign(c);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([getLatest(), getCampaign()])
      .then(([d, c]) => {
        if (cancelled) return;
        setData(d);
        setCampaign(c);
      })
      .catch(() => !cancelled && setErr(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Campaign"
        title="Next batch to run"
        desc="The engine's recommended experiments, ranked by expected improvement against uncertainty. Reliability and the model detail sit below - act first, verify on demand."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} disabled={busy}>
              <RefreshCw />
              {busy ? "..." : "Refresh"}
            </Button>
            <Link href="/analyze" className={buttonVariants()}>
              <Upload />
              New run sheet
            </Link>
          </div>
        }
      />

      {err && data ? (
        <Alert variant="default" className="items-start gap-2.5 border-amber/30 bg-amber-soft px-3.5 py-3">
          <AlertDescription className="text-[13px] text-amber">
            Refresh failed. Showing the last loaded analysis.
          </AlertDescription>
        </Alert>
      ) : null}

      {err && data == null ? (
        <ServiceUnavailable onRetry={refresh} busy={busy} />
      ) : data == null ? (
        <Loading />
      ) : !data.has_data ? (
        <EmptyState
          title="No analysis yet"
          description={
            <>
              <Link href="/analyze" className="font-semibold text-accent-text underline">
                Upload a run sheet
              </Link>{" "}
              to get a recommended batch.
            </>
          }
        />
      ) : (
        <DecideBody
          key={JSON.stringify([data.campaign_generation, data.dataset, data.updated])}
          d={data}
          campaign={campaign}
          onStarted={setCampaign}
          onReanalyzed={(analysis, c) => {
            setData(analysis);
            setCampaign(c);
          }}
        />
      )}
    </div>
  );
}

/** The active (has-data) campaign shape - what the panel and re-propose action need. */
type ActiveCampaign = Extract<Campaign, { has_campaign: true }>;

function DecideBody({
  d,
  campaign,
  onStarted,
  onReanalyzed,
}: {
  d: PopulatedResult;
  campaign: Campaign | null;
  onStarted: (c: Campaign) => void;
  onReanalyzed: (analysis: PopulatedResult, campaign: Campaign) => void;
}) {
  const [queued, setQueued] = useState<Set<number>>(new Set());
  const [startBusy, setStartBusy] = useState(false);
  const [startErr, setStartErr] = useState(false);
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const [reanalyzeErr, setReanalyzeErr] = useState(false);
  const reliable = isReliable(d);
  const unit = parseUnit(d.target);
  const targetName = d.target.replace(/\s*\([^)]*\)\s*$/, "");
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;
  const active: ActiveCampaign | null = campaign?.has_campaign ? campaign : null;
  const hasPredicted = Boolean(d.response_surface || d.correlation);
  const incumbent = proposalIncumbent(d);

  function toggle(i: number) {
    setQueued((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleStart() {
    const recipes = [...queued].map((i) => {
      const p = d.proposals[i];
      return {
        recipe: Object.fromEntries(d.proposal_features.map((f, fi) => [f, p.vals[fi]])),
        pred: p.pred,
        std: p.std,
        mode: p.mode,
        reason: p.reason,
      };
    });
    setStartBusy(true);
    setStartErr(false);
    try {
      await startRuns(recipes);
      onStarted(await getCampaign());
      setQueued(new Set());
    } catch {
      setStartErr(true);
    } finally {
      setStartBusy(false);
    }
  }

  async function handleLogResult(id: string, value: number) {
    await logResult(id, value);
    onStarted(await getCampaign());
  }

  async function handleReanalyze() {
    setReanalyzeBusy(true);
    setReanalyzeErr(false);
    try {
      const { analysis, campaign: c } = await reanalyze();
      onReanalyzed(analysis, c);
      setQueued(new Set());
    } catch {
      setReanalyzeErr(true);
    } finally {
      setReanalyzeBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Campaign strip: target, best-so-far, evidence, and the trust chip */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Optimizing" value={targetName} sub={`maximize${unit ? ` (${unit})` : ""}`} />
        <Stat label="Best so far" value={num(active?.best ?? d.best, 2)} sub={`across ${d.n} runs`} mono />
        {active ? (
          <Stat
            label="Round"
            value={String(active.round)}
            sub={`${active.n_awaiting} awaiting result${active.n_awaiting === 1 ? "" : "s"}`}
            mono
          />
        ) : null}
        <Stat label="Batch ready" value={String(d.proposals.length)} sub="recommended runs" mono />
        <div className="ml-auto">
          <TrustChip reliable={reliable} spearman={d.reliability?.spearman ?? d.cv_spearman} />
        </div>
      </Card>

      {/* Honest lead: what this batch actually buys you, before the recipes. */}
      <HonestVerdict d={d} best={incumbent} band={d.conformal_q ?? null} unit={unit} />

      {/* HERO: the recommended batch */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold text-fg">Recommended experiments</h2>
          <span className="text-[12px] text-muted">
            predicted {targetName}
            {d.conformal_q != null
              ? ` · ± ${num(d.conformal_q, 2)} conformal band${coveragePct(d.conformal_coverage) ? ` (${coveragePct(d.conformal_coverage)})` : ""}`
              : ""}
          </span>
        </div>
        <ProposalDisclosures d={d} />
        <p className="mb-3 text-[12px] text-muted">
          {incumbent == null
            ? "Comparison unavailable — the engine did not report a reproducible incumbent for this replicate-aware fit."
            : `Compared with ${d.noise?.replicate_aware ? "best reproducible recipe" : "best measured run"}: ${num(incumbent, 2)}.`}
        </p>
        {d.proposals.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.proposals.map((p, i) => (
              <ProposalCard
                key={i}
                rank={i + 1}
                p={p}
                features={d.proposal_features}
                unit={unit}
                best={incumbent}
                band={d.conformal_q ?? null}
                queued={queued.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="No proposals"
            description="This analysis did not return any recommended recipes."
          />
        )}
        {queued.size > 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-[10px] border border-accent/40 bg-blue-tint px-4 py-2.5 text-[13px]">
            <span className="text-fg">
              <span className="font-semibold">{queued.size}</span> run{queued.size > 1 ? "s" : ""} queued for this
              cycle.
            </span>
            <Button onClick={handleStart} disabled={startBusy}>
              <FlaskConical />
              {startBusy ? "Starting..." : `Start ${queued.size} run${queued.size > 1 ? "s" : ""}`}
            </Button>
          </div>
        ) : null}
        {startErr ? <p className="mt-2 text-[12px] text-amber">Couldn&apos;t start those runs. Try again.</p> : null}
      </section>

      {/* Active campaign: the recipes started this round, and the loop's close */}
      {active && active.pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="mb-1 flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold text-fg">In progress this round</h2>
            <span className="text-[12px] text-muted">
              {active.n_awaiting} awaiting result{active.n_awaiting === 1 ? "" : "s"} · {active.n_measured} measured
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {active.pending.map((run) => (
              <PendingRunRow key={run.id} run={run} features={d.proposal_features} unit={unit} onLogResult={handleLogResult} />
            ))}
          </div>
          <div className="flex items-center justify-between rounded-[10px] border border-accent/40 bg-blue-tint px-4 py-2.5 text-[13px]">
            <span className="text-fg">
              <span className="font-semibold">{active.n_measured}</span> result{active.n_measured === 1 ? "" : "s"} logged
              this round.
            </span>
            <Button onClick={handleReanalyze} disabled={reanalyzeBusy || active.n_measured === 0}>
              <RefreshCw />
              {reanalyzeBusy ? "Re-analyzing..." : `Re-propose with ${active.n_measured} result${active.n_measured === 1 ? "" : "s"}`}
            </Button>
          </div>
          {reanalyzeErr ? <p className="text-[12px] text-amber">Re-analysis failed. Try again.</p> : null}
        </section>
      ) : null}

      {/* Optimization progress: measured best-so-far by round, not a prediction */}
      {active ? (
        <CampaignProgress campaign={active} />
      ) : null}

      {/* Scale-up projection: demoted behind a disclosure and labelled as NOT
          from the client's data - it is physics/literature priors, so it must
          not sit in the decision hero pretending to be a result. */}
      {d.proposals.length ? (
        <Details summary="Projected scale-up - physics priors, not from your data">
          <ScaleUpTimeline
            bestRecipe={Object.fromEntries(d.proposal_features.map((f, i) => [f, d.proposals[0].vals[i]]))}
            bestValue={active?.best ?? d.best}
            targetName={targetName}
            unit={unit}
          />
        </Details>
      ) : null}

      {/* Supporting analysis: collapsed by default, lazy-mounted on first open */}
      <Details summary="Process drivers - what correlates with the target">
        <Card className="flex flex-col">
          <p className="text-[12px] leading-snug text-muted">
            Signed correlation of each input with {targetName}, held out across recipe groups - an association, not a
            proven cause. Colored bars are statistically significant (95% CI excludes zero and survive multiple-testing
            correction); gray bars are not.
          </p>
          {driverSelectionNote(d.driver_selection) ? (
            <p className="mt-1 text-[12px] leading-snug text-muted">{driverSelectionNote(d.driver_selection)}</p>
          ) : null}
          {d.drivers.length ? (
            <>
              <div className="mt-3">
                <DriversTornado drivers={d.drivers} target={d.target} />
              </div>
              <DriverInsights
                target={d.target}
                drivers={d.drivers}
                n={d.n}
                nonProducers={nonProducers}
                provenance={d.provenance}
                proposals={d.proposals}
                proposalFeatures={d.proposal_features}
                clearsFloor={d.reliability?.clears_floor ?? null}
              />
            </>
          ) : (
            <EmptyState
              icon={SlidersHorizontal}
              title="No drivers yet"
              description="This analysis did not return any input/target correlations to show."
            />
          )}
        </Card>
      </Details>

      <Details summary="Model reliability - how far to trust it">
        <PromotionPanel d={d} />
        <ReliabilityPanel d={d} />
        <ModelCoverage d={d} />
        <EvaluationChecks d={d} />
        <AnalysisDiagnostics d={d} />
      </Details>

      <Details summary="Run structure - where the measured runs sit">
        {d.embedding ? (
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.85fr_0.95fr]">
            <RunLandscape d={d} />
            <TargetDistribution d={d} />
          </div>
        ) : (
          <TargetDistribution d={d} />
        )}
      </Details>

      {hasPredicted ? (
        <Details summary="Predicted landscape - response surface & feature correlation">
          {d.response_surface && d.correlation ? (
            <div className="grid items-stretch gap-4 lg:grid-cols-[1.85fr_0.95fr]">
              <ResponseSurface d={d} />
              <CorrelationHeatmap d={d} />
            </div>
          ) : (
            <>
              <ResponseSurface d={d} />
              <CorrelationHeatmap d={d} />
            </>
          )}
        </Details>
      ) : null}

      {/* Coming next: PLACEHOLDER - text only, no numbers, no chart shapes, no skeletons */}
      <Details summary="Coming next">
        <ul className="flex flex-col gap-1.5 px-3 py-2 text-[12px] text-muted">
          <li>Live batch curves - awaiting bioreactor telemetry</li>
          <li>Digital twin - live process model</li>
          <li>Scientific alerts - live sensors</li>
          <li>Cost &amp; ROI - cost feed</li>
        </ul>
      </Details>
    </div>
  );
}

function Stat({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className={cn("mt-0.5 text-[20px] font-semibold text-fg", mono && "tabular font-mono")}>{value}</div>
      {sub ? <div className="text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

function TrustChip({ reliable, spearman }: { reliable: boolean; spearman: number | null }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium",
        reliable ? "border-green-soft bg-green-soft text-green" : "border-amber-soft bg-amber-soft text-amber",
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", reliable ? "bg-green" : "bg-amber")} />
      {reliable ? "Reliable - safe to optimize" : "Exploring - gathering signal"}
      {spearman != null ? (
        <Tooltip>
          <TooltipTrigger className="tabular font-mono opacity-70 focus-visible:outline-none">
            · ρ {spearman.toFixed(2)}
          </TooltipTrigger>
          <TooltipContent>Held-out rank agreement (Spearman correlation between predicted and measured order).</TooltipContent>
        </Tooltip>
      ) : null}
    </Badge>
  );
}

/** The elevated, honest lead for /decide: what this batch actually buys you,
 * stated against the incumbent and the model's real confidence - not a
 * confident-looking ranked list papering over wide uncertainty. */
function HonestVerdict({
  d,
  best,
  band,
  unit,
}: {
  d: PopulatedResult;
  best: number | null;
  band: number | null;
  unit: string;
}) {
  const rel = d.reliability;
  const props = d.proposals;
  if (!props.length) return null;
  if (best == null) return (
    <div className="rounded-2xl border-l-4 border-l-border bg-bg p-4 text-[13px] text-muted">
      Comparison unavailable — no reproducible incumbent reported for this replicate-aware fit. Predictions remain available below.
    </div>
  );
  const beats = props.filter((p) => p.pred - (band ?? p.std) >= best).length;
  // The SAME isReliable() predicate the TrustChip pill uses (lib/api.ts) - never
  // re-derive trustworthiness locally, or this verdict can disagree with the pill
  // shown right above it.
  const reliable = isReliable(d);
  const rho = rel?.spearman ?? d.cv_spearman;
  const good = reliable && beats > 0;
  const bestStr = `${num(best, 2)}${unit ? ` ${unit}` : ""}`;
  return (
    <div
      className={cn(
        "rounded-2xl border-l-4 p-4 text-[13px] leading-relaxed",
        good ? "border-l-green bg-green-soft text-green" : "border-l-amber bg-amber-soft text-amber",
      )}
    >
      <p className="font-semibold">
        {beats > 0
          ? `${beats} of ${props.length} recipes are predicted to beat your current best of ${bestStr}.`
          : `None of these ${props.length} recipes clearly beats your current best of ${bestStr} - this batch is exploration, not a confident bet.`}
      </p>
      <p className="mt-1 opacity-90">
        {reliable
          ? `The model ranks recipes with ${rho != null ? `ρ ${rho.toFixed(2)}` : "moderate"} agreement - a genuine head start over guessing. But the ± bands are wide, so read the order as a guide, not a guarantee.`
          : `Rank agreement is ${rho != null ? rho.toFixed(2) : "low"}${rel ? ` (below the ${rel.spearman_floor.toFixed(2)} floor)` : ""} and the ± bands are wide. On data this noisy, undirected search is competitive - running these earns the model confidence; expect a modest head start, not certainty.`}
      </p>
      {rel?.unmodeled?.length ? (
        <p className="mt-1.5 text-[12px] opacity-75">
          The engine does not model {rel.unmodeled.join(" · ")} - use your own judgment there.
        </p>
      ) : null}
    </div>
  );
}

/** The honest, per-recipe read against the incumbent, using the conformal band:
 * only if the whole band sits above the current best is it "likely" better;
 * if it sits below, the recipe is predicted worse; otherwise it's a coin-flip
 * the model can't call. This is what stops five wide-banded predictions from
 * reading as a confident ranked list. */
function recipeVerdict(pred: number, band: number, best: number | null) {
  if (best == null) return { label: "comparison unavailable", tone: "neutral" as const };
  if (pred - band >= best) return { label: "likely beats best", tone: "good" as const };
  if (pred + band <= best) return { label: "below current best", tone: "weak" as const };
  return { label: "coin-flip vs best", tone: "neutral" as const };
}

function ProposalCard({
  rank,
  p,
  features,
  unit,
  best,
  band,
  queued,
  onToggle,
}: {
  rank: number;
  p: Proposal;
  features: string[];
  unit: string;
  best: number | null;
  band: number | null;
  queued: boolean;
  onToggle: () => void;
}) {
  const bandV = band ?? p.std;
  const delta = best == null ? null : p.pred - best;
  const v = recipeVerdict(p.pred, bandV, best);
  const toneClass =
    v.tone === "good" ? "bg-green-soft text-green" : v.tone === "weak" ? "bg-amber-soft text-amber" : "bg-bg text-muted";
  return (
    <Card className={cn("flex flex-col gap-3 transition-colors", queued && "bg-blue-tint")}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-bg font-mono text-[11px] font-semibold text-accent-text">
          {rank}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "h-auto rounded-lg border-transparent px-2 py-0.5 text-[11px] font-medium",
            p.mode === "exploit" ? "bg-green-soft text-green" : "bg-explore-soft text-explore-deep",
          )}
        >
          {p.mode === "exploit" ? "best bet" : "exploration"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {features.map((f, i) => (
          <div key={f}>
            <div className="text-[10px] tracking-wider text-muted uppercase">{f}</div>
            <div className="tabular font-mono text-[17px] font-semibold text-fg">{num(p.vals[i], 2)}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
        {/* The number that matters: predicted change vs the recipe you already have. */}
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted">vs current best</span>
          <span
            className={cn(
              "tabular font-mono text-[16px] font-semibold",
              delta != null && delta > 0 ? "text-green" : "text-muted",
            )}
          >
            {delta == null ? "n/a" : `${delta >= 0 ? "+" : "−"}${num(Math.abs(delta), 2)}`}
            {delta != null && unit ? <span className="ml-1 text-[10px] font-normal text-muted">{unit}</span> : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="tabular font-mono text-[11px] text-muted">
            predicts {num(p.pred, 2)} ± {num(bandV, 2)}
          </span>
          <Badge variant="outline" className={cn("h-auto rounded-md border-transparent px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap", toneClass)}>
            {v.label}
          </Badge>
        </div>
        {p.p_feasible != null ? (
          <div className="text-[11px] text-muted">
            P(feasible) <span className="tabular font-mono font-semibold text-fg">{num(p.p_feasible, 2)}</span>
          </div>
        ) : null}
        <p className="mt-0.5 text-[12px] leading-snug text-muted">{p.reason}</p>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-[10px] border text-[12px] font-semibold transition-colors [&_svg]:size-3.5",
            queued
              ? "border-accent bg-accent text-[color:var(--primary-foreground)] hover:bg-accent-hover"
              : "border-border bg-card text-fg hover:bg-bg",
          )}
        >
          <FlaskConical />
          {queued ? "Queued" : "Queue this run"}
        </button>
      </div>
    </Card>
  );
}

function PendingRunRow({
  run,
  features,
  unit,
  onLogResult,
}: {
  run: CampaignRun;
  features: string[];
  unit: string;
  onLogResult: (id: string, value: number) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const parsed = Number(value);
  const canSubmit = value.trim() !== "" && Number.isFinite(parsed);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setFailed(false);
    try {
      await onLogResult(run.id, parsed);
      setValue("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
      <Badge
        variant="outline"
        className={cn(
          "h-auto rounded-lg px-2 py-0.5 text-[11px] font-medium",
          run.mode === "explore"
            ? "border-explore-soft bg-explore-soft text-explore-deep"
            : "border-green-soft bg-green-soft text-green",
        )}
      >
        {run.mode}
      </Badge>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {features.map((f) => (
          <div key={f} className="text-[12px] whitespace-nowrap">
            <span className="text-muted">{f}</span>{" "}
            <span className="tabular font-mono font-semibold text-fg">{num(run.recipe[f], 2)}</span>
          </div>
        ))}
      </div>

      <div className="text-[12px] whitespace-nowrap text-muted">
        predicted{" "}
        <span className="tabular font-mono font-semibold text-fg">
          {num(run.pred, 2)} <span className="font-normal text-muted">± {num(run.std, 2)}</span>
        </span>
        {unit ? ` ${unit}` : ""}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {run.awaiting ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="measured value"
              aria-label={`Measured ${unit || "value"} for this recipe`}
              className="h-8 w-32 rounded-[8px] border border-border bg-card px-2 text-[13px] text-fg tabular font-mono focus:border-accent focus:outline-none"
              disabled={busy}
            />
            <Button size="sm" onClick={submit} disabled={!canSubmit || busy}>
              {busy ? "..." : "Log result"}
            </Button>
          </>
        ) : (
          <Badge variant="outline" className="h-auto rounded-lg border-green-soft bg-green-soft px-2 py-1 text-[12px] font-medium text-green">
            logged {run.result != null ? num(run.result, 2) : "—"}
          </Badge>
        )}
        {failed ? <span className="text-[11px] text-amber">failed - retry</span> : null}
      </div>
    </Card>
  );
}

/**
 * A collapsed-by-default disclosure whose children mount lazily - only after
 * it is opened for the first time, then they stay mounted (no unmount on
 * close). Recharts' ResponsiveContainer measures its parent on mount, so
 * mounting these hidden (the plain `<details>` default) is wasted work every
 * page load; opening on demand is the honest cost to pay, not upfront.
 */
function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="group border-t border-border"
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-[13px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-2">{opened ? children : null}</div>
    </details>
  );
}
