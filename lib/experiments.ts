// Client for the kalos Experiments API (the FastAPI portal's /api/experiments/*
// routes - see kalos/docs/M2_INTEGRATION.md for the contract). Reuses the same
// engine base URL as lib/api.ts and the AnalyzeResult shape for `result`, since
// the portal populates it with exactly what /api/latest returns.
import { API, type AnalyzeResult } from "@/lib/api";

export type ExperimentStatus = "DRAFT" | "READY" | "PROCESSING" | "DONE" | "FAILED";

/** The lightweight row shape returned by the list endpoint. */
export type ExperimentSummary = {
  id: string;
  name: string;
  status: ExperimentStatus;
  updated_at: string;
};

export type ExperimentConfig = {
  target: string;
  outcomes?: string[];
  replicate_group_by?: string[];
  anonymize: boolean;
};

export type ExperimentPayload = {
  columns: string[];
  rows: Record<string, number | string>[];
};

export type ExperimentProvenance = {
  seed: number;
  engine_version: string;
  processed_at: string;
  noise_floor?: { icc: number; sigma: number };
};

/** The full experiment record, including the run sheet and (once DONE) the analysis. */
export type Experiment = {
  id: string;
  name: string;
  status: ExperimentStatus;
  created_at: string;
  updated_at: string;
  config: ExperimentConfig;
  payload: ExperimentPayload;
  result: AnalyzeResult | null;
  provenance: ExperimentProvenance | null;
  error: string | null;
};

/** Per-experiment outcome from POST /api/experiments/run-ready. */
export type RunReadySummary = {
  id: string;
  name: string;
  status: ExperimentStatus;
  error?: string | null;
};

/** The `AnalyzeResult` sections that a DONE experiment's rendered detail view
 *  depends on. `drivers`, `oof`, and `proposals` are typed as always-present
 *  on `AnalyzeResult` (lib/api.ts), but that type only describes what a fresh
 *  engine run returns - a DONE experiment's *persisted* result can predate
 *  the current schema (see the field comments in lib/api.ts acknowledging
 *  schema growth) and simply lack one of these arrays at runtime. */
export type ResultSection = "drivers" | "oof" | "proposals";

/** Which of `result`'s chart-backing sections are missing (not an array).
 *  Callers must check this before handing the field to a chart - e.g.
 *  `DriversBar` does `[...drivers].reverse()` with no guard and throws on
 *  `undefined`. */
export function missingResultSections(result: AnalyzeResult): ResultSection[] {
  const missing: ResultSection[] = [];
  if (!Array.isArray(result.drivers)) missing.push("drivers");
  if (!Array.isArray(result.oof)) missing.push("oof");
  if (!Array.isArray(result.proposals)) missing.push("proposals");
  return missing;
}

/** Thrown by every function below on a non-2xx response. Carries the HTTP
 *  status and, when the portal sent one, its documented `{ error }` message. */
export class ExperimentApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExperimentApiError";
    this.status = status;
  }
}

async function handle<T>(r: Response): Promise<T> {
  if (r.ok) {
    const body: unknown = await r.json();
    // The cast below trusts the portal's documented response shape - this is
    // not full runtime validation, just a guard against the degenerate case
    // (empty body, or a bare JSON primitive) that would otherwise smuggle a
    // useless value through as if it were a valid T.
    if (body === null || typeof body !== "object") {
      throw new ExperimentApiError(`experiments service returned an unexpected body for a ${r.status} response`, r.status);
    }
    return body as T;
  }
  let message = `experiments service responded ${r.status}`;
  try {
    const body: unknown = await r.json();
    if (body && typeof body === "object" && "error" in body && typeof (body as Record<string, unknown>).error === "string") {
      message = (body as Record<string, unknown>).error as string;
    }
  } catch {
    // Body wasn't JSON (or was empty) - fall back to the status-based message.
  }
  throw new ExperimentApiError(message, r.status);
}

export const listExperiments = (): Promise<ExperimentSummary[]> =>
  fetch(`${API}/api/experiments`).then((r) => handle<ExperimentSummary[]>(r));

export async function createExperiment(
  file: File,
  opts: { name: string; target: string; outcomes?: string; anonymize?: boolean },
): Promise<Experiment> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", opts.name);
  fd.append("target", opts.target);
  if (opts.outcomes) fd.append("outcomes", opts.outcomes);
  if (opts.anonymize != null) fd.append("anonymize", String(opts.anonymize));
  const r = await fetch(`${API}/api/experiments`, { method: "POST", body: fd });
  return handle<Experiment>(r);
}

export const getExperiment = (id: string): Promise<Experiment> =>
  fetch(`${API}/api/experiments/${id}`).then((r) => handle<Experiment>(r));

export async function patchStatus(id: string, status: ExperimentStatus): Promise<Experiment> {
  const r = await fetch(`${API}/api/experiments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return handle<Experiment>(r);
}

export async function runExperiment(id: string, force = false): Promise<Experiment> {
  const url = `${API}/api/experiments/${id}/run${force ? "?force=true" : ""}`;
  const r = await fetch(url, { method: "POST" });
  return handle<Experiment>(r);
}

export const runReady = (): Promise<RunReadySummary[]> =>
  fetch(`${API}/api/experiments/run-ready`, { method: "POST" }).then((r) => handle<RunReadySummary[]>(r));
