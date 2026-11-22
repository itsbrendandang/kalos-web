/*
 * One shared horizontal scale for the proposal cards' prediction bars, so
 * every card in a batch is drawn on the same axis and can be compared by eye.
 * Pure, tested in __tests__/prediction-scale.test.ts.
 */

export type PredictionScale = {
  lo: number;
  hi: number;
  /** Position of a value on the bar, 0 to 100 (percent), clamped. */
  at: (v: number) => number;
};

/**
 * Spans every prediction's band (pred ± band) and the incumbent, padded by 5%
 * on each side so no mark sits on the bar's end. Returns null when there is
 * nothing finite to draw.
 */
export function predictionScale(preds: readonly number[], band: number | null, incumbent: number | null): PredictionScale | null {
  const half = band != null && Number.isFinite(band) && band > 0 ? band : 0;
  const values = preds.filter(Number.isFinite).flatMap((p) => [p - half, p + half]);
  if (incumbent != null) values.push(incumbent);
  return scaleOver(values);
}

/**
 * The same padded scale over any set of values (range ends, predictions, the
 * incumbent). Non-finite values are ignored; null when none is finite.
 */
export function scaleOver(input: readonly number[]): PredictionScale | null {
  const values = input.filter(Number.isFinite);
  if (values.length === 0) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi === lo) {
    // A single point: give it a visible neighbourhood instead of dividing by zero.
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.05;
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;
  return { lo, hi, at: (v) => Math.min(100, Math.max(0, ((v - lo) / span) * 100)) };
}

export type RecipeRange = { lo: number; hi: number; coverage: number | null; source: "interval" | "band" };

/**
 * The range to draw for one recipe: the engine's own interval at `coverage`
 * when it sent an available one (asymmetric, per recipe), otherwise the
 * global +/- band around the prediction, otherwise none.
 */
export function recipeRange(
  pred: number,
  intervals: readonly { available: boolean; coverage: number; lo?: number; hi?: number }[] | undefined,
  band: number | null,
  bandCoverage: number | null,
  coverage = 0.9,
): RecipeRange | null {
  const iv = intervals?.find((i) => i.available && Math.abs(i.coverage - coverage) < 1e-9);
  if (iv && iv.lo != null && iv.hi != null && Number.isFinite(iv.lo) && Number.isFinite(iv.hi) && iv.hi >= iv.lo) {
    return { lo: iv.lo, hi: iv.hi, coverage: iv.coverage, source: "interval" };
  }
  if (band != null && Number.isFinite(band) && band > 0 && Number.isFinite(pred)) {
    return { lo: pred - band, hi: pred + band, coverage: bandCoverage, source: "band" };
  }
  return null;
}
