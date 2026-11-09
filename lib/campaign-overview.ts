/*
 * View-model for the campaign home. Values come from GET /api/latest,
 * GET /api/campaign, and the session upload rejection. Absent fields stay null.
 */

import type { Campaign, CampaignRun, LatestResult, PopulatedResult, Proposal, Promotion } from "@/lib/api";
import { constraintNote, coveragePct, isUnmeasuredFailure, reliabilityVerdict, type ReliabilityVerdict } from "@/lib/api";
import { bestDeltaFromPreviousRound, campaignStage, displayRound } from "@/lib/campaign-stage";
import { activeRejection, type UploadRejection } from "@/components/campaign/plan-view";
import { promotionLine } from "@/components/campaign/learn";
import type { StageKey } from "@/lib/routes";
import { parseUnit } from "@/lib/utils";
import type { ActiveCampaign } from "@/lib/workbench";

export const OVERVIEW_STAGES = ["conditions", "results", "learning", "experiments", "promotion"] as const;
export type OverviewStage = (typeof OVERVIEW_STAGES)[number];

export const OVERVIEW_STAGE_LABEL: Record<OverviewStage, string> = {
  conditions: "Conditions",
  results: "Measured results",
  learning: "Model learning",
  experiments: "Next experiments",
  promotion: "Promotion evidence",
};

export type FetchStatus = "idle" | "loading" | "ready" | "error" | "stale";
export type PanelKind = "loading" | "empty" | "error" | "blocked" | "partial" | "ready";
export type StageParam = OverviewStage | "absent" | "invalid";

export type OverviewFetch<T> = {
  data: T | null;
  /** True when the latest request failed. Data may still be the previous success. */
  error: boolean;
  /** True only before the first response. A later refresh uses `error`, not this. */
  loading: boolean;
};

export type OverviewInput = {
  latest: OverviewFetch<LatestResult>;
  campaign: OverviewFetch<Campaign>;
  /** Session memory from the setup/plan rejection. Ignored once the dataset changes. */
  rejection: UploadRejection | null;
  /**
   * Plan page selection. The home passes null: it does not own the checkbox
   * state, so it must not claim the batch is selected.
   */
  selectedCount: number | null;
  /** Plan page `startedHere`: a start succeeded in this session. */
  startedHere: boolean;
  /** Plan page approval dialog in-flight guard. The home does not start runs. */
  startInFlight: boolean;
  /** Engine-confirmed empty campaign and demo mode, already decided by campaignView. */
  illustrative: boolean;
};

export type StartBlock = "rejected-upload" | "empty-selection" | "previously-started" | "in-flight" | "selection-unknown" | "no-batch";

export type StartPermission = {
  /**
   * True only when every plan canStart input is known and passes.
   * Null when selection is not on this surface and no known block applies.
   * Never set from promotion.
   */
  canStart: boolean | null;
  label: "Review required" | "Ready to review" | "Not available" | "Already started";
  /** Plain reason. Promotion is mentioned only to say it is a separate decision. */
  reason: string;
  blocks: StartBlock[];
};

export type CampaignOverview = {
  /** Stable identity for stage reset. Null while the first responses are still out, or when nothing loaded. */
  identity: string | null;
  illustrative: boolean;
  hasCampaign: boolean;
  hasAnalysis: boolean;
  settled: boolean;
  objective: {
    label: string | null;
    unit: string | null;
    /** Always null until a direction field exists. */
    direction: null;
  };
  /** Measured best. Never a prediction. */
  bestMeasured: {
    value: number | null;
    source: "campaign.best" | "analysis.best" | null;
    /** Run ids for this value are not on the payload. */
    runIds: null;
    replicateType: null;
    replicateCount: null;
    aggregation: null;
  };
  baseline: {
    value: null;
    runIds: null;
    replicateType: null;
    replicateCount: null;
    aggregation: null;
    reason: string;
  };
  /**
   * Change versus a control. Suppressed because the baseline is unknown.
   * `fromPreviousRound` is the existing measured history delta, labeled as
   * that and not as a control comparison.
   */
  measuredChange: {
    versusControl: null;
    fromPreviousRound: { delta: number; context: string } | null;
  };
  round: {
    /** 1-based display round. Null when the campaign has no round. */
    display: number | null;
    /** Engine `round`, unchanged. */
    engine: number | null;
    completed: number | null;
    pending: number | null;
    /** No run-level failure status exists. Always null, never zero. */
    failed: null;
  };
  ranking: {
    state: ReliabilityVerdict["state"] | "not-evaluated";
    label: ReliabilityVerdict["label"] | "Not evaluated";
    rho: number | null;
    ci: [number, number] | null;
    floor: number | null;
    reason: string;
    /** `cv_n_groups` when the engine sent it. */
    groupCount: number | null;
  };
  promotion: {
    /** Authoritative aggregate when the object is present. Null when it was not sent. */
    passed: boolean | null;
    verdict: "eligible" | "not-eligible" | "not-evaluated";
    /** Not inferred from a subset of metrics. */
    passedCount: null;
    failureCount: number | null;
    unmeasuredFailureCount: number | null;
    /** Plain sentence from promotionLine, or null when there is nothing to add. */
    line: string | null;
    summary: string | null;
    meaning: string | null;
    detail: "Not evaluated" | "Some checks unavailable";
  };
  start: StartPermission;
  draft: {
    /** `proposals.length` when the array was sent. */
    proposals: number | null;
    /** Candidate versus control is not a separate field. */
    candidates: null;
    controls: null;
  };
  versions: {
    dataset: string | null;
    campaignGeneration: string | null;
    inputSha256: string | null;
    engineVersion: string | null;
    /** Unix seconds when `updated` looks like seconds. */
    updatedAt: number | null;
  };
  interval: {
    halfWidth: number | null;
    /** Null when `conformal_coverage` was not sent. Never a guessed percent. */
    coverageLabel: string | null;
    provenance: "retrospective" | "unavailable";
    note: string;
  };
  conditions: {
    fetch: FetchStatus;
    panel: PanelKind;
    factors: { name: string; searchRange: [number, number] | null }[];
    heldFixed: null;
    constraintNote: string | null;
    validationStatus: string | null;
    missing: string[];
    blockedReason: string | null;
  };
  results: {
    fetch: FetchStatus;
    panel: PanelKind;
    completed: number | null;
    pending: number | null;
    failed: null;
    awaiting: { id: string }[];
    measured: { id: string; result: number }[];
  };
  fit: {
    fetch: FetchStatus;
    panel: PanelKind;
    /** `analysis_in_sync === false`: the loaded analysis is not the current campaign. */
    workflowStale: boolean;
    blockedReason: string | null;
  };
  proposals: {
    fetch: FetchStatus;
    panel: PanelKind;
    count: number | null;
    /** Predictions in engine order. Not a ranked "best". */
    predicted: { label: string; pred: number | null }[];
    reviewable: boolean;
    blockedReason: string | null;
  };
  gates: {
    fetch: FetchStatus;
    panel: PanelKind;
  };
  loopNext: { stage: StageKey; action: string; href: string; reason: string } | null;
  staleResources: ("campaign" | "analysis")[];
};

const BASELINE_REASON =
  "Baseline unavailable. The campaign response does not name a control run or how replicates were aggregated.";

const FAILED_COUNT_NOTE = "Failed-run count is unavailable. Campaign runs have no failure status.";

export function parseStageParam(value: string | null | undefined): StageParam {
  if (value == null || value === "") return "absent";
  return (OVERVIEW_STAGES as readonly string[]).includes(value) ? (value as OverviewStage) : "invalid";
}

export function withStageParam(pathname: string, current: { toString(): string }, stage: OverviewStage): string {
  const params = new URLSearchParams(current.toString());
  params.set("stage", stage);
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/** Local zone label included. `epoch` is seconds or milliseconds. */
export function formatOverviewTimestamp(epoch: number, timeZone: string): string {
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(dt);
}

function fetchStatus(hasData: boolean, error: boolean, loading: boolean): FetchStatus {
  if (hasData && error) return "stale";
  if (hasData) return "ready";
  if (error) return "error";
  if (loading) return "loading";
  return "idle";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(obj: unknown, key: string): number | null {
  if (!isRecord(obj) || !Object.prototype.hasOwnProperty.call(obj, key)) return null;
  const value = obj[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readString(obj: unknown, key: string): string | null {
  if (!isRecord(obj) || !Object.prototype.hasOwnProperty.call(obj, key)) return null;
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function activeCampaign(data: Campaign | null): ActiveCampaign | null {
  return data?.has_campaign ? data : null;
}

function analysisOf(data: LatestResult | null, illustrative: boolean): PopulatedResult | null {
  if (illustrative || !data || !data.has_data) return null;
  return data;
}

function finiteCount(value: number | null): number | null {
  if (value == null || value < 0) return null;
  return value;
}

/**
 * Plan's canStart, and nothing else. `selectedCount` null means this surface
 * does not know the selection: canStart stays null unless a known block
 * already forbids a start. Promotion is not an input.
 */
export function planCanStart(input: {
  selectedCount: number | null;
  rejectedUpload: boolean;
  previouslyStarted: boolean;
  inFlight: boolean;
  proposalCount: number | null;
}): StartPermission {
  const blocks: StartBlock[] = [];
  if (input.rejectedUpload) blocks.push("rejected-upload");
  if (input.previouslyStarted) blocks.push("previously-started");
  if (input.inFlight) blocks.push("in-flight");
  if (input.proposalCount === 0) blocks.push("no-batch");
  if (input.selectedCount === 0) blocks.push("empty-selection");
  if (input.selectedCount == null) blocks.push("selection-unknown");

  const hard = blocks.filter((b) => b !== "selection-unknown");
  if (input.previouslyStarted) {
    return {
      canStart: false,
      label: "Already started",
      reason: "Runs from this analysis are already started. Promotion is a separate decision.",
      blocks,
    };
  }
  if (input.rejectedUpload) {
    return {
      canStart: false,
      label: "Not available",
      reason: "The last upload was not used. Review setup before starting. Promotion is a separate decision.",
      blocks,
    };
  }
  if (input.inFlight) {
    return {
      canStart: false,
      label: "Not available",
      reason: "A start request is already in flight.",
      blocks,
    };
  }
  if (input.proposalCount == null) {
    return {
      canStart: input.selectedCount == null ? null : false,
      label: "Not available",
      reason: "The proposal list is unavailable, so start permission cannot be confirmed.",
      blocks,
    };
  }
  if (input.proposalCount === 0 || input.selectedCount === 0) {
    return {
      canStart: false,
      label: input.proposalCount === 0 ? "Not available" : "Review required",
      reason:
        input.proposalCount === 0
          ? "There is no draft batch to start."
          : "Select at least one proposal to run. Review and select recipes before starting.",
      blocks,
    };
  }
  if (input.selectedCount == null) {
    return {
      canStart: null,
      label: "Review required",
      reason: "No recipes are reviewed or selected on this page. Review and select recipes before starting. Promotion is a separate decision.",
      blocks,
    };
  }
  return {
    canStart: hard.length === 0,
    label: "Ready to review",
    reason: "Selected recipes can be reviewed on Plan. Starting still requires the approval step. Promotion is a separate decision.",
    blocks,
  };
}

function proposalCount(analysis: PopulatedResult | null): number | null {
  if (!analysis) return null;
  return Array.isArray(analysis.proposals) ? analysis.proposals.length : null;
}

function previouslyStarted(campaign: ActiveCampaign | null, startedHere: boolean): boolean {
  if (startedHere) return true;
  if (!campaign || !Array.isArray(campaign.pending)) return false;
  return campaign.pending.length > 0 && campaign.analysis_in_sync !== true;
}

function roundCounts(campaign: ActiveCampaign | null): { completed: number | null; pending: number | null; awaiting: { id: string }[]; measured: { id: string; result: number }[] } {
  if (!campaign) return { completed: null, pending: null, awaiting: [], measured: [] };
  const completed = finiteCount(readNumber(campaign, "n_measured"));
  const pending = finiteCount(readNumber(campaign, "n_awaiting"));
  const runs = Array.isArray(campaign.pending) ? campaign.pending : [];
  const awaiting = runs.filter((r): r is CampaignRun => isRecord(r) && r.awaiting === true && typeof r.id === "string").map((r) => ({ id: r.id }));
  const measured = runs
    .filter((r): r is CampaignRun => isRecord(r) && r.awaiting === false && typeof r.id === "string" && typeof r.result === "number" && Number.isFinite(r.result))
    .map((r) => ({ id: r.id, result: r.result as number }));
  return { completed, pending, awaiting, measured };
}

function bestMeasured(campaign: ActiveCampaign | null, analysis: PopulatedResult | null): CampaignOverview["bestMeasured"] {
  const blank = { value: null, source: null, runIds: null, replicateType: null, replicateCount: null, aggregation: null } as const;
  if (campaign && Object.prototype.hasOwnProperty.call(campaign, "best")) {
    const value = readNumber(campaign, "best");
    if (value != null) return { ...blank, value, source: "campaign.best" };
  }
  if (analysis && Object.prototype.hasOwnProperty.call(analysis, "best")) {
    const value = readNumber(analysis, "best");
    if (value != null) return { ...blank, value, source: "analysis.best" };
  }
  return blank;
}

function searchRange(analysis: PopulatedResult | null, name: string): [number, number] | null {
  const ranges = analysis?.feature_ranges;
  if (!ranges || !Object.prototype.hasOwnProperty.call(ranges, name)) return null;
  const pair = ranges[name];
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  const [lo, hi] = pair;
  if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [lo, hi];
}

function rankingOf(analysis: PopulatedResult | null): CampaignOverview["ranking"] {
  if (!analysis) {
    return {
      state: "not-evaluated",
      label: "Not evaluated",
      rho: null,
      ci: null,
      floor: null,
      reason: "Ranking reliability has not been evaluated.",
      groupCount: null,
    };
  }
  const verdict = reliabilityVerdict(analysis);
  return {
    state: verdict.state,
    label: verdict.label,
    rho: verdict.rho,
    ci: verdict.ci,
    floor: verdict.floor,
    reason: verdict.reason,
    groupCount: readNumber(analysis, "cv_n_groups"),
  };
}

function promotionOf(analysis: PopulatedResult | null): CampaignOverview["promotion"] {
  const promotion: Promotion | undefined = analysis?.promotion;
  if (!promotion) {
    return {
      passed: null,
      verdict: "not-evaluated",
      passedCount: null,
      failureCount: null,
      unmeasuredFailureCount: null,
      line: null,
      summary: null,
      meaning: null,
      detail: "Not evaluated",
    };
  }
  if (typeof promotion.passed !== "boolean") {
    return {
      passed: null,
      verdict: "not-evaluated",
      passedCount: null,
      failureCount: null,
      unmeasuredFailureCount: null,
      line: null,
      summary: typeof promotion.summary === "string" ? promotion.summary : null,
      meaning: typeof promotion.meaning === "string" ? promotion.meaning : null,
      detail: "Not evaluated",
    };
  }
  const failures = Array.isArray(promotion.failures) ? promotion.failures.filter((f): f is string => typeof f === "string") : [];
  return {
    passed: promotion.passed,
    verdict: promotion.passed ? "eligible" : "not-eligible",
    passedCount: null,
    failureCount: Array.isArray(promotion.failures) ? failures.length : null,
    unmeasuredFailureCount: failures.filter((f) => isUnmeasuredFailure(f)).length,
    line: promotion.passed ? null : promotionLine(promotion),
    summary: typeof promotion.summary === "string" ? promotion.summary : null,
    meaning: typeof promotion.meaning === "string" ? promotion.meaning : null,
    detail: "Some checks unavailable",
  };
}

function intervalOf(analysis: PopulatedResult | null): CampaignOverview["interval"] {
  const half = analysis ? readNumber(analysis, "conformal_q") : null;
  if (half == null || half < 0) {
    return {
      halfWidth: null,
      coverageLabel: null,
      provenance: "unavailable",
      note: "No prediction interval was reported.",
    };
  }
  const coverageLabel = coveragePct(analysis?.conformal_coverage);
  return {
    halfWidth: half,
    coverageLabel,
    provenance: "retrospective",
    note: coverageLabel
      ? `Latest analysis half-width (${coverageLabel}). conformal_q is not a model standard deviation. No frozen prediction-time interval is on this response, so this figure is retrospective. Coverage measured on held-out runs is not guaranteed for proposals.`
      : "Latest analysis half-width. conformal_q is not a model standard deviation, and no coverage percent was reported. No frozen prediction-time interval is on this response, so this figure is retrospective.",
  };
}

function identityFor(input: OverviewInput, campaign: ActiveCampaign | null, analysis: PopulatedResult | null, latest: LatestResult | null): string | null {
  if (input.illustrative && campaign) return "demo";
  const latestFetch = fetchStatus(latest != null, input.latest.error, input.latest.loading);
  const campaignFetch = fetchStatus(input.campaign.data != null, input.campaign.error, input.campaign.loading);
  const pending = latestFetch === "idle" || latestFetch === "loading" || campaignFetch === "idle" || campaignFetch === "loading";
  if (!campaign && !analysis && pending && latestFetch !== "error" && campaignFetch !== "error") return null;
  if (!campaign && !analysis) {
    const settled = !pending;
    return settled ? "none" : null;
  }
  const dataset = analysis ? readString(analysis, "dataset") : null;
  const sha = analysis?.run?.input_sha256 ?? null;
  const target = campaign?.target ?? analysis?.target ?? "";
  return `dataset:${dataset ?? ""}|sha:${sha ?? ""}|target:${target}`;
}

function combineFetch(primary: FetchStatus, secondary: FetchStatus, hasFacts: boolean): FetchStatus {
  if (hasFacts && (primary === "stale" || secondary === "stale")) return "stale";
  if (hasFacts) return "ready";
  if (primary === "error" || secondary === "error") return "error";
  if (primary === "loading" || secondary === "loading") return "loading";
  if (primary === "idle" || secondary === "idle") return "idle";
  return "ready";
}

function panelFrom(fetch: FetchStatus, flags: { empty?: boolean; blocked?: boolean; partial?: boolean }): PanelKind {
  if (fetch === "idle" || fetch === "loading") return "loading";
  if (fetch === "error") return "error";
  if (flags.blocked) return "blocked";
  if (flags.empty) return "empty";
  if (flags.partial || fetch === "stale") return "partial";
  return "ready";
}

export function buildCampaignOverview(input: OverviewInput): CampaignOverview {
  const latest = input.latest.data;
  const campaignData = input.campaign.data;
  const campaign = activeCampaign(campaignData);
  const analysis = analysisOf(latest, input.illustrative);
  const dataset = analysis ? readString(analysis, "dataset") : null;
  const rejection = input.illustrative ? null : activeRejection(input.rejection, dataset);
  const latestFetch = fetchStatus(latest != null, input.latest.error, input.latest.loading);
  const campaignFetch = fetchStatus(campaignData != null, input.campaign.error, input.campaign.loading);
  const counts = roundCounts(campaign);
  const best = bestMeasured(campaign, analysis);
  const previous = campaign && Array.isArray(campaign.history) ? bestDeltaFromPreviousRound(campaign) : null;
  const proposalsN = proposalCount(analysis);
  const started = previouslyStarted(campaign, input.startedHere);
  const start = planCanStart({
    selectedCount: input.selectedCount,
    rejectedUpload: rejection != null,
    previouslyStarted: started,
    inFlight: input.startInFlight,
    proposalCount: analysis ? proposalsN : input.illustrative ? null : latest && !latest.has_data ? 0 : null,
  });
  const features = campaign?.features ?? analysis?.features ?? [];
  const factorNames = Array.isArray(features) ? features.filter((name): name is string => typeof name === "string" && name.length > 0) : [];
  const target = campaign?.target ?? analysis?.target ?? null;
  const unit = target ? parseUnit(target) || null : null;
  const missing: string[] = [];
  if (!unit) missing.push("unit");
  missing.push("baseline");
  if (!analysis?.validation) missing.push("column roles");
  if (factorNames.length === 0) missing.push("factors");
  const conditionsFetch = combineFetch(campaignFetch, latestFetch, Boolean(campaign || analysis));
  const confirmedEmpty = conditionsFetch === "ready" && !campaign && !analysis;
  const conditionsBlocked = rejection != null;
  const ranking = rankingOf(analysis);
  const promotion = promotionOf(analysis);
  const fitWorkflowStale = campaign?.analysis_in_sync === false;
  const fitBlocked = rejection != null;
  const proposalBlockedReason = rejection
    ? "The last upload was not used."
    : started
      ? "Runs from this analysis are already started."
      : input.startInFlight
        ? "A start request is already in flight."
        : input.selectedCount === 0
          ? "Select at least one proposal to run."
          : null;
  const predicted = (analysis?.proposals ?? []).map((p: Proposal, i) => ({
    label: `P${i + 1}`,
    pred: typeof p?.pred === "number" && Number.isFinite(p.pred) ? p.pred : null,
  }));
  const reviewable = (proposalsN ?? 0) > 0 && !started && rejection == null && !input.startInFlight;
  const loopSource = input.illustrative ? campaign : campaignData;
  const loopReady = !loopSource?.has_campaign || Array.isArray(loopSource.pending);
  const loop =
    loopSource && loopReady
      ? campaignStage(input.illustrative ? { has_data: true, proposals: [] } : (analysis ?? latest ?? { has_data: false }), loopSource)
      : null;
  const staleResources: ("campaign" | "analysis")[] = [];
  if (campaignFetch === "stale") staleResources.push("campaign");
  if (latestFetch === "stale") staleResources.push("analysis");
  const settled =
    latestFetch !== "idle" && latestFetch !== "loading" && campaignFetch !== "idle" && campaignFetch !== "loading";

  const resultsPartial = counts.completed == null || counts.pending == null;
  const fitPartial = analysis != null && (ranking.ci == null || ranking.groupCount == null || ranking.rho == null);
  const proposalsPartial = predicted.some((p) => p.pred == null);
  const gatesPartial = promotion.passed != null;

  return {
    identity: identityFor(input, campaign, analysis, latest),
    illustrative: input.illustrative,
    hasCampaign: campaign != null,
    hasAnalysis: analysis != null,
    settled,
    objective: { label: target, unit, direction: null },
    bestMeasured: best,
    baseline: {
      value: null,
      runIds: null,
      replicateType: null,
      replicateCount: null,
      aggregation: null,
      reason: BASELINE_REASON,
    },
    measuredChange: {
      versusControl: null,
      fromPreviousRound: previous
        ? {
            delta: previous.delta,
            context: previous.previousRound === 0 ? "vs uploaded data" : `vs round ${displayRound(previous.previousRound)}`,
          }
        : null,
    },
    round: {
      display: campaign ? displayRound(campaign.round) : null,
      engine: campaign ? campaign.round : null,
      completed: counts.completed,
      pending: counts.pending,
      failed: null,
    },
    ranking,
    promotion,
    start,
    draft: { proposals: proposalsN, candidates: null, controls: null },
    versions: {
      dataset,
      campaignGeneration: analysis ? (readString(analysis, "campaign_generation") ?? null) : null,
      inputSha256: analysis?.run?.input_sha256 ?? null,
      engineVersion: analysis ? (readString(analysis, "engine_version") ?? null) : null,
      updatedAt: analysis ? readNumber(analysis, "updated") : null,
    },
    interval: intervalOf(analysis),
    conditions: {
      fetch: conditionsFetch,
      panel: panelFrom(conditionsFetch, {
        blocked: conditionsBlocked,
        empty: confirmedEmpty || (!campaign && !analysis && conditionsFetch === "ready"),
        partial: Boolean((campaign || analysis) && missing.length > 0),
      }),
      factors: factorNames.map((name) => ({ name, searchRange: searchRange(analysis, name) })),
      heldFixed: null,
      constraintNote: constraintNote(analysis?.constraint),
      validationStatus: analysis?.validation?.status ?? null,
      missing,
      blockedReason: rejection ? rejection.error : null,
    },
    results: {
      fetch: campaignFetch,
      panel: panelFrom(campaignFetch, {
        empty: campaignFetch !== "error" && campaignFetch !== "loading" && campaignFetch !== "idle" && !campaign,
        partial: resultsPartial,
        blocked: false,
      }),
      completed: counts.completed,
      pending: counts.pending,
      failed: null,
      awaiting: counts.awaiting,
      measured: counts.measured,
    },
    fit: {
      fetch: latestFetch,
      panel: panelFrom(latestFetch, {
        empty: !analysis && latestFetch !== "loading" && latestFetch !== "idle" && latestFetch !== "error",
        blocked: fitBlocked,
        partial: fitPartial || fitWorkflowStale,
      }),
      workflowStale: fitWorkflowStale,
      blockedReason: fitBlocked ? "The shown analysis is from the previous file. The last upload was not used." : null,
    },
    proposals: {
      fetch: latestFetch,
      panel: panelFrom(latestFetch, {
        empty: (!analysis && latestFetch !== "loading" && latestFetch !== "idle" && latestFetch !== "error") || proposalsN === 0,
        blocked: proposalBlockedReason != null && (proposalsN ?? 0) > 0,
        partial: proposalsPartial,
      }),
      count: proposalsN,
      predicted,
      reviewable,
      blockedReason: proposalBlockedReason,
    },
    gates: {
      fetch: latestFetch,
      panel: panelFrom(latestFetch, {
        empty: latest != null && (!analysis || analysis.promotion == null),
        partial: gatesPartial,
      }),
    },
    loopNext: loop ? { stage: loop.next.stage, action: loop.next.action, href: loop.next.href, reason: loop.next.reason } : null,
    staleResources,
  };
}

/**
 * Default stage once resources have settled. Request errors are included so
 * the first view can land on the broken resource; callers must not reapply
 * this after the person has a pinned stage. HTTP errors are not scientific
 * failures. Pending runs outrank a failed promotion. Promotion does not block start.
 */
export function resolveAttention(model: CampaignOverview): OverviewStage {
  if (model.conditions.panel === "blocked" || model.conditions.fetch === "error") return "conditions";
  if (model.results.fetch === "error") return "results";
  // A failed-run count is not on the payload (always null) and must not select this stage.
  if (model.results.pending != null && model.results.pending > 0) return "results";
  if (model.promotion.passed === false) return "promotion";
  if (model.fit.fetch === "error") return "learning";
  if (model.gates.fetch === "error") return "promotion";
  if (model.proposals.fetch === "error") return "experiments";
  if (model.fit.fetch === "stale" || model.fit.workflowStale || model.ranking.state === "insufficient" || (model.hasCampaign && !model.hasAnalysis)) {
    return "learning";
  }
  if (model.proposals.reviewable) return "experiments";
  if (!model.hasCampaign && !model.hasAnalysis) return "conditions";
  return "results";
}

export function stageStatus(model: CampaignOverview, stage: OverviewStage): string {
  if (stage === "conditions") {
    if (model.conditions.panel === "loading") return "Loading conditions";
    if (model.conditions.panel === "error") return "Couldn't load conditions";
    if (model.conditions.panel === "blocked") return "Needs review";
    if (model.conditions.panel === "empty") return "Not defined";
    if (model.conditions.panel === "partial") return "Needs review";
    return "Defined";
  }
  if (stage === "results") {
    if (model.results.panel === "loading") return "Loading results";
    if (model.results.panel === "error") return "Couldn't load runs";
    if (model.results.panel === "empty") return "No measured results yet";
    if (model.round.display != null) return `Round ${model.round.display}`;
    return "Measured results";
  }
  if (stage === "learning") {
    if (model.fit.panel === "loading") return "Loading model evidence";
    if (model.fit.panel === "error") return "Couldn't load model evidence";
    if (model.fit.panel === "empty") return "No model fit yet";
    if (model.fit.panel === "blocked") return "Needs review";
    return model.ranking.label;
  }
  if (stage === "experiments") {
    if (model.proposals.panel === "loading") return "Loading the batch";
    if (model.proposals.panel === "error") return "Couldn't load the batch";
    if (model.proposals.panel === "empty") return "No draft batch";
    if (model.start.label === "Already started") return "Already started";
    if (model.proposals.blockedReason) return "Review required";
    return "Draft · Review required";
  }
  if (model.gates.panel === "loading") return "Loading promotion checks";
  if (model.gates.panel === "error") return "Couldn't load promotion checks";
  if (model.promotion.verdict === "not-evaluated") return "Not evaluated";
  if (model.promotion.verdict === "eligible") return "Eligible";
  return "Not eligible";
}

export const FAILED_RUNS_UNAVAILABLE = FAILED_COUNT_NOTE;

export type StageNavState = {
  campaignKey: string | null;
  stage: OverviewStage | null;
  pinned: boolean;
};

export const initialStageNav: StageNavState = { campaignKey: null, stage: null, pinned: false };

export type StageEffect = { op: "push" | "replace"; stage: OverviewStage };

export type StageEvent =
  | { type: "url"; campaignKey: string | null; param: StageParam }
  | { type: "select"; stage: OverviewStage }
  | { type: "attention"; stage: OverviewStage };

function navEqual(a: StageNavState, b: StageNavState): boolean {
  return a.campaignKey === b.campaignKey && a.stage === b.stage && a.pinned === b.pinned;
}

/** One reducer for deep links, clicks, Back/Forward, invalid values, and refresh. */
export function reduceStageNav(state: StageNavState, event: StageEvent): { state: StageNavState; effect: StageEffect | null } {
  if (event.type === "select") {
    if (state.stage === event.stage && state.pinned) return { state, effect: null };
    const next = { ...state, stage: event.stage, pinned: true };
    return { state: next, effect: state.stage === event.stage ? null : { op: "push", stage: event.stage } };
  }

  if (event.type === "attention") {
    if (state.pinned) return { state, effect: null };
    if (state.stage === event.stage) return { state: { ...state, pinned: true }, effect: null };
    return {
      state: { campaignKey: state.campaignKey, stage: event.stage, pinned: true },
      effect: { op: "replace", stage: event.stage },
    };
  }

  const keyChanged = event.campaignKey !== state.campaignKey;
  if (keyChanged) {
    const firstSight = state.campaignKey == null && event.campaignKey != null;
    if (firstSight && event.param !== "absent" && event.param !== "invalid") {
      const next = { campaignKey: event.campaignKey, stage: event.param, pinned: true };
      return { state: navEqual(state, next) ? state : next, effect: null };
    }
    const next = { campaignKey: event.campaignKey, stage: null, pinned: false };
    return { state: navEqual(state, next) ? state : next, effect: null };
  }

  if (event.param !== "absent" && event.param !== "invalid") {
    if (event.param === state.stage) return { state, effect: null };
    return { state: { ...state, stage: event.param, pinned: true }, effect: null };
  }

  if (state.pinned && state.stage) return { state, effect: { op: "replace", stage: state.stage } };
  return { state, effect: null };
}

export function integrateStageNav(
  state: StageNavState,
  input: { active: boolean; campaignKey: string | null; param: StageParam; attention: OverviewStage | null; settled: boolean },
): { state: StageNavState; effect: StageEffect | null } {
  if (!input.active) return { state, effect: null };
  const url = reduceStageNav(state, { type: "url", campaignKey: input.campaignKey, param: input.param });
  if (!input.settled || input.attention == null || url.state.campaignKey == null) return url;
  const attention = reduceStageNav(url.state, { type: "attention", stage: input.attention });
  return { state: attention.state, effect: attention.effect ?? url.effect };
}

export function overviewStageForLoop(stage: StageKey): OverviewStage {
  if (stage === "setup") return "conditions";
  if (stage === "plan") return "experiments";
  if (stage === "learn") return "learning";
  return "results";
}
