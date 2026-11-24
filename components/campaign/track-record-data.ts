/*
 * Pure helpers for Validate's track record: how the predictions the engine
 * recorded when each run started held up once the run was measured.
 * Everything here reads the engine's prospective record (getTrackRecord,
 * getTrackRuns in lib/assist.ts); nothing is re-scored against the current
 * analysis, and nothing is judged that the engine did not judge.
 *
 * Ported from feat/axiom-style-shell (components/campaign/track-record-data.ts)
 * without its chart helpers: Validate already draws runs against their
 * recorded bands (validation dumbbells), so the track record is the verdict,
 * the per-round table and the scoring rules.
 */

import type { CoverageStat, TrackRecord, TrackRun } from "@/lib/assist";
import { displayRound } from "@/lib/campaign-stage";
import { coverageText, formatValue } from "@/lib/num";

/** One run as the track record counts it. `round` is the display round (1-based), null when the engine did not say. */
export type TrackPoint = {
  id: number;
  runId: string;
  round: number | null;
  /** "scored": prediction and band recorded at start, result measured after. "awaiting": no result yet. "unscored": not comparable (see the engine's exclusion rules). */
  kind: "scored" | "awaiting" | "unscored";
  pred: number | null;
  lo: number | null;
  hi: number | null;
  measured: number | null;
  corrected: boolean;
  inside: boolean | null;
  /** Measured minus predicted, from the engine. */
  error: number | null;
};

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const count = (n: number) => formatValue(n, { quantity: "count" }).text;
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
const pct = (v: number) => formatValue(v, { quantity: "pct" }).text;

/** Runs as the engine sent them (oldest first), classified. Runs with neither a prediction nor a result are dropped. */
export function trackPoints(items: readonly TrackRun[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const r of items) {
    const pred = r.prediction?.available && finite(r.prediction.pred) ? r.prediction.pred : null;
    const measured = finite(r.measured?.value) ? r.measured.value : null;
    if (pred == null && measured == null) continue;
    const band = r.band && finite(r.band.lo) && finite(r.band.hi) ? r.band : null;
    out.push({
      id: r.id,
      runId: r.run_id,
      round: finite(r.round) ? displayRound(r.round) : null,
      kind: r.scored ? "scored" : measured == null ? "awaiting" : "unscored",
      pred,
      lo: band ? Math.min(band.lo, band.hi) : null,
      hi: band ? Math.max(band.lo, band.hi) : null,
      measured,
      corrected: measured != null && r.measured?.corrected === true,
      inside: r.scored ? r.inside : null,
      error: r.scored && finite(r.error) ? r.error : null,
    });
  }
  return out;
}

/** "needs 10 scored runs to judge; has 7" in plain words; other reasons kept as the engine wrote them. */
export function judgeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const m = /needs (\d+) scored runs? to judge; has (\d+)/.exec(reason);
  if (m) {
    const need = Number(m[1]);
    const has = Number(m[2]);
    return `Too few to judge the range yet: that takes ${plural(need, "scored run", "scored runs")}, and there ${has === 1 ? "is" : "are"} ${count(has)} so far.`;
  }
  return `Not judged yet: ${reason.replace(/\.$/, "")}.`;
}

/**
 * The verdict, one or two plain sentences. It never says the ranges are
 * calibrated, wide or narrow unless the engine judged them (`judged === true`),
 * and then only what the engine's Wilson interval allows.
 */
export function trackVerdict(c: CoverageStat): string {
  if (c.n === 0) return "No measured result can be compared with its recorded prediction yet.";
  const level = coverageText(c.nominal);
  const range = level ? `${level} range` : "range";
  const first = `${count(c.inside)} of ${plural(c.n, "measured result", "measured results")} landed inside the ${range} recorded when the run started.`;
  if (c.judged !== true) {
    const why = judgeReason(c.reason);
    return why ? `${first} ${why}` : first;
  }
  const w = c.wilson_95;
  if (!w || !level) return first;
  const plausibly = `${pct(w[0])} to ${pct(w[1])}`;
  if (c.nominal < w[0]) return `${first} That is more often than ${level} (plausibly ${plausibly}), so the ranges are on the wide side.`;
  if (c.nominal > w[1]) return `${first} That is less often than ${level} (plausibly ${plausibly}), so treat the ranges as too narrow.`;
  return `${first} That is consistent with ${level} (plausibly ${plausibly}).`;
}

export type RoundRow = {
  /** Display round (1-based). */
  round: number;
  started: number;
  measured: number;
  corrected: number;
  inside: number;
  scored: number;
  meanError: number | null;
};

/** Per-round table rows, oldest round first. */
export function roundRows(record: Pick<TrackRecord, "rounds">): RoundRow[] {
  return [...record.rounds]
    .sort((a, b) => a.round - b.round || (a.first_recorded_at ?? 0) - (b.first_recorded_at ?? 0))
    .map((r) => ({
      round: displayRound(r.round),
      started: r.n_started,
      measured: r.n_measured,
      corrected: r.n_corrected,
      inside: r.coverage.inside,
      scored: r.coverage.n,
      meanError: r.error.n > 0 && finite(r.error.mean) ? r.error.mean : null,
    }));
}

/**
 * A line for what the verdict and table leave out (awaiting, unscored and
 * corrected runs, earlier run sheets, runs past the page read); null when
 * nothing is left out. Ported as `chartNote`; renamed since nothing is drawn.
 */
export function leftOutNote(points: readonly TrackPoint[], hasMore: boolean, earlierSheets = false): string | null {
  const awaiting = points.filter((p) => p.kind === "awaiting").length;
  const unscored = points.filter((p) => p.kind === "unscored").length;
  const corrected = points.filter((p) => p.corrected).length;
  const parts: string[] = [];
  if (awaiting) parts.push(`${plural(awaiting, "run is", "runs are")} awaiting a result.`);
  if (unscored) parts.push(`${plural(unscored, "run has", "runs have")} a result that cannot be scored against a prediction recorded before it.`);
  if (corrected) parts.push(`${plural(corrected, "result was", "results were")} corrected after entry; the latest value is used.`);
  if (earlierSheets) parts.push("Runs from earlier run sheets are left out.");
  if (hasMore) parts.push(`Only the first ${count(points.length)} runs were read; newer runs exist beyond them.`);
  return parts.length ? parts.join(" ") : null;
}

/** Human labels for the engine's scoring rules, in reading order. */
const RULE_LABELS: [key: string, label: string][] = [
  ["scored_only_if", "A run counts only if"],
  ["band", "The range used"],
  ["measured", "The measured value used"],
  ["error_formula", "Error"],
  ["coverage_interval", "Uncertainty in the share inside"],
  ["pooling", "Pooling"],
  ["judged_from_n", "Judged from"],
];

/**
 * The engine's `rules` block as label and text pairs for the "How this is
 * scored" disclosure. Unknown keys and malformed input are skipped.
 */
export function scoringRules(record: unknown): { label: string; text: string }[] {
  const rules = (record as { rules?: unknown } | null)?.rules;
  if (!rules || typeof rules !== "object") return [];
  const r = rules as Record<string, unknown>;
  const out: { label: string; text: string }[] = [];
  for (const [key, label] of RULE_LABELS) {
    const v = r[key];
    if (key === "judged_from_n" && typeof v === "number") out.push({ label, text: `${plural(v, "scored run", "scored runs")} or more` });
    else if (typeof v === "string" && v) out.push({ label, text: v });
  }
  return out;
}

/**
 * The track record restricted to the current run sheet. After a replacing
 * upload the engine restarts round numbers, so rounds of an earlier sheet
 * would otherwise be tabled under the same "Round 1". Rounds say which sheet
 * they belong to (`current_dataset`); runs do not, so a run belongs to the
 * current sheet when its prediction was recorded at or after the current
 * sheet's first recorded round. The pooled coverage mixes sheets, so when
 * anything is left out it is re-summed from the current rounds and not judged
 * here. Engines that do not mark sheets are passed through.
 */
export function currentSheetOnly(
  record: TrackRecord,
  items: readonly TrackRun[],
): { rounds: TrackRecord["rounds"]; items: TrackRun[]; coverage: CoverageStat; leftOut: boolean } {
  const earlier = record.rounds.some((r) => r.current_dataset === false);
  if (!earlier) return { rounds: record.rounds, items: [...items], coverage: record.pooled.coverage, leftOut: false };
  const rounds = record.rounds.filter((r) => r.current_dataset !== false);
  const starts = rounds.map((r) => r.first_recorded_at).filter(finite);
  const cutoff = starts.length ? Math.min(...starts) : Infinity;
  const kept = items.filter((r) => finite(r.prediction?.recorded_at) && r.prediction.recorded_at >= cutoff);
  const n = rounds.reduce((t, r) => t + r.coverage.n, 0);
  const inside = rounds.reduce((t, r) => t + r.coverage.inside, 0);
  return {
    rounds,
    items: kept,
    coverage: { n, inside, outside: n - inside, observed: n ? inside / n : null, nominal: record.pooled.coverage.nominal, judged: false, reason: null },
    leftOut: true,
  };
}
