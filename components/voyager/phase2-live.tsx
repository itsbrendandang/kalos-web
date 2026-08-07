"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge, RefreshCw, Info, FlaskConical } from "lucide-react";
import {
  getLatest,
  recipeColumns,
  recipeValue,
  type LatestResult,
  type AnalyzeResult,
  type Reliability,
} from "@/lib/api";

type Live = Extract<LatestResult, { has_data: true }>;

function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "-";
}

/** One-decimal band, but never collapse a real, tiny band to a misleading "0.0". */
function fmtBand(x: number) {
  if (!Number.isFinite(x)) return "-";
  return x > 0 && x < 0.05 ? "< 0.1" : x.toFixed(1);
}

// The engine's reason string embeds a raw GP-posterior "(±x)"; strip it so a card
// shows a single, labeled uncertainty (the conformal band) rather than two numbers.
function cleanReason(r: string) {
  return r.replace(/\s*\([^)]*±[^)]*\)/g, "").trim();
}

function verdict(r: Reliability | undefined): { tone: "ok" | "warn" | "bad"; text: string } {
  if (!r || r.spearman == null) return { tone: "bad", text: "Not enough grouped folds to score reliability on this dataset." };
  if (r.clears_floor && r.ci_excludes_zero)
    return {
      tone: "ok",
      text: "Positive but modest held-out signal: rank correlation clears the 0.20 floor and its 95% CI excludes zero. Treat recommendations as exploratory leads, not commitments.",
    };
  if (r.clears_floor)
    return { tone: "warn", text: "Borderline: clears the 0.20 floor, but the 95% CI includes zero. Low confidence." };
  if (r.ci_excludes_zero)
    return { tone: "warn", text: "Below the 0.20 reliability floor, though the 95% CI excludes zero. Low-confidence recommendations." };
  return { tone: "bad", text: "Weak: below the 0.20 floor and the 95% CI includes zero. Recommendations are low-confidence." };
}

const TONE_CLASS: Record<"ok" | "warn" | "bad", string> = {
  ok: "v-tone-ok",
  warn: "v-tone-warn",
  bad: "v-tone-bad",
};

function Reliability_({ d }: { d: AnalyzeResult }) {
  const r = d.reliability;
  const v = verdict(r);
  const toneClass = TONE_CLASS[v.tone];
  return (
    <div className={`rounded-[10px] border-[0.5px] px-3.5 py-3 ${toneClass}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <Gauge className="size-3.5" />
        <span className="text-[12px] font-medium">Model reliability</span>
        {r?.spearman != null ? (
          <span className="ml-auto font-mono text-[12px] font-semibold">
            Spearman {fmt(r.spearman, 2)}
            {r.ci95 ? ` · 95% CI [${fmt(r.ci95[0], 2)}, ${fmt(r.ci95[1], 2)}]` : ""}
          </span>
        ) : null}
      </div>
      <div className="text-[11px] leading-[1.55]">{v.text}</div>
    </div>
  );
}

function ProposalCard({ d, p, i }: { d: AnalyzeResult; p: AnalyzeResult["proposals"][number]; i: number }) {
  const band = d.conformal_q ?? p.std;
  const bandLabel = d.conformal_q != null ? "90% conformal band" : "model std";
  const isExploit = p.mode === "exploit";
  return (
    <div className="dc">
      <div className={`dc-row cursor-default ${isExploit ? "dc-row--exploit" : "dc-row--explore"}`}>
        <span className={`dcb ${isExploit ? "dcb--exploit" : "dcb--explore"}`}>{isExploit ? "Exploit" : "Explore"}</span>
        <div className="min-w-0 flex-1">
          <div className="dcn">Candidate {i + 1}</div>
          <div className="dcsub">{cleanReason(p.reason)}</div>
        </div>
        <div>
          <div className="dcp">{fmt(p.pred, 1)}</div>
          <div className="dcu">
            ± {fmtBand(band)} · {bandLabel}
          </div>
        </div>
      </div>
      <div className="dc-expand">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {recipeColumns([p], d.proposal_features).names.map((f) => {
            const v = recipeValue(p, f, d.proposal_features);
            return (
              <div key={f} className="cond-cell">
                <div className="cond-lbl truncate">{f}</div>
                <div className="cond-val">{typeof v === "number" ? fmt(v, 3) : (v ?? "—")}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Body({ d, onRefresh, busy, offline }: { d: Live; onRefresh: () => void; busy: boolean; offline: boolean }) {
  return (
    <div className="two">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[9px] border-[0.5px] border-[color:var(--v-blue-border)] bg-[var(--v-blue-tint)] px-3 py-2">
          <Activity className="size-3.5 text-[color:var(--v-blue-7-text)]" />
          <span className="text-[12px] font-medium text-[color:var(--v-blue-7-text)]">Live · scored by the kalos engine</span>
          <span className="font-mono text-[11px] text-[color:var(--v-blue-7-text)]">
            {d.n} runs · {d.d} inputs · maximize {d.target}
          </span>
          <button className="uplr ml-auto inline-flex items-center gap-1" onClick={onRefresh} disabled={busy}>
            <RefreshCw className="size-3" /> {busy ? "…" : "Refresh"}
          </button>
        </div>

        {offline ? (
          <div className="v-tone-warn mb-2 rounded-[8px] border-[0.5px] px-3 py-2 text-[11px]">
            Could not reach the engine just now; showing the last successful result. Retry with Refresh.
          </div>
        ) : null}

        <Reliability_ d={d} />

        <div className="sh mt-3.5">Recommended next experiments</div>
        <div className="mb-2 text-[11px] text-[color:var(--v-muted)]">
          The engine&apos;s actual output: the batch to run next, each with a predicted {d.target} and a distribution-free
          uncertainty band. These are experiments to run, not scale-up promotions.
        </div>
        {d.proposals.map((p, i) => (
          <ProposalCard key={i} d={d} p={p} i={i} />
        ))}
      </div>

      <div>
        <div className="sh">What drives {d.target}</div>
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--v-border)] p-3">
          <div className="mb-2 text-[10px] text-[color:var(--v-muted)]">Global signed rank correlation across all runs.</div>
          {d.drivers.map((dr) => {
            const w = Math.min(100, Math.abs(dr.rho) * 100);
            return (
              <div key={dr.name} className="mini-bar-row">
                <div className="mini-bar-label truncate" title={dr.name}>
                  {dr.name}
                </div>
                <div className="mini-bar-track">
                  <div
                    className={`mini-bar-fill ${dr.rho >= 0 ? "" : "v-driver-fill--down"}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <div className="mini-bar-pct">{dr.rho >= 0 ? "+" : ""}{fmt(dr.rho, 2)}</div>
              </div>
            );
          })}
        </div>

        <div className="sh mt-3.5">Not modeled by this engine</div>
        <div className="rounded-[10px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[color:rgba(17,17,17,0.6)]">
            <Info className="size-3 text-[color:var(--v-blue)]" /> Shown elsewhere in the mock, absent here on purpose
          </div>
          <ul className="space-y-1 text-[11px] text-[color:var(--v-muted)]">
            {(d.reliability?.unmodeled ?? ["feasibility probability", "calibration (ECE)", "scale-up transfer"]).map((u) => (
              <li key={u} className="flex gap-1.5">
                <span className="text-[color:var(--v-faint)]">•</span>
                {u}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[10px] leading-[1.5] text-[color:var(--v-muted)]">
            Success-probability % and the Bench→2000L scale-up curve need a feasibility classifier and multi-scale data the
            current engine does not have, so they are omitted rather than fabricated.
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border-[0.5px] border-[color:var(--v-border)] bg-[var(--v-surface)] px-4 py-10 text-center">
      <FlaskConical className="mx-auto mb-2 size-5 text-[color:rgba(17,17,17,0.2)]" />
      <div className="text-[12px] text-[color:var(--v-muted)]">{children}</div>
    </div>
  );
}

export function Phase2Live() {
  const [data, setData] = useState<LatestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

  async function refresh() {
    setBusy(true);
    setOffline(false);
    try {
      setData(await getLatest());
    } catch {
      setOffline(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getLatest()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setOffline(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Only take over the whole screen when there is no prior data to keep showing.
  if (data == null && offline)
    return (
      <Notice>
        The analysis service is unavailable. Try Refresh again in a moment or contact Kalos support.
      </Notice>
    );
  if (data == null) return <Notice>Scoring the latest dataset...</Notice>;
  if (!data.has_data)
    return <Notice>No dataset analyzed yet. Upload a run sheet on the optimizer&apos;s Analyze view, then return here.</Notice>;

  return <Body d={data} onRefresh={refresh} busy={busy} offline={offline} />;
}
