// What a round's results did (first-time study, F5). Kalos does not yet report which runs an update
// learned from or what the update changed (`runs_used`, `delta`: being added on the engine), and it drops a
// round's runs from `pending` once it has folded them in. So this module (a) snapshots the model before and
// after an update and the measured runs it learned from, kept in this browser, and (b) works out the
// changes from the campaign's own rounds (`history`). Every sentence built here says where it came from.
// Pure except the two localStorage helpers; tested in __tests__/learn-record.test.ts.

import type { CampaignRun, PopulatedResult } from "@/lib/api";
import { reliabilityVerdict } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { topDrivers } from "@/lib/overview";

/** The numbers of a model that an update can change. */
export type ModelSnapshot = {
  /** Runs the model learned from. */
  n: number;
  /** The inputs the model used, in the sheet's order. */
  features: string[];
  /** Rank agreement on runs the model had not seen (null when not scored). */
  rankScore: number | null;
  /** The likely range's half-width (null when not reported). */
  band: number | null;
  state: "reliable" | "not-yet" | "insufficient";
  /** The strongest input, as the analysis ranks it. */
  topInput: string | null;
};

export function snapshotOf(d: PopulatedResult): ModelSnapshot {
  const v = reliabilityVerdict(d);
  return {
    n: d.n,
    features: [...d.features],
    rankScore: v.rho,
    band: d.conformal_q ?? null,
    state: v.state,
    topInput: topDrivers(d.drivers ?? [], 1)[0]?.name ?? null,
  };
}

export type LearnedRun = { id: string; label: string; recipe: Record<string, number>; pred: number; result: number; mode: CampaignRun["mode"] };

/** One update of the model: the round it learned from, the runs it used, and the model before and after. */
export type RoundRecord = {
  /** Which campaign (see campaignKey). */
  campaign: string;
  /** The round people see whose results were learned from. */
  round: number;
  target: string;
  columns: string[];
  runs: LearnedRun[];
  before: ModelSnapshot;
  after: ModelSnapshot | null;
  /** ISO time of the update. */
  at: string;
};

/** A key for the campaign that survives the engine renaming the dataset between rounds: the target and the runs it started from. */
export function campaignKey(c: { target: string; history: readonly { round: number; n_base: number }[] }): string {
  const first = [...c.history].sort((a, b) => a.round - b.round)[0];
  return `${c.target}:${first?.n_base ?? 0}`;
}

const KEY = "kalos.learned-rounds.v1";

function readAll(): RoundRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as RoundRecord[]) : [];
  } catch {
    return [];
  }
}

/** Keeps the record in this browser (replacing an earlier one for the same campaign and round). Never throws. */
export function rememberRound(record: RoundRecord): void {
  try {
    const rest = readAll().filter((r) => !(r.campaign === record.campaign && r.round === record.round));
    localStorage.setItem(KEY, JSON.stringify([...rest, record].slice(-50)));
  } catch {
    // Storage refused (private mode, quota): the page then says the runs are not kept.
  }
}

/** The record of one learned round of a campaign, or null when this browser has none. */
export function learnedRound(campaign: string, round: number): RoundRecord | null {
  try {
    return readAll().find((r) => r.campaign === campaign && r.round === round) ?? null;
  } catch {
    return null;
  }
}

/** Whether a measured result landed inside its likely range; null without a range. */
export function insideRange(run: { pred: number; result: number }, band: number | null): boolean | null {
  if (band == null || !Number.isFinite(band)) return null;
  return Math.abs(run.result - run.pred) <= band;
}

export type RoundChange = { text: string; /** Where the sentence comes from. */ source: "kalos" | "browser" };

const fmt = (v: number) => formatNumber(v);

/**
 * What changed since the previous round, in plain sentences. The runs and the best come from the
 * campaign's own rounds (Kalos's numbers); the rank score, likely range and inputs come from the
 * snapshots this browser kept, when it has them.
 */
export function roundChanges(opts: {
  history: readonly { round: number; best: number | null; n_base: number }[];
  /** The engine round whose update is described (its entry in history), or the latest. */
  engineRound: number;
  target: string;
  unit?: string;
  record: RoundRecord | null;
}): RoundChange[] {
  const out: RoundChange[] = [];
  const sorted = [...opts.history].sort((a, b) => a.round - b.round);
  const i = sorted.findIndex((h) => h.round === opts.engineRound);
  const unit = opts.unit ? ` ${opts.unit}` : "";
  if (i >= 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const added = cur.n_base - prev.n_base;
    out.push({ source: "kalos", text: `The model now learns from ${formatNumber(cur.n_base, "count")} runs, ${added > 0 ? `${formatNumber(added, "count")} more than before` : "the same as before"}.` });
    if (prev.best != null && cur.best != null) {
      const d = cur.best - prev.best;
      out.push({
        source: "kalos",
        text:
          d > 0
            ? `Best measured ${opts.target} rose from ${fmt(prev.best)} to ${fmt(cur.best)}${unit}.`
            : `Best measured ${opts.target} is still ${fmt(cur.best)}${unit}: no run in this round beat it.`,
      });
    }
  }
  const r = opts.record;
  if (r?.after) {
    const b = r.before;
    const a = r.after;
    if (b.rankScore != null && a.rankScore != null) {
      const d = a.rankScore - b.rankScore;
      out.push({
        source: "browser",
        text: `Rank agreement on runs the model had not seen went from ${formatNumber(b.rankScore, "corr")} to ${formatNumber(a.rankScore, "corr")} (${Math.abs(d) < 0.005 ? "no change" : d > 0 ? "better" : "worse"}).`,
      });
    }
    if (b.band != null && a.band != null) {
      out.push({ source: "browser", text: `The likely range went from ± ${fmt(b.band)} to ± ${fmt(a.band)}${unit} (${a.band < b.band ? "narrower" : a.band > b.band ? "wider" : "the same"}).` });
    }
    if (b.state !== a.state) {
      const word = (s: ModelSnapshot["state"]) => (s === "reliable" ? "Reliable" : s === "not-yet" ? "Not yet reliable" : "Not enough runs to tell");
      out.push({ source: "browser", text: `The verdict changed from ${word(b.state)} to ${word(a.state)}.` });
    }
    const dropped = b.features.filter((f) => !a.features.includes(f));
    const addedF = a.features.filter((f) => !b.features.includes(f));
    if (dropped.length || addedF.length) {
      out.push({
        source: "browser",
        text: `The inputs changed: ${dropped.length ? `Kalos stopped using ${dropped.join(", ")}` : ""}${dropped.length && addedF.length ? "; " : ""}${addedF.length ? `it now also uses ${addedF.join(", ")}` : ""}. Your column choice on Setup was not kept by the update.`,
      });
    }
    if (b.topInput && a.topInput && b.topInput !== a.topInput) {
      out.push({ source: "browser", text: `The input that goes most with ${opts.target} is now ${a.topInput} (it was ${b.topInput}).` });
    }
  }
  return out;
}
