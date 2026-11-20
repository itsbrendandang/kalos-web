/*
 * Where a number came from (VIZ_SPEC 2.7). Every hero number, table row and
 * chart mark can show one of these: the engine field, the dataset, the input
 * hash, the engine build and the analysis time. Pure; built only from what the
 * engine sent, so a missing part is simply absent.
 */
import type { AnalyzeResult, Campaign, CampaignRun } from "@/lib/api";
import type { Basis } from "@/lib/num";

export type Source = {
  label: string;
  field: string;
  basis: Basis;
  dataset?: string;
  inputSha256?: string;
  engineVersion?: string;
  buildSha?: string;
  seed?: number;
  timestamp?: number;
  runId?: string;
  method?: string;
};

type AnalysisLike = Pick<AnalyzeResult, "run" | "engine_version" | "seed" | "timestamp"> & { dataset?: string; updated?: number };

const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;

/** A number read from an analysis. */
export function sourceFromAnalysis(d: AnalysisLike, field: string, basis: Basis, method?: string): Source {
  const dataset = d.run?.filename ?? d.dataset;
  return defined({
    label: dataset ? `Analysis of ${dataset}` : "Engine analysis",
    field,
    basis,
    dataset,
    inputSha256: d.run?.input_sha256,
    engineVersion: d.engine_version,
    buildSha: d.run?.build_sha,
    seed: d.seed ?? d.run?.seed,
    timestamp: d.timestamp ?? d.updated,
    method,
  });
}

/** A run's measured result, or its prediction when `basis` is "predicted". */
export function sourceFromRun(c: Pick<Extract<Campaign, { has_campaign: true }>, "target">, run: CampaignRun, basis: Basis = "measured"): Source {
  const prov = run.analysis_provenance ?? undefined;
  return defined({
    label: basis === "measured" ? `Measured result of run ${run.id.slice(0, 7)}` : `Prediction for run ${run.id.slice(0, 7)}`,
    field: basis === "measured" ? `campaign.pending[id=${run.id}].result` : `campaign.pending[id=${run.id}].pred`,
    basis,
    runId: run.id,
    inputSha256: prov?.input_sha256,
    engineVersion: prov?.engine_version,
    seed: prov?.seed,
    timestamp: basis === "measured" ? (run.result_recorded_at ?? run.measured_at ?? undefined) : prov?.timestamp,
  });
}

/** A number from the campaign summary (best measured, history, counts). */
export function sourceFromCampaign(field: string, basis: Basis, label = "Campaign summary"): Source {
  return { label, field, basis };
}

/** The ordered "label: value" pairs a source popover lists. */
export function sourceLines(s: Source): [string, string][] {
  const t = s.timestamp != null ? new Date((s.timestamp < 1e12 ? s.timestamp * 1000 : s.timestamp)).toISOString().replace("T", " ").slice(0, 16) + " UTC" : undefined;
  const rows: [string, string | number | undefined][] = [
    ["Field", s.field],
    ["Basis", s.basis],
    ["Dataset", s.dataset],
    ["Run", s.runId],
    ["Input SHA-256", s.inputSha256],
    ["Engine", s.engineVersion],
    ["Build", s.buildSha],
    ["Seed", s.seed],
    ["Time", t],
    ["Method", s.method],
  ];
  return rows.filter((r): r is [string, string | number] => r[1] !== undefined && r[1] !== "").map(([k, v]) => [k, String(v)]);
}
