/*
 * Pure rules for the Agent page, tested in __tests__/agent.test.ts. Nothing
 * here invents data: every number comes from the campaign Kalos returned.
 */
import type { CampaignRun } from "@/lib/api";
import type { ActiveCampaign } from "@/lib/workbench";

export type AgentState = "working" | "waiting" | "idle";

export type AgentStatus = { state: AgentState; headline: string; detail: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the agent is doing, in one sentence, from the campaign alone. */
export function agentStatus(c: ActiveCampaign | null): AgentStatus {
  if (!c) return { state: "idle", headline: "No campaign yet", detail: "Upload a run sheet in Setup and this page starts watching the lab." };
  if (c.n_awaiting > 0) {
    return {
      state: "waiting",
      headline: `Waiting on ${plural(c.n_awaiting, "lab result")}`,
      detail: `${plural(c.n_awaiting, "run")} started in round ${c.round} and not yet recorded. This page checks again every 20 seconds while it is open.`,
    };
  }
  return { state: "idle", headline: "Nothing in the lab", detail: "Plan the next round when you are ready; once its runs start, this page watches them." };
}

export const awaitingRuns = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => r.awaiting);
export const measuredRuns = (c: ActiveCampaign): CampaignRun[] => c.pending.filter((r) => !r.awaiting && r.result != null);

export type ForecastCheck = {
  n: number;
  /** Average of |measured - predicted|: how far a prediction usually was from its result. */
  meanAbsError: number;
  /** How many measured results landed inside the model's likely range for that run (predicted ± its spread). */
  withinOneSd: number;
};

/** How well the model's predictions matched what the lab measured, or null with nothing measured. */
export function forecastCheck(runs: readonly CampaignRun[]): ForecastCheck | null {
  const done = runs.filter((r) => r.result != null && Number.isFinite(r.pred));
  if (!done.length) return null;
  const errs = done.map((r) => Math.abs((r.result as number) - r.pred));
  return {
    n: done.length,
    meanAbsError: errs.reduce((a, b) => a + b, 0) / done.length,
    withinOneSd: done.filter((r, i) => errs[i] <= r.std).length,
  };
}
