# Engine proxy: authentication, tokens and setup (W2)

`/api/engine/*` is the only way the browser reaches the kalos engine. The
browser never talks to the engine, never sees its URL, its tokens or a tenant
id. This page covers how the proxy decides, what the engine must trust, how to
set it up and rotate it, and the **deployment sequencing** the engine needs.

Code: `app/api/engine/[...path]/route.ts` (wiring), `lib/server/engine-proxy.ts`
(the pipeline, in order), `lib/server/session.ts` (`requireApiSession`),
`lib/server/tenants.ts`, `lib/server/scopes.ts`, `lib/server/engine-routes.ts`,
`lib/server/csrf.ts`, `lib/server/engine-token.ts`, `scripts/engine-jwks.mjs`.
Tests: `__tests__/engine-proxy.test.ts` (unit, fake DB behind the real
resolver), `tests/auth-integration/engine-proxy.int.ts` (real Better Auth DB,
real key file, real tenant map; only the engine is faked).

## 1. What happens to one request

Each step fails closed; nothing reaches the engine until all of them pass.

| # | Check | Failure |
|---|---|---|
| 1 | Method in {GET, HEAD, POST, PATCH, DELETE}; path matches the **exact** route table (method + segment pattern). Raw path has no `%2f %5c %2e %25 %00`, no `\`, no `.`/`..` segment; decoded segments have no `/ \ ? # %`, control chars, `.`/`..`, or empty value. | 405 / 404 |
| 2 | Query ≤ 2 KB, no control characters; re-serialised, never forwarded raw. | 400 |
| 3 | CSRF / origin (below). Body type per route: JSON or multipart only. | 403 / 415 |
| 4 | **`requireApiSession()`** on the cookie header ONLY: Better Auth looks the session up in its database (no cookie cache), MFA must be satisfied, and the organization comes from the `member` table. | 401 anonymous/expired/revoked; 403 `mfa_required`; 403 `no_organization` |
| 5 | Tenant = `KALOS_TENANT_MAP_FILE[orgId]`. Unmapped, malformed, or `default` (the engine's anonymous tenant) → 403. | 403 `organization_not_provisioned` |
| 6 | Scopes: the member-table role gives the scopes; the route needs `campaigns:read` (GET/HEAD) or `campaigns:write`; archive/unarchive also needs `org:admin` and a second factor within 300 s. | 403 `insufficient_scope` / `step_up_required` |
| 7 | Rate limits (per session, per session-writes, per tenant; in memory, one replica). | 429 |
| 8 | Body cap: JSON 1 MiB (`KALOS_PROXY_MAX_JSON_BYTES`), uploads per `KALOS_MAX_UPLOAD_MB`; checked on `Content-Length` and while streaming. | 413 |
| 9 | Mint a 60 s EdDSA token for this one request; forward with an allow-listed header set and a timeout (`KALOS_ENGINE_TIMEOUT_MS`, default 120 s). | 503 key unavailable; 504 timeout; 502 unreachable |

Response path: only `content-type`, `retry-after`, `content-disposition` pass
back. `Set-Cookie`, `Server`, engine error bodies (5xx) and redirects never
reach the browser. An engine 401 becomes 502 `engine_auth_failed` so it never
looks like a sign-out. Every response carries `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY`, a locked-down CSP and a request id.

Forwarded to the engine: `Authorization: Bearer <minted token>`, `x-request-id`,
`accept` (validated), and `content-type` for bodies. Never forwarded: the
browser cookie, any client `Authorization`, `X-Forwarded-*`, `X-Real-IP`,
`Host`, `X-Kalos-*`, or any other header.

### CSRF

State-changing methods need **all** of: `Origin` exactly equal to
`KALOS_PUBLIC_URL` (or `BETTER_AUTH_URL`), `Sec-Fetch-Site` absent or
`same-origin`, `Referer` (if present) on the same origin, and
`X-Kalos-CSRF: 1` (a custom header, so a cross-origin page needs a CORS
preflight, which the proxy never grants). Reads are refused on a positive
cross-site signal. The session cookie is also `SameSite=Lax` and `HttpOnly`.

### Tenant

The engine scopes every campaign by `tenant`. The value comes only from the
operator's map. It is never derived from the provider's org id, the request,
the query, the body or a header. Renaming or re-creating an org therefore
cannot silently re-point it at another tenant's data.

## 2. The engine token (the contract the engine verifies)

```
header:  { "alg": "EdDSA", "typ": "JWT", "kid": "<KALOS_ENGINE_JWT_KID>" }
claims:  iss "kalos-web"        aud "kalos-engine"
         sub  <Better Auth user id>       sid <Better Auth session id>
         tenant <mapped tenant id>        scopes [ "campaigns:read" | "campaigns:write" | "org:admin" ]
         jti  <UUID v4, fresh per request>
         iat = nbf            exp = iat + 60
```

- The token carries **only the scopes that the one route needs** (least
  privilege per request). A read has `["campaigns:read"]`, a write has
  `["campaigns:write"]`, an archive has `["campaigns:write","org:admin"]`.
- `exp - iat` is 60 s (`PROXY_TOKEN_TTL_SECONDS`). The engine's default
  maximum is 120 s; the web cannot ask for more.
- `sub`/`sid` must be 1-256 printable ASCII without space or comma (the
  engine's rule; `buildEngineClaims` enforces it).
- The browser never receives the token.

## 3. Keys and the engine's trust store

### Web: signing key

- Ed25519 **PKCS#8 PEM private key**, one per environment (dev, staging,
  production each have their own pair and kid).
- Generate: `openssl genpkey -algorithm ed25519 -out engine-jwt.pem`
- Mount it read-only as a secret. Permissions 0400 or 0440, owned by the web
  user. Never in the image, never in git, never in an env **value**, never in
  a `NEXT_PUBLIC_*` variable.
- `KALOS_ENGINE_JWT_PRIVATE_KEY_FILE=/run/secrets/engine-jwt.pem`
- `KALOS_ENGINE_JWT_KID=kalos-web-2026-10` (1-64 characters of `[A-Za-z0-9._-]`)
- A missing, unreadable, RSA or otherwise non-Ed25519 key makes every engine
  request answer 503 `engine_credentials_unavailable`. Nothing is forwarded.

### Engine: public JWKS (what it must trust)

Derive the public JWKS from the same key so the two cannot drift:

```sh
KALOS_ENGINE_JWT_PRIVATE_KEY_FILE=/run/secrets/engine-jwt.pem \
KALOS_ENGINE_JWT_KID=kalos-web-2026-10 \
node scripts/engine-jwks.mjs > engine-jwks.json
```

The output has only public members (`kty`, `crv`, `x`, `kid`, `alg`, `use`).
The engine refuses any key that carries `d`. Give that file to the engine as
`KALOS_JWT_PUBLIC_KEYS_FILE`, with:

| Engine setting | Value |
|---|---|
| `KALOS_JWT_PUBLIC_KEYS_FILE` | path to `engine-jwks.json` |
| `KALOS_JWT_ISSUER` | `kalos-web` (must equal the web's `iss`) |
| `KALOS_JWT_AUDIENCE` | `kalos-engine` |
| `KALOS_JWT_MAX_TTL_S` | 120 (default; the web sends 60) |
| `KALOS_JWT_LEEWAY_S` | 30 (default) |

Public keys only, ever. Do **not** mount the private PEM on the engine.

### Rotation

Normal rotation (no suspected compromise):

1. Generate a new PEM and pick a new kid (`kalos-web-2026-11`).
2. Add the new key to the engine's JWKS file so it holds **both** keys. Wait
   for the engine to re-read the file (it does so when the mtime changes).
3. Switch the web to the new `KALOS_ENGINE_JWT_PRIVATE_KEY_FILE` and
   `KALOS_ENGINE_JWT_KID`. Restart the web.
4. Wait at least `KALOS_JWT_MAX_TTL_S + KALOS_JWT_LEEWAY_S` (150 s with the
   defaults). After that, no token signed with the old key can still be valid.
5. Remove the old key from the engine's JWKS file.

Suspected compromise: remove the old key from the engine's JWKS **at once**
(in-flight requests fail with 502 `engine_auth_failed` until the web is
switched), then do steps 1, 3, 5. Also revoke affected sessions.

## 4. Tenant map

`KALOS_TENANT_MAP_FILE` holds one flat JSON object:

```json
{ "<better-auth organization id>": "<tenant id>" }
```

- Tenant ids match `^[A-Za-z0-9_-]{1,64}$`. `default` is reserved for the
  engine's anonymous mode and is refused.
- Onboard through `scripts/create-org.mjs`. It creates the org and the owner
  invitation, and adds the map entry atomically. It refuses to map two orgs
  to one tenant.
- A malformed map is rejected as a whole. Every org then gets 403, and the
  boot check reports it. Unknown orgs get 403; there is no default tenant.
- The file is re-read when its mtime changes, so an operator can add an org
  without a restart.

## 5. REQUIRED SEQUENCING

> **The engine must be deployed before, or together with, this web change.**
> Deploy this web change first and the engine is still in static-token mode,
> so every proxied request is refused with 401. The proxy turns that into
> 502 `engine_auth_failed`, and the app stops working for every user. The
> same applies to rolling back the engine while the web stays on this change.

The engine pieces this depends on, as of this writing:

| Engine PR | Needed for | State |
|---|---|---|
| `security/p0-engine-hardening` (#86) | base of the JWT work | open, not merged |
| `feat/engine-jwt-verification` (#88, E2) | verifies the EdDSA tokens (JWKS, `iss`, `aud`, `kid`, TTL) | draft, CI green |
| `feat/campaign-schema-v2` (#89, E3) and `feat/campaign-routes` (#90, E4) | `/api/campaigns*` (multi-campaign, archive) | open |

Until #90 is deployed, the web's `/api/campaigns*` calls get the engine's 404
(passed through as 404). Until #88 is deployed, all calls fail as described
above.

Engine-side tenant isolation for JWT callers is **not yet demonstrated**.
`tests/test_cross_tenant_isolation_jwt.py` (named as a skipped E2 stub) is on
neither `feat/engine-jwt-verification` nor `main`, and #88 has no skipped
isolation tests. Verify engine isolation before relying on it.

## 6. Known limits

- **Revocation window.** A new token is never minted for a signed-out or
  demoted user (the session and member row are read per request). A token
  already issued stays valid for up to 60 s + 30 s leeway. The engine has no
  jti replay cache, and session denial on the engine needs
  `KALOS_AUTH_DENY_SUBJECTS` (env, read per request, applied after a restart).
- **Single replica.** Rate limits are in memory per process. With several web
  replicas, the effective limit multiplies by the replica count.
- **Engine error envelopes** with status 4xx (for example upload validation
  messages) are passed through by design. Engine 5xx bodies are not.
- The tenant map and the JWKS are read from disk. The web and the engine must
  see the same files (or separate files kept in sync).

## 7. Verifying a deployment

- `node scripts/engine-jwks.mjs` with the production env prints one key with
  the expected kid.
- A signed-in member's `GET /api/engine/api/latest` returns 200 (the engine
  accepts the token, so its JWT path is live, not the static-token path).
- Sign out in a second browser, then retry in the first: 401, and no engine
  request is made (the audit log has `outcome: "unauthenticated"`).
- `curl -i /api/engine/api/latest` without a cookie: 401 with no engine call.
