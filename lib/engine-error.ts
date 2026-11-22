/*
 * One reading of a failed engine response. The engine's error envelope is
 * { error, code } (kalos/portal/app.py); older engines send { error } or
 * FastAPI's { detail }. The proxy adds its own { error } on 502. Callers
 * branch on `kind`, never on the message text.
 */

export type EngineErrorKind =
  /** 502/504 or a network failure: the engine did not answer in time or at all. */
  | "unreachable"
  /** 503: the engine is busy (one analysis at a time) or a provider is down; retry later. */
  | "busy"
  /** 401/403: the proxy's token is missing or lacks the scope. */
  | "auth"
  /** 429: too many requests. */
  | "rate_limited"
  /** 404 */
  | "not_found"
  /** 409: the state changed or needs confirmation (`code` says which). */
  | "conflict"
  /** 400/413/422: the request was refused for a stated reason. */
  | "rejected"
  /** 5xx other than the above. */
  | "server";

export class EngineError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly kind: EngineErrorKind;
  /** Seconds from Retry-After, when the engine sent one. */
  readonly retryAfter: number | null;

  constructor(message: string, status: number, code: string | null, retryAfter: number | null) {
    super(message);
    this.name = "EngineError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.kind = kindFor(status);
  }
}

export function kindFor(status: number): EngineErrorKind {
  if (status === 0 || status === 502 || status === 504) return "unreachable";
  if (status === 503) return "busy";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status >= 400 && status < 500) return "rejected";
  return "server";
}

/** The message and code in an engine error body, whatever generation of engine sent it. */
export function parseErrorBody(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { message: null, code: null };
  const b = body as { error?: unknown; code?: unknown; detail?: unknown };
  const code = typeof b.code === "string" ? b.code : null;
  if (typeof b.error === "string") return { message: b.error, code };
  if (typeof b.detail === "string") return { message: b.detail, code };
  return { message: null, code };
}

/** Build an EngineError from a non-ok Response. Never throws. */
export async function engineError(r: Response): Promise<EngineError> {
  let parsed: { message: string | null; code: string | null } = { message: null, code: null };
  try {
    parsed = parseErrorBody(await r.json());
  } catch {
    // Not JSON: keep the status-based message.
  }
  const ra = Number(r.headers.get("retry-after"));
  return new EngineError(parsed.message ?? `engine responded ${r.status}`, r.status, parsed.code, Number.isFinite(ra) && ra > 0 ? ra : null);
}

/** A plain sentence for an error, for places that show one line. */
export function describeEngineError(e: unknown): string {
  if (!(e instanceof EngineError)) return "The analysis service did not respond. Check the connection and try again.";
  switch (e.kind) {
    case "unreachable":
      return "The analysis service did not respond in time. It may still be working; check again in a minute.";
    case "busy":
      if (e.code === "assist_provider_unavailable") return "The assistant's language model could not be reached. Search and the rest of Kalos still work.";
      return `The analysis service is busy with another request.${e.retryAfter ? ` Try again in about ${Math.ceil(e.retryAfter)} s.` : " Try again shortly."}`;
    case "auth":
      return "This app is not allowed to make that request. The engine token is missing or lacks permission.";
    case "rate_limited":
      return `Too many requests.${e.retryAfter ? ` Try again in about ${Math.ceil(e.retryAfter)} s.` : " Try again shortly."}`;
    default:
      return e.message;
  }
}
