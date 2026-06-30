"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Layers, RefreshCw, Sparkles } from "lucide-react";
import { runSingle, runMulti, type SingleRun, type MultiRun, type Proposal, type MultiProposal } from "@/lib/api";
import { Card, SectionLabel, Tag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConvergenceChart, ParetoChart, Sparkline } from "@/components/charts";
import { fmt } from "@/lib/utils";

type Objective = "single" | "multi";

// Example data so the dashboard renders before/without the engine on :8050.
function demoSingle(): SingleRun {
  const targets = [41, 53, 58, 67, 71, 78, 84, 88, 91];
  const trajectory = targets.map((best, i) => ({ round: i + 1, best, n: (i + 1) * 4 }));
  return {
    trajectory,
    proposals: [
      { vals: [0.62, 1.4, 37], pred: 93.1, std: 2.8, mode: "exploit", reason: "near the current best ridge" },
      { vals: [0.81, 0.9, 41], pred: 89.4, std: 6.2, mode: "explore", reason: "high uncertainty, unsampled corner" },
      { vals: [0.55, 1.7, 34], pred: 90.7, std: 3.5, mode: "exploit", reason: "refines the leading recipe" },
    ],
    best_recipe: [0.6, 1.5, 36],
    best_value: 91,
    optimum: [0.58, 1.55, 35],
  };
}

function demoMulti(): MultiRun {
  const all = [
    { titer: 41, purity: 71 }, { titer: 58, purity: 64 }, { titer: 66, purity: 80 },
    { titer: 72, purity: 76 }, { titer: 80, purity: 69 }, { titer: 85, purity: 83 },
    { titer: 88, purity: 74 }, { titer: 91, purity: 79 },
  ];
  const pareto = [
    { titer: 66, purity: 80 }, { titer: 85, purity: 83 }, { titer: 91, purity: 79 },
  ];
  return {
    trajectory: [{ round: 8, pareto: pareto.length, best_titer: 91, best_purity: 83 }],
    pareto,
    all,
    proposals: [
      { vals: [0.6, 1.5, 36], pred_titer: 92.0, pred_purity: 82, mode: "exploit", reason: "extends the frontier" },
      { vals: [0.84, 1.1, 44], pred_titer: 87.5, pred_purity: 85, mode: "explore", reason: "trades titer for purity" },
    ],
  };
}

function StatTile({ icon: Icon, label, value, soft }: {
  icon: typeof FlaskConical;
  label: string;
  value: React.ReactNode;
  soft?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(20,40,30,.04),0_10px_26px_rgba(20,40,30,.05)]">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${soft ? "bg-accent2-soft text-accent2-deep" : "bg-accent-soft text-accent-hover"}`}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <div className="tabular font-mono text-[20px] font-semibold leading-none">{value}</div>
        <div className="mt-1 text-[11.5px] text-muted">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [single, setSingle] = useState<SingleRun>(demoSingle);
  const [multi, setMulti] = useState<MultiRun>(demoMulti);
  const [obj, setObj] = useState<Objective>("single");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([runSingle(), runMulti()]);
      setSingle(a);
      setMulti(b);
      setLive(true);
    } catch {
      setSingle(demoSingle());
      setMulti(demoMulti());
      setLive(false);
    } finally {
      setBusy(false);
    }
  }
  // Initial fetch: setState only after the await, so we don't trigger
  // cascading renders by setting state synchronously inside the effect.
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([runSingle(), runMulti()]);
        if (on) {
          setSingle(a);
          setMulti(b);
          setLive(true);
        }
      } catch {
        // Demo data is already in state; keep the offline marker explicit.
        if (on) setLive(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const last = single.trajectory.at(-1)!;
  const first = single.trajectory[0]!.best;
  const gain = first ? Math.round(((single.best_value - first) / first) * 100) : 0;
  const proposals = obj === "single" ? single.proposals : multi.proposals;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl font-semibold tracking-tight">DNA of your bioprocess</h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
            <span className={`size-1.5 rounded-full ${live ? "bg-accent" : "bg-explore"}`} />
            {live ? "Live — engine connected" : "Example data — engine offline"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-card p-1 shadow-[0_1px_2px_rgba(20,40,30,.05)]">
            {(["single", "multi"] as Objective[]).map((o) => (
              <button
                key={o}
                onClick={() => setObj(o)}
                aria-pressed={obj === o}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  obj === o ? "bg-accent text-white" : "text-muted hover:text-fg"
                }`}
              >
                {o === "single" ? "Single" : "Multi"}
              </button>
            ))}
          </div>
          <Button onClick={load} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : ""} />
            {busy ? "Running…" : "Run next batch"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Hero — optimization landscape */}
        <Card className="relative flex flex-col overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent2-soft blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <SectionLabel className="mb-0.5">Optimization landscape</SectionLabel>
              <p className="text-[12.5px] text-muted">
                {obj === "single"
                  ? "Best-so-far climbs as Kalos proposes and you measure."
                  : "The frontier is the set of best titer / purity tradeoffs."}
              </p>
            </div>
            <Link href="/optimize" aria-label="Open optimizer" className="grid size-8 place-items-center rounded-full bg-bg text-muted transition-colors hover:text-accent">
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>

          <div className="relative mt-4 grow">
            {obj === "single" ? (
              <ConvergenceChart data={single.trajectory.map((t) => ({ n: t.n, best: t.best }))} yLabel="best titer (mg/L)" />
            ) : (
              <ParetoChart all={multi.all} pareto={multi.pareto} />
            )}
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-bg px-4 py-3">
            <Sparkles className="size-4 text-accent2-deep" />
            <span className="text-[12.5px] text-muted">
              Kalos balances <span className="font-semibold text-fg">exploring</span> new recipes and{" "}
              <span className="font-semibold text-fg">exploiting</span> known-good ones.
            </span>
            <Link href="/optimize" className="ml-auto text-[12.5px] font-semibold text-accent hover:text-accent-hover">
              Learn more →
            </Link>
          </div>
        </Card>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {/* Status header */}
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(20,40,30,.04),0_10px_26px_rgba(20,40,30,.05)]">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sidebar font-head text-[15px] font-bold text-white">K</span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">Kalos Engine</div>
              <div className="font-mono text-[11px] text-muted">BoTorch · ESM-2 · :8050</div>
            </div>
            <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-semibold ${live ? "bg-accent-soft text-accent-hover" : "bg-explore-soft text-explore-deep"}`}>
              {live ? "online" : "demo"}
            </span>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4">
            <StatTile icon={FlaskConical} label="Experiments run" value={last.n} />
            <StatTile icon={Layers} label="Active proposals" value={proposals.length} soft />
          </div>

          {/* Headline metric */}
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <SectionLabel className="mb-0.5">Best titer</SectionLabel>
                <p className="text-[12px] text-muted">over {last.n} experiments</p>
              </div>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-hover">+{gain}%</span>
            </div>
            <div className="mt-1.5 flex items-end gap-1.5">
              <span className="tabular font-mono text-[44px] font-semibold leading-none">{fmt(single.best_value, 0)}</span>
              <span className="mb-1.5 text-[13px] text-muted">mg/L</span>
            </div>
            <div className="mt-2">
              <Sparkline data={single.trajectory.map((t) => ({ best: t.best }))} />
            </div>
          </Card>

          {/* Next experiments timeline */}
          <Card className="p-5">
            <SectionLabel>Next experiments</SectionLabel>
            <ul className="flex flex-col gap-2.5">
              {proposals.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bg font-mono text-[11px] text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex items-center gap-2">
                      <Tag mode={p.mode} />
                      <span className="truncate text-[12px] text-muted">{p.reason}</span>
                    </div>
                  </div>
                  <span className="tabular shrink-0 font-mono text-[12.5px] font-semibold">
                    {obj === "single" ? fmt((p as Proposal).pred, 0) : fmt((p as MultiProposal).pred_titer, 0)}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/optimize" className="mt-4 inline-flex text-[12.5px] font-semibold text-accent hover:text-accent-hover">
              Open optimizer →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
