// One place that turns an engine or proxy error code into a sentence a scientist can act on.
// Raw codes (payload_too_large, engine_busy, ...) are never shown; the code only selects the copy.
// The codes come from lib/server/engine-proxy.ts (its own failures) and from the engine's 400 bodies.

/** A failed engine or proxy call, typed so callers branch on `code`, not on message text. */
export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Upload limit in MB, when the proxy said so (payload_too_large). */
    readonly limitMb?: number,
  ) {
    super(`engine responded ${status}`);
    this.name = "EngineError";
  }
}

export type EngineMessage = {
  /** Plain sentence for the page. Never contains the raw code. */
  message: string;
  /** The session is gone: the page should send the user to sign in. */
  signIn: boolean;
};

const GENERIC = "The analysis service could not use this file. Check the sheet and try again.";

const KNOWN: Record<string, (limitMb?: number) => EngineMessage> = {
  payload_too_large: (limitMb) => ({
    message: `This file is over the ${limitMb != null ? `${limitMb} MB` : "upload"} limit. Remove the sheets or rows you do not need, or ask your administrator to raise the limit.`,
    signIn: false,
  }),
  unauthenticated: () => ({ message: "Your sign-in has expired. Sign in again to continue.", signIn: true }),
  rate_limited: () => ({ message: "Too many requests in a short time. Wait a minute and try again.", signIn: false }),
  engine_busy: () => ({ message: "The analysis service is busy with other fits. Try again in a moment.", signIn: false }),
  engine_error: () => ({ message: "The analysis service hit an error. Try again in a moment.", signIn: false }),
  engine_unreachable: () => ({ message: "The analysis service did not respond. Try again in a moment.", signIn: false }),
  engine_timeout: () => ({ message: "The analysis took too long and was stopped. Try again, or use a smaller sheet.", signIn: false }),
  engine_auth_failed: () => ({
    message: "The analysis service could not verify this session. Try again; if it keeps happening, sign in again.",
    signIn: false,
  }),
  campaign_has_runs: () => ({ message: "This campaign already has runs. Replacing the data discards them.", signIn: false }),
  too_few_rows: () => ({ message: "This sheet has too few rows to fit a model. Add more measured runs.", signIn: false }),
  too_few_complete_rows: () => ({
    message: "Too few rows are complete across the target and the inputs. Fill in or remove rows with blank cells.",
    signIn: false,
  }),
  target_constant: () => ({ message: "The target column never changes in this sheet, so there is nothing to learn from. Choose a column that varies.", signIn: false }),
  ambiguous_header: () => ({ message: "The analysis service could not tell which row holds the column names. Make the first row the header and try again.", signIn: false }),
  sheet_not_found: () => ({ message: "That worksheet is not in this file. Choose one from the list.", signIn: false }),
};

/** A bare machine code: lowercase words joined by underscores, no spaces. */
const isCodeLike = (s: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(s);

/**
 * The plain copy for a failed call. `code` wins; a bare code in `error` (how the proxy sends its own
 * failures) is treated the same; otherwise the engine's own human sentence is used.
 */
export function engineMessage(input: { code?: string | null; error?: string | null; limitMb?: number }): EngineMessage {
  const key = input.code && input.code.length > 0 ? input.code : input.error && isCodeLike(input.error) ? input.error : null;
  const known = key ? KNOWN[key] : undefined;
  if (known) return known(input.limitMb);
  // An unknown code, or none: the engine's own sentence when it sent one, never a bare code.
  const text = input.error?.trim();
  return { message: text && !isCodeLike(text) ? text : GENERIC, signIn: false };
}

/** Copy for anything thrown by a call: a typed EngineError, or an unexpected failure (network, bug). */
export function errorMessage(err: unknown): EngineMessage {
  if (err instanceof EngineError) return engineMessage({ code: err.code, limitMb: err.limitMb });
  return { message: "The analysis service did not respond. Try again in a moment.", signIn: false };
}
