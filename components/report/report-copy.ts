/*
 * Plain words for the engine's codes on the Report page. The raw code stays
 * visible next to these words (or in a disclosure); an unknown code is never
 * guessed at: it falls back to the engine's own text.
 */

import { formatValue } from "@/lib/num";

/**
 * A number a person typed (a threshold, a constraint coefficient), shown at
 * the precision it was given: never padded with digits nobody entered.
 */
export function typedValue(v: number, unit: string | null = null): string {
  const text = String(Math.abs(v));
  if (/e/i.test(text)) return formatValue(v, { unit, fallbackSigFigs: 6 }).text;
  const m = /\.(\d+)$/.exec(text);
  return formatValue(v, { unit, decimals: m ? Math.min(m[1].length, 6) : 0 }).text;
}

/** Audit actions the engine writes (kalos/portal *_api.py), in plain words. */
const AUDIT_ACTIONS: Record<string, string> = {
  "campaign.create": "Created the campaign",
  "campaign.rename": "Renamed the campaign",
  "campaign.archive": "Archived the campaign",
  "campaign.unarchive": "Restored the campaign from the archive",
  "campaign.upload": "Uploaded a run sheet",
  "run.upload": "Uploaded a run sheet",
  "job.submit": "Queued a sheet analysis",
  "job.cancel": "Cancelled a background job",
  "campaign.start": "Started runs from the proposed batch",
  "campaign.result": "Recorded or corrected a measured result",
  "campaign.reanalyze": "Re-analyzed with the measured results",
  "campaign.reanalyze.submit": "Queued a re-analysis",
  "campaign.setup": "Changed the campaign setup (goal, bounds, constraints or unit)",
  "campaign.stages.update": "Changed the scale-up stages",
  "campaign.gate.decide": "Recorded a scale-up gate decision",
  "campaign.export_rows": "Exported the raw data rows",
};

export function auditActionWords(action: string): string {
  return AUDIT_ACTIONS[action] ?? "Other engine action";
}

/** "ok", or the engine's `http_<status>` for a request it turned down. */
export function auditOutcomeWords(outcome: string): string {
  if (outcome === "ok") return "Done";
  const m = /^http_(\d{3})$/.exec(outcome);
  if (m) {
    const status = Number(m[1]);
    const what = status === 401 || status === 403 ? "not permitted" : status === 404 ? "not found" : status === 409 ? "refused, conflicting state" : status === 413 ? "too large" : status === 429 ? "rate limited" : status >= 500 ? "engine error" : "refused";
    return `Not done (${what}, HTTP ${status})`;
  }
  return outcome;
}

/**
 * Operating ranges `not_computed` reason codes (ENGINE_API_V2 section 9), in
 * plain words. `fix` is set only where the engine's own fix is known; else the
 * engine's `what_would_fix_it` is shown as sent.
 */
export const OPERATING_RANGE_REASONS: Record<string, { reason: string; fix?: string }> = {
  threshold_missing: { reason: "No threshold was given.", fix: "Enter a threshold in the target's units." },
  no_data: { reason: "This campaign has no data yet.", fix: "Upload a run sheet on Harmonize." },
  no_analysis: { reason: "The campaign has no published analysis.", fix: "Upload the run sheet again, or re-analyze the campaign." },
  analysis_stale: {
    reason: "The current analysis does not describe the campaign's data: results were recorded, or the campaign changed, after it was computed.",
    fix: "Re-analyze on Validate so the analysis includes the latest results, then ask again.",
  },
  reliability_unknown: { reason: "The analysis carries no reliability verdict (it predates it).", fix: "Re-analyze the campaign so its reliability is measured." },
  model_not_reliable: {
    reason: "The model has not yet shown it can rank held-out runs, so a range drawn from it would not be trustworthy.",
    fix: "Add more measured runs, ideally spread over the design space, and re-analyze until the model's reliability clears the floor.",
  },
  goal_unrecognized: { reason: "The campaign setup names a goal this engine does not recognize.", fix: "Set the goal to maximize or minimize in the campaign setup." },
  analysis_incomplete: { reason: "The analysis lacks the inputs, search box or row count needed to refit the model.", fix: "Re-analyze the campaign." },
  categorical_only_design: { reason: "Every model input is categorical, so a numeric range per input is not defined.", fix: "An operating range needs at least one continuous process input." },
  refit_data_mismatch: { reason: "The analysis names columns that cannot be matched to the campaign's rows.", fix: "Re-analyze the campaign." },
  anonymized_mapping_unavailable: { reason: "The engine could not reproduce the anonymized names, so it could not show a result safely.", fix: "Re-analyze the campaign." },
  design_box_degenerate: { reason: "The search box has no width to search in." },
  model_fit_failed: { reason: "The model could not be refit on the campaign's rows." },
  no_region_found: {
    reason: "At this threshold and probability the model does not give even the best measured recipe enough chance of meeting the rule, so no region around it can be claimed.",
    fix: "Lower the threshold or the probability, or measure more runs near the best recipe.",
  },
  region_too_small: { reason: "The region that meets the rule holds too few of the engine's sample points to state a range." },
  // The campaign setup (goal, bounds, constraints) is applied to the search (engine 0f1b826); fixes come from the engine.
  setup_goal_mismatch: { reason: "The analysis was computed for a different goal than the campaign setup now names." },
  setup_out_of_sync: { reason: "The campaign setup changed after the analysis was computed, so its search region is out of date." },
  setup_not_applied: { reason: "The analysis did not apply the campaign setup's bounds and constraints, so a range from it could fall outside them." },
  setup_unreadable: { reason: "The engine could not read the stored campaign setup." },
  no_measured_run_in_setup_region: { reason: "No measured run lies inside the setup's bounds and constraints, so there is no anchor to grow a region from." },
  setup_region_too_small: { reason: "Too few of the engine's sample points satisfy the setup's bounds and constraints to state a range." },
};
