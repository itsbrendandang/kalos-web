// Client for the kalos portal's experiment list (GET /api/experiments), which
// the Experiments hub's Live view reads. Reuses the engine base URL from
// lib/api.ts.
import { API } from "@/lib/api";

export type ExperimentStatus = "DRAFT" | "READY" | "PROCESSING" | "DONE" | "FAILED";

/** The lightweight row shape returned by the list endpoint. */
export type ExperimentSummary = {
  id: string;
  name: string;
  status: ExperimentStatus;
  updated_at: string;
};

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
