"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { runMulti, runSingle, type MultiProposal, type MultiRun, type Proposal, type SingleRun } from "@/lib/api";
import { PageHeader } from "@/components/kit/page-header";
import { Verdict } from "@/components/kit/verdict";
import { Section } from "@/components/kit/section";
import { Disclosure } from "@/components/kit/disclosure";
import { ChartFrame } from "@/components/kit/chart-frame";
import { lazyChart } from "@/components/kit/lazy-chart";
import { Metric } from "@/components/kit/metric";
import { Button } from "@/components/ui/button";
import { ModeBadge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { formatNumber } from "@/lib/format";
import { dimensionNames, multiVerdict, singleVerdict } from "./benchmark";

const ConvergenceChart = lazyChart(() => import("./charts").then((m) => m.ConvergenceChart));
const ParetoChart = lazyChart(() => import("./charts").then((m) => m.ParetoChart));

type Mode = "single" | "multi";
type Outcome<T> = { status: "idle" } | { status: "running" } | { status: "error" } | { status: "done"; data: T };

/**
 * The engine's optimizer on a made-up surface whose best answer is known
 * (a smooth bump over a three-dimensional unit cube, not a bioprocess). It
 * shows how the method behaves; it says nothing about any real process.
 */
export default function BenchmarkPage() {
  const [mode, setMode] = useState<Mode>("single");
  const [single, setSingle] = useState<Outcome<SingleRun>>({ status: "idle" });
  const [multi, setMulti] = useState<Outcome<MultiRun>>({ status: "idle" });
  const running = single.status === "running" || multi.status === "running";
  const hasRun = single.status !== "idle" || multi.status !== "idle";

  async function run() {
    setSingle({ status: "running" });
    setMulti({ status: "running" });
    // One at a time: the engine answers busy to a second request while the first is running.
    const [s] = await Promise.allSettled([runSingle()]);
    setSingle(s.status === "fulfilled" ? { status: "done", data: s.value } : { status: "error" });
    const [m] = await Promise.allSettled([runMulti()]);
    setMulti(m.status === "fulfilled" ? { status: "done", data: m.value } : { status: "error" });
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Library"
        title="Benchmark the optimizer"
        description="Run the engine's search on a made-up surface whose best answer is known. It shows how the method behaves, not what your process will do."
        action={
          <Button onClick={() => void run()} disabled={running}>
            {running ? "Running..." : hasRun ? "Run again" : "Run the benchmark"}
          </Button>
        }
      />

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-0">
        <TabsList variant="line">
          <TabsTrigger value="single">One objective</TabsTrigger>
          <TabsTrigger value="multi">Two objectives</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "single" ? <SingleView outcome={single} onRetry={run} /> : <MultiView outcome={multi} onRetry={run} />}

      <Disclosure summary="About this benchmark">
        <div className="flex max-w-[68ch] flex-col gap-2 text-body text-fg-muted">
          <p>
            The surface is a deterministic function with one known best recipe, written into the engine for this purpose. The optimizer
            starts from a handful of random points and asks for two more recipes per round, exactly as it does on a run sheet.
          </p>
          <p>
            Because the answer is known, the distance between the recipe found and the true optimum is an honest score for the search.
            Nothing here is a prediction about a real bioprocess, and the recipes are not settings to run.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}

function NotRunYet() {
  return (
    <EmptyState
      icon={FlaskConical}
      title="Nothing has run yet"
      description="Run the benchmark to watch the optimizer search the surface. A run takes a few seconds."
    />
  );
}

function Failed({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Could not reach the engine"
      description="The benchmark request failed before the engine could answer. This is a connection problem, not a result."
      onRetry={onRetry}
    />
  );
}

function SingleView({ outcome, onRetry }: { outcome: Outcome<SingleRun>; onRetry: () => void }) {
  if (outcome.status === "idle") return <NotRunYet />;
  if (outcome.status === "running") return <LoadingSkeleton variant="chart" label="Running the benchmark" />;
  if (outcome.status === "error") return <Failed onRetry={onRetry} />;
  const data = outcome.data;
  const last = data.trajectory[data.trajectory.length - 1];
  const cols = dimensionNames(data.best_recipe.length);
  const points = data.trajectory.map((t) => ({ n: t.n, best: t.best }));

  return (
    <div className="flex flex-col gap-8">
      <Verdict tone="good">{singleVerdict(data)}</Verdict>

      <ChartFrame
        title="Best value found, by experiments run"
        n={last?.n ?? null}
        method="After each batch of two experiments the engine records the best value seen so far. The line steps up when a batch beats the previous best and stays flat when it does not."
        state={points.length < 2 ? "insufficient" : "ready"}
      >
        <ConvergenceChart data={points} />
      </ChartFrame>

      <Section title="Best recipe found against the known optimum" description="Each input runs from 0 to 1 on the benchmark surface.">
        <Table className="min-w-[24rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Recipe</TableHead>
              {cols.map((c) => (
                <TableHead key={c} numeric className="font-mono text-code">
                  {c}
                </TableHead>
              ))}
              <TableHead numeric>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Found by the search</TableCell>
              {data.best_recipe.map((v, i) => (
                <TableCell key={i} numeric>
                  {formatNumber(v)}
                </TableCell>
              ))}
              <TableCell numeric>{formatNumber(data.best_value)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-fg-muted">Known optimum</TableCell>
              {data.optimum.map((v, i) => (
                <TableCell key={i} numeric className="text-fg-muted">
                  {formatNumber(v)}
                </TableCell>
              ))}
              <TableCell numeric className="text-fg-muted">
                n/a
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Disclosure summary="Next proposed batch" meta={`${formatNumber(data.proposals.length, "count")} recipes`}>
        <ProposalsTable cols={cols} rows={data.proposals} predHead="Predicted value" predFn={(r) => `${formatNumber(r.pred)} ± ${formatNumber(r.std)}`} />
      </Disclosure>
    </div>
  );
}

function MultiView({ outcome, onRetry }: { outcome: Outcome<MultiRun>; onRetry: () => void }) {
  if (outcome.status === "idle") return <NotRunYet />;
  if (outcome.status === "running") return <LoadingSkeleton variant="chart" label="Running the benchmark" />;
  if (outcome.status === "error") return <Failed onRetry={onRetry} />;
  const data = outcome.data;
  const last = data.trajectory[data.trajectory.length - 1];
  const cols = dimensionNames(data.proposals[0]?.vals.length ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <Verdict tone="neutral">{multiVerdict(data)}</Verdict>

      <ChartFrame
        title="Titer against purity, every run"
        n={data.all.length}
        method="Each dot is one simulated run. A run is on the trade-off front when no other run beats it on both titer and purity at once; those are joined by a line."
        state={data.all.length < 2 ? "insufficient" : "ready"}
        height={300}
      >
        <ParetoChart all={data.all} pareto={data.pareto} />
      </ChartFrame>

      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Metric label="Recipes on the front" value={data.pareto.length} quantity="count" />
        <Metric label="Best titer seen" value={last?.best_titer} qualifier="made-up units" />
        <Metric label="Best purity seen" value={last?.best_purity} unit="%" />
        <Metric label="Rounds run" value={Math.max(0, data.trajectory.length - 1)} quantity="count" />
      </div>

      <Disclosure summary="Next proposed batch" meta={`${formatNumber(data.proposals.length, "count")} recipes`}>
        <ProposalsTable
          cols={cols}
          rows={data.proposals}
          predHead="Predicted titer / purity"
          predFn={(r) => `${formatNumber(r.pred_titer)} / ${formatNumber(r.pred_purity)}%`}
        />
      </Disclosure>
    </div>
  );
}

/** The proposed batch: one row per recipe, the inputs, the prediction and the reason the engine gave. */
function ProposalsTable<T extends Proposal | MultiProposal>({
  cols,
  rows,
  predHead,
  predFn,
}: {
  cols: string[];
  rows: T[];
  predHead: string;
  predFn: (r: T) => string;
}) {
  if (!rows.length) return <p className="text-body text-fg-muted">The engine proposed nothing for the next batch.</p>;
  return (
    <Table className="min-w-[36rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Recipe</TableHead>
          {cols.map((c) => (
            <TableHead key={c} numeric className="font-mono text-code">
              {c}
            </TableHead>
          ))}
          <TableHead numeric>{predHead}</TableHead>
          <TableHead>Why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell>{i + 1}</TableCell>
            {r.vals.map((v, j) => (
              <TableCell key={j} numeric>
                {formatNumber(v)}
              </TableCell>
            ))}
            <TableCell numeric>{predFn(r)}</TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                <ModeBadge mode={r.mode} />
                <span className="text-fg">{r.reason}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
