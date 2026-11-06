import type { ProvenanceEntry } from "@/lib/api";

/**
 * Plain words for each column status the engine emits in its provenance list.
 * Anything not listed here renders as "Not used" and the raw status is shown
 * only inside the "Engine detail" disclosure, never rewritten into prose.
 */
const ROLE: Record<string, string> = {
  kept_feature: "Process input",
  target: "The result being raised",
  dropped_id: "Not used: treated as a run label",
  dropped_output: "Not used: looks like a measured output",
  dropped_constant: "Not used: never changes",
  dropped_constant_on_fitted_rows: "Not used: never changes in the fitted rows",
  dropped_all_blank: "Not used: no values",
  dropped_non_numeric: "Not used: mostly text",
  // The engine's catch-all: a column it did not pick, with no specific reason. The counts beside it say the rest.
  dropped_sparse: "Not used: left out by the engine",
};

export const UNKNOWN_ROLE = "Not used";

export function roleLabel(status: string): string {
  return ROLE[status] ?? UNKNOWN_ROLE;
}

export function isKnownStatus(status: string): boolean {
  return status in ROLE;
}

/** Columns whose status the role map does not know, for the "Engine detail" disclosure. */
export function unknownStatuses(provenance: readonly ProvenanceEntry[]): ProvenanceEntry[] {
  return provenance.filter((c) => !isKnownStatus(c.status));
}

/** One sentence on the run sheet the model is working from. */
export function runSheetSentence(d: { dataset: string; n: number; features: readonly string[]; target: string }): string {
  const inputs = d.features.length === 1 ? "1 input" : `${d.features.length} inputs`;
  const runs = d.n === 1 ? "1 run" : `${d.n} runs`;
  return `The model is working from ${d.dataset}: ${runs}, ${inputs}, raising ${d.target}.`;
}
