// Pure mapping from a session's authorization data (permissions, role,
// roles - see SessionContext in lib/server/session-context.ts) to the scopes
// kalos-web puts in the engine token. Provider-neutral, no I/O, no env: the
// engine repo's tests reuse the same rules through
// __tests__/vectors/engine-token.json, so this file is the single definition.
//
// Rules (docs/AUTH_PROVIDER_INTERFACE.md):
// - `permissions` are authoritative when the session carries any: each
//   permission whose slug is exactly an engine scope name passes through,
//   anything else is ignored. Whatever the auth provider's admin config
//   assigns per role is then the source of truth.
// - Only when the token has NO permissions do we fall back to the role
//   slug(s): viewer -> read; member -> read + write; admin -> read + write +
//   org:admin. Unknown roles map to nothing.
// - An empty result means "no access": the caller must answer 403 and must
//   not call the engine.

import type { SessionContext } from "@/lib/server/session-context";

export const ENGINE_SCOPES = ["campaigns:read", "campaigns:write", "org:admin"] as const;
export type EngineScope = (typeof ENGINE_SCOPES)[number];

const ROLE_SCOPES: Readonly<Record<string, readonly EngineScope[]>> = Object.freeze({
  viewer: ["campaigns:read"],
  member: ["campaigns:read", "campaigns:write"],
  admin: ["campaigns:read", "campaigns:write", "org:admin"],
});

/** The authorization subset of SessionContext the mapping reads. */
export type AuthorizationClaims = Pick<SessionContext, "permissions" | "role" | "roles">;

function isEngineScope(value: unknown): value is EngineScope {
  return typeof value === "string" && (ENGINE_SCOPES as readonly string[]).includes(value);
}

/** Engine scopes for a session, in canonical ENGINE_SCOPES order, deduplicated. */
export function scopesForClaims(claims: AuthorizationClaims): EngineScope[] {
  const granted = new Set<EngineScope>();
  const permissions = Array.isArray(claims.permissions) ? claims.permissions : [];

  if (permissions.length > 0) {
    for (const p of permissions) if (isEngineScope(p)) granted.add(p);
  } else {
    const roles = new Set<string>();
    if (typeof claims.role === "string") roles.add(claims.role);
    if (Array.isArray(claims.roles)) for (const r of claims.roles) if (typeof r === "string") roles.add(r);
    for (const role of roles) {
      // Own-property lookup only: a role slug like "constructor" or
      // "__proto__" must not reach Object.prototype.
      if (!Object.prototype.hasOwnProperty.call(ROLE_SCOPES, role)) continue;
      for (const s of ROLE_SCOPES[role]) granted.add(s);
    }
  }

  return ENGINE_SCOPES.filter((s) => granted.has(s));
}

/** The scope an engine request needs: reads need campaigns:read, anything else campaigns:write. */
export function requiredScopeForMethod(method: string): EngineScope {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD" ? "campaigns:read" : "campaigns:write";
}
