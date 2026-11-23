/** Descriptive counts of measured members of engine-held-out pairs. No fitting or imputation. */
export function outcomeDistribution(oof: unknown) {
  const pairs = Array.isArray(oof) ? oof : [];
  const values: number[] = pairs.filter((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v))).map((p) => p[0]);
  const excluded = pairs.length - values.length;
  if (!values.length) return { bins: [], n: 0, excluded };
  let lo = values[0];
  let hi = lo;
  for (const value of values) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
  if (lo === hi) return { bins: [{ lo, hi, count: values.length }], n: values.length, excluded };
  const size = Math.min(8, Math.ceil(Math.sqrt(values.length)));
  // Interpolate after scaling to avoid overflow in hi - lo for opposite-sign finite extremes.
  const edge = (i: number) => lo * (1 - i / size) + hi * (i / size);
  const bins = Array.from({ length: size }, (_, i) => ({ lo: edge(i), hi: edge(i + 1), count: 0 }));
  for (const value of values) {
    const index = bins.findIndex((b, i) => value >= b.lo && (i === bins.length - 1 ? value <= b.hi : value < b.hi));
    if (index >= 0) bins[index].count++;
  }
  return { bins, n: values.length, excluded };
}
