"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, FlaskConical, RefreshCw, Upload } from "lucide-react";
import { getLatest, isReliable, type LatestResult, type PopulatedResult, type Proposal } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel, ModelCoverage } from "@/components/dashboard/reliability-panel";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function refresh() {
    setBusy(true);
    setErr(false);
    try {
      setData(await getLatest());
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    getLatest()
      .then((d) => !cancelled && setData(d))
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
        <DecideBody d={data} />
      )}
    </div>
  );
}

function DecideBody({ d }: { d: PopulatedResult }) {
  const [queued, setQueued] = useState<Set<number>>(new Set());
  const reliable = isReliable(d);
  const unit = parseUnit(d.target);
  const targetName = d.target.replace(/\s*\([^)]*\)\s*$/, "");
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;

  function toggle(i: number) {
    setQueued((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Campaign strip: target, best-so-far, evidence, and the trust chip */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Optimizing" value={targetName} sub={`maximize${unit ? ` (${unit})` : ""}`} />
        <Stat label="Best so far" value={num(d.best, 2)} sub={`across ${d.n} runs`} mono />
        <Stat label="Batch ready" value={String(d.proposals.length)} sub="recommended runs" mono />
        <div className="ml-auto">
          <TrustChip reliable={reliable} spearman={d.reliability?.spearman ?? d.cv_spearman} />
        </div>
      </Card>

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
            <button
              type="button"
              className={BTN_ACCENT}
              onClick={() => alert(`Queued ${queued.size} run(s). (Prototype - wiring to the run store is next.)`)}
            >
              <FlaskConical />
              Start {queued.size} run{queued.size > 1 ? "s" : ""}
            </button>
          </div>
        ) : null}
      </section>

      {/* Compact trust line: the honest verdict, subordinate to the decision */}
      <TrustLine d={d} reliable={reliable} />

      {/* Everything else: collapsed by default */}
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
        <TargetDistribution d={d} />
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

function TrustLine({ d, reliable }: { d: PopulatedResult; reliable: boolean }) {
  const rel = d.reliability;
  if (!rel || rel.spearman == null || rel.ci95 == null) return null;
  const includesZero = rel.ci95[0] <= 0 && rel.ci95[1] >= 0;
  return (
    <div
      className={cn(
        "rounded-2xl border border-l-4 p-4 text-[13px] leading-relaxed",
        reliable
          ? "border-green/30 border-l-green bg-green-soft text-green"
          : "border-amber/30 border-l-amber bg-amber-soft text-amber",
      )}
    >
      {reliable ? (
        <>
          The model ranks recipes reliably (rank agreement {rel.spearman.toFixed(2)}, above the{" "}
          {rel.spearman_floor.toFixed(2)} floor). These picks are optimized bets, not just exploration.
        </>
      ) : (
        <>
          These are <span className="font-semibold">exploration picks to gather signal</span>, not optimized bets.
          Held-out rank agreement is {rel.spearman.toFixed(2)} (95% range {rel.ci95[0].toFixed(2)} to{" "}
          {rel.ci95[1].toFixed(2)}
          {includesZero ? ", which includes zero" : ""}) — below the {rel.spearman_floor.toFixed(2)} trust floor.
          Running them is how the model earns confidence.
        </>
      )}
    </div>
  );
}

function ProposalCard({
  rank,
  p,
  features,
  unit,
  queued,
  onToggle,
}: {
  rank: number;
  p: Proposal;
  features: string[];
  unit: string;
  queued: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className={cn("flex flex-col gap-3 transition-colors", queued && "border-accent/50 bg-blue-tint")}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-bg font-mono text-[11px] font-semibold text-accent-text">
          {rank}
        </span>
        <span
          className={cn(
            "rounded-lg border px-2 py-0.5 text-[11px] font-medium",
            p.mode === "explore"
              ? "border-explore-soft bg-explore-soft text-explore-deep"
              : "border-green-soft bg-green-soft text-green",
          )}
        >
          {p.mode}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {features.map((f, i) => (
          <div key={f}>
            <div className="text-[10px] tracking-wider text-muted uppercase">{f}</div>
            <div className="tabular font-mono text-[17px] font-semibold text-fg">{num(p.vals[i], 2)}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted">predicted</span>
          <span className="tabular font-mono text-[14px] font-semibold text-fg">
            {num(p.pred, 2)} <span className="text-muted">± {num(p.std, 2)}</span>
            {unit ? <span className="ml-1 text-[11px] font-normal text-muted">{unit}</span> : null}
          </span>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-muted">{p.reason}</p>
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

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-card open:bg-transparent">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-1 pb-1">{children}</div>
    </details>
  );
}
