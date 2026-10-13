/*
 * Pure rules for the Plan stage's batch: the order the recipes are shown in
 * and the exceptions worth a second look. Tested in __tests__/plan-batch.test.ts.
 */

import type { Proposal } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/** A recipe whose estimated chance of being feasible is below this is flagged. */
export const LOW_FEASIBILITY = 0.5;

/** At most this many recipes are flagged, so the page never becomes a wall of warnings. */
export const MAX_EXCEPTIONS = 3;

export type BatchItem = {
  /** Position in the engine's list; what a started run must be matched back to. */
  index: number;
  /** 1-based position in the displayed (sorted) order; what the page calls "Recipe N". */
  rank: number;
  proposal: Proposal;
  beatsBest: boolean;
};

/**
 * Recipes predicted to beat the incumbent first, then the rest; each group by
 * predicted value, highest first (ties keep the engine's order). With no
 * incumbent nothing can be said to beat it, so there is one group.
 */
export function orderBatch(proposals: readonly Proposal[], incumbent: number | null): BatchItem[] {
  const beats = (p: Proposal) => incumbent != null && p.pred > incumbent;
  return proposals
    .map((proposal, index) => ({ index, proposal, beatsBest: beats(proposal) }))
    .sort((a, b) => Number(b.beatsBest) - Number(a.beatsBest) || b.proposal.pred - a.proposal.pred || a.index - b.index)
    .map((item, i) => ({ ...item, rank: i + 1 }));
}

/** True when no measured value we can see is negative, so a negative prediction is not plausible. */
export const targetIsNonNegative = (best: number, oof: readonly [number, number][]): boolean =>
  best >= 0 && oof.every(([measured]) => measured >= 0);

export type ExceptionKind = "negative" | "low-feasibility" | "gain-within-band";

export type BatchException = { rank: number; kind: ExceptionKind; text: string };

/**
 * The recipes to check before starting, from fields the engine sent: predicted
 * below zero for a target that is never negative, a low estimated chance of
 * being feasible (only when the engine sent one), or a predicted gain smaller
 * than the prediction band. A recipe gets its most serious flag only; the list
 * is capped and ordered by seriousness, then rank. `total` counts every
 * flagged recipe so the page can say when it is showing fewer.
 */
export function batchExceptions(
  items: readonly BatchItem[],
  ctx: { incumbent: number | null; band: number | null; nonNegative: boolean },
): { shown: BatchException[]; total: number } {
  const order: ExceptionKind[] = ["negative", "low-feasibility", "gain-within-band"];
  const flags: BatchException[] = [];
  for (const { rank, proposal: p } of items) {
    const gain = ctx.incumbent == null ? null : p.pred - ctx.incumbent;
    if (ctx.nonNegative && p.pred < 0) {
      flags.push({ rank, kind: "negative", text: `Recipe ${rank} is predicted ${p.pred > -0.005 ? "just below zero" : `at ${formatNumber(p.pred)}, below zero`}, but this target has no negative measurements.` });
    } else if (p.p_feasible != null && p.p_feasible < LOW_FEASIBILITY) {
      flags.push({ rank, kind: "low-feasibility", text: `Recipe ${rank} has only a ${formatNumber(p.p_feasible, "pct")} estimated chance of being feasible.` });
    } else if (gain != null && gain > 0 && ctx.band != null && ctx.band > gain) {
      flags.push({ rank, kind: "gain-within-band", text: `Recipe ${rank} is predicted to beat the best by ${formatNumber(gain)}, less than its prediction band of ${formatNumber(ctx.band)}.` });
    }
  }
  flags.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.rank - b.rank);
  return { shown: flags.slice(0, MAX_EXCEPTIONS), total: flags.length };
}
