// Column roles as the ENGINE read them (its provenance list), so names always match what the
// engine will accept back: duplicate headers renamed, empty columns dropped, sideways sheets
// transposed, and Excel files (whose header the browser cannot read) all come through the same way.
//
// Every column falls in exactly one kind, and the wording keeps four different facts apart:
//   input            used by the model
//   target           the column being maximised
//   engine_excluded  left out by the engine on its own (ID/date/output name, or it said nothing specific)
//   user_excluded    left out because the user unticked it (or moved the target away from it)
// A data-quality WARNING (empty / not numeric / constant) is a separate field and is only set when the
// provenance numbers (non_null, coerced_cells) or an engine status that states a data fact establish it.
// The engine's catch-all `dropped_sparse` is NOT such a statement: with explicit roles it is also what a
// perfectly good numeric column the user unticked comes back as.
import type { ColumnRolesInput, ProvenanceEntry } from "@/lib/api";

export type ColumnKind = "input" | "target" | "engine_excluded" | "user_excluded";

export type SheetColumn = {
  name: string;
  status: string;
  usedAsInput: boolean;
  isTarget: boolean;
  kind: ColumnKind;
  /** Why the column is not an input (who decided), or null for inputs and the target. */
  note: string | null;
  /** A data-quality finding about the column, or null when none is established. */
  warning: string | null;
};

/** Engine statuses that are a NAME-based decision (not a finding about the data). */
const AUTO_REASON: Record<string, string> = {
  dropped_id: "treated as an ID",
  dropped_output: "looks like a measured output",
};

/** Engine statuses that state a fact about the data itself and that the provenance counts cannot show. */
const DATA_FACT: Record<string, string> = {
  dropped_constant: "never changes",
  dropped_constant_on_fitted_rows: "never changes in the fitted rows",
};
/** Statuses the counts in `qualityWarning` establish (or contradict) on their own, so their wording is not reused. */
const COUNT_CHECKED = new Set(["dropped_all_blank", "dropped_non_numeric", "dropped_sparse"]);

export const USER_EXCLUDED_NOTE = "You excluded this column";
export const FORMER_TARGET_NOTE = "Was the target, so it is not an input";
export const ENGINE_LEFT_OUT_NOTE = "Left out by Kalos";

export type RolesContext = {
  /** The explicit roles the CURRENT fit was sent with; undefined when the engine inferred them. */
  sentRoles?: ColumnRolesInput;
  /** Targets the user moved away from during this session (their old target is not an input either). */
  formerTargets?: readonly string[];
  /**
   * Provenance of the last fit whose roles the ENGINE inferred (before any explicit roles were sent). Explicit-roles
   * fits use the engine's generic profile, which forgets name-based decisions (an `_gL` output column comes back as
   * a plain "not chosen"), so this is how an ID/output the engine excluded itself is not credited to the user.
   */
  baseline?: readonly ProvenanceEntry[];
};

/** A column with fewer filled cells than this fraction of the fullest column is "mostly empty". */
const EMPTY_SHARE = 0.5;
/** The engine's own numeric gate: a column is numeric when at least 80% of filled cells parse. */
const NUMERIC_SHARE = 0.8;

/** Data-quality finding from the provenance counts alone (never from the engine's status wording). */
export function qualityWarning(p: ProvenanceEntry, rowsAtLeast: number): string | null {
  const filled = p.non_null;
  if (filled === 0) return "has no values";
  if (filled > 0 && p.coerced_cells > 0 && (filled - p.coerced_cells) / filled < NUMERIC_SHARE) {
    return `mostly not numbers (${p.coerced_cells} of ${filled} filled cells)`;
  }
  if (rowsAtLeast > 0 && filled < EMPTY_SHARE * rowsAtLeast) return `mostly empty (${filled} filled of at least ${rowsAtLeast} rows)`;
  return null;
}

export function columnsFromProvenance(provenance: readonly ProvenanceEntry[] | undefined, ctx: RolesContext = {}): SheetColumn[] {
  const list = provenance ?? [];
  // The fullest column is a lower bound on the sheet's row count.
  const rowsAtLeast = list.reduce((m, p) => Math.max(m, p.non_null), 0);
  const sentFeatures = ctx.sentRoles && ctx.sentRoles.features.length > 0 ? new Set(ctx.sentRoles.features) : null;
  const former = new Set(ctx.formerTargets ?? []);
  const baseline = new Map((ctx.baseline ?? []).map((b) => [b.name, b.status]));

  return list.map((p): SheetColumn => {
    const base = { name: p.name, status: p.status, usedAsInput: p.status === "kept_feature", isTarget: p.status === "target" };
    if (p.status === "kept_feature") return { ...base, kind: "input", note: null, warning: null };
    if (p.status === "target") return { ...base, kind: "target", note: null, warning: null };

    // Everything else is excluded. Warning first: only numbers, or an engine status that is itself a data fact.
    // The engine's own name-based reason, from this fit or, after a roles fit, from the inferred fit it replaced.
    const auto = AUTO_REASON[p.status] ?? AUTO_REASON[baseline.get(p.name) ?? ""] ?? null;
    // IDs and outputs are expected to be text/sparse; that is not a finding about them.
    const warning = auto ? null : (qualityWarning(p, rowsAtLeast) ?? DATA_FACT[p.status] ?? null);
    const declaredByUser = p.source === "declared" && p.status === "dropped_id";
    // With explicit roles every column that is not ticked was left out by the user, unless the engine
    // independently dropped it by name (then the engine's own reason is the honest one).
    // A column the engine had itself left out of the inferred fit stays the engine's, whatever the roles fit says.
    const engineChose = baseline.get(p.name) === "kept_feature";
    const userUnticked = sentFeatures !== null && !sentFeatures.has(p.name) && auto === null && (baseline.size === 0 || engineChose);

    if (former.has(p.name)) return { ...base, kind: "user_excluded", note: FORMER_TARGET_NOTE, warning };
    if (declaredByUser || userUnticked) return { ...base, kind: "user_excluded", note: USER_EXCLUDED_NOTE, warning };
    if (auto) return { ...base, kind: "engine_excluded", note: auto, warning };
    // Unknown `dropped_*` statuses keep their raw wording; sparse / data-fact statuses say nothing about intent.
    const unknown = !(p.status in DATA_FACT) && !COUNT_CHECKED.has(p.status) && p.status.startsWith("dropped")
      ? p.status.replace(/^dropped_?/, "").replace(/_/g, " ") || "dropped"
      : null;
    return { ...base, kind: "engine_excluded", note: unknown ?? ENGINE_LEFT_OUT_NOTE, warning };
  });
}

/** Candidate targets that survive across re-fits: the engine only lists the chosen target after a roles fit. */
export function mergeTargets(previous: readonly string[], fromEngine: readonly string[], usedRoles: boolean): string[] {
  if (usedRoles) return previous.length ? [...previous] : [...fromEngine];
  return [...fromEngine];
}
