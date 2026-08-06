// Pure date -> track-percentage math for the replay footer (DESIGN_SPEC.md
// section 3.4). The whole point of this footer is that its four example
// ticks sit at uneven positions (0%, 26%, 82%, 100%) because they encode
// REAL elapsed calendar time between rounds, not round index - a campaign
// that waited 48 days between round 2 and round 3 should visibly show that
// wait as a long gap, not the same fixed spacing as a round that closed in
// three days. This module is the only place that math lives, so the footer
// component stays a pure renderer of whatever this returns.
export type ReplayTick = {
  id: string;
  /** Unix ms of the real event this tick marks (round close, or a folded
   *  run's measured_at). Null for a round that has not happened yet - a
   *  proposed/open round with no measured outcome, which the engine
   *  genuinely cannot date. */
  dateMs: number | null;
};

export type PositionedTick = ReplayTick & { pct: number };

/** Fixed share of the track reserved for trailing undated (future/proposed)
 *  ticks - there is no real duration to measure for "how long until the
 *  next round," so it is not derived from data, only how much of the track
 *  the dated portion is allowed to occupy. Matches the mock's worked
 *  example exactly: with one dated span and one trailing undated tick, the
 *  last dated tick lands at 100 - 18 = 82%. */
const FUTURE_RESERVE_PCT = 18;

/** Maps each tick to a 0-100 track percentage. Ticks with a real `dateMs`
 *  are spaced proportionally to elapsed time within [0, 100 - reserve]
 *  (or all at 0 if there is only one dated tick - nothing has elapsed yet).
 *  Ticks with `dateMs: null` are spread evenly across the reserved trailing
 *  band, with the last one always pinned to exactly 100 (the track's
 *  terminus). Input order is preserved in the output; ticks do not need to
 *  be pre-sorted by date, but in practice they always are (round order).
 */
export function tickPositions(ticks: readonly ReplayTick[]): PositionedTick[] {
  const dated = ticks.filter((t): t is ReplayTick & { dateMs: number } => t.dateMs != null);
  const undatedCount = ticks.length - dated.length;
  const datedMax = undatedCount > 0 ? 100 - FUTURE_RESERVE_PCT : 100;

  const first = dated[0]?.dateMs ?? 0;
  const last = dated[dated.length - 1]?.dateMs ?? first;
  const span = last - first;

  let undatedSeen = 0;
  return ticks.map((t) => {
    if (t.dateMs != null) {
      const pct = span === 0 ? 0 : ((t.dateMs - first) / span) * datedMax;
      return { ...t, pct };
    }
    const pct =
      undatedCount === 1 ? 100 : datedMax + (undatedSeen / (undatedCount - 1)) * (100 - datedMax);
    undatedSeen += 1;
    return { ...t, pct };
  });
}

/** Projects any real date onto the SAME axis the ticks already define, using
 *  the first and last dated ticks as anchors. This is what lets the scrubber
 *  reveal individual nodes in booking-date order while the round ticks stay
 *  exactly where `tickPositions` put them: one axis, two consumers, no second
 *  normalisation that could disagree with the first. Dates outside the anchor
 *  span clamp rather than extending it - a run booked after the last round
 *  closed is simply "last", it does not silently rescale the footer. */
export function projectDate(dateMs: number, positioned: readonly PositionedTick[]): number {
  const dated = positioned.filter((t): t is PositionedTick & { dateMs: number } => t.dateMs != null);
  if (dated.length === 0) return 100;
  const first = dated[0];
  const last = dated[dated.length - 1];
  const span = last.dateMs - first.dateMs;
  if (span <= 0) return first.pct;
  const raw = first.pct + ((dateMs - first.dateMs) / span) * (last.pct - first.pct);
  return Math.min(100, Math.max(0, raw));
}

/** Which ticks (and, by extension, which graph nodes) are "revealed" at a
 *  given scrub position - drives the replay drag interaction. A node is
 *  revealed once the scrubber's percentage has reached or passed its own
 *  tick's percentage; this never recomputes layout (see
 *  lib/workspace/graph/simulation.ts's freeze-after-settle), it only
 *  toggles visibility of already-positioned nodes. */
export function revealedIds(positioned: readonly PositionedTick[], scrubPct: number): Set<string> {
  return new Set(positioned.filter((t) => t.pct <= scrubPct).map((t) => t.id));
}
