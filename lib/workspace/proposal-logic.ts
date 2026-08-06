// Pure logic behind the proposals card (design spec 1.3.F). The design's
// table has two hard-coded recipe columns ("Glucose", "Feed start"); a real
// campaign's proposals carry whatever inputs the engine actually varied, so
// the columns are derived from the batch instead of assumed.
import type { Proposal } from "./types";

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

export function recipeColumns(proposals: Proposal[], limit: number = MAX_RECIPE_COLUMNS): RecipeColumns {
  const seen: string[] = [];
  for (const p of proposals) {
    for (const key of Object.keys(p.run.recipe)) {
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
export function recipeDecimals(proposals: Proposal[], key: string): 0 | 2 {
  const values = proposals.map((p) => p.run.recipe[key]).filter((v): v is number => typeof v === "number");
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
