"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Database, RefreshCw, Upload } from "lucide-react";
import {
  getLatest,
  isReliable,
  reliabilityReason,
  type LatestResult,
  type PopulatedResult,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatTile } from "@/components/ui/stat-tile";
import { PageHeader, Loading } from "@/components/page-header";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { AnalysisReadout } from "@/components/analysis-readout";
import { fmt, parseUnit } from "@/lib/utils";

function ago(ts?: number) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
            <Link href="/analyze" className={buttonVariants()}>
              <Upload />
              Run analysis
            </Link>
          </div>
        }
      />

      {err && data ? (
        <Alert variant="default" className="items-start gap-2.5 border-amber/30 bg-amber-soft px-3.5 py-3">
          <AlertDescription className="text-[13px] text-amber">
            Refresh failed. The dashboard is showing the last loaded analysis.
          </AlertDescription>
        </Alert>
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
          <Link href="/analyze" className={buttonVariants({ className: "mt-5" })}>
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
        <Badge variant="outline" className="gap-1.5 border-border bg-blue-soft text-accent-text">
          <CheckCircle2 className="size-3.5" />
          {ready ? "Ready to review" : "Reliability needs review"}
        </Badge>
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

function KpiStrip({ d }: { d: PopulatedResult }) {
  const rho = d.cv_spearman;
  const reliable = isReliable(d);
  const unit = parseUnit(d.target);
  // Four tiles, read left to right as a sentence: where you are (best) -> can you
  // trust it (reliability) -> how much data (runs/inputs) -> what's next
  // (proposals). The old "Top driver" tile was dropped: it made an odd 5th cell
  // (the orphan wrap) AND headlined a driver the tornado below already reports
  // honestly - a single lead correlation doesn't belong in the KPI row.
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={`Best ${d.target.replace(/\s*\([^)]*\)\s*$/, "")}`}
        value={
          <>
            {fmt(d.best, 1)}
            {unit ? <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span> : null}
          </>
        }
        hint="Best observed run"
      />
      <StatTile
        label="Model reliability"
        value={rho != null ? rho.toFixed(2) : "n/a"}
        tooltip="Held-out rank agreement (Spearman) between predicted and measured order. Reliable only when it clears the trust floor AND its 95% CI excludes zero - see isReliable() in lib/api.ts."
        hint={
          rho != null ? (
            <span className={reliable ? "text-green" : "text-amber"}>
              {reliabilityReason(d)}
            </span>
          ) : (
            "not scored (too few groups)"
          )
        }
      />
      <StatTile
        label="Runs / inputs"
        value={`${d.n} / ${d.d}`}
        hint={d.cv_n_groups != null ? `${d.cv_n_groups} recipe groups` : "grouped, leakage-controlled"}
      />
      <StatTile label="Proposals ready" value={d.proposals.length} hint="Next batch to run" />
    </div>
  );
}

function OverviewBody({ d }: { d: PopulatedResult }) {
  return (
    <>
      <DatasetStrip d={d} />
      <KpiStrip d={d} />
      <AnalysisReadout d={d} />
    </>
  );
}
