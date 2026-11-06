import type { MultiRun, SingleRun } from "@/lib/api";
import { formatNumber } from "@/lib/format";

/** Straight-line distance between two recipes in the benchmark's unit cube; 0 means the search landed on the optimum. */
export function recipeDistance(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - (b[i] ?? 0)) ** 2, 0));
}

/** The one sentence for a single-objective run. */
export function singleVerdict(run: Pick<SingleRun, "best_recipe" | "optimum" | "trajectory">): string {
  const last = run.trajectory[run.trajectory.length - 1];
  const n = last?.n ?? 0;
  const dist = recipeDistance(run.best_recipe, run.optimum);
  return `Found a recipe within ${formatNumber(dist)} of the known optimum after ${formatNumber(n, "count")} experiments.`;
}

/** The one sentence for a multi-objective run. */
export function multiVerdict(run: Pick<MultiRun, "pareto">): string {
  const k = run.pareto.length;
  return `Found ${formatNumber(k, "count")} trade-off ${k === 1 ? "recipe" : "recipes"}; no single winner.`;
}

/** Input names for the benchmark's unlabeled dimensions. */
export function dimensionNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `x${i + 1}`);
}
