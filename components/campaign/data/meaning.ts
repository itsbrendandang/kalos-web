// The one sentence of meaning under every Your data figure. Each states an association seen in these runs and
// never a cause: no "because", "drives", "causes", "effect of", "leads to", "improves". Pure, so the wording is
// unit-tested in __tests__/data-meaning.test.ts. Numbers go through `dataNumber`, counts through `formatNumber`.
import { associationOf, pairedValues, rankInputs } from "@/components/campaign/data/association";
import { consecutiveBlocks, summarize, type ColumnProfile, type Histogram, type MeasuredSplit, type ReplicateGroup, type ReplicateSpread, type SheetProfile } from "@/components/campaign/data/profile";
import { dataNumber } from "@/components/campaign/data/svg";
import { formatNumber } from "@/lib/format";

/** How many "best" runs a sentence talks about: a tenth of the runs, 3 to 10 (fewer only when the sheet has fewer). */
export function bestCount(n: number): number {
  if (n < 3) return n;
  return Math.max(3, Math.min(10, Math.ceil(n / 10)));
}

const runs = (k: number) => `${formatNumber(k, "count")} ${k === 1 ? "run" : "runs"}`;

function median(values: readonly number[]): number {
  return summarize(values)?.median ?? NaN;
}

/** The indices of the `b` largest values, largest first (ties by the earlier index). */
export function topIndices(values: readonly number[], b: number): number[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((p, q) => q.v - p.v || p.i - q.i)
    .slice(0, b)
    .map((p) => p.i);
}

/**
 * A1. The best row, whether its recipe is repeated, and whether blocks of consecutive rows repeat a recipe.
 * With `origins` (one label per row, null for the sheet itself), one more sentence for the latest round.
 */
export function sheetOrder(values: readonly (number | null)[], groups: readonly ReplicateGroup[], origins?: readonly (string | null)[]): string | null {
  const present = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (present.length === 0) return null;
  const best = present.reduce((a, p) => (p.v > a.v ? p : a));
  const own = groups.find((g) => g.rows.includes(best.i));
  const bestPart = `Best run: row ${formatNumber(best.i + 1, "count")} at ${dataNumber(best.v)}${
    own ? `; it is one of ${runs(own.rows.length)} of the same recipe` : "; no other run repeats its recipe"
  }.`;
  const blocks = consecutiveBlocks(groups);
  let blockPart: string;
  if (blocks.length === 0) blockPart = "No block of consecutive rows repeats a recipe.";
  else {
    const [first] = blocks;
    const more = blocks.length - 1;
    blockPart = `Rows ${formatNumber(first.rows[0] + 1, "count")} to ${formatNumber(first.rows[first.rows.length - 1] + 1, "count")} repeat one recipe ${formatNumber(first.rows.length, "count")} times${
      more === 0 ? "" : more === 1 ? ", and 1 more block does the same" : `, and ${formatNumber(more, "count")} more blocks do the same`
    }.`;
  }
  const parts = [bestPart, blockPart];
  const round = latestRound(values, origins);
  if (round) parts.push(round);
  return parts.join(" ");
}

/** `Round {k} added {m} runs; its best, {b}, {beat | did not beat} the sheet's best {b0}.` for the latest labelled origin. */
export function latestRound(values: readonly (number | null)[], origins?: readonly (string | null)[]): string | null {
  if (!origins) return null;
  const labels = [...new Set(origins.filter((o): o is string => o != null))];
  if (labels.length === 0) return null;
  const label = labels[labels.length - 1];
  const inRound = values.filter((_, i) => origins[i] === label);
  const inSheet = values.filter((v, i) => origins[i] == null && v != null) as number[];
  const measured = inRound.filter((v): v is number => v != null);
  const added = `${label} added ${runs(inRound.length)}`;
  if (measured.length === 0 || inSheet.length === 0) return `${added}.`;
  const b = Math.max(...measured);
  const b0 = Math.max(...inSheet);
  return `${added}; its best, ${dataNumber(b)}, ${b > b0 ? "beat" : "did not beat"} the sheet's best ${dataNumber(b0)}.`;
}

/** The levels of a category input with their target values, sorted by median target descending. */
export function levelsByMedian(points: readonly { x: string; y: number }[]): { value: string; ys: number[]; median: number }[] {
  const by = new Map<string, number[]>();
  for (const p of points) by.set(p.x, [...(by.get(p.x) ?? []), p.y]);
  return [...by]
    .map(([value, ys]) => ({ value, ys, median: median(ys) }))
    .sort((a, b) => b.median - a.median || a.value.localeCompare(b.value));
}

/** A2. Which level had the highest and lowest median target, and how many levels the best runs came from. */
export function categoryStrips(xName: string, yName: string, points: readonly { x: string; y: number }[]): string | null {
  if (points.length === 0) return null;
  const levels = levelsByMedian(points);
  const b = bestCount(points.length);
  const bestLevels = new Set(topIndices(points.map((p) => p.y), b).map((i) => points[i].x));
  const top = levels[0];
  if (levels.length === 1) return `${xName} is ${top.value} in every one of these ${runs(points.length)}, so it cannot show an association with ${yName}.`;
  const bottom = levels[levels.length - 1];
  return `${top.value} had the highest median ${yName} (${dataNumber(top.median)}, n = ${formatNumber(top.ys.length, "count")}) and ${bottom.value} the lowest (${dataNumber(bottom.median)}, n = ${formatNumber(bottom.ys.length, "count")}); the best ${formatNumber(b, "count")} runs ${bestLevels.size === 1 ? `all came from one ${xName} value` : `came from ${formatNumber(bestLevels.size, "count")} different ${xName} values`}.`;
}

/** A3. The direction and looseness of the trend by |rho|, then where the best runs sat on the input. */
export function scatter(xName: string, yName: string, points: readonly { x: number; y: number }[], rho: number | null): string | null {
  if (points.length === 0) return null;
  const a = Math.abs(rho ?? 0);
  const dir = (rho ?? 0) > 0 ? "higher" : "lower";
  const trend = rho == null || a < 0.25 ? `${yName} showed no clear trend with ${xName}` : a >= 0.5 ? `Higher ${xName} went with ${dir} ${yName}` : `Higher ${xName} tended to go with ${dir} ${yName}, loosely`;
  const b = bestCount(points.length);
  if (points.length < 3) return `${trend}; ${runs(points.length)} only.`;
  const bestXs = topIndices(points.map((p) => p.y), b).map((i) => points[i].x);
  const mid = median(points.map((p) => p.x));
  const lo = Math.min(...bestXs);
  const hi = Math.max(...bestXs);
  const where = bestXs.every((x) => x > mid) ? `all had ${xName} above ${dataNumber(lo)}` : bestXs.every((x) => x < mid) ? `all had ${xName} below ${dataNumber(hi)}` : `had ${xName} from ${dataNumber(lo)} to ${dataNumber(hi)}`;
  return `${trend}; the best ${formatNumber(b, "count")} runs ${where}.`;
}

/** A4. The fullest bin, its share of the runs, and how far above it the top value sits. */
export function histogram(hist: Histogram, n: number, max: number): string | null {
  if (n === 0 || hist.counts.length === 0) return null;
  const fullest = hist.counts.indexOf(Math.max(...hist.counts));
  const c = hist.counts[fullest];
  const last = hist.counts.length - 1;
  let maxBin = last;
  for (let i = 0; i <= last; i++) {
    if (max <= hist.edges[i + 1] || i === last) {
      maxBin = i;
      break;
    }
  }
  const above = maxBin - fullest;
  return `${formatNumber(c, "count")} of ${runs(n)} (${formatNumber(c / n, "pct")}) fall between ${dataNumber(hist.edges[fullest])} and ${dataNumber(hist.edges[fullest + 1])}, the fullest bin; the top value, ${dataNumber(max)}, is ${
    above <= 0 ? "in that bin" : `${formatNumber(above, "count")} ${above === 1 ? "bin" : "bins"} above it`
  }.`;
}

/** A5. Replicate spread, and how it compares with the spread across all runs (`allSd`, the sd of every target value). */
export function replicate(spread: ReplicateSpread, allSd: number | null): string {
  if (spread.groups === 0) return "No replicates: no two runs share every input value, so run-to-run spread cannot be measured from this sheet.";
  const head = `${formatNumber(spread.groups, "count")} ${spread.groups === 1 ? "recipe" : "recipes"} run more than once (${runs(spread.runs)}). Median spread within a recipe: ${dataNumber(spread.medianSd)}`;
  if (spread.medianSd == null || allSd == null || !(allSd > 0)) return `${head}.`;
  return `${head}, which is ${formatNumber(spread.medianSd / allSd, "pct")} of the spread across all runs.`;
}

/** A3. Why a nearly constant input has no scatter. */
export function nearlyConstant(xName: string, yName: string, min: number, max: number): string {
  return `${xName} is nearly constant (${dataNumber(min)} to ${dataNumber(max)}), so this sheet cannot show its association with ${yName}.`;
}

/** Shared rule 6. Which rows a `data_type` column keeps out of every chart. */
export function leftOut(split: MeasuredSplit, total: number): string {
  const out = split.leftOut.reduce((s, l) => s + l.n, 0);
  const named = split.leftOut.map((l) => `${l.value} (${formatNumber(l.n, "count")})`).join(", ");
  return `${formatNumber(out, "count")} of ${formatNumber(total, "count")} rows ${out === 1 ? "is" : "are"} marked ${named} in ${split.column}, so ${out === 1 ? "it stays" : "they stay"} in the table and out of every chart; only the ${runs(split.profile.n)} marked measured ${split.profile.n === 1 ? "is" : "are"} drawn.`;
}

/**
 * A6. How many of the best measured held-out runs the model's top predictions include, and (with a band) how many
 * predictions landed within it. `oof` pairs are [measured, predicted].
 */
export function predictedVsMeasured(oof: readonly (readonly [number, number])[], band?: number | null): string | null {
  const n = oof.length;
  if (n === 0) return null;
  const b = bestCount(n);
  const topPredicted = new Set(topIndices(oof.map((p) => p[1]), b));
  const k = topIndices(oof.map((p) => p[0]), b).filter((i) => topPredicted.has(i)).length;
  const first = `The model's top ${formatNumber(b, "count")} predicted runs include ${formatNumber(k, "count")} of the ${formatNumber(b, "count")} best measured runs`;
  if (band == null || !Number.isFinite(band)) return `${first}.`;
  const m = oof.filter(([measured, predicted]) => Math.abs(predicted - measured) <= band).length;
  return `${first}; ${formatNumber(m, "count")} of ${formatNumber(n, "count")} predictions landed within ${dataNumber(band)} of the measurement.`;
}

/** The sentence for one input against the target: scatter for a numeric input, strips for a category. */
export function inputSentence(x: ColumnProfile, y: ColumnProfile): string | null {
  const { xs, ys } = pairedValues(x, y);
  if (x.kind === "numeric") {
    const rho = associationOf(x, y).rho ?? null;
    return scatter(x.name, y.name, (xs as number[]).map((xv, i) => ({ x: xv, y: ys[i] })), rho);
  }
  return categoryStrips(x.name, y.name, (xs as string[]).map((xv, i) => ({ x: xv, y: ys[i] })));
}

/**
 * The strongest-association sentence (the scatter or strip sentence of the top-ranked input), for a page's verdict.
 * Null when there is no numeric target, no rankable input, or too few runs.
 */
export function leadSentence(profile: SheetProfile, target: string, inputs: readonly (string | ColumnProfile)[]): string | null {
  const y = profile.columns.find((c) => c.name === target);
  if (!y || y.kind !== "numeric") return null;
  const [top] = rankInputs(profile, target, inputs);
  if (!top || top.strength == null || top.nearlyConstant) return null;
  const x = profile.columns.find((c) => c.name === top.name);
  return x ? inputSentence(x, y) : null;
}
