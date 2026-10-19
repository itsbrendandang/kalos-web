/**
 * Plain copy for a failed second-factor request. Switches on the Better Auth
 * error `code` first (the server's own name for the cause), then on the HTTP
 * status only as a fallback for responses without a code.
 *
 * Server sources (lib/server/auth-config.mjs):
 *  - 503 MFA_ACCOUNTING_TIMEOUT / SESSION_LOOKUP_FAILED: the server could not
 *    check the code. Not the user's fault; nothing was counted against them.
 *  - 401 INVALID_CODE / INVALID_BACKUP_CODE: a wrong code.
 *  - 429 TWO_FACTOR_LOCKED: too many wrong codes for this account, for now.
 *  - 401 SESSION_REVOKED: too many wrong codes on this session; it was ended.
 *  - 401 TOTP_REPLAYED: this code was already accepted once.
 *  - 401 SESSION_NOT_FOUND or any other 401: the sign-in is no longer valid.
 */
export function mfaErrorText(status: number, data: Record<string, unknown> | null): string {
  const code = typeof data?.code === "string" ? data.code : "";
  if (code === "MFA_ACCOUNTING_TIMEOUT" || code === "SESSION_LOOKUP_FAILED" || (!code && status === 503)) {
    return "We could not check your code just now. Wait a moment and try again.";
  }
  if (code === "SESSION_REVOKED") return "Too many wrong codes, so this sign-in was ended. Sign in again.";
  if (code === "TWO_FACTOR_LOCKED" || (!code && status === 429)) return "Too many wrong codes. Try again later.";
  if (code === "TOTP_REPLAYED") return "That code was already used. Wait for the next one.";
  if (code === "INVALID_CODE" || code === "INVALID_BACKUP_CODE") return "That code is not right. Check your authenticator app and try again.";
  if (status === 401) return "Your sign-in expired. Sign in again.";
  return "That code is not right. Check your authenticator app and try again.";
}
