// One identity for a recipe everywhere (first-time study, F8): the same P1..Pn label on Plan, Run, Record
// and Learn, and the same inputs in the same column order (the sheet's order, as the analysis lists the
// modeled inputs). Copy and Print read the same table. Pure; tested in __tests__/recipe-identity.test.ts.

import { displayRound } from "@/lib/campaign-stage";
import { formatNumber } from "@/lib/format";

/**
 * The recipe columns to show: every input that any recipe sets, in `inputs` order (the analysis'
 * `features`, which follow the sheet), then any input of `fallback` (the engine's `proposal_features`,
 * or the campaign's inputs) not already listed. Keys in neither list are not inputs (the engine echoes a
 * sheet's other columns in a recipe) and are left out.
 */
export function recipeColumns(recipes: readonly Record<string, unknown>[], inputs: readonly string[], fallback: readonly string[] = []): string[] {
  const present = new Set(recipes.flatMap((r) => Object.keys(r)));
  const out: string[] = [];
  for (const k of [...inputs, ...fallback]) if (present.has(k) && !out.includes(k)) out.push(k);
  return out;
}

/**
 * The label of each run of the round, by its place in the order the runs were started: P1, P2, ... When
 * the list holds runs from more than one round (results still waiting from an earlier round), the label
 * carries the round people see: R1-P4. The engine's hex id is never the name on screen.
 */
export function runLabels(runs: readonly { id: string; round?: number | null }[]): Map<string, string> {
  const rounds = new Set(runs.map((r) => r.round ?? null));
  const prefixed = rounds.size > 1;
  const counters = new Map<number | null, number>();
  const out = new Map<string, string>();
  for (const r of runs) {
    const key = r.round ?? null;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    out.set(r.id, prefixed && key != null ? `R${displayRound(key)}-P${n}` : `P${n}`);
  }
  return out;
}

/** The round people see for a run, or null when the engine did not stamp it. */
export const runRound = (r: { round?: number | null }): number | null => (r.round == null ? null : displayRound(r.round));

export type RecipeLine = { label: string; recipe: Record<string, unknown>; predicted?: number | null; measured?: number | null };

const cell = (v: unknown): string => (typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v == null ? "" : String(v));

/**
 * The recipes as a tab-separated table for the clipboard: a header row, then one row per recipe with
 * the label first, the inputs in column order, and the predicted (and measured, when given) value. Pastes
 * into a spreadsheet as cells. Values are exact, not rounded.
 */
export function recipesAsText(rows: readonly RecipeLine[], columns: readonly string[], target: string, opts: { measured?: boolean; round?: number | null } = {}): string {
  const head = ["Recipe", ...columns, `Predicted ${target}`, ...(opts.measured ? [`Measured ${target}`] : [])];
  const lines = rows.map((r) => [r.label, ...columns.map((c) => cell(r.recipe[c])), cell(r.predicted), ...(opts.measured ? [cell(r.measured)] : [])]);
  const title = opts.round != null ? [`Round ${opts.round}`] : [];
  return [...title, head.join("\t"), ...lines.map((l) => l.join("\t"))].join("\n");
}

/** "SP 8.97 · Met 8.15 · Gly 6.27": one recipe on one line, at the page's number format. */
export function recipeInline(recipe: Record<string, unknown>, columns: readonly string[]): string {
  return columns
    .filter((c) => c in recipe)
    .map((c) => `${c} ${typeof recipe[c] === "number" ? formatNumber(recipe[c] as number) : String(recipe[c])}`)
    .join(" · ");
}
