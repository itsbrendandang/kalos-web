// plain-words: disclosure-only
/*
 * What the proposed runs were built from, read only from fields the engine
 * returns (lib/api.ts AnalyzeResult and RunRecord). Rendered inside the
 * "What these runs were built from" disclosure of the start dialog, so the
 * labels keep the engine's own words (version, build, seed, SHA-256).
 */
import type { PlanAnalysis } from "@/components/campaign/plan-view";
import { formatNumber } from "@/lib/format";
import { isUnknownBuild } from "@/components/campaign/plan/run-facts";

export const NOT_AVAILABLE = "Not available";

export type ProvenanceRow = { label: string; value: string; mono: boolean };

/**
 * A field the engine did not send reads "Not available"; nothing is filled in
 * from a guess. The engine reports no model version, so that row is always
 * "Not available".
 */
export function provenanceRows(d: PlanAnalysis): ProvenanceRow[] {
  const run = d.run;
  const seed = run?.seed ?? d.seed;
  const libs = run?.library_versions
    ? Object.entries(run.library_versions)
        .filter((e): e is [string, string] => typeof e[1] === "string")
        .map(([name, ver]) => `${name} ${ver}`)
    : [];
  return [
    { label: "Target", value: d.target, mono: false },
    { label: "Model version", value: NOT_AVAILABLE, mono: false },
    { label: "Engine version", value: d.engine_version ?? NOT_AVAILABLE, mono: true },
    { label: "Engine build", value: run?.build_sha && !isUnknownBuild(run.build_sha) ? run.build_sha : NOT_AVAILABLE, mono: true },
    { label: "Fit seed", value: seed != null ? String(seed) : NOT_AVAILABLE, mono: true },
    { label: "Input fingerprint (SHA-256)", value: run?.input_sha256 ?? NOT_AVAILABLE, mono: true },
    { label: "Measured runs in the model", value: formatNumber(d.n, "count"), mono: false },
    {
      label: "Runs in the lab when these were proposed",
      value: d.n_pending_considered != null ? formatNumber(d.n_pending_considered, "count") : NOT_AVAILABLE,
      mono: false,
    },
    { label: "Optimizer", value: d.proposal_optimizer ?? NOT_AVAILABLE, mono: false },
    { label: "Libraries", value: libs.length ? libs.join(", ") : NOT_AVAILABLE, mono: true },
  ];
}
