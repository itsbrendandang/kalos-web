// Scale and tick helpers shared by the Your data figures. Pure, so the axis maths is unit-tested.

/** A linear map from the data domain to a pixel range. A zero-width domain maps to the middle of the range. */
export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]): (v: number) => number {
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

/** Round tick positions (1, 2, 2.5 or 5 times a power of ten) that cover [lo, hi], about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const DATA_FORMAT = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

/** A raw sheet value for display: up to four significant digits, grouped, never a made-up zero. */
export function dataNumber(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "n/a" : DATA_FORMAT.format(v);
}
