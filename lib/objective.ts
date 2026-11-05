// The optimizer only raises its target: the engine maximizes and has no direction field.
// These helpers keep the copy honest about that. They are pure, so Setup and Overview share one rule.

/** Words in a column name that usually mean "the lower the better". Kept short on purpose: a warning, not a classifier. */
const LOWER_IS_BETTER = ["impurity", "impurities", "cost", "time", "byproduct", "byproducts", "contaminant", "contaminants"];

/**
 * The word in `column` that suggests lower is better (`impurity_pct` gives `impurity`), or null.
 * Matches whole words only, after splitting snake_case, kebab-case, spaces and camelCase, so `runtime` or `costume` do not match.
 */
export function lowerIsBetterWord(column: string): string | null {
  const words = column
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.find((w) => LOWER_IS_BETTER.includes(w)) ?? null;
}

/**
 * The plain warning Setup shows under the target picker when the chosen column looks like something to keep low.
 * Null when the name gives no reason to doubt the direction. It never blocks the upload.
 */
export function directionWarning(target: string | null | undefined): string | null {
  if (!target) return null;
  if (lowerIsBetterWord(target) == null) return null;
  return `${target} may be a value to keep low. Kalos only aims to raise the column it is given, so its suggestions push ${target} up. To aim lower, add a column of the negated values to the sheet (for example, 100 minus each value) and choose that column.`;
}

/** The Overview title. Kalos aims to raise the target; it never aims to lower it. */
export function aimLine(target: string): string {
  return `Kalos aims to raise ${target}`;
}
