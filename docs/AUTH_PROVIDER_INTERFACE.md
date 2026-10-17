# Auth provider interface (SessionContext)

Status: **Better Auth implements this contract** (`lib/server/session.ts`,
see [AUTH.md](AUTH.md)). Sign-in, MFA and organizations are live; the engine
proxy does not consume the `SessionContext` yet (step W2), so no engine token
is minted on a live request so far. WorkOS AuthKit remains a documented
alternative only (not installed); any provider must meet the same contract.

## The contract

A provider integration validates its own session **server-side** and produces
a `SessionContext` (`lib/server/session-context.ts`):

| Field | Type | Meaning |
| --- | --- | --- |
| `userId` | string | Stable provider user id. Becomes engine token `sub`. |
| `sessionId` | string | Provider session id. Becomes engine token `sid`. |
| `orgId` | string \| null | Provider id of the **active** organization; null if none selected. Never used as a tenant id directly. |
| `role` / `roles` | string / string[] | Role slug(s) in the active org: `viewer`, `member`, `admin`. |
| `permissions` | string[] | Permission slugs in the active org, if the provider has them. |
| `authenticatedAt` | number \| null | Unix seconds of the last active sign-in. Unknown = stale. |
| `mfaVerified` | boolean | Whether this session satisfied MFA. |

Rules for every provider:

- Build it only from the provider's verified session (signed/encrypted
  HttpOnly cookie or server-side session lookup). Never from headers, query,
  body or anything the browser can set.
- No session means 401 JSON for `/api/*` (never a redirect) and a redirect to
  sign-in for pages. `orgId === null` means 403 for `/api/*` and a redirect to
  an org picker that only offers the user's own memberships.
- No bypass switch. Tests replace the provider with a module mock, not an env var.

## What happens downstream (provider-neutral, already implemented)

1. **Tenant**: `resolveTenant(orgId)` (`lib/server/tenants.ts`) maps the
   provider org id to a stable internal tenant id from the operator's JSON file
   (`KALOS_TENANT_MAP_FILE`, `{ "<provider org id>": "<tenant>" }`). Tenant ids
   must match `^[A-Za-z0-9_-]{1,64}$`. An unmapped org, or a malformed map,
   resolves to null and the caller answers 403. Switching providers means
   re-keying this file, not moving data.
2. **Scopes**: `scopesForClaims(session)` (`lib/server/scopes.ts`).
   `permissions` are authoritative when present (exact slugs `campaigns:read`,
   `campaigns:write`, `org:admin`); otherwise roles map viewer -> read,
   member -> read + write, admin -> read + write + `org:admin`. Empty result:
   403, no engine call. GET/HEAD need `campaigns:read`; other methods need
   `campaigns:write`.
3. **Step-up**: `isRecentlyAuthenticated(session)` is true only if
   `authenticatedAt` is within 300 s. Destructive engine calls must require it.
4. **Engine token**: `mintEngineTokenForSession(session, tenant, scopes)`
   (`lib/server/engine-token.ts`): EdDSA (Ed25519), header `kid`, claims
   `iss=kalos-web`, `aud=kalos-engine`, `sub`, `tenant`, `scopes`, `sid`,
   `jti` (UUID), `iat`, `nbf`, `exp` (TTL hard-clamped to 120 s). Key from
   `KALOS_ENGINE_JWT_PRIVATE_KEY_FILE` (PKCS#8 PEM), id from
   `KALOS_ENGINE_JWT_KID`; one key pair per environment.

## Shared test vectors

`__tests__/vectors/engine-token.json` (regenerate with
`node scripts/gen-engine-token-vectors.mjs`) holds valid and invalid tokens and
scope-mapping cases for the engine's verifier tests. Its key pairs are
**test-only**, generated for that file and valid nowhere.

## Provider mappings

### Better Auth (implemented)

`resolveSession()` / `getSessionContext()` / `requireApiSession()` in
`lib/server/session.ts`:

| Field | Source |
| --- | --- |
| `userId`, `sessionId` | `user.id`, `session.id` from Better Auth's DB session lookup (cookie cache off). |
| `orgId` | `member.organizationId` for (user, `session.activeOrganizationId`) **re-read from the member table on every call**; the session field is only a hint. A user with exactly one membership needs no selection. No valid membership → `null`. |
| `role` / `roles` | `member.role` (comma-separated in Better Auth), known roles only: `owner`, `admin`, `member`, `viewer`. |
| `permissions` | Flattened from the role's `createAccessControl` statements: viewer `campaigns:read`; member + `campaigns:write`; admin/owner + `campaigns:archive`, `org:admin`. |
| `authenticatedAt` | `session.mfaVerifiedAt` (last second-factor proof; re-stamped by step-up). |
| `mfaVerified` | `mfaVerifiedAt` set - only the two-factor verify endpoints can set it. Sessions without it never produce a `SessionContext` (state `mfa_required`). |

`role: "owner"` is never used by the role fallback in `scopesForClaims`
because Better Auth always supplies `permissions`.

### WorkOS AuthKit (documented alternative, not installed)

`withAuth()` gives `organizationId`, `role`/`roles`, `permissions`,
`sessionId`; `authenticatedAt` from the access token's `auth_time` claim;
`mfaVerified` from the authentication method. Switching providers means
re-keying the tenant map, not moving data.
