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
  if (incumbent != null && Number.isFinite(incumbent)) values.push(incumbent);
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
