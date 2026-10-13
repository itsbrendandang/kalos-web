/*
 * Where the live campaign is in its round, and the one next action, derived
 * from GET /api/latest + GET /api/campaign alone (kalos/docs/CAMPAIGN_LOOP.md).
 * Pure, so every rule is unit tested in __tests__/campaign-stage.test.ts.
 *
 * Rounds: the engine counts re-analyses (`campaign.round`, 0 right after an
 * upload). People count batches, so the batch proposed after k re-analyses is
 * "round k + 1".
 *
 * The engine cannot tell a run still in the lab from one that is back but not
 * yet entered: both are "awaiting". So while any run awaits, the round is in
 * Run (honest: results are outstanding) and the next action is Record, the Run
 * stage's own primary action. Record and Learn only complete once every
 * started run has a result. Stages are ordered: done ... current ... upcoming.
 * Setup is done once an analysis exists and stays done across rounds.
 */

import type { Campaign, LatestResult } from "@/lib/api";
import { CAMPAIGN_STAGES, type StageKey } from "@/lib/routes";
import { inFlight, measured, type ActiveCampaign } from "@/lib/workbench";

export type StepState = "done" | "current" | "upcoming";

export type StageStep = {
  key: StageKey;
  label: string;
  href: string;
  state: StepState;
  /** A short, visible reason for the state, so no stage is ever marked done silently. */
  detail: string;
};

export type NextAction = {
  /** The stage page the action lives on. */
  stage: StageKey;
  /** Verb + object, also the button label: "Record 3 results". */
  action: string;
  href: string;
  /** One sentence on why this is next. */
  reason: string;
};

export type CampaignStage = {
  /** The round being worked on, as people count it (1-based); null before any analysis. */
  round: number | null;
  started: number;
  awaiting: number;
  measured: number;
  steps: StageStep[];
  next: NextAction;
};

/** The 1-based round people see, from the engine's 0-based `round`. The only place this conversion lives. */
export const displayRound = (engineRound: number): number => engineRound + 1;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function steps(states: Record<StageKey, [StepState, string]>): StageStep[] {
  return CAMPAIGN_STAGES.map((s) => ({ key: s.key, label: s.label, href: s.href, state: states[s.key][0], detail: states[s.key][1] }));
}

const href = (stage: StageKey) => `/campaign/${stage}`;

/**
 * `latest` only needs to say whether an analysis exists (and, when it does,
 * how many recipes it proposed), so demo data can pass `{ has_data: true }`.
 */
export function campaignStage(
  latest: Pick<LatestResult, "has_data"> & { proposals?: readonly unknown[] },
  campaign: Campaign,
): CampaignStage {
  const active: ActiveCampaign | null = campaign.has_campaign ? campaign : null;
  const started = active?.pending.length ?? 0;
  const awaiting = active ? inFlight(active).length : 0;
  const done = active ? measured(active).length : 0;
  const counts = { started, awaiting, measured: done };

  if (!latest.has_data && started === 0) {
    return {
      round: null,
      ...counts,
      steps: steps({
        setup: ["current", "No run sheet yet"],
        plan: ["upcoming", ""],
        run: ["upcoming", ""],
        record: ["upcoming", ""],
        learn: ["upcoming", ""],
      }),
      next: {
        stage: "setup",
        action: "Upload a run sheet",
        href: href("setup"),
        reason: "Kalos fits a model to the runs you already have, then proposes the first batch.",
      },
    };
  }

  const round = displayRound(active?.round ?? 0);
  const setupDone: [StepState, string] = ["done", latest.has_data ? "Run sheet analyzed" : "Campaign seeded"];

  if (started === 0) {
    const proposed = latest.proposals?.length;
    return {
      round,
      ...counts,
      steps: steps({
        setup: setupDone,
        plan: ["current", proposed ? `${plural(proposed, "recipe")} proposed` : "Batch ready to review"],
        run: ["upcoming", ""],
        record: ["upcoming", ""],
        learn: ["upcoming", ""],
      }),
      next: {
        stage: "plan",
        action: `Review and start round ${round}`,
        href: href("plan"),
        reason: proposed
          ? `The model proposed ${plural(proposed, "recipe")}. Untick any you will not run, then start the rest.`
          : "Review the proposed batch, untick any recipe you will not run, then start the rest.",
      },
    };
  }

  const startedText = `${plural(started, "run")} started`;

  if (awaiting > 0) {
    return {
      round,
      ...counts,
      steps: steps({
        setup: setupDone,
        plan: ["done", startedText],
        run: ["current", `${awaiting} awaiting results`],
        record: ["upcoming", done > 0 ? `${done} of ${started} recorded` : "Nothing recorded yet"],
        learn: ["upcoming", ""],
      }),
      next: {
        stage: "record",
        action: `Record ${plural(awaiting, "result")}`,
        href: href("record"),
        reason:
          done > 0
            ? `${done} of ${started} results are in. Enter the rest as they come back from the lab.`
            : `${plural(awaiting, "run")} from round ${round} ${awaiting === 1 ? "is" : "are"} waiting for a measured result.`,
      },
    };
  }

  return {
    round,
    ...counts,
    steps: steps({
      setup: setupDone,
      plan: ["done", startedText],
      run: ["done", `All ${started} back`],
      record: ["done", `${plural(done, "result")} recorded`],
      learn: ["current", "Ready to update the model"],
    }),
    next: {
      stage: "learn",
      action: `Learn from round ${round}`,
      href: href("learn"),
      reason: `Every run in round ${round} has a result. See what changed, then plan round ${round + 1}.`,
    },
  };
}

/**
 * The measured best-so-far change from the previous round, from
 * `campaign.history` only. Null when there is no previous round or either end
 * has no measured best: the caller shows a qualifier instead of a delta.
 */
export function bestDeltaFromPreviousRound(
  campaign: ActiveCampaign,
): { delta: number; previousRound: number } | null {
  const i = campaign.history.findIndex((h) => h.round === campaign.round);
  if (i < 1) return null;
  const [prev, cur] = [campaign.history[i - 1], campaign.history[i]];
  if (prev.best == null || cur.best == null) return null;
  return { delta: cur.best - prev.best, previousRound: prev.round };
}
