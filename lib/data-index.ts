// The Data index: a pure join of the run sheets this browser holds (lib/sheet-store.ts) with the engine's
// campaigns, their analyses and their rounds. Nothing here fetches or reads storage; the page feeds it what
// it loaded and renders what comes out, so the join is unit-tested on plain values.
//
// The join key is the sha256 of the uploaded bytes: the store keys sheets by it and the engine stamps it on
// every analysis as `run.input_sha256`.
//
// Rounds: the engine counts folds. `history[].round` is 0 for the seeded base and k after the k-th fold;
// `pending[].round` is the 0-based round a run was STARTED in, so the runs that fold into `history[k]` are
// those started with `round === k - 1`. The index speaks in the 1-based round people see (the history round,
// which is `pending.round + 1`, the same conversion as `displayRound` in lib/campaign-stage.ts).

import type { Campaign, CampaignRun, LatestResult } from "@/lib/api";
import type { SheetSummary } from "@/lib/sheet-store";
import { displayRound } from "@/lib/campaign-stage";

/** What the index reads off a campaign's analysis (`/api/campaigns/{id}/analysis` or `/api/latest`). */
export type AnalysisFacts = {
  dataset: string;
  n: number;
  d: number;
  target: string;
  features: string[];
  /** Seconds since the epoch, as the engine sends it. */
  updated: number;
  run?: { input_sha256?: string; filename?: string };
};

/** What the index reads off a campaign's loop summary (`/api/campaigns/{id}` summary or `/api/campaign`). */
export type CampaignFacts = {
  target: string;
  n_base: number;
  best: number | null;
  round: number;
  history: { round: number; best: number | null; n_base: number }[];
  pending: Pick<CampaignRun, "result" | "awaiting" | "round">[];
};

export type CampaignInput = {
  id: string;
  name: string;
  is_default: boolean;
  analysis: AnalysisFacts | null;
  summary: CampaignFacts | null;
};

export type SheetRow = {
  sha: string;
  name: string;
  rows: number | null;
  inputs: number | null;
  target: string | null;
  /** ms since the epoch. */
  loadedAt: number;
  usedBy: { campaignId: string; campaignName: string } | null;
  /** The 1-based rounds recorded from this sheet: folded ones from `history`, plus any round with runs still listed. */
  rounds: number[];
};

export type RoundRow = {
  campaignId: string;
  campaignName: string;
  /** 1-based, as people count it. */
  round: number;
  measured: number;
  awaiting: number;
  best: number | null;
  /** True once the engine folded the round's measured runs into the campaign's data. */
  folded: boolean;
  fromSheet: string;
};

export type EngineOnlyRow = {
  campaignId: string;
  campaignName: string;
  dataset: string;
  rows: number;
  inputs: number;
  target: string;
  /** ms since the epoch. */
  updatedAt: number;
};

export type DataIndex = { sheets: SheetRow[]; rounds: RoundRow[]; engineOnly: EngineOnlyRow[] };

/** The analysis facts of a `/api/latest`-shaped response, or null when the engine has no data. */
export function analysisFacts(latest: LatestResult | null | undefined): AnalysisFacts | null {
  if (!latest || !latest.has_data) return null;
  const { dataset, n, d, target, features, updated, run } = latest;
  return { dataset, n, d, target, features, updated, run: run ? { input_sha256: run.input_sha256, filename: run.filename } : undefined };
}

/** The campaign facts of a `/api/campaign`-shaped response, or null before any campaign exists. */
export function campaignFacts(c: Campaign | null | undefined): CampaignFacts | null {
  if (!c || !c.has_campaign) return null;
  const { target, n_base, best, round, history, pending } = c;
  return { target, n_base, best, round, history, pending };
}

const shaOf = (c: CampaignInput): string | null => c.analysis?.run?.input_sha256 ?? null;

/** The rounds of one campaign, 1-based, folded ones first by the history and in-progress ones from `pending`. */
export function campaignRounds(c: CampaignInput, fromSheet: string): RoundRow[] {
  const s = c.summary;
  if (!s) return [];
  const history = [...s.history].sort((a, b) => a.round - b.round);
  const byRound = new Map<number, RoundRow>();
  const base = { campaignId: c.id, campaignName: c.name, fromSheet };

  for (let k = 0; k < history.length; k++) {
    const h = history[k];
    if (h.round <= 0) continue;
    // n_base only grows by the measured runs folded in, so the difference is that round's measured count.
    const prev = history[k - 1];
    const measured = prev ? Math.max(0, h.n_base - prev.n_base) : 0;
    byRound.set(h.round, { ...base, round: h.round, measured, awaiting: 0, best: h.best, folded: true });
  }

  const unfolded = new Map<number, { measured: number; awaiting: number; best: number | null }>();
  for (const run of s.pending) {
    if (run.round == null) continue; // started before the engine stamped rounds: it cannot be placed
    const r = displayRound(run.round);
    const folded = byRound.get(r);
    if (folded) {
      // A run still awaiting after its round folded: the round is listed, with what is still open.
      if (run.awaiting) folded.awaiting += 1;
      continue;
    }
    const acc = unfolded.get(r) ?? { measured: 0, awaiting: 0, best: null };
    if (run.awaiting || run.result == null) acc.awaiting += 1;
    else {
      acc.measured += 1;
      acc.best = acc.best == null ? run.result : Math.max(acc.best, run.result);
    }
    unfolded.set(r, acc);
  }
  for (const [r, acc] of unfolded) byRound.set(r, { ...base, round: r, ...acc, folded: false });

  return [...byRound.values()].sort((a, b) => b.round - a.round);
}

/** The join. Sheets newest first; rounds latest first per campaign; engine-only analyses in campaign order. */
export function buildIndex({ sheets, campaigns }: { sheets: SheetSummary[]; campaigns: CampaignInput[] }): DataIndex {
  const bySha = new Map<string, CampaignInput>();
  for (const c of campaigns) {
    const sha = shaOf(c);
    if (sha && !bySha.has(sha)) bySha.set(sha, c);
  }
  const storedShas = new Set(sheets.map((s) => s.sha256));

  const sheetRows: SheetRow[] = [...sheets]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .map((s) => {
      const c = bySha.get(s.sha256) ?? null;
      const rounds = c ? campaignRounds(c, s.name).map((r) => r.round).sort((a, b) => a - b) : [];
      return {
        sha: s.sha256,
        name: s.name,
        rows: c?.analysis?.n ?? s.engine?.n ?? null,
        inputs: c?.analysis?.d ?? s.engine?.d ?? null,
        target: c?.analysis?.target ?? s.engine?.target ?? null,
        loadedAt: s.lastUsedAt,
        usedBy: c ? { campaignId: c.id, campaignName: c.name } : null,
        rounds,
      };
    });

  const rounds: RoundRow[] = [];
  const engineOnly: EngineOnlyRow[] = [];
  for (const c of campaigns) {
    const sha = shaOf(c);
    const stored = sha ? sheets.find((s) => s.sha256 === sha) : undefined;
    const fromSheet = stored?.name ?? c.analysis?.dataset ?? c.name;
    rounds.push(...campaignRounds(c, fromSheet));
    if (c.analysis && !(sha && storedShas.has(sha))) {
      engineOnly.push({
        campaignId: c.id,
        campaignName: c.name,
        dataset: c.analysis.dataset,
        rows: c.analysis.n,
        inputs: c.analysis.d,
        target: c.analysis.target,
        updatedAt: Math.round(c.analysis.updated * 1000),
      });
    }
  }

  return { sheets: sheetRows, rounds, engineOnly };
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * The page's one verdict. `working` is the analysis the campaign runs from (the default campaign's), or
 * null when the engine has none; `engineKnown` is false when the engine could not be asked.
 */
export function indexVerdict(index: DataIndex, working: AnalysisFacts | null, engineKnown = true): string {
  const held = index.sheets.length;
  if (held === 0 && !working && engineKnown) return "Nothing loaded yet.";
  const first = held === 0 ? "No sheet is held in this browser" : `${plural(held, "sheet")} held here`;
  if (!engineKnown) return `${first}; the engine could not be asked which one the campaign is working from.`;
  if (!working) return `${first}; the campaign has no run sheet yet.`;
  const name = working.run?.filename ?? working.dataset;
  return `${first}; the campaign is working from ${name} (${plural(working.n, "row")}).`;
}

/** The list of rounds recorded from a sheet, as one caption: "Round 1 recorded from it", "Rounds 1, 2 and 3 recorded from it". */
export function roundsCaption(rounds: number[]): string | null {
  if (rounds.length === 0) return null;
  if (rounds.length === 1) return `Round ${rounds[0]} recorded from it`;
  const list = `${rounds.slice(0, -1).join(", ")} and ${rounds[rounds.length - 1]}`;
  return `Rounds ${list} recorded from it`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });

/** A date for a caption, fixed en-US so server and client renders match. */
export function formatDate(ms: number): string {
  return Number.isFinite(ms) ? dateFormat.format(new Date(ms)) : "n/a";
}
