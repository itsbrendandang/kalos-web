"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { runSingle, runMulti, type SingleRun, type MultiRun } from "@/lib/api";
import { Card, SectionLabel, Kpi } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, DemoBadge, Loading } from "@/components/page-header";
import { ConvergenceChart, ParetoChart } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { fmt } from "@/lib/utils";

export default function OptimizePage() {
  const [s, setS] = useState<SingleRun | null>(null);
  const [m, setM] = useState<MultiRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function run() {
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
    // Initial load without a synchronous setState in the effect body (Loading
    // shows while s/m are null) — satisfies react-hooks/set-state-in-effect.
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

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Optimize"
        desc="Kalos suggests which experiment to run next to reach your target with fewer experiments."
        action={
          <Button onClick={run} disabled={busy}>
            <Sparkles />
            {busy ? "Running…" : "Run"}
          </Button>
        }
      />

      {err ? (
        <Card className="text-sm text-explore-deep">
          Could not reach the engine. Start it with <code className="font-mono">python -m kalos.portal</code> (it serves the API on port 8050).
        </Card>
      ) : null}

      <Card>
        <div className="mb-1 flex items-center gap-2">
          <SectionLabel className="mb-0">Optimize one outcome</SectionLabel>
          <DemoBadge />
        </div>
        <p className="mb-4 text-[13px] text-muted">
          Maximize titer over a 3-input recipe. Best-so-far climbs as the loop proposes and measures.
        </p>
        {s ? (
          <>
            <div className="mb-5 grid grid-cols-3 gap-3">
              <Kpi hero label="Best titer (mg/L)" value={fmt(s.best_value, 1)} />
              <Kpi label="Gap to optimum" value={gap.toFixed(3)} />
              <Kpi label="Experiments" value={s.trajectory.at(-1)!.n} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <div>
                <SectionLabel>Convergence</SectionLabel>
                <ConvergenceChart data={s.trajectory.map((t) => ({ n: t.n, best: t.best }))} yLabel="best titer (mg/L)" />
              </div>
              <div>
                <SectionLabel>Next batch proposed</SectionLabel>
                <Proposals cols={["x1", "x2", "x3"]} rows={s.proposals} predHead="pred. titer" predFn={(p) => `${p.pred} ± ${p.std}`} />
              </div>
            </div>
          </>
        ) : (
          <Loading />
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center gap-2">
          <SectionLabel className="mb-0">Optimize two outcomes at once</SectionLabel>
          <DemoBadge />
        </div>
        <p className="mb-4 text-[13px] text-muted">
          Maximize titer and purity together. The emerald frontier is the set of best achievable tradeoffs you can pick from.
        </p>
        {m ? (
          <>
            <div className="mb-5 grid grid-cols-3 gap-3">
              <Kpi hero label="Pareto front" value={m.trajectory.at(-1)!.pareto} hint="tradeoff points" />
              <Kpi label="Best titer (mg/L)" value={fmt(m.trajectory.at(-1)!.best_titer, 1)} />
              <Kpi label="Best purity (%)" value={fmt(m.trajectory.at(-1)!.best_purity, 0)} />
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <div>
                <SectionLabel>Titer vs purity</SectionLabel>
                <ParetoChart all={m.all} pareto={m.pareto} />
              </div>
              <div>
                <SectionLabel>Next batch proposed</SectionLabel>
                <Proposals
                  cols={["x1", "x2", "x3"]}
                  rows={m.proposals}
                  predHead="pred. titer / purity"
                  predFn={(p) => `${p.pred_titer} / ${p.pred_purity}%`}
                />
              </div>
            </div>
          </>
        ) : (
          <Loading />
        )}
      </Card>
    </div>
  );
}
