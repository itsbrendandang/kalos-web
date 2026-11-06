// One place that turns an engine or proxy error code into a sentence a scientist can act on.
// Raw codes (payload_too_large, engine_busy, ...) are never shown; the code only selects the copy.
// The codes come from lib/server/engine-proxy.ts (its own failures) and from the engine's 400 bodies.
// On screen the service is "Kalos", never "the engine"; each code also carries its why-line (lib/why.ts).
import { whyLine } from "@/lib/why";

/** A failed engine or proxy call, typed so callers branch on `code`, not on message text. */
export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Upload limit in MB, when the proxy said so (payload_too_large). */
    readonly limitMb?: number,
    /** The engine's own sentence from a body that had no machine code. Only used when no code maps to copy. */
    readonly detail?: string,
  ) {
    super(`Kalos answered ${status}`);
    this.name = "EngineError";
  }
}

export type EngineMessage = {
  /** Plain sentence for the page. Never contains the raw code. */
  message: string;
  /** The session is gone: the page should send the user to sign in. */
  signIn: boolean;
  /** The engine's own sentence, kept verbatim for a secondary line labelled ENGINE_TEXT_LABEL. Never a bare code. Absent or null when there is none. */
  engineText?: string | null;
  /** The "Why this matters" line for the code (lib/why.ts), shown under the sentence; null when the code has none. */
  why?: string | null;
};

/** The label over the engine's own sentence, wherever a page keeps it one click down. */
export const ENGINE_TEXT_LABEL = "As Kalos wrote it";

const GENERIC = "Kalos could not use this file. Check the sheet and try again.";

type Context = { limitMb?: number; limitRows?: number | null };

const KNOWN: Record<string, (ctx: Context) => EngineMessage> = {
  payload_too_large: ({ limitMb }) => ({
    message: `This file is over the ${limitMb != null ? `${limitMb} MB` : "upload"} limit. Remove the sheets or rows you do not need, or ask your administrator to raise the limit.`,
    signIn: false,
  }),
  // The engine refuses a fit over its complete-row cap with no code (only the sentence); see fitRowCap.
  fit_rows_over_cap: ({ limitRows }) => ({
    message:
      `The model takes at most ${limitRows != null ? limitRows.toLocaleString("en-US") : "a fixed number of"} complete runs, and this sheet has more. ` +
      "Each measured result adds a run, so a campaign can outgrow the limit. To keep going, upload a smaller sheet on Setup with the oldest runs removed (Setup asks before it replaces runs), or ask your administrator to raise the limit.",
    signIn: false,
  }),
  unauthenticated: () => ({ message: "Your sign-in has expired. Sign in again to continue.", signIn: true }),
  rate_limited: () => ({ message: "Too many requests in a short time. Wait a minute and try again.", signIn: false }),
  engine_busy: () => ({ message: "Kalos is busy with other work. Try again in a moment.", signIn: false }),
  engine_error: () => ({ message: "Kalos hit an error. Try again in a moment.", signIn: false }),
  engine_unreachable: () => ({ message: "Could not reach Kalos. This is a connection problem, not a result; nothing you entered is lost. Try again in a moment.", signIn: false }),
  engine_timeout: () => ({ message: "The work took too long and was stopped. Try again, or use a smaller sheet.", signIn: false }),
  engine_auth_failed: () => ({
    message: "Kalos could not confirm who you are. Try again; if it keeps happening, sign in again.",
    signIn: false,
  }),
  campaign_has_runs: () => ({ message: "This campaign already has runs. Replacing the sheet discards them.", signIn: false }),
  too_few_rows: () => ({ message: "This sheet has too few runs to build a model from. Add more measured runs.", signIn: false }),
  too_few_complete_rows: () => ({
    message: "Too few runs have a value for the target and every input. Fill in or remove runs with blank cells.",
    signIn: false,
  }),
  target_constant: () => ({ message: "The target column never changes in this sheet, so there is nothing to learn from. Choose a column that varies.", signIn: false }),
  ambiguous_header: () => ({ message: "Kalos could not tell which row holds the column names. Make the first row the header and try again.", signIn: false }),
  sheet_not_found: () => ({ message: "That worksheet is not in this file. Choose one from the list.", signIn: false }),
};

/** A bare machine code: lowercase words joined by underscores, no spaces. */
const isCodeLike = (s: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(s);

/**
 * The engine's refusal of a fit over its complete-row cap (kalos/portal/uploads.py `_ERR_TOO_MANY_FIT_ROWS`).
 * It is sent with no `code`, so the sentence is the only signal. Returns the cap when the sentence names it, or null.
 */
export function fitRowCap(text: string): { limitRows: number | null } | null {
  if (!/too large for the surrogate/i.test(text)) return null;
  const m = /N<=(\d+)/.exec(text);
  return { limitRows: m ? Number(m[1]) : null };
}

/**
 * The plain copy for a failed call. `code` wins; a bare code in `error` (how the proxy sends its own
 * failures) is treated the same; otherwise the engine's own human sentence is used.
 */
export function engineMessage(input: { code?: string | null; error?: string | null; limitMb?: number }): EngineMessage {
  const key = input.code && input.code.length > 0 ? input.code : input.error && isCodeLike(input.error) ? input.error : null;
  const known = key && Object.prototype.hasOwnProperty.call(KNOWN, key) ? KNOWN[key] : undefined;
  if (known) return { ...known({ limitMb: input.limitMb }), why: whyLine(key!) };
  // An unknown code, or none: the engine's own sentence when it sent one, never a bare code.
  const text = input.error?.trim();
  const cap = text ? fitRowCap(text) : null;
  if (cap) return { ...KNOWN.fit_rows_over_cap({ limitRows: cap.limitRows }), engineText: text, why: whyLine("fit_rows_over_cap") };
  return { message: text && !isCodeLike(text) ? text : GENERIC, signIn: false, why: whyLine("generic") };
}

/** Learn's plain fallback when the engine sent only its own sentence (or nothing): no engine vocabulary. */
export const LEARN_FALLBACK = "Kalos could not update the model. Try again in a moment.";

/**
 * Learn's failed model update: the plain reason and the next step first, and the engine's own sentence kept
 * aside as `engineText` (for the "As Kalos wrote it" line). A sentence the copy does not map to, or no sentence,
 * never becomes the reason. A bare machine code is never shown anywhere.
 */
export function learnFailure(err: unknown): EngineMessage {
  const copy = errorMessage(err);
  const raw = err instanceof EngineError ? (err.detail ?? "").trim() : "";
  const engineText = copy.engineText || (raw && !isCodeLike(raw) ? raw : null);
  const plain = copy.message === raw || copy.message === GENERIC;
  return { message: plain ? LEARN_FALLBACK : copy.message, signIn: copy.signIn, engineText: engineText || null, why: plain ? whyLine("engine_error") : (copy.why ?? null) };
}

/** Copy for anything thrown by a call: a typed EngineError, or an unexpected failure (network, bug). */
export function errorMessage(err: unknown): EngineMessage {
  if (err instanceof EngineError) return engineMessage({ code: err.code, error: err.detail, limitMb: err.limitMb });
  return { message: "Could not reach Kalos. This is a connection problem, not a result; nothing you entered is lost. Try again in a moment.", signIn: false, why: whyLine("engine_unreachable") };
}
