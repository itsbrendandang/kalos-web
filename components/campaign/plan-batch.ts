/*
 * Pure rules for the Plan stage's batch: the order the recipes are shown in
 * and the exceptions worth a second look. Tested in __tests__/plan-batch.test.ts.
 */

import { proposalRecipe, type Proposal } from "@/lib/api";
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

export type ExceptionKind = "negative" | "low-feasibility" | "gain-within-band" | "at-edge";

/** A setpoint within this fraction of the range width from either end counts as "at the edge". */
export const EDGE_FRACTION = 0.02;

/**
 * The inputs of a recipe sitting at the edge of the range tried so far. There the
 * model is extrapolating from one side only, so the predicted value is less
 * trustworthy. Needs the engine's `feature_ranges`; with none, nothing is flagged.
 */
export function edgeInputs(
  recipe: Record<string, number>,
  ranges: Record<string, [number, number]> | undefined,
  fraction = EDGE_FRACTION,
): string[] {
  if (!ranges) return [];
  return Object.entries(recipe)
    .filter(([name, v]) => {
      const r = ranges[name];
      if (!r || !Number.isFinite(v)) return false;
      const width = r[1] - r[0];
      return width > 0 && (v - r[0] <= width * fraction || r[1] - v <= width * fraction);
    })
    .map(([name]) => name);
}

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
  ctx: {
    incumbent: number | null;
    band: number | null;
    nonNegative: boolean;
    /** Engine `feature_ranges` and the `proposal_features` order, to flag edge recipes. Optional. */
    ranges?: Record<string, [number, number]>;
    features?: string[];
  },
): { shown: BatchException[]; total: number } {
  const order: ExceptionKind[] = ["negative", "low-feasibility", "gain-within-band", "at-edge"];
  const flags: BatchException[] = [];
  for (const { rank, proposal: p } of items) {
    const gain = ctx.incumbent == null ? null : p.pred - ctx.incumbent;
    if (ctx.nonNegative && p.pred < 0) {
      flags.push({ rank, kind: "negative", text: `Recipe ${rank} is predicted ${p.pred > -0.005 ? "just below zero" : `at ${formatNumber(p.pred)}, below zero`}, but this target has no negative measurements.` });
    } else if (p.p_feasible != null && p.p_feasible < LOW_FEASIBILITY) {
      flags.push({ rank, kind: "low-feasibility", text: `Recipe ${rank} has only a ${formatNumber(p.p_feasible, "pct")} estimated chance of being feasible.` });
    } else if (gain != null && gain > 0 && ctx.band != null && ctx.band > gain) {
      flags.push({ rank, kind: "gain-within-band", text: `Recipe ${rank} is predicted to beat the best by ${formatNumber(gain)}, less than its prediction band of ${formatNumber(ctx.band)}.` });
    } else {
      const edge = edgeInputs(proposalRecipe(p, ctx.features ?? []), ctx.ranges);
      if (edge.length > 0) {
        flags.push({ rank, kind: "at-edge", text: `Recipe ${rank} sits at the edge of the range tried for ${edge.slice(0, 3).join(", ")}${edge.length > 3 ? ` and ${edge.length - 3} more` : ""}, so the model is extrapolating there.` });
      }
    }
  }
  flags.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.rank - b.rank);
  return { shown: flags.slice(0, MAX_EXCEPTIONS), total: flags.length };
}
