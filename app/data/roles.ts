import type { ProvenanceEntry } from "@/lib/api";
import { ROLE_WHY, type WhyCode } from "@/lib/why";

/**
 * Plain words for each column status the engine emits in its provenance list: how each column was read.
 * Anything not listed here renders as "Not used" and the raw status is shown only inside the "As Kalos
 * wrote it" disclosure, never rewritten into prose. Each status carries a "Why this matters" line (ROLE_WHY).
 */
const ROLE: Record<string, string> = {
  kept_feature: "Used as an input",
  target: "The target: the number being raised",
  dropped_id: "Not used: treated as a run label",
  dropped_output: "Not used: looks like a measured result",
  dropped_constant: "Not used: never changes",
  dropped_constant_on_fitted_rows: "Not used: never changes in the runs the model learned from",
  dropped_all_blank: "Not used: no values",
  dropped_non_numeric: "Not used: mostly text",
  // The engine's catch-all: a column it did not pick, with no specific reason. The counts beside it say the rest.
  dropped_sparse: "Not used: left out by Kalos",
};

export const UNKNOWN_ROLE = "Not used";

export function roleLabel(status: string): string {
  return ROLE[status] ?? UNKNOWN_ROLE;
}

/**
 * The why-line code for a status: the engine's own name when it has words, else the unknown-status line.
 * `dropped_sparse` is also the engine's catch-all for a column it did not pick for no stated reason, so its
 * "mostly blank" line is used only when the column really is sparse (`sparse`, from the filled counts).
 */
export function roleWhy(status: string, sparse = true): WhyCode {
  if (status === "dropped_sparse" && !sparse) return "unknown_role";
  return ROLE_WHY[status] ?? "unknown_role";
}

/** A column with fewer filled cells than half the fullest column's is sparse (the same gate as lib/sheet-roles.ts). */
export function isSparse(c: ProvenanceEntry, provenance: readonly ProvenanceEntry[]): boolean {
  const rowsAtLeast = provenance.reduce((m, p) => Math.max(m, p.non_null), 0);
  return c.non_null === 0 || c.non_null < 0.5 * rowsAtLeast;
}

export function isKnownStatus(status: string): boolean {
  return status in ROLE;
}

/** Columns whose status the map does not know, for the "As Kalos wrote it" disclosure. */
export function unknownStatuses(provenance: readonly ProvenanceEntry[]): ProvenanceEntry[] {
  return provenance.filter((c) => !isKnownStatus(c.status));
}

/** One sentence on the run sheet the model is working from. */
export function runSheetSentence(d: { dataset: string; n: number; features: readonly string[]; target: string }): string {
  const inputs = d.features.length === 1 ? "1 input" : `${d.features.length} inputs`;
  const runs = d.n === 1 ? "1 run" : `${d.n} runs`;
  return `The model is working from ${d.dataset}: ${runs}, ${inputs}, raising ${d.target}.`;
}
