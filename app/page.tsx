"use client";

import { useEffect, useState } from "react";
import { Sparkles, Target, FlaskConical, GitBranch, TrendingUp } from "lucide-react";
import { runSingle, runMulti, type SingleRun, type MultiRun } from "@/lib/api";
import { Card, SectionLabel, StatCard, Tag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, DemoBadge, Loading } from "@/components/page-header";
import { ConvergenceChart, ParetoChart } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { fmt } from "@/lib/utils";

export default function Overview() {
  const [s, setS] = useState<SingleRun | null>(null);
  const [m, setM] = useState<MultiRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function run() {
    // Refresh-button path (an event handler): synchronous setState here is fine.
    setBusy(true);
    setErr(false);
    try {
      const [a, b] = await Promise.all([runSingle(), runMulti()]);
      setS(a);
      setM(b);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    // Initial load: no synchronous setState in the effect body (Loading shows
    // while s/m are null), which satisfies react-hooks/set-state-in-effect.
    let cancelled = false;
    Promise.all([runSingle(), runMulti()])
      .then(([a, b]) => {
        if (!cancelled) {
          setS(a);
          setM(b);
        }
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gap = s ? Math.sqrt(s.best_recipe.reduce((acc, v, i) => acc + (v - s.optimum[i]) ** 2, 0)) : 0;
  const top = s?.proposals[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        desc="Your closed-loop optimizer at a glance — the best result so far, how fast it converged, and the experiments to run next."
        action={
          <Button onClick={run} disabled={busy}>
            <Sparkles />
            {busy ? "Running…" : "Refresh"}
          </Button>
        }
      />

      {err ? (
        <Card className="text-sm text-explore-deep">
          Could not reach the engine. Start it with <code className="font-mono">python -m kalos.portal</code> (it serves
          the API on port 8050), then Refresh.
        </Card>
      ) : null}

      {/* stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Target} label="Best titer" value={s ? fmt(s.best_value, 1) : "—"} sub="mg/L, single-objective" />
        <StatCard icon={FlaskConical} label="Experiments" value={s ? s.trajectory.at(-1)!.n : "—"} sub="to reach the best" />
        <StatCard icon={TrendingUp} label="Gap to optimum" value={s ? gap.toFixed(3) : "—"} sub="distance in recipe space" />
        <StatCard icon={GitBranch} tone="explore" label="Pareto tradeoffs" value={m ? m.trajectory.at(-1)!.pareto : "—"} sub="titer vs purity" />
      </div>

      {/* convergence + the single most useful action */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <SectionLabel className="mb-0">Convergence</SectionLabel>
            <DemoBadge />
          </div>
          <p className="mb-3 text-[13px] text-muted">
            Best titer climbs as the loop proposes and measures — the point is fewer experiments to target.
          </p>
          {s ? (
            <ConvergenceChart data={s.trajectory.map((t) => ({ n: t.n, best: t.best }))} yLabel="best titer (mg/L)" />
          ) : (
            <Loading />
          )}
        </Card>

        <Card className="flex flex-col">
          <SectionLabel>Run this next</SectionLabel>
          {top ? (
            <div className="flex flex-1 flex-col">
              <div className="mt-1 flex items-center gap-2">
                <Tag mode={top.mode} />
                <span className="text-[12px] text-muted">{top.reason}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {top.vals.map((v, i) => (
                  <div key={i} className="rounded-xl bg-bg px-3 py-2.5">
                    <div className="text-[10px] font-medium text-muted">x{i + 1}</div>
                    <div className="tabular mt-0.5 font-mono text-[16px] font-semibold text-fg">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-auto rounded-xl bg-accent-soft px-3 py-3">
                <div className="text-[10px] font-medium text-accent-hover">predicted titer</div>
                <div className="tabular mt-0.5 font-mono text-[20px] font-semibold text-accent-hover">
                  {top.pred} <span className="text-[12px] font-normal">± {top.std}</span>
                </div>
              </div>
            </div>
          ) : (
            <Loading />
          )}
        </Card>
      </div>

      {/* pareto + the ranked recommendations */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-1 flex items-center gap-2">
            <SectionLabel className="mb-0">Titer vs purity</SectionLabel>
            <DemoBadge />
          </div>
          <p className="mb-3 text-[13px] text-muted">The emerald frontier is the set of best achievable tradeoffs.</p>
          {m ? <ParetoChart all={m.all} pareto={m.pareto} /> : <Loading />}
        </Card>

        <Card>
          <SectionLabel>Recommended next experiments</SectionLabel>
          <p className="mb-3 text-[13px] text-muted">Ranked by the acquisition function — highest expected gain first.</p>
          {s ? (
            <Proposals cols={["x1", "x2", "x3"]} rows={s.proposals} predHead="pred. titer" predFn={(p) => `${p.pred} ± ${p.std}`} />
          ) : (
            <Loading />
          )}
        </Card>
      </div>
    </div>
  );
}
