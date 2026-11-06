// How strongly each input moved with the target in the sheet's own rows: Spearman's rank correlation for numeric
// inputs and the correlation ratio (the square root of eta squared) for category inputs, so both sit on one 0..1
// scale. Pure maths, unit-tested in __tests__/data-association.test.ts. An association in these runs is never a cause.
import type { ColumnKind, ColumnProfile, SheetProfile } from "@/components/campaign/data/profile";

/** Fewer paired values than this and the association is not reported (`strength: null`). */
export const MIN_PAIRS = 5;

/** Ranks 1..n with ties given the average of the ranks they span. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const rank = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) ranks[order[m].i] = rank;
    k = j + 1;
  }
  return ranks;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rank correlation with average ranks for ties. Null with fewer than 3 pairs or a constant side. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length) throw new Error("spearman: xs and ys differ in length");
  return pearson(averageRanks(xs), averageRanks(ys));
}

/** The between-level share of the total sum of squares of `ys` (eta squared, 0..1). Null when ys do not vary. */
export function etaSquared(levels: readonly string[], ys: readonly number[]): number | null {
  if (levels.length !== ys.length) throw new Error("etaSquared: levels and ys differ in length");
  const n = ys.length;
  if (n < 2) return null;
  const mean = ys.reduce((s, v) => s + v, 0) / n;
  const total = ys.reduce((s, v) => s + (v - mean) ** 2, 0);
  if (total === 0) return null;
  const groups = new Map<string, { sum: number; n: number }>();
  levels.forEach((l, i) => {
    const g = groups.get(l) ?? { sum: 0, n: 0 };
    g.sum += ys[i];
    g.n += 1;
    groups.set(l, g);
  });
  let between = 0;
  for (const g of groups.values()) between += g.n * (g.sum / g.n - mean) ** 2;
  return between / total;
}

export type InputRank = {
  name: string;
  kind: ColumnKind;
  /** |rho| for numeric inputs, sqrt(eta squared) for categories; null with fewer than `MIN_PAIRS` paired values. */
  strength: number | null;
  /** Spearman's rho, numeric inputs only. */
  rho?: number;
  nearlyConstant: boolean;
  /** Runs with both the input and the target. */
  n: number;
};

/** The paired (input, target) values of an input: numbers for a numeric input, level names for a category. */
export function pairedValues(x: ColumnProfile, y: ColumnProfile): { xs: (number | string)[]; ys: number[]; rows: number[] } {
  const xs: (number | string)[] = [];
  const ys: number[] = [];
  const rows: number[] = [];
  for (let r = 0; r < y.numbers.length; r++) {
    const yv = y.numbers[r];
    const xv = x.kind === "numeric" ? x.numbers[r] : x.raw[r];
    if (yv == null || xv == null || xv === "") continue;
    xs.push(xv);
    ys.push(yv);
    rows.push(r);
  }
  return { xs, ys, rows };
}

/** Numeric strength of one input against the target: rho (numeric) or the correlation ratio (category). */
export function associationOf(x: ColumnProfile, y: ColumnProfile): { strength: number | null; rho?: number; n: number } {
  const { xs, ys } = pairedValues(x, y);
  const n = ys.length;
  if (n < MIN_PAIRS) return { strength: null, n };
  if (x.kind === "numeric") {
    const rho = spearman(xs as number[], ys);
    return rho == null ? { strength: null, n } : { strength: Math.abs(rho), rho, n };
  }
  const eta2 = etaSquared(xs as string[], ys);
  return eta2 == null ? { strength: null, n } : { strength: Math.sqrt(eta2), n };
}

function resolve(profile: SheetProfile, inputs: readonly (string | ColumnProfile)[]): ColumnProfile[] {
  return inputs.map((i) => (typeof i === "string" ? profile.columns.find((c) => c.name === i) : i)).filter((c): c is ColumnProfile => c != null);
}

/**
 * The inputs ranked by how strongly they moved with the target, strongest first. Nearly constant inputs sort last
 * whatever their rho; inputs with too few paired values carry `strength: null` and sort after the ranked ones.
 */
export function rankInputs(profile: SheetProfile, target: string, inputs: readonly (string | ColumnProfile)[]): InputRank[] {
  const y = profile.columns.find((c) => c.name === target);
  const cols = resolve(profile, inputs).filter((c) => c.kind === "numeric" || c.kind === "category");
  const ranked: InputRank[] = cols.map((x) => {
    const a = y && y.kind === "numeric" ? associationOf(x, y) : { strength: null, n: 0 };
    return { name: x.name, kind: x.kind, strength: a.strength, ...(a.rho != null ? { rho: a.rho } : {}), nearlyConstant: x.nearlyConstant, n: a.n };
  });
  const order = (r: InputRank) => (r.nearlyConstant ? 2 : r.strength == null ? 1 : 0);
  return ranked.sort((a, b) => order(a) - order(b) || (b.strength ?? 0) - (a.strength ?? 0) || a.name.localeCompare(b.name));
}

/** The caption word for an input's place in the ranking: "strongest association", "weaker" or "nearly constant". */
export function strengthWord(rank: InputRank, index: number): string {
  if (rank.nearlyConstant) return "nearly constant";
  if (rank.strength == null) return "too few runs to rank";
  return index === 0 ? "strongest association" : "weaker";
}
