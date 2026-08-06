// Pure logic behind the proposals card (design spec 1.3.F). The design's
// table has two hard-coded recipe columns ("Glucose", "Feed start"); a real
// campaign's proposals carry whatever inputs the engine actually varied, so
// the columns are derived from the batch instead of assumed.
import type { Proposal, Run } from "./types";

/** The design's table fits two recipe columns comfortably at 860px. Three is
 *  the point where the "Change from best" column starts truncating, so that
 *  is the cap - anything beyond it is reported as a count, never dropped
 *  silently. */
export const MAX_RECIPE_COLUMNS = 3;

export type RecipeColumns = {
  /** Raw engine feature keys, in first-seen order across the batch. */
  keys: string[];
  /** Inputs the batch varies that did not fit in the table. */
  hidden: string[];
};

export function recipeColumns(runs: Run[], limit: number = MAX_RECIPE_COLUMNS): RecipeColumns {
  const seen: string[] = [];
  for (const run of runs) {
    for (const key of Object.keys(run.recipe)) {
      if (!seen.includes(key)) seen.push(key);
    }
  }
  return { keys: seen.slice(0, limit), hidden: seen.slice(limit) };
}

/** "4 exploit, 2 explore" - the batch's own composition, counted, not stated. */
export function modeSplit(proposals: Proposal[]): { exploit: number; explore: number } {
  return {
    exploit: proposals.filter((p) => p.run.mode === "exploit").length,
    explore: proposals.filter((p) => p.run.mode === "explore").length,
  };
}

/** A column header out of an engine feature key: `feed_start_day` -> "FEED
 *  START DAY". The header row is uppercase-styled, so this only has to undo
 *  the snake_case; it deliberately does not try to prettify the token itself
 *  (an input called `pH_setpoint` stays `pH setpoint`, not "Ph Setpoint"). */
export function columnLabel(key: string): string {
  return key.replace(/_/g, " ");
}

/** Decimal places for one recipe column, decided by the WHOLE column rather
 *  than cell by cell. An input every proposal states as a whole number (a
 *  `feed_start_day` of 2 is a day index) renders with none, because "2.00"
 *  implies a precision the input does not have. As soon as one row in the
 *  column is fractional, every row in it gets two decimals - otherwise a
 *  tabular-nums column mixes "7" and "6.40" and the decimal points stop
 *  lining up. */
export function recipeDecimals(runs: Run[], key: string): 0 | 2 {
  const values = runs.map((run) => run.recipe[key]).filter((v): v is number => typeof v === "number");
  return values.every((v) => Number.isInteger(v)) ? 0 : 2;
}

export function formatRecipeValue(v: number, decimals: number): string {
  return v.toFixed(decimals);
}

/** Whether a proposal's prediction is above the campaign's measured best -
 *  the design's green up-arrow. Null (no arrow) whenever either side is
 *  missing, so an arrow always means a real comparison happened. */
export function beatsBest(predicted: number | null, bestSoFar: number | null): boolean | null {
  if (predicted == null || bestSoFar == null) return null;
  return predicted > bestSoFar;
}

/** A recipe as a single comparable string, keys sorted so two recipes that
 *  differ only in key order still compare equal. */
function recipeKey(recipe: Record<string, number>): string {
  return Object.keys(recipe)
    .sort()
    .map((k) => `${k}=${recipe[k]}`)
    .join("|");
}

/**
 * Which proposals in a batch have ALREADY been booked into the lab.
 *
 * The engine leaves `GET /api/latest`'s proposals in place after
 * `POST /api/campaign/start` - the batch is only replaced by the next
 * re-analysis - so a freshly approved batch keeps coming back from the engine
 * looking exactly as unapproved as it did before. Matching each proposal's
 * recipe against the runs actually booked into the open round is the only
 * thing the engine gives us that can tell the two apart, and it is a real
 * comparison of real values, not a local "I clicked it" flag that would
 * survive a failed request or a page reload.
 *
 * Recipes are compared exactly: both sides originate from the same engine
 * numbers (a proposal's `vals` become the started run's `recipe` verbatim),
 * so there is no float drift to tolerate here, and tolerating any would risk
 * calling a genuinely different recipe already-booked.
 */
export function bookedProposalIds(proposals: Proposal[], bookedRuns: Run[]): Set<string> {
  const booked = new Set(bookedRuns.map((r) => recipeKey(r.recipe)));
  return new Set(proposals.filter((p) => booked.has(recipeKey(p.run.recipe))).map((p) => p.id));
}
