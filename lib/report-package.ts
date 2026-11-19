/*
 * The Report page's data package: a versioned JSON object and two CSVs
 * assembled in the browser ONLY from what the engine returned (campaign meta,
 * campaign summary, current analysis, and the report routes: result history
 * and audit log, gate decisions, the raw-rows export, the stored setup and an
 * operating-ranges request made in this session). Nothing here is computed that the
 * engine did not compute; the one derived label is the app-wide reliability
 * verdict (lib/api.ts reliabilityVerdict), which reads the engine's own
 * floor and interval. Predicted and measured values live in separate
 * sub-objects and columns, and a value the engine did not send is `null`
 * (an empty CSV cell), never 0. Pure, tested in __tests__/report-package.test.ts.
 */

import {
  proposalRecipe,
  reliabilityVerdict,
  targetUnitOf,
  type AnalyzeResult,
  type AppliedSetup,
  type AuditItem,
  type ComputedEvidence,
  type GateRecord,
  type GatesView,
  type Goal,
  type GpInterval,
  type IntervalMethod,
  type OperatingRanges,
  type PredictionAtStart,
  type ProposalInterval,
  type ResultHistoryItem,
  type RowsExport,
  type SetupView,
  type TargetUnit,
  type Calibration,
  type Campaign,
  type CampaignMeta,
  type CampaignRun,
  type DataDrops,
  type DesignBoxExclusion,
  type Driver,
  type DriverSelection,
  type ProvenanceEntry,
  type Reliability,
  type ReliabilityState,
  type RunRecord,
} from "@/lib/api";
import { formatValue } from "@/lib/num";
import { methodCaveat, proposalCaveat, type CoverageAtProposalsEstimate, type EngineIntervalCaveat } from "@/lib/proposal-caveat";
import type { UnitConversion, ValidationFinding, ValidationReport } from "@/lib/validation";

export const PACKAGE_KIND = "kalos.data-package";
/**
 * 2: adds goal, target unit, setup, per-level intervals, prediction at start, result history, gate decisions, operating
 * ranges and raw-rows metadata, and the trust caveat on every proposal interval (`predicted.interval_caveats`).
 */
export const PACKAGE_SCHEMA_VERSION = 2;

/** A recipe setpoint: numeric, or a categorical level (e.g. a medium name). */
export type Setpoint = number | string | null;

/**
 * `proposal_provenance` is in the analysis payload but not typed in lib/api.ts.
 * Typed here, every field optional, so an older engine renders n/a.
 */
export type ProposalProvenance = {
  schema_version?: number;
  engine_version?: string;
  build_sha?: string;
  library_versions?: Record<string, string | null>;
  pin_drift?: Record<string, unknown>;
  seed?: number;
  input_sha256?: string;
  config_sha256?: string;
  config_fields?: string[];
  model_artifact_stored?: boolean;
  provenance_sha256?: string;
  timestamp?: number;
  created_at?: string;
};

/** The analysis as this module reads it: the typed result plus the untyped fields it needs. */
export type PackageAnalysis = AnalyzeResult & {
  dataset?: string;
  updated?: number;
  proposal_provenance?: ProposalProvenance | null;
  promotion?: AnalyzeResult["promotion"] & { not_judged?: string[] };
};

export type PackagePredicted = { value: number | null; sd: number | null };

export type PackageRun = {
  id: string;
  round: number | null;
  status: "awaiting" | "measured";
  recipe: Record<string, Setpoint>;
  mode: string | null;
  reason: string | null;
  predicted: PackagePredicted;
  measured: {
    value: number | null;
    version: number | null;
    previous: number | null;
    reason: string | null;
    recorded_by: string | null;
    recorded_at: number | null;
  } | null;
  started_at: number | null;
  /** Who supplied `predicted`: "engine" (a published proposal, recorded at start) or "caller". Null on legacy runs. */
  pred_source: "engine" | "caller" | null;
  /** The engine's prediction and band recorded when the run started, verbatim (null on legacy runs). */
  prediction_at_start: PredictionAtStart | null;
  /** measured − predicted at start (basis derived), as the engine computed it. Null while awaiting or without one. */
  residual: number | null;
  residual_basis: string | null;
  /** Whether the measured value fell inside the band recorded at start (the engine's check). */
  inside_band: boolean | null;
  proposed_by: {
    provenance_sha256: string | null;
    input_sha256: string | null;
    config_sha256: string | null;
    engine_version: string | null;
    seed: number | null;
    timestamp: number | null;
  } | null;
};

export type PackageProposal = {
  index: number;
  recipe: Record<string, Setpoint>;
  mode: string | null;
  reason: string | null;
  predicted: PackagePredicted & {
    band_half_width: number | null;
    band_coverage: number | null;
    p_feasible: number | null;
    /** Observation-scale sd the per-proposal intervals are built from. */
    predictive_std: number | null;
    /** Per-level normalized split-conformal intervals, every level the engine sent (refused levels keep their reason). */
    intervals: ProposalInterval[];
    /** Model-based GP posterior bands, per level (the engine's own GP posterior, not checked on held-out runs). */
    gp_intervals: GpInterval[];
    /**
     * The trust caveat for each interval this proposal carries: one per available per-proposal level, and one for the
     * global band (`band_half_width`) when the engine sent one. Empty only when there is no interval.
     */
    interval_caveats: PackageIntervalCaveat[];
  };
};

/** The caveat that goes with a proposal interval: its coverage was measured on past runs, and is lower at proposals. */
export type PackageIntervalCaveat = {
  /** The interval it applies to: a per-proposal level, or the global `conformal_q` band. */
  applies_to: "per_proposal_interval" | "global_band";
  coverage: number | null;
  /** The sentence shown next to the interval. */
  text: string;
  /** "engine": the engine's own caveat; "web_fixed_text": the app's fixed text, because this engine build sent none. */
  source: "engine" | "web_fixed_text";
  engine_code: string | null;
  /** The engine's `interval_basis` (else `coverage_basis`), null when not sent. */
  interval_basis: string | null;
  /** The engine's coverage measured at proposals, verbatim; null when not sent. */
  coverage_at_proposals_estimate: CoverageAtProposalsEstimate | null;
};

/** A report route the page read, or why it could not: the package never guesses a missing section. */
export type Unavailable = { status: "unavailable"; code: string; reason: string };

export type PackageResultHistory =
  | {
      status: "included";
      /** False when the engine had more pages than were read (see `pages_read`). */
      complete: boolean;
      pages_read: number;
      /** Append-only result versions, newest first. A correction has `is_correction: true` and its `previous_value`. */
      results: ResultHistoryItem[];
      /** Audit log rows for this campaign, newest first. `detail` is the engine's raw string, as stored. */
      audit: AuditItem[];
      notes: Record<string, string>;
    }
  | Unavailable;

export type PackageGates =
  | {
      status: "included";
      note: string;
      current_stage: string | null;
      current_stage_basis: "recorded";
      stages_source: string;
      /** Recorded human decisions only, per gate (newest first, at most the engine's preview per gate). */
      decisions: {
        gate: string;
        stage_label: string;
        in_stage_definitions: boolean;
        decision: string | null;
        state: string;
        current: GateRecord | null;
        history: GateRecord[];
        history_count: number;
        history_truncated: boolean;
      }[];
      /** What the engine computed for each gate, kept apart: nothing here sets a decision. */
      computed_evidence: Record<string, ComputedEvidence>;
    }
  | Unavailable;

export type OperatingRangesRequest = { threshold: number; probability: number; basis: "target" };

/** One operating-ranges request made on the Report page in this session. */
export type OperatingRangesRun =
  | { status: "answered"; request: OperatingRangesRequest; requested_at: string; outcome: OperatingRanges }
  | { status: "failed"; request: OperatingRangesRequest; requested_at: string; code: string; reason: string };

export type PackageOperatingRanges = OperatingRangesRun | { status: "not_requested"; note: string };

export type PackageRawRows =
  | {
      status: "included";
      note: string;
      target: string | null;
      columns: string[];
      n_original_rows: number | null;
      n_folded_rows: number | null;
      n_unattributed_rows: number | null;
      original_rows_identifiable: boolean;
      original_rows_reason: string | null;
      anonymization: Record<string, unknown>;
      csv_formula_neutralization: string | null;
      provenance: Record<string, unknown>;
    }
  | Unavailable;

/** What the Report page read beyond the summary and analysis. Absent means not read (the package says so). */
export type PackageExtras = {
  history?: { status: "loaded"; results: ResultHistoryItem[]; audit: AuditItem[]; notes: Record<string, string>; complete: boolean; pages: number } | Unavailable;
  gates?: { status: "loaded"; data: GatesView } | Unavailable;
  rows?: { status: "loaded"; data: RowsExport } | Unavailable;
  setup?: { status: "loaded"; data: SetupView } | Unavailable;
  operatingRanges?: OperatingRangesRun | null;
};

export type NotIncluded = { item: string; reason: string };

export type DataPackage = {
  kind: typeof PACKAGE_KIND;
  schema_version: typeof PACKAGE_SCHEMA_VERSION;
  generated_at: string;
  generated_by: "kalos-web";
  conventions: { timestamps: string; missing: string; rounds: string; source: string };
  campaign: { id: string; name: string; created_at: number | null; round: number | null; analysis_in_sync: boolean | null };
  objective: {
    target: string | null;
    /** The display unit (engine `target_unit.unit`, else parsed from an older analysis's header). Values are never converted. */
    unit: string | null;
    target_unit: TargetUnit | null;
    direction: Goal;
    /** Where the direction came from: the analysis's applied setup, the campaign summary, or the engine default (maximize, no goal set). */
    direction_source: "analysis" | "campaign" | "engine_default";
    note: string;
    setup: {
      /** The setup as applied to this analysis (`analysis.setup`); null when none was stored. */
      applied: AppliedSetup | null;
      /** The campaign's stored setup (GET /setup); `settings_in_sync: false` means it changed since the analysis. */
      stored: SetupView | Unavailable | null;
    };
  };
  evidence: {
    best_measured: number | null;
    n_base_rows: number | null;
    n_measured_runs: number | null;
    n_awaiting_runs: number | null;
  };
  data: {
    dataset: string | null;
    filename: string | null;
    sheet: string | null;
    n_rows: number | null;
    n_features: number | null;
    input_sha256: string | null;
    validation: {
      status: string | null;
      mode: string | null;
      counts: ValidationReport["counts"] | null;
      checks_run: string[];
      findings: ValidationFinding[];
      conversions: UnitConversion[];
    } | null;
    columns: ProvenanceEntry[];
    exclusions: {
      data_drops: DataDrops | null;
      n_dropped_incomplete: number | null;
      n_censored_excluded: number | null;
      design_box_exclusions: DesignBoxExclusion[];
      auto_categorical: string[];
      categorical_features: string[];
    };
    observed_design_space: { label: string; ranges: Record<string, [number, number]> | null };
  };
  model: {
    reliability: {
      verdict: ReliabilityState;
      label: string;
      reason: string;
      engine: Reliability | null;
    };
    cv_spearman: number | null;
    cv_ci95: [number, number] | null;
    calibration: Calibration | null;
    /** The global band, with the engine's caveat for it at proposals (null when this engine build sent none). */
    conformal: { half_width: number | null; coverage: number | null; caveat: EngineIntervalCaveat | null };
    /** Per-proposal interval levels and how they were built (absent on older analyses: [] and null). */
    interval_levels: number[];
    interval_method: IntervalMethod | null;
    promotion: {
      passed: boolean;
      summary: string;
      meaning: string;
      failures: string[];
      not_judged: string[];
      metrics: Record<string, number>;
      enforced: false;
    } | null;
    drivers: Driver[];
    driver_selection: DriverSelection | null;
  };
  proposals: PackageProposal[];
  runs: PackageRun[];
  history: { round: number; best_measured: number | null; n_base: number | null }[];
  provenance: {
    engine_version: string | null;
    seed: number | null;
    analysis_timestamp: number | null;
    input_sha256: string | null;
    provenance_sha256: string | null;
    config_sha256: string | null;
    build_sha: string | null;
    library_versions: Record<string, string | null>;
    run_record: RunRecord | null;
    proposal_provenance: ProposalProvenance | null;
  };
  result_history: PackageResultHistory;
  gates: PackageGates;
  operating_ranges: PackageOperatingRanges;
  raw_rows: PackageRawRows;
  not_included: NotIncluded[];
};

/** Why each thing is missing, in plain words. Shown on the page and written into the package. */
export const NOT_INCLUDED: readonly NotIncluded[] = [
  {
    item: "The data rows themselves",
    reason:
      "Downloaded separately, as the engine's own export (Raw data on this page, CSV or JSON). This package records their counts, attribution and fingerprint; match the original sheet by its input_sha256.",
  },
  { item: "Protocols and SOPs", reason: "The engine can draft SOPs, but this app does not use that yet." },
];

const GATES_NOTE =
  "Gate decisions are recorded by people and stored by the engine; computed_evidence is what the engine computed from the campaign's analysis and never sets a decision.";
const RAW_ROWS_NOTE =
  "Counts, attribution and provenance of the engine's raw-rows export. The rows themselves are a separate download (the engine's CSV or JSON).";
const OPERATING_RANGES_NOT_REQUESTED =
  "No operating range was requested on the Report page before this package was built. The engine computes one only on request, for a threshold and probability you choose.";

/** The rows-export metadata the package keeps (counts and flags, never the rows). */
export function rawRowsMeta(r: RowsExport): Extract<PackageRawRows, { status: "included" }> {
  const extra = r as RowsExport & { csv_formula_neutralization?: unknown };
  return {
    status: "included",
    note: RAW_ROWS_NOTE,
    target: str(r.target),
    columns: r.columns ?? [],
    n_original_rows: num(r.original_rows?.n),
    n_folded_rows: num(r.folded_rows?.n),
    n_unattributed_rows: num(r.unattributed_rows?.n),
    original_rows_identifiable: r.original_rows_identifiable === true,
    original_rows_reason: str(r.original_rows_reason),
    anonymization: r.anonymization ?? {},
    csv_formula_neutralization: str(extra.csv_formula_neutralization),
    provenance: r.provenance ?? {},
  };
}

/** Recorded decisions and computed evidence, in separate fields, as GET /gates sent them. */
export function gatesPackage(g: GatesView): Extract<PackageGates, { status: "included" }> {
  const all = [...(g.gates ?? []), ...(g.orphaned_gates ?? [])];
  const evidence: Record<string, ComputedEvidence> = {};
  for (const x of all) if (x.computed_evidence) evidence[x.key] = x.computed_evidence;
  return {
    status: "included",
    note: GATES_NOTE,
    current_stage: str(g.current_stage),
    current_stage_basis: "recorded",
    stages_source: g.stages_source,
    decisions: all.map((x) => ({
      gate: x.key,
      stage_label: x.stage_label,
      in_stage_definitions: x.in_stage_definitions,
      decision: x.decision ?? null,
      state: x.state,
      current: x.current ?? null,
      history: x.history ?? [],
      history_count: x.history_count ?? 0,
      history_truncated: x.history_truncated === true,
    })),
    computed_evidence: evidence,
  };
}

/** The goal the analysis used, else the campaign's, else the engine default (maximize). */
export function goalOf(analysis: Pick<AnalyzeResult, "goal"> | null, summary: { goal?: Goal } | null): { direction: Goal; source: "analysis" | "campaign" | "engine_default" } {
  if (analysis?.goal === "maximize" || analysis?.goal === "minimize") return { direction: analysis.goal, source: "analysis" };
  if (summary?.goal === "maximize" || summary?.goal === "minimize") return { direction: summary.goal, source: "campaign" };
  return { direction: "maximize", source: "engine_default" };
}

export const OBSERVED_BOX_LABEL =
  "Observed search box: the lowest and highest value of each input in the uploaded data, which the engine searches inside. Not an operating range.";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && num(v[0]) != null && num(v[1]) != null ? [v[0], v[1]] : null;

function setpoints(recipe: Record<string, unknown> | null | undefined): Record<string, Setpoint> {
  const out: Record<string, Setpoint> = {};
  for (const [k, v] of Object.entries(recipe ?? {})) out[k] = typeof v === "string" ? v : num(v);
  return out;
}

function packageRun(r: CampaignRun): PackageRun {
  // A run without a finite result is not measured, whatever the flag says.
  const awaiting = r.awaiting === true || num(r.result) == null;
  const p = r.analysis_provenance;
  return {
    id: r.id,
    round: num(r.round),
    status: awaiting ? "awaiting" : "measured",
    recipe: setpoints(r.recipe),
    mode: str(r.mode),
    reason: str(r.reason),
    predicted: { value: num(r.pred), sd: num(r.std) },
    measured: awaiting
        ? null
        : {
            value: num(r.result),
            version: num(r.result_version),
            previous: num(r.previous_result),
            reason: str(r.result_reason),
            recorded_by: str(r.result_actor),
            recorded_at: num(r.result_recorded_at) ?? num(r.measured_at),
          },
    started_at: num(r.created_at),
    pred_source: r.pred_source === "engine" || r.pred_source === "caller" ? r.pred_source : null,
    prediction_at_start: r.prediction_at_start ?? null,
    residual: num(r.residual),
    residual_basis: str(r.residual_basis),
    inside_band: typeof r.inside_band === "boolean" ? r.inside_band : null,
    proposed_by: p
      ? {
          provenance_sha256: str(p.provenance_sha256),
          input_sha256: str(p.input_sha256),
          config_sha256: str(p.config_sha256),
          engine_version: str(p.engine_version),
          seed: num(p.seed),
          timestamp: num(p.timestamp),
        }
      : null,
  };
}

/** Seconds or milliseconds since the epoch, or a Date, as an ISO 8601 UTC string. */
function iso(t: Date | number): string {
  const ms = t instanceof Date ? t.getTime() : t < 1e12 ? t * 1000 : t;
  return new Date(ms).toISOString();
}

/**
 * Assemble the package. `summary` may be the no-campaign variant and
 * `analysis` may be null (no upload yet): every section then reads null or
 * empty, never a made-up value.
 */
export function buildPackage(
  meta: Pick<CampaignMeta, "id" | "name" | "created_at">,
  summary: Campaign | null,
  analysis: PackageAnalysis | null,
  generatedAt: Date | number,
  extras: PackageExtras = {},
): DataPackage {
  const s = summary && summary.has_campaign ? summary : null;
  const goal0 = goalOf(analysis, s);
  // The summary always reports a goal; when the stored setup is the engine's default, nobody set one.
  const storedDefault = extras.setup?.status === "loaded" && extras.setup.data.source === "default";
  const goal = goal0.source === "campaign" && storedDefault ? { ...goal0, source: "engine_default" as const } : goal0;
  const target = str(s?.target) ?? str(analysis?.target);
  const a = analysis;
  const run = a?.run ?? null;
  const pp = a?.proposal_provenance ?? null;
  const verdict = a ? reliabilityVerdict(a) : null;
  const band = num(a?.conformal_q);
  const coverage = num(a?.conformal_coverage);
  const features = a?.proposal_features ?? [];
  const inputSha = str(run?.input_sha256) ?? str(pp?.input_sha256);

  return {
    kind: PACKAGE_KIND,
    schema_version: PACKAGE_SCHEMA_VERSION,
    generated_at: iso(generatedAt),
    generated_by: "kalos-web",
    conventions: {
      timestamps: "Engine timestamps are Unix seconds (UTC), as the engine sent them.",
      missing: "null means the engine did not send the value. It never stands for 0.",
      rounds: "round is the engine's 0-based count of re-analyses (0 = fitted to the uploaded sheet only). The app shows round + 1, so a run with round 0 is round 1 on screen.",
      source:
        "Assembled in the browser from the engine's campaign summary, current analysis and report routes (result history and audit log, gates, raw-rows export, setup, operating ranges). Nothing is recomputed.",
    },
    campaign: {
      id: meta.id,
      name: meta.name,
      created_at: num(meta.created_at),
      round: num(s?.round),
      analysis_in_sync: typeof s?.analysis_in_sync === "boolean" ? s.analysis_in_sync : null,
    },
    objective: {
      target,
      unit: targetUnitOf({ target, target_unit: a?.target_unit ?? null }),
      target_unit: a?.target_unit ?? null,
      direction: goal.direction,
      direction_source: goal.source,
      note:
        goal.source === "engine_default"
          ? "No goal was set, so the engine maximizes the target (its default)."
          : `The engine ${goal.direction === "minimize" ? "minimizes" : "maximizes"} the target${goal.source === "analysis" ? ", as applied to this analysis from the campaign setup" : ", as the campaign summary reports"}.`,
      setup: {
        applied: a?.setup ?? null,
        stored: extras.setup ? (extras.setup.status === "loaded" ? extras.setup.data : extras.setup) : null,
      },
    },
    evidence: {
      best_measured: num(s?.best),
      n_base_rows: num(s?.n_base),
      n_measured_runs: num(s?.n_measured),
      n_awaiting_runs: num(s?.n_awaiting),
    },
    data: {
      dataset: str(a?.dataset),
      filename: str(run?.filename),
      sheet: str(run?.sheet) ?? str(a?.sheet_used),
      n_rows: num(a?.n),
      n_features: num(a?.d),
      input_sha256: inputSha,
      validation: a?.validation
        ? {
            status: str(a.validation.status),
            mode: str(a.validation.mode),
            counts: a.validation.counts ?? null,
            checks_run: a.validation.checks_run ?? [],
            findings: a.validation.findings ?? [],
            conversions: a.validation.conversions ?? [],
          }
        : null,
      columns: a?.provenance ?? [],
      exclusions: {
        data_drops: a?.data_drops ?? run?.data_drops ?? null,
        n_dropped_incomplete: num(a?.n_dropped_incomplete),
        n_censored_excluded: num(a?.n_censored_excluded),
        design_box_exclusions: a?.design_box_exclusions ?? [],
        auto_categorical: a?.auto_categorical ?? [],
        categorical_features: a?.categorical_features ?? [],
      },
      observed_design_space: { label: OBSERVED_BOX_LABEL, ranges: a?.feature_ranges ?? null },
    },
    model: {
      reliability: {
        verdict: verdict?.state ?? "insufficient",
        label: verdict?.label ?? "Not enough data",
        reason: verdict?.reason ?? "There is no analysis yet.",
        engine: a?.reliability ?? null,
      },
      cv_spearman: num(a?.cv_spearman),
      cv_ci95: pair(a?.cv_ci95),
      calibration: a?.reliability?.calibration ?? null,
      conformal: { half_width: band, coverage, caveat: a?.conformal_caveat ?? null },
      interval_levels: (a?.interval_levels ?? []).filter((l) => num(l) != null),
      interval_method: a?.interval_method ?? null,
      promotion: a?.promotion
        ? {
            passed: a.promotion.passed,
            summary: a.promotion.summary,
            meaning: a.promotion.meaning,
            failures: a.promotion.failures ?? [],
            not_judged: a.promotion.not_judged ?? [],
            metrics: a.promotion.metrics ?? {},
            enforced: false,
          }
        : null,
      drivers: a?.drivers ?? [],
      driver_selection: a?.driver_selection ?? null,
    },
    proposals: (a?.proposals ?? []).map((p, i): PackageProposal => ({
      index: i + 1,
      recipe: setpoints(proposalRecipe(p, features)),
      mode: str(p.mode),
      reason: str(p.reason),
      predicted: {
        value: num(p.pred),
        sd: num(p.std),
        band_half_width: band,
        band_coverage: coverage,
        p_feasible: num(p.p_feasible),
        predictive_std: num(p.predictive_std),
        intervals: p.intervals ?? [],
        gp_intervals: p.gp_intervals ?? [],
        interval_caveats: intervalCaveats(p, a),
      },
    })),
    runs: (s?.pending ?? []).map(packageRun),
    history: (s?.history ?? []).map((h) => ({ round: h.round, best_measured: num(h.best), n_base: num(h.n_base) })),
    provenance: {
      engine_version: str(a?.engine_version) ?? str(pp?.engine_version),
      seed: num(a?.seed) ?? num(run?.seed) ?? num(pp?.seed),
      analysis_timestamp: num(a?.timestamp),
      input_sha256: inputSha,
      provenance_sha256: str(pp?.provenance_sha256),
      config_sha256: str(pp?.config_sha256),
      build_sha: str(pp?.build_sha) ?? str(run?.build_sha),
      library_versions: { ...(run?.library_versions ?? {}), ...(pp?.library_versions ?? {}) },
      run_record: run,
      proposal_provenance: pp,
    },
    result_history: historySection(extras.history),
    gates: !extras.gates ? notRead("gates") : extras.gates.status === "loaded" ? gatesPackage(extras.gates.data) : extras.gates,
    operating_ranges: extras.operatingRanges ?? { status: "not_requested", note: OPERATING_RANGES_NOT_REQUESTED },
    raw_rows: !extras.rows ? notRead("raw-rows export") : extras.rows.status === "loaded" ? rawRowsMeta(extras.rows.data) : extras.rows,
    not_included: NOT_INCLUDED.map((n) => ({ ...n })),
  };
}

/** The caveat for every interval a proposal carries (lib/proposal-caveat: the engine's own, else the fixed text). */
function intervalCaveats(p: NonNullable<PackageAnalysis["proposals"]>[number], a: PackageAnalysis | null): PackageIntervalCaveat[] {
  const out: PackageIntervalCaveat[] = [];
  const of = (entry: Parameters<typeof proposalCaveat>[0], fallback: Parameters<typeof proposalCaveat>[1], coverage: number | null, applies: PackageIntervalCaveat["applies_to"]) => {
    const c = proposalCaveat(entry, fallback, coverage);
    const raw = (entry && "caveat" in entry && entry.caveat?.coverage_at_proposals_estimate) || (entry && "coverage_at_proposals_estimate" in entry && entry.coverage_at_proposals_estimate) || fallback?.coverage_at_proposals_estimate || null;
    out.push({
      applies_to: applies,
      coverage,
      text: c.text,
      source: c.from === "engine" ? "engine" : "web_fixed_text",
      engine_code: c.code,
      interval_basis: c.basis,
      coverage_at_proposals_estimate: raw && typeof raw === "object" ? raw : null,
    });
  };
  const levels = (p.intervals ?? []).filter((i) => i.available && num(i.lo) != null && num(i.hi) != null);
  for (const i of levels) of(i, methodCaveat(a?.interval_method, i.coverage), num(i.coverage), "per_proposal_interval");
  // band_half_width (the global conformal_q band) is on every proposal whenever the engine sent one: it is caveated too.
  if (num(a?.conformal_q) != null) of(a?.conformal_caveat ?? null, null, num(a?.conformal_coverage), "global_band");
  return out;
}

const notRead = (what: string): Unavailable => ({ status: "unavailable", code: "not_read", reason: `The ${what} had not been read from the engine when this package was built.` });

function historySection(h: PackageExtras["history"]): PackageResultHistory {
  if (!h) return notRead("result history");
  if (h.status === "unavailable") return h;
  return { status: "included", complete: h.complete, pages_read: h.pages, results: h.results, audit: h.audit, notes: h.notes };
}

// --- CSV ---------------------------------------------------------------------

type Cell = string | number | boolean | null | undefined;

/**
 * One RFC 4180 cell. Numbers are written in full precision; missing is an
 * empty cell. Text that a spreadsheet would run as a formula (starting with
 * = + - @, or a tab / carriage return) gets a leading single quote; real
 * numbers, negative ones included, are left alone.
 */
export function csvCell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let text = String(v);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows joined with CRLF (RFC 4180), with a trailing line break. */
export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const isoOrNull = (t: number | null): string | null => (t == null ? null : iso(t));

/** Recipe keys in first-seen order, so columns are stable across rows. */
function recipeColumns(items: readonly { recipe: Record<string, Setpoint> }[]): string[] {
  const seen = new Set<string>();
  for (const it of items) for (const k of Object.keys(it.recipe)) seen.add(k);
  return [...seen];
}

export const RUNS_FIXED_COLUMNS = [
  "run_id",
  "engine_round",
  "run_status",
  "proposal_mode",
  "proposal_reason",
  "predicted_value",
  "predicted_sd",
  "predicted_source",
  "predicted_at_start_band_lo",
  "predicted_at_start_band_hi",
  "predicted_at_start_band_coverage",
  "measured_value",
  "measured_version",
  "measured_previous_value",
  "measured_correction_reason",
  "measured_recorded_by",
  "measured_recorded_at",
  "residual_measured_minus_predicted",
  "inside_band_at_start",
  "started_at",
  "proposed_by_provenance_sha256",
  "proposed_by_input_sha256",
  "proposed_by_config_sha256",
  "proposed_by_engine_version",
  "proposed_by_seed",
] as const;

/** The band the engine recorded when a run started (null for legacy and caller-predicted runs). */
export function startBand(r: Pick<PackageRun, "prediction_at_start">): { lo: number; hi: number; coverage: number } | null {
  const p = r.prediction_at_start;
  if (!p || p.available !== true || !p.interval) return null;
  const { lo, hi, coverage } = p.interval;
  return num(lo) != null && num(hi) != null && num(coverage) != null ? { lo, hi, coverage } : null;
}

/** Every started run: predicted_* and measured_* columns kept apart, then the recipe. */
export function runsCsv(pkg: Pick<DataPackage, "runs">): string {
  const recipe = recipeColumns(pkg.runs);
  const rows = pkg.runs.map((r): Cell[] => [
    r.id,
    r.round,
    r.status,
    r.mode,
    r.reason,
    r.predicted.value,
    r.predicted.sd,
    r.pred_source,
    startBand(r)?.lo,
    startBand(r)?.hi,
    startBand(r)?.coverage,
    r.measured?.value,
    r.measured?.version,
    r.measured?.previous,
    r.measured?.reason,
    r.measured?.recorded_by,
    isoOrNull(r.measured?.recorded_at ?? null),
    r.residual,
    r.inside_band,
    isoOrNull(r.started_at),
    r.proposed_by?.provenance_sha256,
    r.proposed_by?.input_sha256,
    r.proposed_by?.config_sha256,
    r.proposed_by?.engine_version,
    r.proposed_by?.seed,
    ...recipe.map((k) => r.recipe[k]),
  ]);
  return toCsv([...RUNS_FIXED_COLUMNS, ...recipe], rows);
}

const PROPOSAL_BAND_CAVEAT_FALLBACK = proposalCaveat(null).text;
const globalCaveat = (p: PackageProposal): string | null => p.predicted.interval_caveats.find((x) => x.applies_to === "global_band")?.text ?? null;

export const PROPOSALS_FIXED_COLUMNS = [
  "proposal_index",
  "proposal_mode",
  "proposal_reason",
  "predicted_value",
  "predicted_sd",
  "predicted_band_half_width",
  "predicted_band_coverage",
  "predicted_band_caveat",
  "predicted_p_feasible",
] as const;

/**
 * The proposed batch: predictions only (nothing in it has been measured), then
 * one interval_<coverage>_lo/hi/caveat triple per engine level (empty when the
 * engine refused that level; the reason is in the JSON package), then the
 * recipe. Every interval travels with its trust caveat.
 */
export function proposalsCsv(pkg: Pick<DataPackage, "proposals">): string {
  const recipe = recipeColumns(pkg.proposals);
  // One lo/hi pair per coverage level the engine sent, named from the engine's own coverage (0.9 -> 90).
  const levels = [...new Set(pkg.proposals.flatMap((p) => p.predicted.intervals.map((i) => i.coverage)).filter((c) => num(c) != null))].sort((x, y) => x - y);
  const levelName = (c: number) => `interval_${String(Math.round(c * 1000) / 10).replace(".", "_")}`;
  const levelCols = levels.flatMap((c) => [`${levelName(c)}_lo`, `${levelName(c)}_hi`, `${levelName(c)}_caveat`]);
  const rows = pkg.proposals.map((p): Cell[] => [
    p.index,
    p.mode,
    p.reason,
    p.predicted.value,
    p.predicted.sd,
    p.predicted.band_half_width,
    p.predicted.band_coverage,
    p.predicted.band_half_width != null ? (globalCaveat(p) ?? PROPOSAL_BAND_CAVEAT_FALLBACK) : null,
    p.predicted.p_feasible,
    ...levels.flatMap((c) => {
      const i = p.predicted.intervals.find((x) => x.coverage === c);
      const cav = p.predicted.interval_caveats.find((x) => x.applies_to === "per_proposal_interval" && x.coverage === c);
      return i && i.available ? [i.lo, i.hi, cav?.text ?? PROPOSAL_BAND_CAVEAT_FALLBACK] : [null, null, null];
    }),
    ...recipe.map((k) => p.recipe[k]),
  ]);
  return toCsv([...PROPOSALS_FIXED_COLUMNS, ...levelCols, ...recipe], rows);
}

// --- File names and contents ---------------------------------------------------

/** "Fed-batch CHO #3 (Ü)" -> "fed-batch-cho-3-u"; falls back to "campaign". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "campaign";
}

export type PackageFile = "package" | "runs" | "batch" | "rows" | "rows-json";

/**
 * kalos-<slug>-<yyyymmdd>.json, kalos-<slug>-runs-<yyyymmdd>.csv, kalos-<slug>-batch-<yyyymmdd>.csv,
 * kalos-<slug>-rows-<yyyymmdd>.csv / .json (the engine's raw-rows export) (UTC date).
 */
export function packageFilename(campaignName: string, file: PackageFile, at: Date | number): string {
  const day = iso(at).slice(0, 10).replace(/-/g, "");
  const slug = slugify(campaignName);
  if (file === "package") return `kalos-${slug}-${day}.json`;
  if (file === "rows-json") return `kalos-${slug}-rows-${day}.json`;
  return `kalos-${slug}-${file}-${day}.csv`;
}

export const packageJson = (pkg: DataPackage): string => `${JSON.stringify(pkg, null, 2)}\n`;

export type ContentItem = { label: string; detail: string; present: boolean };

// Display strings only; the package's numbers stay raw engine values.
const count = (n: number, one: string, many = `${one}s`) => `${formatValue(n, { quantity: "count" }).text} ${n === 1 ? one : many}`;

/** The "What is in this package" checklist, from the package itself. `present: false` means the engine sent nothing for it. */
export function packageContents(pkg: DataPackage): ContentItem[] {
  const d = pkg.data;
  const measured = pkg.runs.filter((r) => r.status === "measured").length;
  const ranges = d.observed_design_space.ranges ? Object.keys(d.observed_design_space.ranges).length : 0;
  const v = d.validation;
  return [
    {
      label: "Campaign and objective",
      detail: pkg.objective.target
        ? `${pkg.campaign.name}, ${pkg.objective.direction} ${pkg.objective.target}${pkg.objective.unit ? ` (${pkg.objective.unit})` : ""}`
        : `${pkg.campaign.name}, no target yet`,
      present: pkg.objective.target != null,
    },
    {
      label: "Data description",
      detail:
        d.n_rows != null
          ? `${count(d.n_rows, "row")}, ${d.n_features != null ? count(d.n_features, "input") : "inputs n/a"}, input fingerprint ${d.input_sha256 ? "included" : "not sent"}`
          : "No analysis yet",
      present: d.n_rows != null,
    },
    {
      label: "Validation report",
      detail: v ? `${count(v.findings.length, "finding")} from ${count(v.checks_run.length, "check")}` : "Not sent by the engine",
      present: v != null,
    },
    { label: "Column provenance", detail: count(d.columns.length, "column"), present: d.columns.length > 0 },
    { label: "Exclusions", detail: "Dropped rows and cells, censored values, narrowed search ranges", present: d.exclusions.data_drops != null },
    { label: "Observed search box", detail: ranges ? count(ranges, "input") : "Not sent by the engine", present: ranges > 0 },
    {
      label: "Model checks",
      detail: "Reliability, held-out rank agreement, band calibration, promotion gates, drivers",
      present: pkg.model.cv_spearman != null || pkg.model.reliability.engine != null,
    },
    { label: "Proposed batch", detail: count(pkg.proposals.length, "recipe"), present: pkg.proposals.length > 0 },
    {
      label: "Runs",
      detail: `${count(pkg.runs.length, "run")}: ${formatValue(measured, { quantity: "count" }).text} measured, ${formatValue(pkg.runs.length - measured, { quantity: "count" }).text} awaiting`,
      present: pkg.runs.length > 0,
    },
    { label: "Best-so-far history", detail: count(pkg.history.length, "round"), present: pkg.history.length > 0 },
    historyContent(pkg.result_history),
    gatesContent(pkg.gates),
    operatingRangesContent(pkg.operating_ranges),
    rawRowsContent(pkg.raw_rows),
    {
      label: "Provenance",
      detail: "Engine version, seed, hashes, run record, library versions",
      present: pkg.provenance.engine_version != null || pkg.provenance.run_record != null,
    },
  ];
}

function historyContent(h: PackageResultHistory): ContentItem {
  const label = "Result history and audit log";
  if (h.status !== "included") return { label, detail: h.reason, present: false };
  const corrections = h.results.filter((r) => r.is_correction).length;
  return {
    label,
    detail: `${count(h.results.length, "recorded result version")} (${count(corrections, "correction")}), ${count(h.audit.length, "audit entry", "audit entries")}${h.complete ? "" : ", older pages not read"}`,
    present: h.results.length > 0 || h.audit.length > 0,
  };
}

function gatesContent(g: PackageGates): ContentItem {
  const label = "Scale-up gate decisions";
  if (g.status !== "included") return { label, detail: g.reason, present: false };
  const recorded = g.decisions.filter((x) => x.current != null).length;
  return {
    label,
    detail: `${count(recorded, "gate")} of ${formatValue(g.decisions.length, { quantity: "count" }).text} with a recorded decision; computed evidence kept separately`,
    present: true,
  };
}

function operatingRangesContent(o: PackageOperatingRanges): ContentItem {
  const label = "Operating ranges";
  if (o.status === "not_requested") return { label, detail: "Not requested on this page in this session", present: false };
  if (o.status === "failed") return { label, detail: `Requested, but the engine did not answer: ${o.reason}`, present: false };
  if (o.outcome.status === "computed") return { label, detail: `${count(o.outcome.ranges.length, "input")}, model-based, must be verified experimentally`, present: true };
  return { label, detail: `Not computed by the engine: ${o.outcome.reason}`, present: true };
}

function rawRowsContent(r: PackageRawRows): ContentItem {
  const label = "Raw data export (counts and attribution)";
  if (r.status !== "included") return { label, detail: r.reason, present: false };
  const parts = r.original_rows_identifiable
    ? [`${r.n_original_rows != null ? count(r.n_original_rows, "uploaded row") : "uploaded rows n/a"}`, `${r.n_folded_rows != null ? count(r.n_folded_rows, "folded-in row") : "folded-in rows n/a"}`]
    : [`${r.n_unattributed_rows != null ? count(r.n_unattributed_rows, "unattributed row") : "rows n/a"}`, "original rows not identifiable"];
  return { label, detail: parts.join(", "), present: true };
}
