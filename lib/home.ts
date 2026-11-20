/*
 * Pure rules for the Campaigns home (app/page.tsx): what a campaign name may
 * be, how an engine refusal of a name reads, what one campaign row may claim
 * from the summary list (GET /api/campaigns?summary=true), and how a refused
 * archive reads. No React, so every rule is unit tested
 * in __tests__/home.test.ts.
 */

import { reliabilityVerdict, type CampaignMeta, type CampaignSummaryRow, type Goal } from "@/lib/api";
import { EngineError, errorMessage } from "@/lib/engine-error";
import { parseUnit } from "@/lib/num";

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
export function sortCampaigns<T extends CampaignMeta>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.updated_at - a.updated_at || Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

const GATE_WORD: Record<string, "Go" | "No-go" | "Pending"> = { go: "Go", no_go: "No-go", pending: "Pending" };
const JOB_KIND: Record<string, string> = { analysis: "Upload analysis", reanalyze: "Re-analysis" };
const JOB_STAGE: Record<string, string> = {
  queued: "queued",
  parsing: "reading the sheet",
  planning: "planning",
  fitting: "fitting the model",
  calibrating: "calibrating",
  proposing: "proposing recipes",
  publishing: "publishing",
  running: "running",
};

/**
 * What one campaign row may claim, from the campaign list's summary fields alone
 * (GET /api/campaigns?summary=true): no request per campaign. Absent numbers stay null (shown as n/a), never 0.
 */
export type SummaryRowView = {
  hasData: boolean;
  target: string | null;
  /**
   * The engine's `target_unit` from the summary (engine 754a87a: setup, then header pattern, else none). Older
   * engines send none, and the unit is parsed from the target header with `parseUnit` (a trailing "(unit)" only).
   */
  unit: string | null;
  goal: Goal;
  /** Measured best (folded, measured rows only), never a prediction; the word says which direction is best. */
  best: { value: number | null; word: "highest measured" | "lowest measured" };
  reliability: { kind: "na"; reason: string } | { kind: "verdict"; label: string; state: string; reason: string };
  /** The analysis predates results recorded since (`analysis.in_sync === false`). */
  stale: boolean;
  /** The stage key a person recorded (S-key); the summary has no label. Null = not set. */
  stage: string | null;
  gate: { gate: string; word: "Go" | "No-go" | "Pending"; decidedAt: number } | null;
  job: { kind: string; stage: string; progress: number | null } | null;
  /** 1-based round as people count it, or null before any data. */
  round: number | null;
  awaiting: number | null;
  measured: number | null;
};

export function summaryRowView(row: CampaignSummaryRow): SummaryRowView {
  const goal: Goal = row.goal?.direction === "minimize" || row.best_measured?.direction === "min" ? "minimize" : "maximize";
  const a = row.analysis;
  let reliability: SummaryRowView["reliability"];
  if (!a || !a.present) reliability = { kind: "na", reason: row.has_data ? "no analysis stored" : "no data yet" };
  else {
    const rel = a.reliability;
    const v = reliabilityVerdict({
      reliability: rel ? { ...rel, unmodeled: [] } : undefined,
      cv_spearman: a.cv_spearman,
      cv_ci95: rel?.ci95 ?? null,
      verdict: a.verdict ?? null,
    });
    reliability = { kind: "verdict", label: v.label, state: v.state, reason: v.reason };
  }
  const g = row.latest_gate_decision;
  const j = row.active_job;
  return {
    hasData: row.has_data,
    target: row.target,
    // The engine's target_unit when sent (it may know a unit the header does not say, or know there is none).
    unit: row.target_unit ? row.target_unit.unit : row.target ? parseUnit(row.target).unit : null,
    goal,
    best: { value: row.best_measured?.value ?? null, word: goal === "minimize" ? "lowest measured" : "highest measured" },
    reliability,
    stale: !!a && a.present && a.in_sync === false,
    stage: row.current_stage ?? null,
    gate: g ? { gate: g.gate, word: GATE_WORD[g.decision] ?? "Pending", decidedAt: g.decided_at } : null,
    job: j
      ? {
          kind: JOB_KIND[j.kind] ?? "Engine job",
          stage: JOB_STAGE[j.stage] ?? j.stage.replace(/_/g, " "),
          progress: typeof j.progress === "number" && Number.isFinite(j.progress) ? j.progress : null,
        }
      : null,
    round: row.has_data ? row.round + 1 : null,
    awaiting: row.has_data ? row.n_awaiting : null,
    measured: row.has_data ? row.n_measured : null,
  };
}

// --- Archive -------------------------------------------------------------------------------------------

/**
 * How recent the second factor must be to archive or unarchive. Mirrors RECENT_AUTH_MAX_AGE_SECONDS in
 * lib/server/session-context.ts (server-only); __tests__/home.test.ts fails if the two drift apart.
 */
export const ARCHIVE_STEP_UP_SECONDS = 300;

export type ArchiveErrorCopy = { message: string; fix: string | null; signOut: boolean; code: string | null };

/**
 * A refused archive or unarchive in plain words. The web proxy answers 403 insufficient_scope (required
 * org:admin) for non-admins and 403 step_up_required (code STEP_UP_REQUIRED) when the second factor is older
 * than the window; the engine answers writes to archived campaigns with 409 campaign_archived.
 */
export function archiveErrorCopy(err: unknown, action: "archive" | "unarchive"): ArchiveErrorCopy {
  const minutes = Math.round(ARCHIVE_STEP_UP_SECONDS / 60);
  if (err instanceof EngineError) {
    const code = err.code.toLowerCase();
    if (code === "step_up_required" || err.detail === "step_up_required") {
      return {
        message: `To ${action} a campaign you must have verified your second factor in the last ${minutes} minutes, and this session's sign-in is older than that.`,
        fix: `Sign out, sign back in with your second factor, then ${action} again within ${minutes} minutes.`,
        signOut: true,
        code: err.code,
      };
    }
    if (code === "insufficient_scope") {
      return {
        message: `Only organization admins can ${action} campaigns, and your role in this organization is not admin.`,
        fix: "Ask an organization admin to do it, or to make you an admin.",
        signOut: false,
        code: err.code,
      };
    }
    if (code === "campaign_archived") {
      return { message: "This campaign is already archived.", fix: null, signOut: false, code: err.code };
    }
    return { message: errorMessage(err).message, fix: null, signOut: false, code: err.code };
  }
  return { message: errorMessage(err).message, fix: null, signOut: false, code: null };
}
