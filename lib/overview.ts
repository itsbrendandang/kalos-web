/*
 * Pure data rules for the campaign Overview (and the charts Validate reuses),
 * kept free of React so they are tested in __tests__/overview.test.ts.
 */

import { incumbentLabel, type AnalyzeResult, type Driver, type LatestResult } from "@/lib/api";
import { nextRange, toProgressData, type ProgressCampaign } from "@/lib/viz-data/progress-chart";
import type { ActiveCampaign } from "@/lib/workbench";

export type DriverBar = {
  name: string;
  rho: number;
  /** [below, above] distances from rho to its 95% CI ends, an error-bar shape. */
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

// --- Hero tiles (VIZ_SPEC 6) ------------------------------------------------

type TileAnalysis = Pick<AnalyzeResult, "best" | "noise" | "proposals" | "conformal_q" | "conformal_coverage" | "timestamp">;

export type BestTile = {
  /** The headline measured value: the best reproducible recipe on a replicate-aware fit, else the best measured run. */
  value: number | null;
  /** incumbentLabel(): "best measured run" or "best reproducible recipe". */
  label: string;
  /** The best single run, shown beneath when the headline is the reproducible best and differs from it. */
  single: number | null;
  /** Change from the previous history point, with that point named. */
  delta: { current: number; baseline: number; baselineLabel: string } | null;
  reached: { round: number; runs: number } | null;
};

/** The Best measured tile. Measured values only; a missing best stays null (n/a). */
export function bestTile(c: Pick<ActiveCampaign, "best" | "history" | "round">, analysis: Pick<AnalyzeResult, "noise"> | null): BestTile {
  const reproducible = analysis?.noise?.replicate_aware ? (analysis.noise.best_reproducible ?? null) : null;
  const useReproducible = reproducible != null && Number.isFinite(reproducible) && reproducible !== c.best;
  const i = c.history.findIndex((h) => h.round === c.round);
  const prev = i >= 1 ? c.history[i - 1] : null;
  const cur = i >= 0 ? c.history[i] : null;
  return {
    value: useReproducible ? reproducible : c.best,
    label: useReproducible ? "best reproducible recipe" : analysis ? incumbentLabel(analysis) : "best measured run",
    single: useReproducible ? c.best : null,
    delta:
      !useReproducible && prev?.best != null && cur?.best != null
        ? { current: cur.best, baseline: prev.best, baselineLabel: prev.round === 0 ? "the uploaded sheet" : `round ${prev.round}` }
        : null,
    reached: bestReached(c),
  };
}

export type NextTile =
  | { kind: "none"; reason: string }
  | {
      /** proposed: the analysis's batch, not started. started: this round's runs, in the lab. */
      kind: "proposed" | "started";
      n: number;
      /** Lowest interval bound to highest (exact min/max), or the predictions' own span without intervals. */
      lo: number;
      hi: number;
      withIntervals: boolean;
      /** The highest prediction in the batch, with its band when it has one. */
      top: { pred: number; lo: number | null; hi: number | null };
      coverage: number | null;
      halfWidth: number | null;
      /** analysis_in_sync === false. */
      stale: boolean;
    };

/** The Next batch tile, from the same adapter the progress chart draws (so the two never disagree). */
export function nextTile(c: ProgressCampaign, analysis: TileAnalysis | null): NextTile {
  if (!analysis) return { kind: "none", reason: "Appears after the first analysis." };
  const d = toProgressData(c, analysis);
  const stale = c.analysis_in_sync === false;
  if (d.next) {
    const r = nextRange(d.next)!;
    const top = [...d.next.preds].sort((a, b) => b.pred - a.pred)[0];
    return { kind: "proposed", n: d.next.preds.length, lo: r.lo, hi: r.hi, withIntervals: r.withIntervals, top, coverage: d.coverage, halfWidth: d.halfWidth, stale };
  }
  const currentRound = c.round ?? 0;
  const started = (c.pending ?? []).filter((r) => r.round === currentRound);
  const runs = d.runs.filter((r) => started.some((s) => s.id === r.id));
  if (runs.length) {
    const withIntervals = runs.every((r) => r.lo != null && r.hi != null);
    const top = [...runs].sort((a, b) => b.pred - a.pred)[0];
    return {
      kind: "started",
      n: runs.length,
      lo: Math.min(...runs.map((r) => (withIntervals ? r.lo! : r.pred))),
      hi: Math.max(...runs.map((r) => (withIntervals ? r.hi! : r.pred))),
      withIntervals,
      top: { pred: top.pred, lo: top.lo, hi: top.hi },
      coverage: d.coverage,
      halfWidth: d.halfWidth,
      stale,
    };
  }
  return { kind: "none", reason: "The current analysis proposed no batch." };
}

export type RunsTile = {
  /** Measured rows in the model (upload plus folded-in rounds). */
  inModel: number | null;
  /** Rows from the uploaded sheet (history round 0). */
  fromUpload: number | null;
  /** Results recorded this round, not folded into the model yet. */
  recorded: number | null;
  awaiting: number | null;
};

/** The Runs tile: counts straight from the summary; a count the engine did not send is null (n/a), never 0. */
export function runsTile(c: Pick<ActiveCampaign, "n_base" | "history" | "n_measured" | "n_awaiting"> | null): RunsTile {
  if (!c) return { inModel: null, fromUpload: null, recorded: null, awaiting: null };
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    inModel: num(c.n_base),
    fromUpload: num(c.history.find((h) => h.round === 0)?.n_base),
    recorded: num(c.n_measured),
    awaiting: num(c.n_awaiting),
  };
}
