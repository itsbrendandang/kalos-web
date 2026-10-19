// Column roles as the ENGINE read them (its provenance list), so names always match what the
// engine will accept back: duplicate headers renamed, empty columns dropped, sideways sheets
// transposed, and Excel files (whose header the browser cannot read) all come through the same way.
import type { ProvenanceEntry } from "@/lib/api";

export type SheetColumn = { name: string; status: string; usedAsInput: boolean; isTarget: boolean; note: string | null };

const NOTE: Record<string, string> = {
  dropped_id: "treated as an ID",
  dropped_sparse: "mostly empty or not numeric",
  dropped_constant_on_fitted_rows: "never changes in the fitted rows",
};

export function columnsFromProvenance(provenance: readonly ProvenanceEntry[] | undefined): SheetColumn[] {
  return (provenance ?? []).map((p) => ({
    name: p.name,
    status: p.status,
    usedAsInput: p.status === "kept_feature",
    isTarget: p.status === "target",
    note: NOTE[p.status] ?? (p.status.startsWith("dropped") ? p.status.replace(/^dropped_?/, "").replace(/_/g, " ") || "dropped" : null),
  }));
}

/** Candidate targets that survive across re-fits: the engine only lists the chosen target after a roles fit. */
export function mergeTargets(previous: readonly string[], fromEngine: readonly string[], usedRoles: boolean): string[] {
  if (usedRoles) return previous.length ? [...previous] : [...fromEngine];
  return [...fromEngine];
}
