// Where the insecure development secret may be used. Shared by auth.ts (the
// secret resolver), boot-check.ts (whether the boot check runs) and tests.
// Plain ESM (with secret-policy.d.mts) so the node scripts and the auth
// config can import it without a TS loader. Imports nothing.

/** Public, known to everyone who reads this file. Only for local development. */
export const DEV_ONLY_INSECURE_SECRET = "dev-only-insecure-secret-change-me-0123456789";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when the URL's host is localhost, 127.0.0.1 or [::1]. */
export function isLoopbackUrl(raw) {
  if (!raw) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(String(raw).trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The dev fallback secret is allowed ONLY when
 *   - NODE_ENV is "development" or "test", AND
 *   - BETTER_AUTH_URL is set and loopback (localhost, 127.0.0.1, [::1]).
 * An unset BETTER_AUTH_URL gets no fallback in any environment, tests included:
 * the public secret could otherwise decrypt TOTP secrets in a database. Tests
 * that need a secret pass an explicit one (tests/auth-integration/helpers.mjs).
 * A development or test process pointed at a real origin (a deployed container
 * with NODE_ENV=development, say) gets no fallback and runs the boot check.
 */
export function devFallbackAllowed(env) {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test") return false;
  const url = env.BETTER_AUTH_URL?.trim();
  if (!url) return false;
  return isLoopbackUrl(url);
}

/** The production boot check runs unless the dev fallback is allowed (B-4, C-3). */
export function bootCheckRequired(env) {
  return !devFallbackAllowed(env);
}
