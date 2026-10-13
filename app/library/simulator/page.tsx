"use client";

import { useEffect, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { runSingle, runMulti, type MultiRun, type SingleRun } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { PageHeader } from "@/components/page-header";
import { ConvergenceChart, ParetoChart } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { formatNumber } from "@/lib/format";

type Mode = "single" | "multi";

/** Distance from the recipe the run actually found to the benchmark's known
 *  optimum recipe (both are points in the same unit cube) - 0 means the
 *  search landed exactly on the true optimum. */
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

      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-4 text-[13px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          This runs the engine&apos;s real Bayesian optimization loop, but against a{" "}
          <span className="font-semibold">synthetic in-silico benchmark surface</span> - a deterministic function
          with a known optimum, not a real bioprocess or any client data. It exists to show how the optimizer
          searches and converges, not to predict a real outcome. Nothing on this page is a validated model or a
          recommendation to run.
        </p>
      </div>

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
          <p className="mb-3 text-center font-mono text-[11px] text-muted">Running the optimizer…</p>
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
      <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div className="tabular mt-0.5 font-mono text-[20px] font-semibold text-fg">{value}</div>
      {sub ? <div className="text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {sub ? <span className="hidden min-w-0 truncate text-[12px] text-muted md:block">{sub}</span> : null}
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
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">
          Refresh failed. Showing the last run.
        </Card>
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
        <Card className="p-3.5">
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[420px] border-separate border-spacing-y-1 font-mono text-xs">
              <thead>
                <tr className="text-[10px] text-muted uppercase">
                  <th className="px-2 py-1.5 text-left"></th>
                  {cols.map((c) => (
                    <th key={c} className="px-2 py-1.5 text-right">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2 text-left text-fg">
                    Found by search
                  </td>
                  {data.best_recipe.map((v, i) => (
                    <td key={i} className="border-y border-border/70 bg-card px-2 py-2 text-right text-fg">
                      {formatNumber(v)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="rounded-l-xl border-y border-l border-border/70 bg-card px-2 py-2 text-left text-muted">
                    Known optimum
                  </td>
                  {data.optimum.map((v, i) => (
                    <td key={i} className="rounded-r-xl border-y border-r border-border/70 bg-card px-2 py-2 text-right text-muted">
                      {formatNumber(v)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <SectionHead title="Next proposed batch" sub="Unlabeled unit-cube dimensions - a synthetic benchmark, not a real recipe." />
        <Card className="p-3.5">
          {data.proposals.length ? (
            <Proposals
              cols={cols}
              rows={data.proposals}
              predHead="predicted"
              predFn={(r) => `${formatNumber(r.pred)} ± ${formatNumber(r.std)}`}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
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
        <Card className="border-amber/30 bg-amber-soft text-sm text-amber">
          Refresh failed. Showing the last run.
        </Card>
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
        <Card className="p-3.5">
          {data.proposals.length ? (
            <Proposals
              cols={cols}
              rows={data.proposals}
              predHead="predicted titer / purity"
              predFn={(r) => `${formatNumber(r.pred_titer)} / ${formatNumber(r.pred_purity, "count")}%`}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
          )}
        </Card>
      </section>
    </div>
  );
}
