// Provider-neutral view of an authenticated session.
//
// Everything downstream of authentication (engine-token minting, scope
// mapping, tenant resolution, step-up checks) depends ONLY on this shape.
// Each auth provider integration (Better Auth preferred; WorkOS documented
// as an alternative) is responsible for producing a SessionContext from a
// session it has already validated server-side. See
// docs/AUTH_PROVIDER_INTERFACE.md for the contract.
//
// Never build a SessionContext from client-supplied data (headers, query,
// body, non-HttpOnly cookies): only from the provider's verified session.

export interface SessionContext {
  /** Stable provider user id. Becomes the engine token `sub`. */
  userId: string;
  /** Provider session id. Becomes the engine token `sid`. */
  sessionId: string;
  /**
   * The provider's id for the ACTIVE organization, or null when the session
   * has none selected. Mapped to an internal tenant id by resolveTenant();
   * never used as a tenant id directly.
   */
  orgId: string | null;
  /** Role slug(s) in the active organization (e.g. "viewer" | "member" | "admin"). */
  role?: string | null;
  roles?: readonly string[] | null;
  /** Permission slugs in the active organization, when the provider supplies them. */
  permissions?: readonly string[] | null;
  /** When the user last actively authenticated (unix seconds), or null if unknown. Unknown = stale. */
  authenticatedAt: number | null;
  /** Whether the current session satisfied MFA. */
  mfaVerified: boolean;
}

/** Step-up window for destructive actions. */
export const RECENT_AUTH_MAX_AGE_SECONDS = 300;

/** True when the user authenticated within `maxAgeSeconds`. Fails closed on unknown/future/invalid times. */
export function isRecentlyAuthenticated(
  session: Pick<SessionContext, "authenticatedAt">,
  maxAgeSeconds: number = RECENT_AUTH_MAX_AGE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const t = session.authenticatedAt;
  if (typeof t !== "number" || !Number.isFinite(t)) return false;
  const age = nowSeconds - t;
  // Small allowance for clock skew on the "future" side only.
  return age >= -30 && age <= Math.min(maxAgeSeconds, RECENT_AUTH_MAX_AGE_SECONDS);
}
