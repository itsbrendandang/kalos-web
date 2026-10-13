/*
 * Pure rules for the Learn stage: how well the predicted bands held up, when
 * the next round can be planned, and the promotion gate in plain words.
 * Tested in __tests__/learn.test.ts.
 */

import type { CampaignRun, Promotion } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { measured, type ActiveCampaign } from "@/lib/workbench";

export type BandCalibration = { inside: number; total: number };

/**
 * How many measured runs landed inside their predicted band: `|result - pred|`
 * within the conformal half-width. Awaiting runs and non-finite values are
 * left out. Null when the engine reported no band (nothing honest to count);
 * zero of zero when there are simply no measured runs yet.
 */
export function bandCalibration(runs: readonly CampaignRun[], band: number | null | undefined): BandCalibration | null {
  if (band == null || !Number.isFinite(band) || band < 0) return null;
  const scored = runs.filter((r) => r.result != null && Number.isFinite(r.result) && Number.isFinite(r.pred));
  return { inside: scored.filter((r) => Math.abs((r.result as number) - r.pred) <= band).length, total: scored.length };
}

/** "3 of 5 measured runs landed inside their predicted band (90%)." The coverage is left out when the engine did not send one. */
export function calibrationSentence(cal: BandCalibration, coverage?: number | null): string {
  const cov = coverage != null && Number.isFinite(coverage) ? ` (${formatNumber(coverage, "pct")})` : "";
  return `${formatNumber(cal.inside, "count")} of ${formatNumber(cal.total, "count")} measured runs landed inside their predicted band${cov}.`;
}

/** The next round needs at least one measured result to learn from. */
export const canPlanNext = (campaign: ActiveCampaign | null): boolean => campaign != null && measured(campaign).length > 0;

const GATES: Record<string, { reason: string; fix: string }> = {
  surrogate_spearman: { reason: "its ranking of held-out runs is too weak", fix: "Add more measured runs." },
  feasibility_auc: { reason: "it cannot yet tell feasible recipes from infeasible ones", fix: "Add runs that include some that failed or produced nothing." },
  ece: { reason: "its prediction bands do not match how often it is right", fix: "Add more measured runs." },
  brier: { reason: "its feasibility estimates are not reliable yet", fix: "Add runs that include some that failed or produced nothing." },
};

/**
 * The promotion gate as one plain line, or null when it is cleared or the
 * engine did not report it. Names the first failing check in words (never the
 * engine's raw gate text) with one fix; more failures are counted, not listed.
 */
export function promotionLine(promotion: Promotion | undefined): string | null {
  if (!promotion || promotion.passed) return null;
  const [first, ...rest] = promotion.failures;
  const gate = first ? GATES[first.split(/[=\s]/)[0]] : undefined;
  const reason = first?.includes("unmeasured")
    ? "a required check could not be measured on this data"
    : (gate?.reason ?? "it has not met every check yet");
  const more = rest.length ? ` (${rest.length} more ${rest.length === 1 ? "check" : "checks"} also fell short)` : "";
  return `Not cleared to promote: ${reason}${more}. ${gate?.fix ?? "Add more measured runs."}`;
}
