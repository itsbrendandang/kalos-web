/*
 * Pure rules for the Learn stage: how well the likely ranges held up, when
 * the next round can be planned, and the model checks (the engine's promotion
 * gate) in plain words. Tested in __tests__/learn.test.ts.
 */

import type { CampaignRun, Promotion } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { measured, type ActiveCampaign } from "@/lib/workbench";
import type { WhyCode } from "@/lib/why";

export type BandCalibration = { inside: number; total: number };

/**
 * How many measured results landed inside their likely range: `|result - pred|`
 * within the conformal half-width. Awaiting runs and non-finite values are
 * left out. Null when the engine reported no range (nothing honest to count);
 * zero of zero when there are simply no measured runs yet.
 */
export function bandCalibration(runs: readonly CampaignRun[], band: number | null | undefined): BandCalibration | null {
  if (band == null || !Number.isFinite(band) || band < 0) return null;
  const scored = runs.filter((r) => r.result != null && Number.isFinite(r.result) && Number.isFinite(r.pred));
  return { inside: scored.filter((r) => Math.abs((r.result as number) - r.pred) <= band).length, total: scored.length };
}

/** "3 of 5 measured results landed inside their likely range. The range is meant to hold 90% of results." The second sentence is left out when the engine sent no coverage. */
export function calibrationSentence(cal: BandCalibration, coverage?: number | null): string {
  const cov = coverage != null && Number.isFinite(coverage) ? ` The range is meant to hold ${formatNumber(coverage, "pct")} of results.` : "";
  return `${formatNumber(cal.inside, "count")} of ${formatNumber(cal.total, "count")} measured results landed inside their likely range.${cov}`;
}

/** The "puts past runs in the right order" metric in words, for the Learn page's number row. */
export function rankWords(state: "reliable" | "not-yet" | "insufficient"): { word: string; qualifier: string } {
  if (state === "reliable") return { word: "Yes, most of the time", qualifier: "Checked on past runs the model had not seen" };
  if (state === "not-yet") return { word: "Not yet", qualifier: "About as often as not, or it could still be chance" };
  return { word: "Cannot tell yet", qualifier: "Too few past runs could be tested" };
}

/** The next round needs at least one measured result to learn from. */
export const canPlanNext = (campaign: ActiveCampaign | null): boolean => campaign != null && measured(campaign).length > 0;

const GATES: Record<string, { reason: string; fix: string }> = {
  surrogate_spearman: { reason: "it does not yet put the runs it was tested on in the right order", fix: "Add more measured runs." },
  group_mean_margin: { reason: "it does no better than the average of each group of runs", fix: "Add runs that change the recipe within a group." },
  feasibility_auc: { reason: "it cannot yet tell which recipes will fail outright", fix: "Add runs that include some that failed or produced nothing." },
  ece: { reason: "its likely range is wrong about how often it is right", fix: "Add more measured runs." },
  brier: { reason: "its confidence that a recipe will work is not reliable yet", fix: "Add runs that include some that failed or produced nothing." },
};

export type PromotionLine = {
  /** "The model has not passed every check yet: <reason> (1 more check also fell short)." */
  sentence: string;
  /** What to do about it. */
  fix: string;
  /** The why-line code for the first failing check, or null when the raw gate text is not one this app knows. */
  why: WhyCode | null;
};

/**
 * The model checks (the engine's promotion gate) as one plain line, or null
 * when every check passed or the engine did not report them. Names the first
 * failing check in words (never the engine's raw gate text) with one fix;
 * more failures are counted, not listed.
 */
export function promotionLine(promotion: Promotion | undefined): PromotionLine | null {
  if (!promotion || promotion.passed) return null;
  const [first, ...rest] = promotion.failures;
  const key = first ? first.split(/[=\s]/)[0] : "";
  const gate = GATES[key];
  const unmeasured = first?.includes("unmeasured") ?? false;
  const reason = unmeasured ? "a required check could not be run on this sheet" : (gate?.reason ?? "it has not met every check yet");
  const more = rest.length ? ` (${rest.length} more ${rest.length === 1 ? "check" : "checks"} also fell short)` : "";
  return {
    sentence: `The model has not passed every check yet: ${reason}${more}.`,
    fix: gate?.fix ?? "Add more measured runs.",
    why: unmeasured ? "unmeasured" : gate ? (key as WhyCode) : null,
  };
}

/**
 * What the verdict changes for the next round, in one plain sentence. Reads the
 * reliability state and whether the promotion gate cleared; the raw gate detail
 * stays in the verdict's disclosure.
 */
export function verdictImpact(state: "reliable" | "not-yet" | "insufficient", promotionCleared: boolean, nextRound: number): string {
  if (state === "insufficient") return `Too few past runs could be tested to judge the model yet. Record more results before leaning on its suggestions.`;
  if (state === "not-yet") return `Treat its suggestions as ideas to try. Plan round ${nextRound} still updates the model with every measured result.`;
  if (!promotionCleared) return `Plan round ${nextRound} can use it to suggest recipes, but it has not passed every check yet.`;
  return `Plan round ${nextRound} uses it to suggest the next round of recipes.`;
}
