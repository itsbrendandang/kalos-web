/** Descriptive bins of supplied measurements only; no fitted density or imputation. */
export function outcomeBins(values: readonly number[]): { lo: number; hi: number; count: number }[] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [];
  let lo = finite[0];
  let hi = lo;
  for (const value of finite) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
  if (lo === hi) return [{ lo, hi, count: finite.length }];
  const n = Math.min(8, Math.ceil(Math.sqrt(finite.length)));
  const width = (hi - lo) / n;
  const bins = Array.from({ length: n }, (_, i) => ({ lo: lo + i * width, hi: i === n - 1 ? hi : lo + (i + 1) * width, count: 0 }));
  for (const value of finite) bins[Math.min(n - 1, Math.floor((value - lo) / width))].count++;
  return bins;
}

export function finitePairs(pairs: readonly [number, number][]): [number, number][] {
  return pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}
