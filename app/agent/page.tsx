"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FlaskConical, Play, RefreshCw } from "lucide-react";
import { lazyChart } from "@/components/kit/lazy-chart";
import { PageHeader } from "@/components/kit/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclosure } from "@/components/kit/disclosure";
import { Panel, Section } from "@/components/kit/section";
import { Badge, ExampleBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/ui/honest-state";
import { useCampaign } from "@/hooks/use-engine";
import { runSingle, type SingleRun } from "@/lib/api";
import { agentStatus, awaitingRuns, measuredRuns, recipeDistance, simSummary, twinCheck } from "@/lib/agent";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import { DEMO_CAMPAIGN } from "@/lib/mock/campaign";
import { campaignView, shortId, type ActiveCampaign } from "@/lib/workbench";
import { cn } from "@/lib/utils";

const ConvergenceChart = lazyChart(() => import("@/components/charts").then((m) => m.ConvergenceChart));
const POLL_MS = 20_000;
const REPLAY_MS = 450;

/**
 * Agent: what is running right now, and the digital twin. The first half comes
 * from the engine (runs in flight, and how the model's forecast held up against
 * measured results); the second half is a sandbox that replays the optimizer on
 * a synthetic benchmark with a known answer. The sandbox is labelled as such.
 */
export default function AgentPage() {
  const campaign = useCampaign();
  const view = campaignView(campaign.data, campaign.error, DEMO_MODE, DEMO_CAMPAIGN);
  const c = view.state === "data" ? view.campaign : null;
  const demo = view.state === "data" && view.demo;
  const status = agentStatus(c);

  // Check again while runs are in flight (real data only; never poll example data).
  const { refresh } = campaign;
  const waiting = status.state === "waiting" && !demo;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Agent"
        title={view.state === "data" ? status.headline : "Your experiment agent"}
        meta={demo ? <ExampleBadge /> : null}
        description={view.state === "data" ? status.detail : "It tracks the experiments in your lab and uses a model of your process to guess results before they come back."}
        action={
          view.state === "data" ? (
            <Button variant="outline" onClick={() => void campaign.refresh()} disabled={campaign.refreshing}>
              <RefreshCw className={cn(campaign.refreshing && "animate-spin")} />
              {campaign.refreshing ? "Checking" : "Check now"}
            </Button>
          ) : null
        }
      />

      <p className="text-body text-fg-muted">
        <span className="text-fg">How it works:</span> the twin predicts each experiment, your lab runs it, and you enter the real result so the model can learn from it. You always decide what to run.
      </p>

      <Tabs defaultValue="live" className="gap-6">
        <TabsList variant="line">
          <TabsTrigger value="live">Live campaign</TabsTrigger>
          <TabsTrigger value="practice">Practice run</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="flex flex-col gap-10">
          {view.state === "error" ? (
            <ErrorState title="Could not reach the engine" description="This is a connection problem, not an idle agent." onRetry={() => void campaign.refresh()} busy={campaign.refreshing} />
          ) : view.state === "loading" ? (
            <LoadingSkeleton rows={4} label="Loading the campaign" />
          ) : (
            <>
              <RunningExperiments c={c} />
              <TwinCheckSection c={c} />
            </>
          )}
        </TabsContent>
        <TabsContent value="practice">
          <Sandbox />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RunningExperiments({ c }: { c: ActiveCampaign | null }) {
  const runs = c ? awaitingRuns(c) : [];
  return (
    <Section title="In the lab right now" description={c && runs.length ? `Round ${c.round}. Each card is an experiment waiting for its result.` : undefined} actions={runs.length ? <Link href="/campaign/record" className={buttonVariants({ variant: "outline" })}>Record results <ArrowRight /></Link> : null}>
      {runs.length === 0 ? (
        <Panel className="flex items-center gap-3 text-body text-fg-muted">
          <FlaskConical className="size-5 shrink-0" aria-hidden />
          Nothing is in the lab right now. Experiments you start from Plan show up here until their results are entered.
        </Panel>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {runs.map((r) => (
            <li key={r.id}>
              <Panel className="flex h-full flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-code text-fg">{shortId(r.id)}</span>
                  <Badge tone={r.mode === "explore" ? "accent" : "neutral"}>{r.mode === "explore" ? "Exploring" : "Exploiting"}</Badge>
                </div>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
                  {Object.entries(r.recipe).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <dt className="text-fg-muted">{k}</dt>
                      <dd className="tabular-nums text-fg">{formatNumber(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-auto flex items-baseline gap-1.5 border-t border-border pt-3 text-body">
                  <span className="text-fg-muted">Twin expects</span>
                  <span className="text-heading tabular-nums text-fg">{formatNumber(r.pred)}</span>
                  <span className="text-caption tabular-nums text-fg-muted">± {formatNumber(r.std)}</span>
                </p>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
function TwinCheckSection({ c }: { c: ActiveCampaign | null }) {
  const runs = c ? measuredRuns(c) : [];
  const check = twinCheck(runs);
  return (
    <Section title="Did the twin get it right?" description="For experiments that came back, the twin's guess next to the real result.">
      {!check ? (
        <Panel className="text-body text-fg-muted">No results are in yet, so there is nothing to compare. Once the lab reports back, this fills in.</Panel>
      ) : (
        <Panel className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat label="Results compared" value={String(check.n)} />
            <Stat label="Average miss" value={formatNumber(check.meanAbsError)} sub="how far off the guess was" />
            <Stat label="Landed in its expected range" value={`${check.withinOneSd} of ${check.n}`} sub="the twin states a range with every guess" />
          </div>
          <ul className="divide-y divide-border">
            {runs.map((r) => {
              const miss = (r.result as number) - r.pred;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-body">
                  <span className="font-mono text-code">{shortId(r.id)}</span>
                  <span className="tabular-nums text-fg-muted">guessed {formatNumber(r.pred)}</span>
                  <span className="tabular-nums text-fg">measured {formatNumber(r.result)}</span>
                  <span className="w-16 text-right tabular-nums text-fg-muted">{formatNumber(miss, "value", { sign: true })}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </Section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title tabular-nums text-fg">{value}</p>
      {sub ? <p className="text-caption text-fg-muted">{sub}</p> : null}
    </div>
  );
}

type Sim = { id: number; data: SingleRun; distance: number };

/** The sandbox: replay the optimizer on a synthetic benchmark whose best answer is known. */
function Sandbox() {
  const [sims, setSims] = useState<Sim[]>([]);
  const [active, setActive] = useState<Sim | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const total = active?.data.trajectory.length ?? 0;
  const playing = active != null && shown < total;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setShown((n) => n + 1), REPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, shown]);

  const run = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const data = await runSingle();
      const sim: Sim = { id: ++seq.current, data, distance: recipeDistance(data.best_recipe, data.optimum) };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setActive(sim);
      setShown(reduced ? data.trajectory.length : 1);
      setSims((s) => [sim, ...s].slice(0, 5));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const points = active ? active.data.trajectory.slice(0, shown).map((t) => ({ n: t.n, best: t.best })) : [];
  const last = points[points.length - 1];

  return (
    <Section
      title="Try the twin: a practice run"
      description="Watch the agent hunt for the best recipe on a practice problem where the right answer is known. It is a safe demo and does not use your data."
      actions={
        <Button onClick={() => void run()} disabled={busy || playing}>
          <Play />
          {busy ? "Starting" : playing ? "Simulating" : sims.length ? "Run again" : "Run simulation"}
        </Button>
      }
    >
      {failed ? (
        <ErrorState title="Could not run the simulation" description="The engine did not answer. Try again in a moment." onRetry={() => void run()} busy={busy} />
      ) : !active ? (
        <Panel className="text-body text-fg-muted">Press Run simulation. The agent starts with no knowledge and tries experiments one at a time. Each run is a fresh search.</Panel>
      ) : (
        <Panel className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <Stat label="Experiments run" value={last ? String(last.n) : "0"} sub={playing ? "still going" : "finished"} />
            <Stat label="Best result so far" value={last ? formatNumber(last.best) : "n/a"} />
            <Stat label="Gap to the perfect recipe" value={playing ? "n/a" : formatNumber(active.distance)} sub={playing ? "shown when it finishes" : "0 means it found it exactly"} />
          </div>
          <p aria-live="polite" className="text-heading text-fg">
            {playing ? "The agent is trying experiments and learning from each one." : simSummary(active.data.trajectory[total - 1]?.n ?? total, active.distance)}
          </p>
          <ConvergenceChart data={points} yLabel="best result so far" />
          <p className="text-caption text-fg-muted">Each step along the line is one experiment. The line climbs as the agent learns where the best recipe is.</p>
          <Disclosure summary="About this practice problem">
            <p className="pb-3 text-body text-fg-muted">
              This runs the same search the engine uses on your real campaign, but on a made-up surface with a hidden best recipe. It shows how the method behaves. It says nothing about your process.
            </p>
          </Disclosure>
        </Panel>
      )}
      {sims.length > 1 ? (
        <div>
          <p className="mb-2 text-label text-fg-muted">This session</p>
          <ul className="divide-y divide-border rounded-2xl glass px-5 text-body">
            {sims.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="text-fg">Simulation {s.id}</span>
                <span className="tabular-nums text-fg-muted">best {formatNumber(s.data.best_value)}</span>
                <span className="tabular-nums text-fg-muted">{formatNumber(s.distance)} from perfect</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
