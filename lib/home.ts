/*
 * Pure rules for the Campaigns home (app/page.tsx): what a campaign name may
 * be, how an engine refusal of a name reads, and what one campaign row may
 * claim from GET /api/campaigns/{id}. No React, so every rule is unit tested
 * in __tests__/home.test.ts.
 */

import type { CampaignDetail, CampaignMeta } from "@/lib/api";
import { campaignStage, type NextAction } from "@/lib/campaign-stage";
import { EngineError, errorMessage } from "@/lib/engine-error";

/** The engine's limit (kalos-engine: "name must be 1-120 characters"). */
export const NAME_MAX = 120;

// C0 and C1 control characters, which the engine refuses in a name.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * The same rule the engine applies, checked before the request so the common
 * mistakes read instantly. The engine stays the authority: its own 400 is
 * still shown (see `nameErrorMessage`).
 */
export function validateCampaignName(raw: string): NameCheck {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: "Give the campaign a name." };
  if (CONTROL.test(name)) return { ok: false, message: "Names cannot contain control characters such as tabs or line breaks." };
  // Count code points, not UTF-16 units, so an emoji is one character as the engine counts it.
  const length = [...name].length;
  if (length > NAME_MAX) return { ok: false, message: `Names can be at most ${NAME_MAX} characters; this one has ${length}.` };
  return { ok: true, name };
}

/**
 * Copy for a failed create or rename. The engine's 400 for a bad name is
 * "invalid request body: name: Value error, name must be 1-120 characters";
 * its rule is shown as a sentence, never the raw envelope.
 */
export function nameErrorMessage(err: unknown): string {
  if (err instanceof EngineError) {
    if (err.status === 400 && err.detail) {
      const rule = err.detail.match(/name must (.+?)\.?$/i);
      if (rule) return `The engine refused this name: it must ${rule[1]}.`;
      if (/name: field required/i.test(err.detail)) return "Give the campaign a name.";
    }
    if (err.status === 403) return "Your role in this organization cannot change campaigns. Ask an organization admin.";
  }
  return errorMessage(err).message;
}

/** Most recently changed first; ties keep the default campaign on top, then by name. */
export function sortCampaigns(list: readonly CampaignMeta[]): CampaignMeta[] {
  return [...list].sort((a, b) => b.updated_at - a.updated_at || Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

/** What one campaign row may claim, from that campaign's own summary. Absent numbers stay null (shown as n/a), never 0. */
export type CampaignRowSummary = {
  /** False when the engine has no base data for this campaign yet. */
  hasData: boolean;
  /** 1-based round as people count it, or null before any analysis. */
  round: number | null;
  target: string | null;
  /** Measured best so far, never a prediction. */
  best: number | null;
  /** Runs measured into the model (the base sheet plus folded-in rounds). */
  runs: number | null;
  awaiting: number | null;
  next: NextAction;
};

export function campaignRowSummary(detail: CampaignDetail): CampaignRowSummary {
  const { campaign, summary } = detail;
  // Rows do not fetch the analysis: `seeded` stands in for "an analysis exists" in the fallback
  // derivation. The engine's own stage and next action win whenever it sends them.
  const stage = campaignStage({ has_data: campaign.seeded }, summary, campaign.id);
  if (!summary.has_campaign) {
    return { hasData: false, round: stage.round, target: null, best: null, runs: null, awaiting: null, next: stage.next };
  }
  return {
    hasData: true,
    round: stage.round,
    target: summary.target,
    best: summary.best,
    runs: summary.n_base,
    awaiting: summary.n_awaiting,
    next: stage.next,
  };
}
