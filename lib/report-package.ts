/*
 * The Report page's data package: a versioned JSON object and two CSVs
 * assembled in the browser ONLY from what the engine returned (campaign meta,
 * campaign summary, current analysis). Nothing here is computed that the
 * engine did not compute; the one derived label is the app-wide reliability
 * verdict (lib/api.ts reliabilityVerdict), which reads the engine's own
 * floor and interval. Predicted and measured values live in separate
 * sub-objects and columns, and a value the engine did not send is `null`
 * (an empty CSV cell), never 0. Pure, tested in __tests__/report-package.test.ts.
 */

import {
  proposalRecipe,
  reliabilityVerdict,
  type AnalyzeResult,
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
import type { UnitConversion, ValidationFinding, ValidationReport } from "@/lib/validation";

export const PACKAGE_KIND = "kalos.data-package";
export const PACKAGE_SCHEMA_VERSION = 1;

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
  predicted: PackagePredicted & { band_half_width: number | null; band_coverage: number | null; p_feasible: number | null };
};

export type NotIncluded = { item: string; reason: string };

export type DataPackage = {
  kind: typeof PACKAGE_KIND;
  schema_version: typeof PACKAGE_SCHEMA_VERSION;
  generated_at: string;
  generated_by: "kalos-web";
  conventions: { timestamps: string; missing: string; rounds: string; source: string };
  campaign: { id: string; name: string; created_at: number | null; round: number | null; analysis_in_sync: boolean | null };
  objective: { target: string | null; direction: "maximize"; note: string };
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
    conformal: { half_width: number | null; coverage: number | null };
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
  not_included: NotIncluded[];
};

/** Why each thing is missing, in plain words. Shown on the page and written into the package. */
export const NOT_INCLUDED: readonly NotIncluded[] = [
  {
    item: "Base data rows",
    reason: "The engine has no route to export the uploaded rows. You hold the original sheet; match it by its input_sha256.",
  },
  {
    item: "Result correction history and audit log",
    reason: "The engine records them but does not expose them over its API. Each run carries only its latest value, version and previous value.",
  },
  { item: "Robust operating ranges", reason: "Not computed by the engine. The observed design space is the observed search box, not an operating range." },
  { item: "Protocols and SOPs", reason: "The engine can draft SOPs, but this app does not use that yet." },
  { item: "Scale-up stage decisions", reason: "Not stored by the engine: it keeps no stage registry or gate decisions." },
];

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
): DataPackage {
  const s = summary && summary.has_campaign ? summary : null;
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
      source: "Assembled in the browser from the engine's campaign summary and current analysis. Nothing is recomputed.",
    },
    campaign: {
      id: meta.id,
      name: meta.name,
      created_at: num(meta.created_at),
      round: num(s?.round),
      analysis_in_sync: typeof s?.analysis_in_sync === "boolean" ? s.analysis_in_sync : null,
    },
    objective: {
      target: str(s?.target) ?? str(a?.target),
      direction: "maximize",
      note: "The engine only maximizes the target.",
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
      conformal: { half_width: band, coverage },
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
    proposals: (a?.proposals ?? []).map((p, i) => ({
      index: i + 1,
      recipe: setpoints(proposalRecipe(p, features)),
      mode: str(p.mode),
      reason: str(p.reason),
      predicted: { value: num(p.pred), sd: num(p.std), band_half_width: band, band_coverage: coverage, p_feasible: num(p.p_feasible) },
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
    not_included: NOT_INCLUDED.map((n) => ({ ...n })),
  };
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
  "measured_value",
  "measured_version",
  "measured_previous_value",
  "measured_correction_reason",
  "measured_recorded_by",
  "measured_recorded_at",
  "started_at",
  "proposed_by_provenance_sha256",
  "proposed_by_input_sha256",
  "proposed_by_config_sha256",
  "proposed_by_engine_version",
  "proposed_by_seed",
] as const;

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
    r.measured?.value,
    r.measured?.version,
    r.measured?.previous,
    r.measured?.reason,
    r.measured?.recorded_by,
    isoOrNull(r.measured?.recorded_at ?? null),
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

export const PROPOSALS_FIXED_COLUMNS = [
  "proposal_index",
  "proposal_mode",
  "proposal_reason",
  "predicted_value",
  "predicted_sd",
  "predicted_band_half_width",
  "predicted_band_coverage",
  "predicted_p_feasible",
] as const;

/** The proposed batch: predictions only (nothing in it has been measured), then the recipe. */
export function proposalsCsv(pkg: Pick<DataPackage, "proposals">): string {
  const recipe = recipeColumns(pkg.proposals);
  const rows = pkg.proposals.map((p): Cell[] => [
    p.index,
    p.mode,
    p.reason,
    p.predicted.value,
    p.predicted.sd,
    p.predicted.band_half_width,
    p.predicted.band_coverage,
    p.predicted.p_feasible,
    ...recipe.map((k) => p.recipe[k]),
  ]);
  return toCsv([...PROPOSALS_FIXED_COLUMNS, ...recipe], rows);
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

export type PackageFile = "package" | "runs" | "batch";

/** kalos-<slug>-<yyyymmdd>.json, kalos-<slug>-runs-<yyyymmdd>.csv, kalos-<slug>-batch-<yyyymmdd>.csv (UTC date). */
export function packageFilename(campaignName: string, file: PackageFile, at: Date | number): string {
  const day = iso(at).slice(0, 10).replace(/-/g, "");
  const slug = slugify(campaignName);
  if (file === "package") return `kalos-${slug}-${day}.json`;
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
      detail: pkg.objective.target ? `${pkg.campaign.name}, maximize ${pkg.objective.target}` : `${pkg.campaign.name}, no target yet`,
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
    {
      label: "Provenance",
      detail: "Engine version, seed, hashes, run record, library versions",
      present: pkg.provenance.engine_version != null || pkg.provenance.run_record != null,
    },
  ];
}
