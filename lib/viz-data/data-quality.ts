/*
 * H5 data quality (VIZ_SPEC_V2 4.H5). Pure: engine analysis -> a sheet-column x
 * cell-status grid. Rows are the sheet's columns in the engine's order
 * (`provenance`); columns are what the engine found in their cells: filled,
 * missing, not a number, censored, blank read as absent, then one column per
 * validation check that fired on a column. Every count is the engine's
 * (`provenance[].non_null`, `data_drops.cells_by_column`,
 * `data_drops.blank_cells_as_absent`, `validation.findings`); the only
 * arithmetic is a count's share of the sheet's rows, for the fill class.
 *
 * A column the model did not use is never shown with 0 issues: the engine
 * counts unusable cells only in the columns it fits, so those cells read "not
 * checked" (hatch) with that reason.
 */
import type { DataTable } from "@/components/viz/frame";
import type { AnalyzeResult, ProvenanceEntry } from "@/lib/api";
import { formatValue } from "@/lib/num";
import { getCheckLabel, affectedRowCount, type ValidationFinding } from "@/lib/validation";
import { shareClassOf } from "@/lib/viz-data/heat";

export type QualityAnalysis = Pick<AnalyzeResult, "provenance" | "data_drops" | "validation" | "categorical_features" | "auto_categorical" | "target" | "run" | "n_dropped_incomplete" | "n_censored_excluded"> & {
  /** `covariates.not_fitted`: why a covariate is recorded but not a model input (engine docs/CLONES.md). */
  covariates?: { not_fitted?: Record<string, string> } | null;
};

export type QualityRole = "target" | "input" | "categorical" | "clone" | "covariate" | "left-out";

export type QualityRow = { name: string; role: QualityRole; roleText: string; raw: string; used: boolean };

export type QualityCell =
  | { kind: "count"; n: number; share: number | null; cls: number; severity: "error" | "warning" | "info" | null; reasons: string[] }
  | { kind: "filled"; n: number | null; share: number | null }
  | { kind: "expected"; n: number; text: string; reasons: string[] }
  | { kind: "not-checked"; reason: string }
  | { kind: "note"; severity: "error" | "warning" | "info"; reasons: string[] };

export type QualityColumn = { key: string; label: string; help: string };

export type DataQuality = {
  rows: QualityRow[];
  columns: QualityColumn[];
  cells: QualityCell[][];
  nRows: number | null;
  rowsDropped: number | null;
  censoredRowsExcluded: number | null;
  /** Findings that name no column (provenance metadata, controls), listed under the grid. */
  sheetFindings: { check: string; severity: string; message: string }[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const CELL_COLUMNS: QualityColumn[] = [
  { key: "filled", label: "Filled", help: "Cells with any value (engine count, provenance.non_null)" },
  { key: "missing", label: "Missing", help: "Blank or n/a cells in a column the model uses: the run is left out, not imputed" },
  { key: "non_numeric", label: "Not a number", help: "Cells the engine could not read as a number in a numeric input or the target" },
  { key: "censored", label: "Censored", help: "Values like <LOD or >100: the run is left out, never imputed" },
  { key: "blank_absent", label: "Blank as absent", help: "Blank cells the engine read as absent (0) in a sparse or concentration column" },
];

/** Checks already shown by the cell columns (dropped_cells restates missing / not a number / censored). */
const RESTATED = new Set(["dropped_cells", "dropped_rows", "censored_rows"]);

function roleOf(p: ProvenanceEntry & { role?: string }, a: QualityAnalysis): { role: QualityRole; text: string; used: boolean } {
  const cats = new Set([...(a.categorical_features ?? []), ...(a.auto_categorical ?? [])]);
  if (p.role === "strain") return { role: "clone", text: "Clone", used: true };
  if (p.role === "covariate") {
    const fitted = p.status.startsWith("kept");
    return { role: "covariate", text: fitted ? "Covariate, fitted (never proposed)" : "Covariate, recorded, not fitted", used: fitted };
  }
  if (p.status === "target" || p.name === a.target) return { role: "target", text: "Target", used: true };
  if (p.status.startsWith("kept")) return cats.has(p.name) ? { role: "categorical", text: "Input, categorical", used: true } : { role: "input", text: "Input", used: true };
  return { role: "left-out", text: `Left out: ${leftOutWhy(p.status)}`, used: false };
}

/** Plain words for the engine's drop status (the raw status stays in the tooltip). */
export function leftOutWhy(status: string): string {
  switch (status) {
    case "dropped_id":
      return "an ID or label column";
    case "dropped_output":
      return "another outcome, not an input";
    case "dropped_constant":
      return "the same value in every run";
    case "dropped_non_numeric":
    case "dropped_text":
      return "text, not a number";
    case "dropped_empty":
      return "empty";
    default:
      return status.replace(/^dropped_?/, "").replace(/_/g, " ") || "not used";
  }
}

const NOT_CHECKED = "the engine counts unusable cells only in the columns the model uses, and this column was left out";

/** Plain labels for engine checks lib/validation.ts does not name yet (the raw id stays in the tooltip). */
const EXTRA_CHECK_LABEL: Record<string, string> = {
  strain_column_detected: "Clone column detected",
  covariate_columns_detected: "Covariates detected",
  auto_categorical: "Detected as categorical",
};
const checkLabel = (c: string) => EXTRA_CHECK_LABEL[c] ?? getCheckLabel(c);

export function toDataQuality(a: QualityAnalysis): DataQuality | null {
  const prov = (a.provenance ?? []) as (ProvenanceEntry & { role?: string })[];
  if (!prov.length) return null;
  const drops = a.data_drops ?? a.run?.data_drops;
  const byCol = drops?.cells_by_column ?? {};
  const blank = drops?.blank_cells_as_absent;
  const blankByCol = blank && typeof blank === "object" ? (blank as Record<string, number>) : null;
  const report = a.validation;
  const nRows = num(report?.n_rows) ?? num(a.run?.n_rows);
  const findings: ValidationFinding[] = report?.findings ?? [];
  const colFindings = findings.filter((f) => f.column && !RESTATED.has(f.check));
  const checks = [...new Set(colFindings.map((f) => f.check))];
  const columns: QualityColumn[] = [...CELL_COLUMNS, ...checks.map((c) => ({ key: `check:${c}`, label: checkLabel(c), help: `Validation check ${c}` }))];
  const share = (n: number) => (nRows && nRows > 0 ? n / nRows : null);
  const reasonsFor = (column: string, kinds: string[]) =>
    findings.filter((f) => f.column === column && (kinds.length === 0 || kinds.some((k) => f.check === k))).map((f) => f.message);

  const rows: QualityRow[] = [];
  const cells: QualityCell[][] = [];
  for (const p of prov) {
    const r = roleOf(p, a);
    rows.push({ name: p.name, role: r.role, roleText: r.text, raw: p.status, used: r.used });
    const counts = byCol[p.name] ?? {};
    const row: QualityCell[] = [];
    for (const c of CELL_COLUMNS) {
      if (c.key === "filled") {
        const n = num(p.non_null);
        row.push({ kind: "filled", n, share: n != null ? share(n) : null });
        continue;
      }
      if (!r.used) {
        const why = a.covariates?.not_fitted?.[p.name];
        row.push({ kind: "not-checked", reason: why ? `${NOT_CHECKED}: ${why}` : NOT_CHECKED });
        continue;
      }
      if (c.key === "non_numeric" && (r.role === "categorical" || r.role === "clone")) {
        const n = num(p.coerced_cells) ?? 0;
        row.push({ kind: "expected", n, text: "text levels", reasons: ["Text levels are expected in a categorical or clone column; they are labels, not numbers."] });
        continue;
      }
      const n = c.key === "blank_absent" ? (num(blankByCol?.[p.name]) ?? 0) : (num(counts[c.key]) ?? 0);
      row.push({ kind: "count", n, share: share(n), cls: n > 0 ? shareClassOf(share(n) ?? 1) || 1 : 0, severity: n > 0 ? "warning" : null, reasons: n > 0 ? reasonsFor(p.name, ["dropped_cells"]) : [] });
    }
    for (const check of checks) {
      const fs = colFindings.filter((f) => f.column === p.name && f.check === check);
      if (!fs.length) {
        row.push({ kind: "count", n: 0, share: 0, cls: 0, severity: null, reasons: [] });
        continue;
      }
      const sev = fs.some((f) => f.severity === "error") ? "error" : fs.some((f) => f.severity === "warning") ? "warning" : "info";
      const n = fs.reduce((s, f) => s + affectedRowCount(f), 0);
      row.push(
        n > 0
          ? { kind: "count", n, share: share(n), cls: shareClassOf(share(n) ?? 1) || 1, severity: sev, reasons: fs.map((f) => f.message) }
          : { kind: "note", severity: sev, reasons: fs.map((f) => f.message) },
      );
    }
    cells.push(row);
  }
  return {
    rows,
    columns,
    cells,
    nRows,
    rowsDropped: num(a.n_dropped_incomplete) ?? num(drops?.rows_dropped),
    censoredRowsExcluded: num(a.n_censored_excluded) ?? num(drops?.censored_rows_excluded),
    sheetFindings: findings.filter((f) => !f.column && !RESTATED.has(f.check)).map((f) => ({ check: f.check, severity: f.severity, message: f.message })),
  };
}

const count = (n: number | null | undefined) => formatValue(n, { quantity: "count" }).text;

/** The printed text of a cell. */
export function qualityCellText(c: QualityCell): string {
  switch (c.kind) {
    case "filled":
      return count(c.n);
    case "count":
      return count(c.n);
    case "expected":
      return c.text;
    case "not-checked":
      return "not checked";
    case "note":
      return c.reasons.length === 1 ? `1 ${c.severity === "info" ? "note" : c.severity}` : `${count(c.reasons.length)} ${c.severity === "info" ? "notes" : `${c.severity}s`}`;
  }
}

export function describeDataQuality(q: DataQuality): string {
  const issues = q.cells.flat().filter((c) => c.kind === "count" && c.n > 0).length;
  const left = q.rows.filter((r) => !r.used).length;
  return (
    `Data check for ${q.rows.length} columns of ${q.nRows != null ? `${count(q.nRows)} rows` : "the sheet"}: ` +
    `${issues === 0 ? "no cell-level issue in the columns the model uses" : `${count(issues)} column-and-issue cell${issues === 1 ? "" : "s"} with problems`}` +
    `${left ? `; ${count(left)} column${left === 1 ? " was" : "s were"} left out of the fit and not checked` : ""}.` +
    (q.rowsDropped != null ? ` ${count(q.rowsDropped)} run${q.rowsDropped === 1 ? " was" : "s were"} left out of the fit for a missing or non-numeric cell.` : "")
  );
}

export function dataQualityTable(q: DataQuality): DataTable {
  return {
    caption: "Cells per column and issue, as the engine counted them",
    columns: ["Column", "Role", ...q.columns.map((c) => c.label)],
    rows: q.rows.map((r, i) => [r.name, r.roleText, ...q.cells[i].map(qualityCellText)]),
  };
}
