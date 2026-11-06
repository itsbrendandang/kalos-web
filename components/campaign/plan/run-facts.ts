// plain-words: disclosure-only
/*
 * The engine's own account of how this round was made, for the Method
 * disclosure on Plan: the facts it recorded about the model run, and the
 * method behind the likely range. The labels keep the engine's names
 * (fingerprint, seed, build) because they are only ever one click down.
 */
import type { RunRecord } from "@/lib/api";

/** The method behind the likely range, for a disclosure. */
export const BAND_METHOD = "Conformal band at the stated coverage, measured on held-out measured runs; one width for every proposed recipe, and not guaranteed for new recipes.";

/** The facts the engine recorded about this run of the model, as label/value rows. Only fields present on `run` are returned. */
export function runFacts(run: RunRecord | null | undefined): { label: string; value: string }[] {
  if (!run) return [];
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value != null && value !== "") rows.push({ label, value });
  };
  if (run.kind === "upload") add("Source", "Run sheet upload");
  else if (run.kind === "reanalyze") add("Source", "Model update with the campaign's recorded runs");
  if (run.profile === "bioprocess") add("Columns", "Read from their names (bioprocess profile)");
  else if (run.profile === "generic") add("Columns", "Chosen by you (generic profile)");
  if (run.input_sha256) add("Sheet fingerprint (SHA-256)", run.input_sha256.slice(0, 12));
  if (run.anonymize !== true) add("Sheet", run.sheet ?? undefined);
  if (typeof run.n_rows === "number") add("Runs fitted", run.n_rows.toLocaleString("en-US"));
  if (typeof run.n_features === "number") add("Inputs modeled", run.n_features.toLocaleString("en-US"));
  if (typeof run.pending_runs === "number") add("Runs in the lab when proposed", run.pending_runs.toLocaleString("en-US"));
  if (typeof run.seed === "number") add("Fit seed", String(run.seed));
  if (run.torch_threads !== undefined) add("Threads", run.torch_threads === null ? "not pinned" : String(run.torch_threads));
  if (run.library_versions) {
    const v = Object.entries(run.library_versions)
      .filter(([, ver]) => typeof ver === "string")
      .map(([name, ver]) => `${name} ${ver}`);
    add("Libraries", v.length ? v.join(", ") : null);
  }
  if (run.build_sha) add("Engine build", run.build_sha.slice(0, 12));
  return rows;
}
