/*
 * Where the live campaign is in its round, and the one next action, derived
 * from GET /api/latest + GET /api/campaign alone (kalos/docs/CAMPAIGN_LOOP.md).
 * Pure, so every rule is unit tested in __tests__/campaign-stage.test.ts.
 *
 * Rounds: the engine counts re-analyses (`campaign.round`, 0 right after an
 * upload). People count rounds of runs, so the recipes proposed after k
 * re-analyses are "round k + 1".
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
import type { WhyCode } from "@/lib/why";

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
  /** The "Why this matters" line for this step (lib/why.ts). */
  why: NextWhy;
};

export type NextWhy = Extract<WhyCode, "setup_no_sheet" | "setup_done" | "plan_ready" | "run_waiting" | "record_partial" | "learn_ready">;

/** The why-line code for a next step, from the stage it lives on and how far the round has got. */
export function nextWhy(stage: StageKey, counts: { hasData: boolean; measured: number }): NextWhy {
  switch (stage) {
    case "setup":
      return counts.hasData ? "setup_done" : "setup_no_sheet";
    case "plan":
      return "plan_ready";
    case "run":
    case "record":
      return counts.measured > 0 ? "record_partial" : "run_waiting";
    default:
      return "learn_ready";
  }
}

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
 * The engine's `campaign.stage` and `next_action` win when present; the local
 * derivation below is the fallback for engines that do not send them yet.
 */
export function campaignStage(
  latest: Pick<LatestResult, "has_data"> & { proposals?: readonly unknown[] },
  campaign: Campaign,
): CampaignStage {
  const local = localStage(latest, campaign);
  const { stage, next_action: next } = campaign;
  const meta = (key: string) => CAMPAIGN_STAGES.find((s) => s.key === key);
  // A malformed engine payload must never throw inside the shell: fall back.
  if (stage == null || stage.steps.length !== CAMPAIGN_STAGES.length || stage.steps.some((s) => !meta(s.key)) || (next && !meta(next.stage))) return local;
  return {
    ...local,
    // The engine sends `round` already 1-based (display round); do not convert again.
    round: stage.round,
    started: stage.started,
    steps: stage.steps.map((s) => ({ key: s.key, label: meta(s.key)!.label, href: meta(s.key)!.href, state: s.state, detail: s.detail })),
    next: next ? { ...next, href: meta(next.stage)!.href, why: nextWhy(next.stage, { hasData: latest.has_data, measured: local.measured }) } : local.next,
  };
}

/**
 * `latest` only needs to say whether an analysis exists (and, when it does,
 * how many recipes it proposed), so demo data can pass `{ has_data: true }`.
 */
function localStage(
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
        reason: "Kalos learns from the runs you already have, then proposes the first recipes to try.",
        why: "setup_no_sheet",
      },
    };
  }

  const round = displayRound(active?.round ?? 0);
  const setupDone: [StepState, string] = ["done", latest.has_data ? "Kalos has read the sheet" : "Campaign started"];

  if (started === 0) {
    const proposed = latest.proposals?.length;
    return {
      round,
      ...counts,
      steps: steps({
        setup: setupDone,
        plan: ["current", proposed ? `${plural(proposed, "recipe")} proposed` : "Recipes ready to review"],
        run: ["upcoming", ""],
        record: ["upcoming", ""],
        learn: ["upcoming", ""],
      }),
      next: {
        stage: "plan",
        action: "Review the proposed runs",
        href: href("plan"),
        reason: proposed
          ? `The model proposed ${plural(proposed, "recipe")} for round ${round}. Untick any you will not run, then start the rest.`
          : `Review the recipes proposed for round ${round}, untick any you will not run, then start the rest.`,
        why: "plan_ready",
      },
    };
  }

  const startedText = `${plural(started, "run")} started`;

  if (awaiting > 0) {
    // The waiting runs' own round (the engine stamps it), not the campaign's current round: after the model is
    // updated the campaign moves on while runs from the earlier round can still be waiting for a result.
    const waitingRounds = [...new Set(inFlight(active!).map((r) => (r.round == null ? null : displayRound(r.round))))];
    const waitingRound = waitingRounds.length === 1 && waitingRounds[0] != null ? waitingRounds[0] : null;
    const fromRound = waitingRound != null ? ` from round ${waitingRound}` : waitingRounds.length > 1 ? " from earlier rounds" : "";
    return {
      round,
      ...counts,
      steps: steps({
        setup: setupDone,
        plan: ["done", startedText],
        run: ["current", `${plural(awaiting, "run")} waiting for a result`],
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
            : `${plural(awaiting, "run")}${fromRound} ${awaiting === 1 ? "has" : "have"} no result yet. Enter each as it comes back from the lab.`,
        why: done > 0 ? "record_partial" : "run_waiting",
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
      action: `See what round ${round} taught the model`,
      href: href("learn"),
      reason: `Every run in round ${round} has a result. See what changed, then plan round ${round + 1}.`,
      why: "learn_ready",
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
