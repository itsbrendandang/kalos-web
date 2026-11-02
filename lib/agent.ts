/*
 * Pure rules for the Agent page, tested in __tests__/agent.test.ts. Nothing
 * here invents data: every number comes from the campaign the engine returned
 * or from a simulation the user ran.
 */
import type { CampaignRun } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

export type AgentState = "working" | "waiting" | "idle";

export type AgentStatus = { state: AgentState; headline: string; detail: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the agent is doing, in one sentence, from the campaign alone. */
export function agentStatus(c: ActiveCampaign | null): AgentStatus {
  if (!c) return { state: "idle", headline: "No campaign yet", detail: "Upload a run sheet in Setup and the agent will start watching it." };
  if (c.n_awaiting > 0) {
    return {
      state: "waiting",
      headline: `Waiting on ${plural(c.n_awaiting, "lab result")}`,
      detail: `${plural(c.n_awaiting, "run")} started in round ${c.round} and not yet recorded. This page checks again every 20 seconds while it is open.`,
    };
  }
  return { state: "idle", headline: "Nothing running", detail: "No runs are in flight. Plan the next batch when you are ready." };
}

export const awaitingRuns = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => r.awaiting);
export const measuredRuns = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => !r.awaiting && r.result != null);

export type TwinCheck = {
  n: number;
  /** Mean of |measured - predicted|. */
  meanAbsError: number;
  /** How many measured results landed inside predicted ± 1 standard deviation. */
  withinOneSd: number;
};

/** How well the model's forecast matched what the lab measured, or null with nothing measured. */
export function twinCheck(runs: readonly CampaignRun[]): TwinCheck | null {
  const done = runs.filter((r) => r.result != null && Number.isFinite(r.pred));
  if (!done.length) return null;
  const errs = done.map((r) => Math.abs((r.result as number) - r.pred));
  return {
    n: done.length,
    meanAbsError: errs.reduce((a, b) => a + b, 0) / done.length,
    withinOneSd: done.filter((r, i) => errs[i] <= r.std).length,
  };
}

/** Straight-line distance between two recipes in the benchmark's unit cube. */
export function recipeDistance(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

/** A plain-English result for a finished simulation, for people new to the method. */
export function simSummary(experiments: number, distance: number): string {
  const n = `${experiments} ${experiments === 1 ? "experiment" : "experiments"}`;
  if (distance < 0.05) return `In ${n}, the agent found almost exactly the best possible recipe.`;
  if (distance < 0.2) return `In ${n}, the agent got close to the best possible recipe.`;
  return `In ${n}, the agent was still some way from the best recipe. More experiments would close the gap.`;
}
