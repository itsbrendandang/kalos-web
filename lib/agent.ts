/*
 * Pure rules for the Agent page, tested in __tests__/agent.test.ts. Nothing
 * here invents data: every number comes from the campaign Kalos returned.
 */
import type { Campaign, CampaignRun, LatestResult } from "@/lib/api";
import type { AssistNext } from "@/lib/assist";
import { campaignStage } from "@/lib/campaign-stage";
import { WHY, whyLine } from "@/lib/why";
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

/**
 * The next step worked out here, from the campaign alone, for an engine that
 * has no /api/assist/next yet. Same shape as the engine's guide, so the card
 * cannot tell the two apart. Blockers: runs still out, in plain words.
 */
export function localNextStep(latest: Pick<LatestResult, "has_data"> & { proposals?: readonly unknown[] }, campaign: Campaign): AssistNext {
  const { next, awaiting, started, measured: done } = campaignStage(latest, campaign);
  const blockers: AssistNext["blockers"] = [];
  if (awaiting > 0) {
    blockers.push({
      code: "runs_awaiting",
      text: `${plural(awaiting, "run")} of ${started} ${awaiting === 1 ? "has" : "have"} no result yet.`,
      why: WHY.run_waiting,
    });
  }
  // The same why-lines as the stage pages (lib/why.ts), keyed by the stage the step points to.
  const whyKey = next.stage === "setup" ? "setup_no_sheet" : next.stage === "plan" ? "plan_ready" : next.stage === "record" ? (done > 0 ? "record_partial" : "run_waiting") : next.stage === "learn" ? "learn_ready" : null;
  const why_it_matters = whyKey ? whyLine(whyKey) : null;
  return { step: `${next.action}.`, why: next.reason, ...(why_it_matters ? { why_it_matters } : {}), action_route: next.href, blockers, action: next.action };
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
