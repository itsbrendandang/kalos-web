"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loading } from "@/components/page-header";
import { SummaryTiles } from "@/components/operations/summary-tiles";
import { RunCard } from "@/components/operations/run-card";
import { RunQueue, fmtPredicted, type QueueRow } from "@/components/operations/run-queue";
import { CompletedList } from "@/components/operations/completed-list";
import { getLatest, type LatestResult, type PopulatedResult } from "@/lib/api";
import { PIPELINE_SUMMARY, runsByStatus, type PipelineRun } from "@/lib/mock/pipeline";
import { num } from "@/lib/utils";

/** Grouping header: a bold label, an optional one-line descriptor, and a
 *  hairline that runs to the edge (same pattern as app/results/page.tsx). */
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span> : null}
      <div className="h-px flex-1 bg-border" />
    </div>
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

/** Fallback: the mock queued runs (recipe + predicted mirror the portal shape). */
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

/** Live view of the Experiments hub: summary tiles, in-flight run cards, the
 *  next-batch queue, and recently completed runs. Extracted from the old
 *  Operations landing page (app/page.tsx) verbatim - same components, same
 *  data sources - so it renders identically under the hub's Live tab. */
export function OperationsView() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [err, setErr] = useState(false);

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

  const attention = runsByStatus("attention");
  const running = runsByStatus("running");
  const nowRunning = [...attention, ...running];
  const completed = runsByStatus("completed");

  const loadingPortal = data == null && !err;
  const populated = data && data.has_data ? data : null;
  const hasRealProposals = Boolean(populated && populated.proposals.length > 0);

  const queueRows = hasRealProposals ? proposalsToQueueRows(populated as PopulatedResult) : queuedRunsToQueueRows(runsByStatus("queued"));
  const queueSub = hasRealProposals
    ? `From the last analysis${populated?.conformal_q != null ? ` · ± ${num(populated.conformal_q, 2)} conformal band` : ""}`
    : "Portal proposals unavailable - showing the scheduled queue.";

  return (
    <div className="flex flex-col gap-6">
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

      <section>
        <SectionHead title="Next batch to run" sub={queueSub} />
        <Card>{loadingPortal ? <Loading label="Checking the portal" /> : <RunQueue rows={queueRows} />}</Card>
      </section>

      <section>
        <SectionHead title="Recently completed" />
        <Card>
          <CompletedList runs={completed} />
        </Card>
      </section>
    </div>
  );
}
