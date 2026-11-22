/*
 * Pure helpers for the Learn page's track record: how the predictions the
 * engine recorded when each run started held up once the run was measured.
 * Everything here reads the engine's prospective record (getTrackRecord,
 * getTrackRuns); nothing is re-scored against the current analysis.
 */

import type { CoverageStat, TrackRecord, TrackRun } from "@/lib/assist";
import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";

/** One run on the chart. `round` is the display round (1-based). */
export type TrackPoint = {
  id: number;
  runId: string;
  round: number;
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

export type TrackGroup = { round: number; points: TrackPoint[] };

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** Runs to chart points, oldest first as the engine sends them. Runs with neither a prediction nor a result are dropped. */
export function trackPoints(items: TrackRun[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const r of items) {
    const pred = r.prediction?.available && finite(r.prediction.pred) ? r.prediction.pred : null;
    const measured = finite(r.measured?.value) ? (r.measured!.value as number) : null;
    if (pred == null && measured == null) continue;
    const band = r.band && finite(r.band.lo) && finite(r.band.hi) ? r.band : null;
    out.push({
      id: r.id,
      runId: r.run_id,
      round: displayRound(r.round),
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

/** Points grouped by display round, rounds ascending, run order kept inside each round. */
export function groupByRound(points: TrackPoint[]): TrackGroup[] {
  const map = new Map<number, TrackPoint[]>();
  for (const p of points) {
    const list = map.get(p.round);
    if (list) list.push(p);
    else map.set(p.round, [p]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([round, pts]) => ({ round, points: pts }));
}

/** Column layout: one slot per run, one empty slot between rounds. `start`/`end` bound each round's slots, `slots` is the total. */
export function layoutSlots(groups: TrackGroup[]): { slots: number; rounds: { round: number; start: number; end: number; cols: { p: TrackPoint; slot: number }[] }[] } {
  const rounds: { round: number; start: number; end: number; cols: { p: TrackPoint; slot: number }[] }[] = [];
  let next = 0;
  for (const g of groups) {
    if (rounds.length) next += 1;
    const start = next;
    const cols = g.points.map((p, i) => ({ p, slot: start + i }));
    next = start + g.points.length;
    rounds.push({ round: g.round, start, end: next, cols });
  }
  return { slots: next, rounds };
}

/** The value range every mark must fit in, padded 8% each side; null when there is nothing to draw. */
export function valueDomain(points: TrackPoint[]): [number, number] | null {
  const vals = points.flatMap((p) => [p.pred, p.lo, p.hi, p.measured]).filter(finite);
  if (!vals.length) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * 0.08, hi + span * 0.08];
}

/** About `count` round-numbered ticks inside [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!finite(lo) || !finite(hi) || hi <= lo) return finite(lo) ? [lo] : [];
  const raw = (hi - lo) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1.5 ? 1 : norm <= 2.25 ? 2 : norm <= 3.5 ? 2.5 : norm <= 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n, "count")} ${n === 1 ? one : many}`;

/** "needs 10 scored runs to judge; has 7" in plain words, other reasons kept as the engine wrote them. */
export function judgeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const m = /needs (\d+) scored runs? to judge; has (\d+)/.exec(reason);
  if (m) {
    const need = Number(m[1]);
    const has = Number(m[2]);
    return `Too few to judge the range yet: that takes ${plural(need, "scored run", "scored runs")}, and there ${has === 1 ? "is" : "are"} ${formatNumber(has, "count")} so far.`;
  }
  return `Not judged yet: ${reason.replace(/\.$/, "")}.`;
}

/**
 * The verdict, one or two plain sentences. It never says the ranges are
 * calibrated unless the engine judged them (`judged === true`), and then only
 * says what the 95% interval allows.
 */
export function trackVerdict(c: CoverageStat): string {
  if (c.n === 0) return "No measured result can be compared with its recorded prediction yet.";
  const pct = formatNumber(c.nominal, "pct");
  const first = `${formatNumber(c.inside, "count")} of ${plural(c.n, "measured result", "measured results")} landed inside the ${pct} range recorded when the run started.`;
  if (c.judged !== true) {
    const why = judgeReason(c.reason);
    return why ? `${first} ${why}` : first;
  }
  const w = c.wilson_95;
  if (!w) return first;
  const range = `${formatNumber(w[0], "pct")} to ${formatNumber(w[1], "pct")}`;
  if (c.nominal < w[0]) return `${first} That is more often than ${pct} (plausibly ${range}), so the ranges are on the wide side.`;
  if (c.nominal > w[1]) return `${first} That is less often than ${pct} (plausibly ${range}), so treat the ranges as too narrow.`;
  return `${first} That is consistent with ${pct} (plausibly ${range}).`;
}

export type RoundRow = {
  round: number;
  started: number;
  measured: number;
  corrected: number;
  inside: number;
  scored: number;
  meanError: number | null;
};

/** Per-round table rows, oldest round first. */
export function roundRows(record: TrackRecord): RoundRow[] {
  return [...record.rounds]
    .sort((a, b) => a.round - b.round)
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

/** One run in words, for the tooltip and screen readers. */
export function describePoint(p: TrackPoint, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  const parts = [
    p.pred != null ? `predicted ${formatNumber(p.pred)}${u}` : "no recorded prediction",
    p.lo != null && p.hi != null ? `range ${formatNumber(p.lo)} to ${formatNumber(p.hi)}` : null,
    p.measured != null ? `measured ${formatNumber(p.measured)}${u}${p.corrected ? " (corrected)" : ""}` : "awaiting a result",
    p.kind === "scored" && p.inside != null ? (p.inside ? "inside the range" : "outside the range") : null,
    p.kind === "unscored" ? "not scored" : null,
  ].filter(Boolean);
  return `Round ${p.round}, run ${p.runId.slice(0, 6)}: ${parts.join(", ")}.`;
}

/** A line under the chart for what it leaves out; null when nothing is left out. */
export function chartNote(points: TrackPoint[], hasMore: boolean): string | null {
  const awaiting = points.filter((p) => p.kind === "awaiting").length;
  const unscored = points.filter((p) => p.kind === "unscored").length;
  const corrected = points.filter((p) => p.corrected).length;
  const parts: string[] = [];
  if (awaiting) parts.push(`${plural(awaiting, "run is", "runs are")} awaiting a result, so only the prediction shows.`);
  if (unscored) parts.push(`${plural(unscored, "run has", "runs have")} a result that cannot be scored against a prediction recorded before it.`);
  if (corrected) parts.push(`${plural(corrected, "result was", "results were")} corrected after entry; the latest value is used.`);
  if (hasMore) parts.push(`Only the first ${formatNumber(points.length, "count")} runs are drawn; newer runs exist beyond them.`);
  return parts.length ? parts.join(" ") : null;
}

/** Human labels for the engine's scoring rules, in reading order. */
const RULE_LABELS: [key: string, label: string][] = [
  ["scored_only_if", "A run counts only if"],
  ["band", "The range used"],
  ["measured", "The measured value used"],
  ["error_formula", "Error"],
  ["coverage_interval", "Uncertainty in the share inside"],
  ["judged_from_n", "Judged from"],
];

/**
 * The engine's `rules` block (not in the typed client yet), as label and text
 * pairs for the "How this is scored" disclosure. Unknown or malformed input
 * gives an empty list.
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
