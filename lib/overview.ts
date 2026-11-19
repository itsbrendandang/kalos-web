/*
 * Pure data rules for the campaign Overview (and the charts Validate reuses),
 * kept free of React so they are tested in __tests__/overview.test.ts.
 */

import type { Driver, LatestResult } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

export type DriverBar = {
  name: string;
  rho: number;
  /** [below, above] distances from rho to its 95% CI ends, the shape recharts' ErrorBar takes. */
  ci: [number, number];
  lo: number;
  hi: number;
  significant: boolean;
};

/** The strongest `k` drivers by |rho|, strongest first. `significant` is the engine's verdict, never re-derived. */
export function topDrivers(drivers: Driver[], k = 6): DriverBar[] {
  return [...drivers]
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
    .slice(0, k)
    .map((d) => ({
      name: d.name,
      rho: d.rho,
      ci: [Math.max(0, d.rho - d.ci95[0]), Math.max(0, d.ci95[1] - d.rho)],
      lo: d.ci95[0],
      hi: d.ci95[1],
      significant: d.significant,
    }));
}

export type BestSoFarPoint = { round: number; best: number | null; runs: number };

/**
 * Measured best-so-far per history point (`campaign.history`). History round
 * 0 is the uploaded sheet; history round k is the model after round k's
 * measured results were folded in. Rounds with no measured best stay as gaps.
 */
export function bestSoFarSeries(c: Pick<ActiveCampaign, "history">): BestSoFarPoint[] {
  return c.history.map((h) => ({ round: h.round, best: h.best, runs: h.n_base }));
}

/** How a history point is named: "Uploaded sheet" for round 0, "Round k" after round k's results. */
export const historyLabel = (round: number): string => (round === 0 ? "Uploaded sheet" : `Round ${round}`);

/**
 * Where the current measured best was first reached: the earliest history
 * point whose best equals it, with how many measured runs the model held then.
 * Null when there is no measured best or the history never reports it.
 */
export function bestReached(c: Pick<ActiveCampaign, "best" | "history">): { round: number; runs: number } | null {
  if (c.best == null) return null;
  const hit = c.history.find((h) => h.best != null && h.best === c.best);
  return hit ? { round: hit.round, runs: hit.n_base } : null;
}

/** The quiet source line under the Overview's numbers. Each field is null when the engine did not send it. */
export type AnalysisSource = {
  dataset: string | null;
  /** Epoch seconds of the analysis. */
  timestamp: number | null;
  engineVersion: string | null;
  /** Full provenance hash (sha256) of the analysis, when the engine sent one. */
  provenance: string | null;
};

type ProvenanceStamp = { provenance_sha256?: unknown; timestamp?: unknown };

/**
 * Reads `proposal_provenance.provenance_sha256` (sent by current engines but
 * not yet typed in lib/api). Older engines only stamp it on the runs an
 * analysis proposed, so a started run's stamp is used only when its timestamp
 * is this analysis's: an earlier analysis's hash is never shown as this one's.
 */
export function analysisSource(latest: LatestResult | null, runs: readonly { analysis_provenance?: ProvenanceStamp | null }[] = []): AnalysisSource {
  if (!latest?.has_data) return { dataset: null, timestamp: null, engineVersion: null, provenance: null };
  const timestamp = latest.timestamp ?? null;
  const stamp = (latest as { proposal_provenance?: ProvenanceStamp | null }).proposal_provenance?.provenance_sha256;
  const fromRun =
    timestamp == null
      ? undefined
      : runs.map((r) => r.analysis_provenance).find((p) => p?.timestamp === timestamp && typeof p.provenance_sha256 === "string")?.provenance_sha256;
  const hash = typeof stamp === "string" && stamp.length > 0 ? stamp : typeof fromRun === "string" && fromRun.length > 0 ? fromRun : null;
  return {
    dataset: latest.dataset ?? latest.run?.filename ?? null,
    timestamp: timestamp ?? latest.updated ?? null,
    engineVersion: latest.engine_version ?? null,
    provenance: hash,
  };
}

/**
 * Round-number axis ticks covering [min, max] (about `count` of them). A flat
 * series (min === max) gets a small symmetric span so the axis still reads.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (hi === lo) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks[ticks.length - 1] < hi) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)));
  return ticks;
}

/**
 * The highest result recorded this round that is not in the model yet (a
 * started run with a measured value, before the next re-analysis folds it
 * in). `campaign.best` only covers runs in the model, so the Overview names
 * this separately rather than letting a newer, higher measurement go unseen.
 * Null when nothing is recorded or no recorded result beats `best`.
 */
export function newerBest(c: Pick<ActiveCampaign, "best" | "pending">): { value: number; runId: string } | null {
  let top: { value: number; runId: string } | null = null;
  for (const r of c.pending) {
    if (r.awaiting || r.result == null || !Number.isFinite(r.result)) continue;
    if (!top || r.result > top.value) top = { value: r.result, runId: r.id };
  }
  if (!top) return null;
  return c.best == null || top.value > c.best ? top : null;
}
