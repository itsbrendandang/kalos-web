"use client";

import { useEffect, useState } from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Loading, DemoBadge } from "@/components/page-header";
import { ErrorState, EmptyState } from "@/components/ui/honest-state";
import { SectionHead } from "@/components/ui/section-head";
import { SummaryTiles } from "@/components/operations/summary-tiles";
import { RunCard } from "@/components/operations/run-card";
import { RunQueue, fmtPredicted, type QueueRow } from "@/components/operations/run-queue";
import { CompletedList } from "@/components/operations/completed-list";
import { ExperimentStatusChip } from "@/components/experiments/status-chip";
import { coveragePct, getLatest, type LatestResult, type PopulatedResult } from "@/lib/api";
import { PIPELINE_SUMMARY, runsByStatus, type PipelineRun } from "@/lib/mock/pipeline";
import { listExperiments, type ExperimentSummary } from "@/lib/experiments";
import { DEMO_MODE } from "@/lib/demo";
import { num } from "@/lib/utils";

/**
 * What the "live runs" board should show, derived from the /api/experiments
 * fetch. `liveErr` wins over everything else - a rejected fetch is always
 * "error", regardless of whether `live` still holds `null` (never fetched)
 * or a stale array from a prior success. This is the fix for the honesty bug
 * this file used to carry: `loadingLive`/`showEmptyBoard` used to be derived
 * from `data == null` alone, so a dropped connection fell through to the same
 * "No live runs" empty copy as a confirmed-empty result - an assertion about
 * the physical lab produced by a failed fetch. See
 * components/ui/honest-state.tsx for the vocabulary this restores.
 */
export type LiveBoardState = "loading" | "error" | "live" | "demo" | "empty";

export function liveBoardState(
  live: ExperimentSummary[] | null,
  liveErr: boolean,
  demoMode: boolean,
): LiveBoardState {
  if (liveErr) return "error";
  if (live == null) return "loading";
  if (live.length > 0) return "live";
  return demoMode ? "demo" : "empty";
}

/** Same rule for the "next batch to run" queue, derived from the
 *  /api/latest fetch: a rejected fetch is "error", never folded into the
 *  same branch as a confirmed `has_data: false` or empty-proposals result. */
export type QueueState = "loading" | "error" | "data";

export function queueState(data: LatestResult | null, err: boolean): QueueState {
  if (err) return "error";
  if (data == null) return "loading";
  return "data";
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
 *  than fabricating telemetry for it). When it's confirmed empty - the real
 *  current state - this shows an honest EmptyState, NOT the rich mock
 *  pipeline data, unless NEXT_PUBLIC_DEMO_MODE is explicitly on, in which
 *  case the mock board renders behind a persistent "Example data" badge.
 *  When the fetch itself fails, this shows a retryable ErrorState instead -
 *  never the empty copy, which would misrepresent a dropped connection as a
 *  fact about the lab (see `liveBoardState` above). The "Next batch to run"
 *  section stays independently wired to the real /api/latest proposals
 *  (see `queueState`), only falling back to the mock queue in demo mode. */
export function OperationsView() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [err, setErr] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [live, setLive] = useState<ExperimentSummary[] | null>(null);
  const [liveErr, setLiveErr] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);

  async function refreshPortal() {
    setPortalBusy(true);
    try {
      setData(await getLatest());
      setErr(false);
    } catch {
      setErr(true);
    } finally {
      setPortalBusy(false);
    }
  }

  async function refreshLive() {
    setLiveBusy(true);
    try {
      setLive(await listExperiments());
      setLiveErr(false);
    } catch {
      setLiveErr(true);
    } finally {
      setLiveBusy(false);
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

  const liveState = liveBoardState(live, liveErr, DEMO_MODE);
  const runningLive = live?.filter((e) => e.status === "PROCESSING") ?? [];
  const attentionLive = live?.filter((e) => e.status === "FAILED") ?? [];
  const queuedLive = live?.filter((e) => e.status === "READY" || e.status === "DRAFT") ?? [];
  const doneLive = live?.filter((e) => e.status === "DONE") ?? [];
  const doneToday = doneLive.filter((e) => isToday(e.updated_at));

  const attention = runsByStatus("attention");
  const running = runsByStatus("running");
  const nowRunning = [...attention, ...running];
  const completed = runsByStatus("completed");

  const qState = queueState(data, err);
  const populated = data && data.has_data ? data : null;
  const hasRealProposals = Boolean(populated && populated.proposals.length > 0);
  const showDemoQueue = !hasRealProposals && DEMO_MODE;

  const queueRows = hasRealProposals
    ? proposalsToQueueRows(populated as PopulatedResult)
    : showDemoQueue
      ? queuedRunsToQueueRows(runsByStatus("queued"))
      : [];
  const queueSub = hasRealProposals
    ? `From the last analysis${
        populated?.conformal_q != null
          ? ` · ± ${num(populated.conformal_q, 2)} conformal band${coveragePct(populated.conformal_coverage) ? ` (${coveragePct(populated.conformal_coverage)})` : ""}`
          : ""
      }`
    : showDemoQueue
      ? "No live proposals - showing the demo queue."
      : "No live proposals yet.";

  return (
    <div className="flex flex-col gap-6">
      {liveState === "loading" ? (
        <Loading label="Checking for live runs" />
      ) : liveState === "error" ? (
        <ErrorState
          title="Could not reach the experiments service"
          description="The request for live experiment jobs failed before the portal could respond. This is a connection problem, not an empty board - your experiments are unaffected."
          onRetry={refreshLive}
          busy={liveBusy}
        />
      ) : liveState === "live" ? (
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
      ) : liveState === "demo" ? (
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
      ) : (
        <EmptyState
          icon={PlugZap}
          title="No live runs"
          description={
            <>
              Connect a run store to see this here. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code> to preview this board with demo data
              instead.
            </>
          }
        />
      )}

      <section>
        <SectionHead
          title="Next batch to run"
          sub={qState === "data" ? queueSub : undefined}
          badge={showDemoQueue ? <DemoBadge /> : undefined}
        />
        <Card>
          {qState === "loading" ? (
            <Loading label="Checking the portal" />
          ) : qState === "error" ? (
            <ErrorState
              title="Could not reach the analysis service"
              description="The request for the next batch of proposals failed before the engine could respond. This is a connection problem, not an empty queue."
              onRetry={refreshPortal}
              busy={portalBusy}
            />
          ) : (
            <RunQueue rows={queueRows} />
          )}
        </Card>
      </section>

      <section>
        <SectionHead title="Recently completed" />
        <Card>
          {liveState === "loading" ? (
            <Loading label="Checking for completed runs" />
          ) : liveState === "error" ? (
            <ErrorState
              title="Could not reach the experiments service"
              description="The request for completed runs failed before the portal could respond."
              onRetry={refreshLive}
              busy={liveBusy}
            />
          ) : liveState === "live" ? (
            <LiveExperimentList rows={doneLive} empty="nothing completed yet" />
          ) : liveState === "demo" ? (
            <CompletedList runs={completed} />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">nothing completed yet</p>
          )}
        </Card>
      </section>
    </div>
  );
}
