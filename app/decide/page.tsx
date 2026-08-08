"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, FlaskConical, RefreshCw, Upload } from "lucide-react";
import {
  fullRecipe,
  getCampaign,
  getLatest,
  isReliable,
  logResult,
  reanalyze,
  recipeColumns,
  recipeValue,
  startRuns,
  type Campaign,
  type CampaignRun,
  type LatestResult,
  type PopulatedResult,
  type Proposal,
  type StartRecipe,
} from "@/lib/api";
import { batchVerdict, bandLabel, proposalVerdict } from "@/lib/batch-verdict";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { ProgressChart } from "@/components/charts";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel, ModelCoverage } from "@/components/dashboard/reliability-panel";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { RunLandscape } from "@/components/dashboard/run-landscape";
import { ResponseSurface } from "@/components/dashboard/response-surface";
import { ScaleUpTimeline } from "@/components/scale-up-timeline";
import { cn, num, parseUnit } from "@/lib/utils";

const BTN_ACCENT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-4 text-[13px] font-semibold whitespace-nowrap text-[color:var(--primary-foreground)] transition-colors hover:border-accent-hover hover:bg-accent-hover [&_svg]:size-4 [&_svg]:shrink-0";

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
            <Link href="/analyze" className={BTN_ACCENT}>
              <Upload />
              New run sheet
            </Link>
          </div>
        }
      />

      {err && data ? (
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">
          Refresh failed. Showing the last loaded analysis.
        </Card>
      ) : null}

      {err && data == null ? (
        <ServiceUnavailable onRetry={refresh} busy={busy} />
      ) : data == null ? (
        <Loading />
      ) : !data.has_data ? (
        <Card className="p-8 text-center text-sm text-muted">
          No analysis yet.{" "}
          <Link href="/analyze" className="font-semibold text-accent-text underline">
            Upload a run sheet
          </Link>{" "}
          to get a recommended batch.
        </Card>
      ) : (
        <DecideBody
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

  function toggle(i: number) {
    setQueued((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleStart() {
    // The FULL recipe, never one rebuilt from `proposal_features`: that list is
    // the abridged top-few-drivers view, so a recipe assembled from it omits
    // every other modeled input and the engine folds those back in as zero.
    const queuedProposals = [...queued].map((i) => d.proposals[i]);
    // An older analysis carries no `recipe`; starting a run from it would send
    // an incomplete experiment to the campaign. Refuse rather than corrupt it.
    if (queuedProposals.some((p) => fullRecipe(p) === null)) {
      setStartErr(true);
      return;
    }
    const recipes: StartRecipe[] = queuedProposals.map((p) => ({
      recipe: fullRecipe(p)!,
      pred: p.pred,
      std: p.std,
      mode: p.mode,
      reason: p.reason,
    }));
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
      <HonestVerdict d={d} best={active?.best ?? d.best} band={d.conformal_q ?? null} unit={unit} />

      {/* HERO: the recommended batch */}
      <section>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold text-fg">Recommended experiments</h2>
          <span className="text-[12px] text-muted">
            predicted {targetName}
            {d.conformal_q != null ? ` · ± ${num(d.conformal_q, 2)} conformal band (95%)` : ""}
          </span>
        </div>
        {d.proposals.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.proposals.map((p, i) => (
              <ProposalCard
                key={i}
                rank={i + 1}
                p={p}
                features={d.proposal_features}
                unit={unit}
                best={active?.best ?? d.best}
                band={d.conformal_q ?? null}
                queued={queued.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        ) : (
          <Card className="py-10 text-center text-[12px] text-muted">no proposals</Card>
        )}
        {queued.size > 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-[10px] border border-accent/40 bg-blue-tint px-4 py-2.5 text-[13px]">
            <span className="text-fg">
              <span className="font-semibold">{queued.size}</span> run{queued.size > 1 ? "s" : ""} queued for this
              cycle.
            </span>
            <button type="button" className={BTN_ACCENT} onClick={handleStart} disabled={startBusy}>
              <FlaskConical />
              {startBusy ? "Starting..." : `Start ${queued.size} run${queued.size > 1 ? "s" : ""}`}
            </button>
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
              <PendingRunRow key={run.id} run={run} unit={unit} onLogResult={handleLogResult} />
            ))}
          </div>
          <div className="flex items-center justify-between rounded-[10px] border border-accent/40 bg-blue-tint px-4 py-2.5 text-[13px]">
            <span className="text-fg">
              <span className="font-semibold">{active.n_measured}</span> result{active.n_measured === 1 ? "" : "s"} logged
              this round.
            </span>
            <button
              type="button"
              className={BTN_ACCENT}
              onClick={handleReanalyze}
              disabled={reanalyzeBusy || active.n_measured === 0}
            >
              <RefreshCw />
              {reanalyzeBusy ? "Re-analyzing..." : `Re-propose with ${active.n_measured} result${active.n_measured === 1 ? "" : "s"}`}
            </button>
          </div>
          {reanalyzeErr ? <p className="text-[12px] text-amber">Re-analysis failed. Try again.</p> : null}
        </section>
      ) : null}

      {/* Optimization progress: measured best-so-far by round, not a prediction */}
      {active && active.history.length >= 2 ? (
        <ProgressPanel active={active} targetName={targetName} unit={unit} />
      ) : null}

      {/* Scale-up projection: demoted behind a disclosure and labelled as NOT
          from the client's data - it is physics/literature priors, so it must
          not sit in the decision hero pretending to be a result. */}
      {d.proposals.length ? (
        <Details summary="Projected scale-up — physics priors, not from your data">
          <ScaleUpTimeline
            bestRecipe={Object.fromEntries(d.proposal_features.map((f, i) => [f, d.proposals[0].vals[i]]))}
            bestValue={active?.best ?? d.best}
            targetName={targetName}
            unit={unit}
          />
        </Details>
      ) : null}

      {/* Supporting analysis: collapsed by default, lazy-mounted on first open */}
      <Details summary="Process drivers — what moves the target">
        <Card className="flex flex-col">
          <p className="text-[12px] leading-snug text-muted">
            Signed correlation of each input with {targetName}, held out across recipe groups. Colored bars clear noise
            (95% CI excludes zero); gray bars are within it.
          </p>
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
            <p className="py-10 text-center text-[12px] text-muted">no drivers</p>
          )}
        </Card>
      </Details>

      <Details summary="Model reliability — how far to trust it">
        <ReliabilityPanel d={d} />
        <ModelCoverage d={d} />
      </Details>

      <Details summary="Run structure — where the measured runs sit">
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
        <Details summary="Predicted landscape — response surface & feature correlation">
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
          <li>Live batch curves — awaiting bioreactor telemetry</li>
          <li>Digital twin — live process model</li>
          <li>Scientific alerts — live sensors</li>
          <li>Cost &amp; ROI — cost feed</li>
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

/**
 * Best-measured-so-far by round - a slim trajectory chart, not a forecast.
 * Only rendered by the caller when there are >= 2 history points (a single
 * point isn't a trajectory). Nulls (a round with no measured base rows yet)
 * are filtered before plotting, per the CAMPAIGN_LOOP.md history contract.
 */
function ProgressPanel({ active, targetName, unit }: { active: ActiveCampaign; targetName: string; unit: string }) {
  const points = active.history
    .filter((h): h is { round: number; best: number; n_base: number } => h.best != null)
    .map((h) => ({ round: h.round, best: h.best }));
  if (points.length < 2) return null;
  const current = points[points.length - 1].best;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-fg">Best {targetName} so far</div>
          <div className="text-[11px] text-muted">measured, over {points.length} rounds</div>
        </div>
        <div className="tabular font-mono text-[20px] font-semibold text-fg">
          {num(current, 2)}
          {unit ? <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span> : null}
        </div>
      </div>
      <div className="h-[110px] w-full">
        <ProgressChart data={points} />
      </div>
    </Card>
  );
}

function TrustChip({ reliable, spearman }: { reliable: boolean; spearman: number | null }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium",
        reliable ? "border-green-soft bg-green-soft text-green" : "border-amber-soft bg-amber-soft text-amber",
      )}
    >
      <span className={cn("size-2 rounded-full", reliable ? "bg-green" : "bg-amber")} />
      {reliable ? "Reliable — safe to optimize" : "Exploring — gathering signal"}
      {spearman != null ? <span className="tabular font-mono opacity-70">· ρ {spearman.toFixed(2)}</span> : null}
    </div>
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
  best: number;
  band: number | null;
  unit: string;
}) {
  const rel = d.reliability;
  const props = d.proposals;
  if (!props.length) return null;
  // Counted once, in lib/batch-verdict.ts, and shared with the /results banner.
  // `beats` clears `best` at the PESSIMISTIC edge of the band, not by point
  // prediction - so the copy has to name the band. Saying "none beats your
  // current best" while the cards below show "+0.31" and "predicted high" reads
  // as a contradiction; saying "not by more than ±3.70" does not.
  const { beats, nAbove } = batchVerdict(props, best, band);
  const reliable = rel?.clears_floor ?? false;
  const rho = rel?.spearman ?? d.cv_spearman;
  const good = reliable && beats > 0;
  const bestStr = `${num(best, 2)}${unit ? ` ${unit}` : ""}`;
  const bandStr = bandLabel(band);
  return (
    <div
      className={cn(
        "rounded-2xl border-l-4 p-4 text-[13px] leading-relaxed",
        good ? "border-l-green bg-green-soft text-green" : "border-l-amber bg-amber-soft text-amber",
      )}
    >
      <p className="font-semibold">
        {good
          ? `${beats} of ${props.length} recipes clear your current best of ${bestStr} even at the low end of the ${bandStr} band.`
          : nAbove > 0
            ? `${nAbove} of ${props.length} recipes predict higher than your current best of ${bestStr}, but not by more than the ${bandStr} band — so this batch is exploration, not a confident bet.`
            : `None of these ${props.length} recipes predicts higher than your current best of ${bestStr} — this batch is exploration, not a confident bet.`}
      </p>
      <p className="mt-1 opacity-90">
        {reliable
          ? `The model ranks recipes with ${rho != null ? `ρ ${rho.toFixed(2)}` : "moderate"} agreement — a genuine head start over guessing. But the ± bands are wide, so read the order as a guide, not a guarantee.`
          : `Rank agreement is ${rho != null ? rho.toFixed(2) : "low"}${rel ? ` (below the ${rel.spearman_floor.toFixed(2)} floor)` : ""} and the ± bands are wide. On data this noisy, undirected search is competitive — running these earns the model confidence; expect a modest head start, not certainty.`}
      </p>
      {rel?.unmodeled?.length ? (
        <p className="mt-1.5 text-[12px] opacity-75">
          The engine does not model {rel.unmodeled.join(" · ")} — use your own judgment there.
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
function recipeVerdict(pred: number, band: number, best: number) {
  switch (proposalVerdict(pred, band, best)) {
    case "beats":
      return { label: "likely beats best", tone: "good" as const };
    case "below":
      return { label: "below current best", tone: "weak" as const };
    default:
      return { label: "coin-flip vs best", tone: "neutral" as const };
  }
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
  best: number;
  band: number | null;
  queued: boolean;
  onToggle: () => void;
}) {
  const bandV = band ?? p.std;
  const delta = p.pred - best;
  const v = recipeVerdict(p.pred, bandV, best);
  const { names: recipeNames, abridged: recipeAbridged } = recipeColumns([p], features);
  const toneClass =
    v.tone === "good" ? "bg-green-soft text-green" : v.tone === "weak" ? "bg-amber-soft text-amber" : "bg-bg text-muted";
  return (
    <Card className={cn("flex flex-col gap-3 transition-colors", queued && "bg-blue-tint")}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-bg font-mono text-[11px] font-semibold text-accent-text">
          {rank}
        </span>
        {/* WHY the optimizer picked this recipe - a strategy label, not a
            confidence claim. `mode` is a bare point-estimate comparison
            (`pred > best`), so calling exploit a "best bet" in affirmative
            green asserted more than the number supports, and sat directly
            above a band-aware chip that often reads "coin-flip vs best".
            The confidence claim belongs to `recipeVerdict` alone; this badge
            stays tonally neutral so green means one thing on this card. */}
        <span className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
          {p.mode === "exploit" ? "chasing the peak" : "exploring"}
        </span>
      </div>

      {/* Every modeled input, not just the top drivers in `features`: this card
          is what someone sets up at the bench, so a partial recipe is wrong. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {recipeNames.map((f) => {
          const v = recipeValue(p, f, features);
          return (
            <div key={f}>
              <div className="text-[10px] tracking-wider text-muted uppercase">{f}</div>
              <div className="tabular font-mono text-[17px] font-semibold text-fg">
                {typeof v === "number" ? num(v, 2) : (v ?? "—")}
              </div>
            </div>
          );
        })}
      </div>
      {recipeAbridged ? (
        <p className="text-[11px] text-amber">
          Partial recipe: only the strongest {recipeNames.length} inputs are listed. Re-run the analysis to get the
          full recipe before running this.
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
        {/* The number that matters: predicted change vs the recipe you already have. */}
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted">vs current best</span>
          <span
            className={cn(
              "tabular font-mono text-[16px] font-semibold",
              // Colored by the BAND-AWARE verdict, not by the sign of the
              // delta: a +0.31 that sits well inside a ±3.70 band is not a
              // gain the model can call, so painting it affirmative green
              // contradicted the "coin-flip vs best" chip beside it.
              v.tone === "good" ? "text-green" : "text-muted",
            )}
          >
            {delta >= 0 ? "+" : "−"}
            {num(Math.abs(delta), 2)}
            {unit ? <span className="ml-1 text-[10px] font-normal text-muted">{unit}</span> : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="tabular font-mono text-[11px] text-muted">
            predicts {num(p.pred, 2)} ± {num(bandV, 2)}
          </span>
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap", toneClass)}>
            {v.label}
          </span>
        </div>
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
  unit,
  onLogResult,
}: {
  run: CampaignRun;
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
      <span
        className={cn(
          "rounded-lg border px-2 py-0.5 text-[11px] font-medium",
          run.mode === "explore"
            ? "border-explore-soft bg-explore-soft text-explore-deep"
            : "border-green-soft bg-green-soft text-green",
        )}
      >
        {run.mode}
      </span>

      {/* Iterate the stored recipe's OWN keys, not `proposal_features`: the run
          was started with a full recipe, so show every input it specifies. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.keys(run.recipe).map((f) => {
          const v = run.recipe[f];
          return (
            <div key={f} className="text-[12px] whitespace-nowrap">
              <span className="text-muted">{f}</span>{" "}
              <span className="tabular font-mono font-semibold text-fg">
                {typeof v === "number" ? num(v, 2) : v}
              </span>
            </div>
          );
        })}
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
          <span className="rounded-lg border border-green-soft bg-green-soft px-2 py-1 text-[12px] font-medium text-green">
            logged {run.result != null ? num(run.result, 2) : "—"}
          </span>
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
