/**
 * The one number format per quantity (redesign brief, rule 5). Every page
 * formats numbers through these so the same quantity never shows with two
 * precisions: target values and correlations to 2 decimals, percentages as
 * integers, counts as integers. Fixed en-US grouping so server and client
 * renders match.
 */

export type Quantity = "value" | "corr" | "icc" | "pct" | "count";

const MISSING = "n/a";

const formatters: Record<Quantity, Intl.NumberFormat> = {
  value: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  corr: new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  // ICC sits near 1: 2 decimals would print 0.997 as "1.00".
  icc: new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  pct: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  count: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
};

/**
 * `pct` takes a fraction (0.9 -> "90%"). `sign` prefixes a "+" on values that
 * stay positive after rounding, for deltas. Missing or non-finite input reads
 * "n/a" rather than a made-up zero.
 */
export function formatNumber(
  n: number | null | undefined,
  quantity: Quantity = "value",
  { sign = false }: { sign?: boolean } = {},
): string {
  if (n == null || !Number.isFinite(n)) return MISSING;
  const scaled = quantity === "pct" ? n * 100 : n;
  // Format the absolute value so a negative that rounds to zero prints "0.00", not "-0.00".
  const body = formatters[quantity].format(Math.abs(scaled));
  const isZero = Number(body.replace(/,/g, "")) === 0;
  const prefix = isZero ? "" : scaled < 0 ? "-" : sign ? "+" : "";
  return `${prefix}${body}${quantity === "pct" ? "%" : ""}`;
}

/** An interval as "lo to hi", both ends in the same quantity's format. */
export function formatRange(lo: number | null | undefined, hi: number | null | undefined, quantity: Quantity = "value"): string {
  return `${formatNumber(lo, quantity)} to ${formatNumber(hi, quantity)}`;
}

/**
 * The one uncertainty number per recipe (rule 2): the prediction band's
 * half-width with its coverage, "± 0.31 (90% band)". `coverage` is the
 * engine's `conformal_coverage` fraction; when it is missing the percentage
 * is left out, never guessed.
 */
export function formatBand(halfWidth: number | null | undefined, coverage?: number | null): string {
  const pct = coverage != null && Number.isFinite(coverage) ? `${formatNumber(coverage, "pct")} band` : "prediction band";
  return `± ${formatNumber(halfWidth)} (${pct})`;
}
