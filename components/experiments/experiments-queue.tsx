"use client";

import { useEffect, useState } from "react";
import { PlayCircle, RefreshCw } from "lucide-react";
import { Loading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { UploadExperimentForm } from "@/components/experiments/upload-form";
import { ExperimentTable } from "@/components/experiments/experiment-table";
import {
  ExperimentApiError,
  listExperiments,
  patchStatus,
  runExperiment,
  runReady,
  type Experiment,
  type ExperimentSummary,
} from "@/lib/experiments";
import { runWithReconcile } from "@/lib/reconcile";

/** Table view of the Experiments hub (M2 integration): a real list wired to
 *  the kalos portal's /api/experiments/* routes, with the "flag ready" and
 *  "run" / "run all ready" actions from the Voyager ML plan. Extracted from
 *  the old Experiments page (app/experiments/page.tsx) verbatim - same portal
 *  wiring (upload, flag READY, run, DONE detail) - so it renders identically
 *  under the hub's Table tab. This is a sibling to the Voyager
 *  project-management surface (app/voyager), not a replacement for it. */
export function ExperimentsQueue() {
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [runAllBusy, setRunAllBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setErr(false);
    try {
      setExperiments(await listExperiments());
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listExperiments()
      .then((d) => {
        if (!cancelled) setExperiments(d);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function withBusy(id: string, run: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setActionErr("");
    runWithReconcile(
      run,
      () => {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        refresh();
      },
      (e) => {
        setActionErr(e instanceof ExperimentApiError ? e.message : "Experiments service unavailable. Try again in a moment.");
      },
    );
  }

  function optimisticStatus(id: string, status: ExperimentSummary["status"]) {
    setExperiments((prev) => prev?.map((e) => (e.id === id ? { ...e, status } : e)) ?? prev);
  }

  function handleCreated(exp: Experiment) {
    setExperiments((prev) => [{ id: exp.id, name: exp.name, status: exp.status, updated_at: exp.updated_at }, ...(prev ?? [])]);
    refresh();
  }

  function handleFlagReady(id: string) {
    optimisticStatus(id, "READY");
    withBusy(id, async () => {
      await patchStatus(id, "READY");
    });
  }

  function handleRun(id: string, force: boolean) {
    optimisticStatus(id, "PROCESSING");
    withBusy(id, async () => {
      await runExperiment(id, force);
    });
  }

  function handleRunAll() {
    const readyIds = experiments?.filter((e) => e.status === "READY").map((e) => e.id) ?? [];
    if (readyIds.length === 0) return;
    setRunAllBusy(true);
    setActionErr("");
    setExperiments((prev) => prev?.map((e) => (e.status === "READY" ? { ...e, status: "PROCESSING" } : e)) ?? prev);
    runWithReconcile(
      runReady,
      () => {
        setRunAllBusy(false);
        refresh();
      },
      (e) => {
        setActionErr(e instanceof ExperimentApiError ? e.message : "Experiments service unavailable. Try again in a moment.");
      },
    );
  }

  const readyCount = experiments?.filter((e) => e.status === "READY").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[64ch] text-[13px] leading-5 text-muted">
          The kalos portal&rsquo;s experiment queue: upload a run sheet, flag it ready, and run the Bayesian engine on
          demand or for every ready experiment at once.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={refresh} disabled={busy}>
            <RefreshCw />
            {busy ? "..." : "Refresh"}
          </Button>
          <Button onClick={handleRunAll} disabled={runAllBusy || readyCount === 0}>
            <PlayCircle />
            {runAllBusy ? "Running..." : `Run all ready (${readyCount})`}
          </Button>
        </div>
      </div>

      <UploadExperimentForm onCreated={handleCreated} />

      {actionErr ? (
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">{actionErr}</Card>
      ) : null}

      {err && experiments ? (
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">
          Refresh failed. Showing the last loaded list.
        </Card>
      ) : null}

      {err && experiments == null ? (
        <ServiceUnavailable
          onRetry={refresh}
          busy={busy}
          title="Experiments service unavailable"
          body="The dashboard could not reach the kalos portal's experiments API. Try again in a moment."
        />
      ) : experiments == null ? (
        <Loading />
      ) : experiments.length === 0 ? (
        <Card className="py-10 text-center text-[13px] text-muted">
          No experiments yet. Upload a run sheet above to create the first one.
        </Card>
      ) : (
        <Card className="p-3.5">
          <ExperimentTable
            experiments={experiments}
            busyIds={busyIds}
            onFlagReady={handleFlagReady}
            onRun={handleRun}
          />
        </Card>
      )}
    </div>
  );
}
