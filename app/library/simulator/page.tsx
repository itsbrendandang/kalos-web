"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { runSingle, runMulti, type MultiRun, type SingleRun } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Callout } from "@/components/kit/callout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { PageHeader } from "@/components/page-header";
import { Proposals } from "@/components/proposals";
import { formatNumber } from "@/lib/format";
import { lazyChart } from "@/components/kit/lazy-chart";

type Mode = "single" | "multi";

/** Distance from the recipe the run actually found to the benchmark's known
 *  optimum recipe (both are points in the same unit cube) - 0 means the
 *  search landed exactly on the true optimum. */
const ConvergenceChart = lazyChart(() => import("@/components/charts").then((m) => m.ConvergenceChart));
const ParetoChart = lazyChart(() => import("@/components/charts").then((m) => m.ParetoChart));

function recipeDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

/**
 * In-silico optimizer: runs the engine's Bayesian optimization loop against a
 * synthetic benchmark surface (kalos/portal/app.py's `_titer`/`_purity` - a
 * deterministic gaussian bump over a 3-dimensional unit cube, not a real
 * bioprocess). This is a demo/sanity-check of the optimizer's search
 * behavior against a KNOWN answer, not an analysis of any real data or a
 * validated predictor - see the banner below and match /decide's honesty bar.
 */
export default function Simulate() {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState<SingleRun | null>(null);
  const [multi, setMulti] = useState<MultiRun | null>(null);
  const [singleErr, setSingleErr] = useState(false);
  const [multiErr, setMultiErr] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setSingleErr(false);
    setMultiErr(false);
    const [s, m] = await Promise.allSettled([runSingle(), runMulti()]);
    if (s.status === "fulfilled") setSingle(s.value);
    else setSingleErr(true);
    if (m.status === "fulfilled") setMulti(m.value);
    else setMultiErr(true);
    setBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, m] = await Promise.allSettled([runSingle(), runMulti()]);
      if (cancelled) return;
      if (s.status === "fulfilled") setSingle(s.value);
      else setSingleErr(true);
      if (m.status === "fulfilled") setMulti(m.value);
      else setMultiErr(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = single == null && multi == null && !singleErr && !multiErr;
  const bothFailed = singleErr && multiErr && single == null && multi == null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="In-silico"
        title="In-silico optimizer"
        desc="Watch the Bayesian optimizer search a benchmark surface with a known answer, single- and multi-objective."
        action={
          <Button variant="ghost" onClick={refresh} disabled={busy}>
            <RefreshCw />
            {busy ? "Running..." : "Run again"}
          </Button>
        }
      />

      <p className="max-w-[68ch] text-body text-fg-muted">
          This runs the engine&apos;s real Bayesian optimization loop, but against a{" "}
          <span className="font-medium text-fg">synthetic in-silico benchmark surface</span> - a deterministic function
          with a known optimum, not a real bioprocess or any client data. It exists to show how the optimizer
          searches and converges, not to predict a real outcome. Nothing on this page is a validated model or a
          recommendation to run.
        </p>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-fit gap-0">
        <TabsList>
          <TabsTrigger value="single">Single objective</TabsTrigger>
          <TabsTrigger value="multi">Multi-objective</TabsTrigger>
        </TabsList>
      </Tabs>

      {bothFailed ? (
        <ErrorState
          title="Engine unavailable"
          description="The dashboard could not reach the kalos engine to run the in-silico optimizer. Try again in a moment."
          onRetry={refresh}
          busy={busy}
        />
      ) : loading ? (
        <div className="py-6">
          <p className="mb-3 text-center text-caption text-fg-muted">Running the optimizer…</p>
          <LoadingSkeleton variant="rows" rows={4} label="Running the optimizer" className="mx-auto max-w-md" />
        </div>
      ) : mode === "single" ? (
        <SingleView data={single} err={singleErr} busy={busy} onRetry={refresh} />
      ) : (
        <MultiView data={multi} err={multiErr} busy={busy} onRetry={refresh} />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-fg-muted">{label}</div>
      <div className="mt-0.5 text-title tabular-nums text-fg">{value}</div>
      {sub ? <div className="text-caption text-fg-muted">{sub}</div> : null}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-heading whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-caption text-fg-muted md:block">{sub}</span> : null}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function SingleView({
  data,
  err,
  busy,
  onRetry,
}: {
  data: SingleRun | null;
  err: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (err && data == null) {
    return (
      <ErrorState
        title="Single-objective run unavailable"
        description="The engine did not return a single-objective run. Try again in a moment."
        onRetry={onRetry}
        busy={busy}
      />
    );
  }
  if (!data) return null;

  const last = data.trajectory[data.trajectory.length - 1];
  const dims = data.best_recipe.length;
  const dist = recipeDistance(data.best_recipe, data.optimum);
  const chartData = data.trajectory.map((t) => ({ n: t.n, best: t.best }));
  const cols = Array.from({ length: dims }, (_, i) => `x${i + 1}`);

  return (
    <div className="flex flex-col gap-6">
      {err ? (
        <Callout tone="warn" title="Refresh failed. Showing the last run." />
      ) : null}

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Best value found" value={formatNumber(data.best_value)} sub={`after ${last.n} experiments`} />
        <Stat label="Rounds" value={String(data.trajectory.length - 1)} />
        <Stat
          label="Distance to known optimum"
          value={formatNumber(dist)}
          sub="0 = found the true optimum, in recipe-space units"
        />
        <Stat label="Next batch" value={String(data.proposals.length)} sub="proposed experiments" />
      </Card>

      <section>
        <SectionHead title="Convergence" sub="Best value found so far, as the search runs more experiments." />
        <Card>
          <ConvergenceChart data={chartData} yLabel="best value" />
        </Card>
      </section>

      <section>
        <SectionHead title="Best recipe found vs. the known optimum" />
        <Card padding="none">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead></TableHead>
                {cols.map((c) => (
                  <TableHead key={c} numeric>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Found by search</TableCell>
                {data.best_recipe.map((v, i) => (
                  <TableCell key={i} numeric>
                    {formatNumber(v)}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="text-fg-muted">Known optimum</TableCell>
                {data.optimum.map((v, i) => (
                  <TableCell key={i} numeric className="text-fg-muted">
                    {formatNumber(v)}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </section>

      <section>
        <SectionHead title="Next proposed batch" sub="Unlabeled unit-cube dimensions - a synthetic benchmark, not a real recipe." />
        <Card padding="none">
          {data.proposals.length ? (
            <Proposals
              cols={cols}
              rows={data.proposals}
              predHead="predicted"
              predFn={(r) => `${formatNumber(r.pred)} ± ${formatNumber(r.std)}`}
            />
          ) : (
            <EmptyState className="py-10" title="No proposals" description="The optimizer returned no next batch for this run." />
          )}
        </Card>
      </section>
    </div>
  );
}

function MultiView({
  data,
  err,
  busy,
  onRetry,
}: {
  data: MultiRun | null;
  err: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (err && data == null) {
    return (
      <ErrorState
        title="Multi-objective run unavailable"
        description="The engine did not return a multi-objective run. Try again in a moment."
        onRetry={onRetry}
        busy={busy}
      />
    );
  }
  if (!data) return null;

  const last = data.trajectory[data.trajectory.length - 1];
  const dims = data.proposals[0]?.vals.length ?? 0;
  const cols = Array.from({ length: dims }, (_, i) => `x${i + 1}`);

  return (
    <div className="flex flex-col gap-6">
      {err ? (
        <Callout tone="warn" title="Refresh failed. Showing the last run." />
      ) : null}

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat label="Pareto front size" value={String(last?.pareto ?? data.pareto.length)} sub="non-dominated recipes" />
        <Stat label="Best titer seen" value={formatNumber(last?.best_titer ?? 0)} sub="mg/L, synthetic" />
        <Stat label="Best purity seen" value={formatNumber(last?.best_purity ?? 0, "count")} sub="%, synthetic" />
        <Stat label="Next batch" value={String(data.proposals.length)} sub="proposed experiments" />
      </Card>

      <section>
        <SectionHead title="Pareto front" sub="Titer vs. purity - the two objectives trade off, so there is no single winner." />
        <Card>
          <ParetoChart all={data.all} pareto={data.pareto} />
        </Card>
      </section>

      <section>
        <SectionHead title="Next proposed batch" sub="Unlabeled unit-cube dimensions - a synthetic benchmark, not a real recipe." />
        <Card padding="none">
          {data.proposals.length ? (
            <Proposals
              cols={cols}
              rows={data.proposals}
              predHead="predicted titer / purity"
              predFn={(r) => `${formatNumber(r.pred_titer)} / ${formatNumber(r.pred_purity, "count")}%`}
            />
          ) : (
            <EmptyState className="py-10" title="No proposals" description="The optimizer returned no next batch for this run." />
          )}
        </Card>
      </section>
    </div>
  );
}
