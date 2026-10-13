// Types and pure helpers for the engine's data-validation report (the
// `validation` block POST /api/run's response gains - see AnalyzeResult in
// lib/api.ts, which wires ValidationReport in). No React here on purpose -
// every helper below is unit-testable without a DOM (see
// __tests__/validation.test.ts).

export type ValidationSeverity = "error" | "warning" | "info";
export type ValidationStatus = "pass" | "pass_with_warnings" | "fail";
export type ValidationMode = "warn" | "strict";

/**
 * The eleven checks the engine runs today. Exhaustive by construction: `CHECK_INFO`
 * below is typed `Record<CheckId, ...>`, so adding a tenth id here without also
 * adding it to `CHECK_INFO` fails typecheck - a new check can never ship
 * without a scientist-facing label (see __tests__/validation.test.ts for the
 * runtime assertion of the same thing).
 */
export const CHECK_IDS = [
  "units_consistency",
  "physical_bounds",
  "duplicate_rows",
  "missingness",
  "outliers",
  "provenance_metadata",
  "replicate_adequacy",
  "controls_present",
  "constant_columns",
  "informative_missingness",
  "constant_within_group",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

function isCheckId(check: string): check is CheckId {
  return (CHECK_IDS as readonly string[]).includes(check);
}

/**
 * One finding from a single check. `check` is typed as `string`, not the
 * strict `CheckId` union - the same convention as `ProvenanceEntry.status` in
 * lib/api.ts, because this payload comes off the wire unvalidated. A future
 * engine build could add a tenth check before the UI ships a label for it,
 * and the UI must render that honestly (the raw id, via `getCheckLabel`'s
 * fallback) rather than crash or silently drop the finding.
 */
export type ValidationFinding = {
  check: string;
  severity: ValidationSeverity;
  message: string;
  column: string | null;
  /** Capped at 20 indices by the engine - see `detail.n_rows_affected` for the true total. */
  rows: number[];
  detail?: Record<string, unknown> | null;
};

export type UnitConversion = {
  column: string;
  from_units: string[];
  /** Internal canonical suffix, e.g. "_c". Prefer `to_unit_label` for display. */
  to_unit: string;
  /** Human-readable unit name from the engine, e.g. "Celsius". Optional because
   *  an engine build older than this field simply will not send it. */
  to_unit_label?: string;
  cells_converted: number;
};

export type ValidationReport = {
  schema_version: number;
  status: ValidationStatus;
  mode: ValidationMode;
  n_rows: number;
  n_columns: number;
  /** Names of the checks the engine ran. */
  checks_run: string[];
  counts: { error: number; warning: number; info: number };
  findings: ValidationFinding[];
  conversions: UnitConversion[];
};

// --- friendly labels ---------------------------------------------------------

/** Scientist-facing label + one-line plain-English explanation for each check -
 *  written for a process scientist, not a programmer: what failed, and why it
 *  matters for trusting the run sheet or the model fit on top of it. */
export const CHECK_INFO: Record<CheckId, { label: string; finding: string; explanation: string }> = {
  units_consistency: {
    finding: "Mixed units",
    label: "Unit consistency",
    explanation:
      "A column mixes units within itself (e.g. some Temp readings in F, others in C), so the same number could mean two different things.",
  },
  physical_bounds: {
    finding: "Values outside physical limits",
    label: "Physical bounds",
    explanation:
      "A value falls outside what's physically possible for that measurement (e.g. a negative titer, a pH above 14) - usually a unit mix-up or a typo.",
  },
  duplicate_rows: {
    finding: "Duplicate rows",
    label: "Duplicate rows",
    explanation: "Two or more rows are exact repeats of each other, which can double-count a run and bias the fit.",
  },
  missingness: {
    finding: "Missing values",
    label: "Missing data",
    explanation: "A column or a set of rows is missing a large share of its values, which limits what the model can learn from it.",
  },
  outliers: {
    finding: "Unusual values",
    label: "Outliers",
    explanation:
      "A value sits far outside the rest of that column's distribution - could be a genuinely extreme run, or a data-entry mistake worth checking.",
  },
  provenance_metadata: {
    finding: "Missing run metadata",
    label: "Provenance metadata",
    explanation: "Run metadata (operator, date, batch, or similar) is missing, which makes a result harder to trace back to how it was produced.",
  },
  replicate_adequacy: {
    finding: "Too few replicates",
    label: "Replicate adequacy",
    explanation: "A condition was run too few times to separate a real effect from ordinary run-to-run noise.",
  },
  controls_present: {
    finding: "No control condition",
    label: "Controls present",
    explanation: "The run sheet has no control condition, which makes it hard to tell a meaningful result apart from batch variation.",
  },
  constant_columns: {
    finding: "Input never varies",
    label: "Constant columns",
    explanation: "An input never varies across runs, so it can't explain any of the observed variation - the model gets no signal from it.",
  },
  informative_missingness: {
    finding: "Blanks that track the outcome",
    label: "Blanks that track the outcome",
    explanation:
      "Blank cells line up with the result (e.g. poor performers were never measured), so a blank is itself a clue and filling it in would quietly teach the model the answer.",
  },
  constant_within_group: {
    finding: "Input constant within each group",
    label: "Constant within each group",
    explanation:
      "An input varies across the sheet but has a single value inside every group, so it is really a stand-in for which group a row is in, not a real driver.",
  },
};

/** Friendly label for a check id, falling back to the raw id for anything
 *  the UI doesn't recognize yet (see the `ValidationFinding.check` comment). */
export function getCheckLabel(check: string): string {
  return isCheckId(check) ? CHECK_INFO[check].label : check;
}

/** One-line plain-English explanation for a check id, or "" when unknown. */
export function getCheckExplanation(check: string): string {
  return isCheckId(check) ? CHECK_INFO[check].explanation : "";
}

/** Plain one-line phrase for a finding row; the engine's own sentence is kept for Method details.
 *  Unknown check ids fall back to the engine message. */
export function findingPhrase(f: Pick<ValidationFinding, "check" | "message">): string {
  return isCheckId(f.check) ? CHECK_INFO[f.check].finding : f.message;
}

// --- sorting / grouping -------------------------------------------------------

const SEVERITY_RANK: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Sort key for a severity: errors first (0), then warnings (1), then info (2). */
export function severityRank(severity: ValidationSeverity): number {
  return SEVERITY_RANK[severity];
}

/** Sorts findings errors-first, then warnings, then info. Stable within a
 *  severity, so the engine's original order is preserved there. */
export function sortFindings(findings: ValidationFinding[]): ValidationFinding[] {
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

export type FindingGroup = { check: string; findings: ValidationFinding[] };

/** Groups findings by check id (each group's findings sorted errors-first),
 *  with groups themselves ordered by their most severe finding - so a check
 *  with an error surfaces above a check with only warnings. */
export function groupFindingsByCheck(findings: ValidationFinding[]): FindingGroup[] {
  const byCheck = new Map<string, ValidationFinding[]>();
  for (const f of findings) {
    const list = byCheck.get(f.check);
    if (list) list.push(f);
    else byCheck.set(f.check, [f]);
  }
  const groups: FindingGroup[] = Array.from(byCheck.entries()).map(([check, list]) => ({
    check,
    findings: sortFindings(list),
  }));
  groups.sort((a, b) => severityRank(a.findings[0].severity) - severityRank(b.findings[0].severity));
  return groups;
}

// --- row-list honesty ----------------------------------------------------------

/** Defends against a malformed/older payload where `rows` isn't actually an
 *  array, so the honesty logic below degrades to "0 rows" rather than throws. */
function safeRows(finding: Pick<ValidationFinding, "rows">): number[] {
  return Array.isArray(finding.rows) ? finding.rows : [];
}

/** The true count of affected rows: `detail.n_rows_affected` when the engine
 *  sent it, else the length of the (possibly capped) `rows` list - never
 *  fabricated beyond what the payload actually says. */
export function affectedRowCount(finding: ValidationFinding): number {
  const raw = finding.detail?.n_rows_affected;
  return typeof raw === "number" ? raw : safeRows(finding).length;
}

/** Whether `rows` is a truncated view of a larger affected set. */
export function isRowListTruncated(finding: ValidationFinding): boolean {
  return affectedRowCount(finding) > safeRows(finding).length;
}

/** The honest row-list caption: "showing 20 of 143 affected rows" when the
 *  engine capped the list, otherwise a plain count. Never implies the shown
 *  list is complete when it isn't. Returns "" when there are no rows to caption. */
export function rowListCaption(finding: ValidationFinding): string {
  const rows = safeRows(finding);
  if (rows.length === 0) return "";
  const total = affectedRowCount(finding);
  if (isRowListTruncated(finding)) {
    return `showing ${rows.length} of ${total} affected rows`;
  }
  return rows.length === 1 ? "1 affected row" : `${rows.length} affected rows`;
}

// --- headline --------------------------------------------------------------------

/** The single sentence a scientist should read first, keyed off `status`. */
export function validationHeadline(report: ValidationReport): string {
  const { status, counts, n_rows, n_columns, checks_run } = report;
  if (status === "fail") {
    return `${counts.error} error${counts.error === 1 ? "" : "s"} found in ${n_rows} rows / ${n_columns} columns - fix these before running an optimization on this data.`;
  }
  if (status === "pass_with_warnings") {
    return `No errors, but ${counts.warning} warning${counts.warning === 1 ? "" : "s"} to review before you trust this run sheet.`;
  }
  return `All ${checks_run.length} checks passed on ${n_rows} rows / ${n_columns} columns.`;
}

// --- unit conversions ---------------------------------------------------------

/** Fallback names for the engine's internal `to_unit` suffixes, used only when
 *  talking to an engine build that predates the `to_unit_label` field.
 *
 *  The engine owns this vocabulary (kalos/normalize/units.py `base_unit_label`)
 *  and now ships the label on the wire, so this map exists purely for backward
 *  compatibility and must not grow. Keeping a second copy of the mapping here is
 *  how the two drift: an earlier version of this file guessed at `_f` and `_k`,
 *  which the engine never emits (temperature always converts TO Celsius), while
 *  omitting `_g_l`, `_ml_h`, `_h` and `_pct`, so a converted concentration
 *  column rendered to a scientist as the literal string "_g_l". */
const LEGACY_UNIT_LABELS: Record<string, string> = {
  _c: "Celsius",
  _pct: "percent",
  _g_l: "g/L",
  _ml_h: "mL/h",
  _h: "hours",
  "": "dimensionless",
};

function toUnitLabel(c: UnitConversion): string {
  return c.to_unit_label ?? LEGACY_UNIT_LABELS[c.to_unit] ?? c.to_unit;
}

/** "Temp: F, C -> Celsius (12 cells converted)" - the one-line summary of a
 *  single silent unit conversion, for the trust-earning conversions section. */
export function conversionSummary(c: UnitConversion): string {
  return `${c.column}: ${c.from_units.join(", ")} -> ${toUnitLabel(c)} (${c.cells_converted} cell${c.cells_converted === 1 ? "" : "s"} converted)`;
}
