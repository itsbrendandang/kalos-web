"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Loading, DemoBadge } from "@/components/page-header";
import { SummaryTiles } from "@/components/operations/summary-tiles";
import { RunCard } from "@/components/operations/run-card";
import { RunQueue, fmtPredicted, type QueueRow } from "@/components/operations/run-queue";
import { CompletedList } from "@/components/operations/completed-list";
import { ExperimentStatusChip } from "@/components/experiments/status-chip";
import { getLatest, type LatestResult, type PopulatedResult } from "@/lib/api";
import { PIPELINE_SUMMARY, runsByStatus, type PipelineRun } from "@/lib/mock/pipeline";
import { listExperiments, type ExperimentSummary } from "@/lib/experiments";
import { DEMO_MODE } from "@/lib/demo";
import { num } from "@/lib/utils";

/** Grouping header: a bold label, an optional one-line descriptor, and a
 *  hairline that runs to the edge (same pattern as app/results/page.tsx). */
function SectionHead({ title, sub, badge }: { title: string; sub?: string; badge?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span> : null}
      <div className="h-px flex-1 bg-border" />
      {badge ?? null}
    </div>
  );
}

/** True when an ISO timestamp falls on the local calendar day - so "Completed
 *  today" counts only runs actually finished today, not every DONE record. */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Real portal proposals (from GET /api/latest) as queue rows. */
function proposalsToQueueRows(d: PopulatedResult): QueueRow[] {
  return d.proposals.map((p, i) => ({
    id: `proposal-${i}`,
    recipe: d.proposal_features.map((f, j) => ({ label: f, value: num(p.vals[j], 2) })),
    pred: { value: fmtPredicted(p.pred, p.std), mode: p.mode, why: p.reason },
  }));
}

/** Demo-only: the mock queued runs (recipe + predicted mirror the portal shape). */
function queuedRunsToQueueRows(runs: PipelineRun[]): QueueRow[] {
  return runs.map((r) => ({
    id: r.id,
    vessel: r.vessel,
    recipe: Object.entries(r.recipe ?? {}).map(([label, value]) => ({ label, value: num(value, 1) })),
    pred: r.predicted
      ? { value: fmtPredicted(r.predicted.value, r.predicted.sigma), mode: r.predicted.mode, why: r.predicted.why }
      : { value: "-", mode: "exploit" as const, why: "" },
  }));
}

/** Honest empty state for a board with no live source connected and demo mode
 *  off - shown instead of ever rendering fabricated runs as if they were real. */
function NoLiveData({ what }: { what: string }) {
  return (
    <Card className="flex flex-col items-center gap-1.5 py-10 text-center">
      <PlugZap className="size-5 text-muted" />
      <div className="text-[13.5px] font-semibold text-fg">No live {what}</div>
      <p className="max-w-[46ch] text-[12px] leading-5 text-muted">
        Connect a run store to see this here. Set <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to
        preview this board with demo data instead.
      </p>
    </Card>
  );
}

/** One live experiment row: name, last-updated, and its real status - no
 *  vessel/procedure/drift fields, since the portal doesn't model those yet. */
function LiveExperimentRow({ e }: { e: ExperimentSummary }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-fg">{e.name}</div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">updated {e.updated_at}</div>
      </div>
      <ExperimentStatusChip status={e.status} />
    </div>
  );
}

function LiveExperimentList({ rows, empty }: { rows: ExperimentSummary[]; empty: string }) {
  if (!rows.length) return <p className="py-10 text-center text-[12px] text-muted">{empty}</p>;
  return (
    <div className="flex flex-col divide-y divide-border">
      {rows.map((e) => (
        <LiveExperimentRow key={e.id} e={e} />
      ))}
    </div>
  );
}

/** Live view of the Experiments hub: summary tiles, in-flight run cards, the
 *  next-batch queue, and recently completed runs.
 *
 *  Prefers the live /api/experiments list (lib/experiments.ts) for "what's
 *  in flight" - when it has records, they render as-is (no vessel/drift
 *  fields exist yet on that API, so this shows the real status list rather
 *  than fabricating telemetry for it). When it's empty - the real current
 *  state - this shows an honest empty state, NOT the rich mock pipeline
 *  data, unless NEXT_PUBLIC_DEMO_MODE is explicitly on, in which case the
 *  mock board renders behind a persistent "Example data" badge. The
 *  "Next batch to run" section stays independently wired to the real
 *  /api/latest proposals, only falling back to the mock queue in demo mode. */
export function OperationsView() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [err, setErr] = useState(false);
  const [live, setLive] = useState<ExperimentSummary[] | null>(null);
  const [liveErr, setLiveErr] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    listExperiments()
      .then((d) => {
        if (!cancelled) setLive(d);
      })
      .catch(() => {
        if (!cancelled) setLiveErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadingLive = live == null && !liveErr;
  const hasLive = (live?.length ?? 0) > 0;
  const showDemoBoard = !loadingLive && !hasLive && DEMO_MODE;
  const showEmptyBoard = !loadingLive && !hasLive && !DEMO_MODE;

  const runningLive = live?.filter((e) => e.status === "PROCESSING") ?? [];
  const attentionLive = live?.filter((e) => e.status === "FAILED") ?? [];
  const queuedLive = live?.filter((e) => e.status === "READY" || e.status === "DRAFT") ?? [];
  const doneLive = live?.filter((e) => e.status === "DONE") ?? [];
  const doneToday = doneLive.filter((e) => isToday(e.updated_at));

  const attention = runsByStatus("attention");
  const running = runsByStatus("running");
  const nowRunning = [...attention, ...running];
  const completed = runsByStatus("completed");

  const loadingPortal = data == null && !err;
  const populated = data && data.has_data ? data : null;
  const hasRealProposals = Boolean(populated && populated.proposals.length > 0);
  const showDemoQueue = !hasRealProposals && DEMO_MODE;

  const queueRows = hasRealProposals
    ? proposalsToQueueRows(populated as PopulatedResult)
    : showDemoQueue
      ? queuedRunsToQueueRows(runsByStatus("queued"))
      : [];
  const queueSub = hasRealProposals
    ? `From the last analysis${populated?.conformal_q != null ? ` · ± ${num(populated.conformal_q, 2)} conformal band` : ""}`
    : showDemoQueue
      ? "No live proposals - showing the demo queue."
      : "No live proposals yet.";

  return (
    <div className="flex flex-col gap-6">
      {loadingLive ? (
        <Loading label="Checking for live runs" />
      ) : hasLive ? (
        <div className="flex flex-col gap-6">
          <SummaryTiles
            running={runningLive.length}
            attention={attentionLive.length}
            queued={queuedLive.length}
            completedToday={doneToday.length}
          />
          <section>
            <SectionHead title="In progress" sub="Live experiment jobs from the kalos portal." />
            <Card>
              <LiveExperimentList rows={[...attentionLive, ...runningLive]} empty="nothing in progress" />
            </Card>
          </section>
          <section>
            <SectionHead title="Queued" sub="Draft and ready experiments awaiting a run." />
            <Card>
              <LiveExperimentList rows={queuedLive} empty="nothing queued" />
            </Card>
          </section>
        </div>
      ) : showDemoBoard ? (
        <div className="flex flex-col gap-6">
          <div className="flex justify-end">
            <DemoBadge />
          </div>
          <SummaryTiles
            running={PIPELINE_SUMMARY.running}
            attention={PIPELINE_SUMMARY.attention}
            queued={PIPELINE_SUMMARY.queued}
            completedToday={PIPELINE_SUMMARY.completedToday}
          />
          <section>
            <SectionHead title="Now running" sub="What's in flight, attention-needed runs first." />
            <div className="grid gap-4 lg:grid-cols-2">
              {nowRunning.map((r) => (
                <RunCard key={r.id} run={r} />
              ))}
            </div>
          </section>
        </div>
      ) : showEmptyBoard ? (
        <NoLiveData what="runs" />
      ) : null}

      <section>
        <SectionHead
          title="Next batch to run"
          sub={queueSub}
          badge={showDemoQueue ? <DemoBadge /> : undefined}
        />
        <Card>{loadingPortal ? <Loading label="Checking the portal" /> : <RunQueue rows={queueRows} />}</Card>
      </section>

      <section>
        <SectionHead title="Recently completed" />
        <Card>
          {hasLive ? (
            <LiveExperimentList rows={doneLive} empty="nothing completed yet" />
          ) : showDemoBoard ? (
            <CompletedList runs={completed} />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">nothing completed yet</p>
          )}
        </Card>
      </section>

      {hasLive ? (
        <p className="text-[11px] text-muted">
          Full detail and actions live in the{" "}
          <Link href="/?view=table" className="font-semibold text-accent-text underline">
            Table view
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
