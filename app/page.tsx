"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, Gauge, Database, TrendingUp, Upload, RefreshCw } from "lucide-react";
import { getLatest, type LatestResult } from "@/lib/api";
import { Card, SectionLabel, StatCard, Tag } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Loading } from "@/components/page-header";
import { DriversBar, PredScatter } from "@/components/charts";
import { Proposals } from "@/components/proposals";
import { fmt } from "@/lib/utils";

const BTN_ACCENT =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-[13px] font-semibold whitespace-nowrap text-white shadow-[0_1px_2px_rgba(32,74,244,.25)] transition-colors hover:bg-accent-hover [&_svg]:size-4 [&_svg]:shrink-0";

function ago(ts?: number) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Overview() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function refresh() {
    setBusy(true);
    setErr(false);
    try {
      setData(await getLatest());
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        desc="Your closed-loop optimizer, on your data: model reliability, what drives the outcome, and the experiments to run next."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={refresh} disabled={busy}>
              <RefreshCw />
              {busy ? "…" : "Refresh"}
            </Button>
            <Link href="/analyze" className={BTN_ACCENT}>
              <Upload />
              Analyze data
            </Link>
          </div>
        }
      />

      {err ? (
        <Card className="text-sm text-explore-deep">
          Could not reach the engine. Start it with <code className="font-mono">python -m kalos.portal</code> (port 8050),
          then Refresh.
        </Card>
      ) : null}

      {data == null ? (
        <Loading />
      ) : !data.has_data ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-hover">
            <Database className="size-5" />
          </span>
          <div className="font-head text-lg font-semibold">No dataset analyzed yet</div>
          <p className="max-w-[46ch] text-[13.5px] text-muted">
            Upload a run sheet on Analyze and this page will show your model&apos;s reliability, what drives your outcome,
            and the next experiments to run.
          </p>
          <Link href="/analyze" className={BTN_ACCENT}>
            <Upload />
            Upload a run sheet
          </Link>
        </Card>
      ) : (
        <OverviewBody d={data} />
      )}
    </div>
  );
}

function OverviewBody({ d }: { d: Extract<LatestResult, { has_data: true }> }) {
  const rho = d.cv_spearman;
  const ci = d.cv_ci95 ?? null;
  const reliable = rho != null && ci != null && ci[0] > 0;
  const top = d.proposals[0];
  const topDriver = d.drivers[0];

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted">
        <Database className="size-3.5" />
        <span className="text-fg">{d.dataset}</span>
        <span>
          · {d.n} runs · {d.d} inputs · target {d.target}
          {d.updated ? ` · ${ago(d.updated)}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Target} label={`Best ${d.target}`} value={fmt(d.best, 1)} sub="best observed" />
        <StatCard
          icon={Gauge}
          tone={reliable ? "accent" : "explore"}
          label="Model reliability"
          value={rho != null ? rho.toFixed(2) : "n/a"}
          sub={
            rho != null
              ? ci
                ? `held-out corr · 95% CI [${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]`
                : "held-out rank corr"
              : "not scored (too few groups)"
          }
        />
        <StatCard
          icon={Database}
          label="Runs / inputs"
          value={`${d.n} / ${d.d}`}
          sub={d.cv_n_groups != null ? `${d.cv_n_groups} recipe groups` : "grouped, leakage-controlled"}
        />
        <StatCard
          icon={TrendingUp}
          label="Top driver"
          value={topDriver ? (topDriver.name.length > 11 ? topDriver.name.slice(0, 11) + "…" : topDriver.name) : "—"}
          sub={topDriver ? `ρ ${topDriver.rho.toFixed(2)}` : ""}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <SectionLabel>Predicted vs measured (out-of-fold)</SectionLabel>
          <p className="mb-3 text-[13px] text-muted">
            Honest held-out predictions; points near the dashed line are well ranked.
          </p>
          {d.oof.length ? (
            <PredScatter oof={d.oof} />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">not enough held-out points</p>
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
              <div className="mt-4 grid grid-cols-2 gap-2">
                {top.vals.map((v, i) => (
                  <div key={i} className="rounded-xl bg-bg px-3 py-2.5">
                    <div className="truncate text-[10px] font-medium text-muted">{d.proposal_features[i] ?? `x${i + 1}`}</div>
                    <div className="tabular mt-0.5 font-mono text-[15px] font-semibold text-fg">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-auto rounded-xl bg-accent-soft px-3 py-3">
                <div className="text-[10px] font-medium text-accent-hover">predicted {d.target}</div>
                <div className="tabular mt-0.5 font-mono text-[20px] font-semibold text-accent-hover">
                  {top.pred} <span className="text-[12px] font-normal">± {top.std}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionLabel>What drives {d.target}</SectionLabel>
          <p className="mb-3 text-[13px] text-muted">Signed correlation: dark bars raise the outcome, light bars lower it.</p>
          {d.drivers.length ? (
            <DriversBar drivers={d.drivers} />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no drivers</p>
          )}
        </Card>

        <Card>
          <SectionLabel>Recommended next experiments</SectionLabel>
          <p className="mb-3 text-[13px] text-muted">Ranked by the acquisition function; highest expected gain first.</p>
          {d.proposals.length ? (
            <Proposals
              cols={d.proposal_features}
              rows={d.proposals}
              predHead={`pred. ${d.target}`}
              predFn={(p) => `${p.pred} ± ${p.std}`}
            />
          ) : (
            <p className="py-10 text-center text-[12px] text-muted">no proposals</p>
          )}
        </Card>
      </div>
    </>
  );
}
