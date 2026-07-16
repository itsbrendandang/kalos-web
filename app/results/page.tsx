"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Database, RefreshCw, Upload } from "lucide-react";
import { getLatest, isReliable, type LatestResult, type PopulatedResult } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { Proposals } from "@/components/proposals";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { DriversTornado } from "@/components/dashboard/drivers-tornado";
import { DriverInsights } from "@/components/dashboard/driver-insights";
import { ReliabilityPanel } from "@/components/dashboard/reliability-panel";
import { RunLandscape } from "@/components/dashboard/run-landscape";
import { TargetDistribution } from "@/components/dashboard/target-distribution";
import { ResponseSurface } from "@/components/dashboard/response-surface";
import { CorrelationHeatmap } from "@/components/dashboard/correlation-heatmap";
import { cn, fmt, num } from "@/lib/utils";

const BTN_ACCENT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-accent bg-accent px-4 text-[13px] font-semibold whitespace-nowrap text-[color:var(--primary-foreground)] transition-colors hover:border-accent-hover hover:bg-accent-hover [&_svg]:size-4 [&_svg]:shrink-0";

function ago(ts?: number) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Pulls a trailing unit like "mg/L" out of a target name such as "Lipase conc. (mg/L)". */
function parseUnit(target: string): string {
  const m = target.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : "";
}

export default function Results() {
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
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analysis"
        title="Results"
        desc="Upload a run sheet, review model reliability, identify process drivers, and choose the next batch of experiments."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} disabled={busy}>
              <RefreshCw />
              {busy ? "..." : "Refresh"}
            </Button>
            <Link href="/analyze" className={BTN_ACCENT}>
              <Upload />
              Run analysis
            </Link>
          </div>
        }
      />

      {err && data ? (
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">
          Refresh failed. The dashboard is showing the last loaded analysis.
        </Card>
      ) : null}

      {err && data == null ? (
        <ServiceUnavailable onRetry={refresh} busy={busy} />
      ) : data == null ? (
        <Loading />
      ) : !data.has_data ? (
        <StartAnalysisCard />
      ) : (
        <OverviewBody d={data} />
      )}
    </div>
  );
}

function StartAnalysisCard() {
  const steps = [
    "Upload CSV, TSV, or Excel run sheet",
    "Select the output you want to maximize",
    "Review reliability before acting on suggestions",
  ];
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid md:grid-cols-[1fr_360px]">
        <div className="p-6">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <ClipboardList className="size-6" />
          </span>
          <h2 className="font-head text-[22px] font-semibold">Run your first analysis</h2>
          <p className="mt-2 max-w-[58ch] text-[13.5px] leading-5 text-muted">
            Start with an experiment table: one run per row, recipe inputs in columns, and at least one measured output.
          </p>
          <Link href="/analyze" className={`${BTN_ACCENT} mt-5`}>
            <Upload />
            Upload run sheet
          </Link>
        </div>
        <div className="border-t border-border bg-blue-soft p-5 md:border-t-0 md:border-l">
          <div className="mb-3 text-[12px] font-semibold text-fg">Analysis flow</div>
          <div className="space-y-2.5">
            {steps.map((step, i) => (
              <div key={step} className="flex items-start gap-2.5 text-[12.5px] text-muted">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-card font-mono text-[10px] font-semibold text-accent-text">
                  {i + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function DatasetStrip({ d }: { d: PopulatedResult }) {
  const ready = isReliable(d);
  const kept = d.provenance?.filter((p) => p.status === "kept_feature").length ?? 0;
  const dropped = d.provenance?.filter((p) => p.status.startsWith("dropped")).length ?? 0;
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
          <Database className="size-3.5 shrink-0 text-accent-text" />
          <span className="max-w-[320px] truncate font-semibold text-fg" title={d.dataset}>
            {d.dataset}
          </span>
          <span>
            {d.n} runs / {d.d} inputs / target {d.target}
            {d.updated ? ` / ${ago(d.updated)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-blue-soft px-2.5 py-1 text-[11px] font-semibold text-accent-text">
          <CheckCircle2 className="size-3.5" />
          {ready ? "Ready to review" : "Reliability needs review"}
        </div>
      </div>
      {d.provenance ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 font-mono text-[10.5px] text-muted">
          <span>{kept} kept feature{kept === 1 ? "" : "s"}</span>
          <span>{dropped} dropped column{dropped === 1 ? "" : "s"}</span>
          <span>
            {nonProducers} zero-{d.target} run{nonProducers === 1 ? "" : "s"}
          </span>
          {d.engine_version ? <span>engine {d.engine_version}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}

function KpiCell({
  label,
  value,
  sub,
  mono = true,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-h-[112px] flex-col justify-center p-4">
      <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className={cn("tabular mt-1.5 truncate text-[24px] leading-none font-semibold text-fg", mono && "font-mono")}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[12px] text-muted">{sub}</div> : null}
    </div>
  );
}

function KpiStrip({ d }: { d: PopulatedResult }) {
  const rho = d.cv_spearman;
  const reliable = isReliable(d);
  const topDriver = d.drivers[0];
  const unit = parseUnit(d.target);

  return (
    <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-5 xl:divide-x">
      <KpiCell
        label={`Best ${d.target.replace(/\s*\([^)]*\)\s*$/, "")}`}
        value={
          <>
            {fmt(d.best, 1)}
            {unit ? <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span> : null}
          </>
        }
        sub="Best observed run"
      />
      <KpiCell
        label="Model reliability"
        value={rho != null ? rho.toFixed(2) : "n/a"}
        sub={rho != null ? (reliable ? "Held-out Spearman, reliable" : "Held-out Spearman, needs review") : "not scored (too few groups)"}
      />
      <KpiCell
        label="Runs / inputs"
        value={`${d.n} / ${d.d}`}
        sub={d.cv_n_groups != null ? `${d.cv_n_groups} recipe groups` : "grouped, leakage-controlled"}
      />
      <KpiCell
        label="Top driver"
        mono={false}
        value={topDriver ? topDriver.name : "-"}
        sub={topDriver ? `rho ${topDriver.rho >= 0 ? "+" : ""}${topDriver.rho.toFixed(2)}` : ""}
      />
      <KpiCell label="Proposals ready" value={d.proposals.length} sub="From the last analysis" />
    </div>
  );
}

/** Grouping header: a bold label, an optional one-line descriptor, and a hairline
 *  that runs to the edge - turns the long dashboard into scannable sections. */
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span> : null}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function OverviewBody({ d }: { d: PopulatedResult }) {
  const nonProducers = d.oof.filter(([measured]) => measured === 0).length;
  const hasPredicted = Boolean(d.response_surface || d.correlation);

  return (
    <>
      <DatasetStrip d={d} />
      <KpiStrip d={d} />

      <section>
        <SectionHead title="Model quality" sub="What the model learned, and how far to trust it." />
        <div className="grid items-start gap-4 lg:grid-cols-[1.85fr_0.95fr]">
          <Card className="flex flex-col">
            <div className="text-[15px] font-semibold text-fg">Process drivers</div>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              Signed correlation of each input with {d.target}, held out across recipe groups. Blue is associated
              with higher {d.target}, gray with lower.
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
                />
              </>
            ) : (
              <p className="py-10 text-center text-[12px] text-muted">no drivers</p>
            )}
          </Card>

          <ReliabilityPanel d={d} />
        </div>
      </section>

      <section>
        <SectionHead title="Run structure" sub="Where the uploaded runs sit, and how the measured target is distributed." />
        {d.embedding ? (
          <div className="grid items-stretch gap-4 lg:grid-cols-[1.85fr_0.95fr]">
            <RunLandscape d={d} />
            <TargetDistribution d={d} />
          </div>
        ) : (
          <TargetDistribution d={d} />
        )}
      </section>

      {hasPredicted ? (
        <section>
          <SectionHead title="Predicted landscape" sub="The model's view of the recipe space, and how the inputs relate." />
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
        </section>
      ) : null}

      <section>
        <SectionHead
          title="Recommended actions"
          sub={`The next batch to run, ranked by the acquisition function${
            d.conformal_q != null ? ` · +/- ${num(d.conformal_q, 2)} conformal band` : ""
          }.`}
        />
        <Card>
          {d.proposals.length ? (
            <Proposals
              cols={d.proposal_features}
              rows={d.proposals}
              predHead={`pred. ${d.target}`}
              predFn={(p) => `${num(p.pred, 2)} +/- ${num(p.std, 2)}`}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
          )}
        </Card>
      </section>
    </>
  );
}
