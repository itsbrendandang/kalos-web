# Authentication (Better Auth)

Status: **W1 - auth core.** Sign-in, MFA, organizations, invitations and the
server-side `SessionContext` resolver are implemented. The engine proxy
(`app/api/engine/[...path]/route.ts`) does **not** use them yet; wiring
`requireApiSession()` + tenant + engine token into it is step W2.

- Library: [Better Auth](https://better-auth.com) **1.7.10**, pinned exact, self-hosted.
- Storage: SQLite through **better-sqlite3 13.0.3** (prebuilt N-API binaries), one file on a volume.
- Identity: **Google OAuth only**. No email/password, no password reset, no email sending.
- Second factor: **TOTP, mandatory for everyone** (plus single-use backup codes).
- Tenancy: Better Auth organizations; roles `owner`, `admin`, `member`, `viewer`.
- Onboarding: **invite-only**. Operators create organizations with a CLI; org admins invite people and copy the link by hand.

The provider-neutral contract this produces is in
[AUTH_PROVIDER_INTERFACE.md](AUTH_PROVIDER_INTERFACE.md).

## Architecture and trust boundaries

```
 Browser ──HTTPS──▶ reverse proxy (TLS, overwrites X-Forwarded-For)
                         │
                         ▼
 ┌────────────────────────── kalos-web (ONE replica, Node, uid 10001) ─────────────────────────┐
 │                                                                                              │
 │  proxy.ts            optimistic only: session cookie present?                                │
 │  (Next "proxy")      no  → page: 307 /sign-in   api: 401 JSON   (public paths pass)          │
 │        │             NOT a security boundary (proxy bypasses have happened)                  │
 │        ▼                                                                                     │
 │  /api/auth/*  ── Better Auth handler ── hooks: scope guard, MFA gate, TOTP replay/failures    │
 │        │                                                                                     │
 │  app/layout.tsx ── resolveSession() ──┐   THE REAL CHECK (lib/server/session.ts):           │
 │  route handlers ── requireApiSession()├─▶ DB session lookup (no cookie cache)                │
 │  server actions ── resolveSession()  ─┘   + mfaVerifiedAt + member table → SessionContext    │
 │                                                     │                                        │
 │                     (W2) tenants.ts → engine-token.ts (EdDSA, ≤120 s) ──────────┐            │
 │                                                                                 │            │
 │  /data/auth.db (SQLite, WAL, 0600)  ◀── better-sqlite3                          │            │
 └─────────────────────────────────────────────────────────────────────────────────┼────────────┘
          ▲  backup sidecar (sqlite3 .backup → age)                                │
                                                                                   ▼
 Google (accounts.google.com, oauth2.googleapis.com)                      kalos-engine (verifies JWT)
```

What is trusted:

| Input | Trusted? |
| --- | --- |
| Session cookie (`better-auth.session_token`, `__Secure-` in prod) | Only after Better Auth looks the token up in the DB on **every** request (cookie cache is off). |
| `session.activeOrganizationId` | **No.** A selection hint. Membership and role are re-read from `member(userId, organizationId)` on every request. |
| Google id_token claims | Verified by Better Auth (signature, issuer, audience). `email_verified` must be `true`. |
| Request body `scopes`, `idToken`, other `provider` on `/sign-in/social` | Rejected (400). |
| `X-Forwarded-For` | Only as configured by `AUTH_TRUSTED_PROXIES` / `AUTH_IP_ADDRESS_HEADERS` (rate limiting and the session IP shown in Security). |

Files:

| File | Role |
| --- | --- |
| `lib/server/auth-config.mjs` | All policy (plain ESM, shared by app, CLI, tests). |
| `lib/server/auth.ts`, `auth-db.ts` | App instance; SQLite handle (WAL, `busy_timeout`, 0600, `:memory:` during `next build`). |
| `lib/server/session.ts` | Session → `SessionContext`; `requireApiSession`, `requirePageSession`. |
| `lib/auth-routes.ts`, `proxy.ts` | Route classification (pure, tested) and the optimistic proxy. |
| `lib/server/boot-check.ts`, `instrumentation.ts` | Production boot check; `AUTH_MIGRATE`. |
| `app/sign-in`, `signed-out`, `accept-invite/[id]`, `select-org`, `settings/security`, `settings/organization` | Pages. |
| `lib/server/auth-actions.ts` | Server actions (sign-out, select org, accept/decline invite, revoke sessions, invite/cancel/remove). |
| `scripts/create-org.mjs` | Operator CLI for new organizations. |

**Rule for new code:** every route handler, server component or server action
that reads or changes user data calls `requireApiSession()` /
`requirePageSession()` / `resolveSession()` itself. Do not rely on `proxy.ts`
or on the root layout alone (client-side navigations do not re-run the root
layout).

## Sign-in flow and the MFA gate

Better Auth's two-factor plugin only challenges **email/password** sign-ins.
An OAuth (Google) callback gets a full session without any second factor -
verified in the scratch project and re-checked by
`tests/auth-integration/mfa.int.ts`. Our gate closes that gap:

1. Google callback → Better Auth creates a session. A database hook stamps
   `mfaVerifiedAt = null` and `expiresAt = now + 15 min` (a "half session").
   Only the two-factor verify endpoints can create a session with
   `mfaVerifiedAt` set; the field is `input: false` (clients cannot set it).
2. A `hooks.before` middleware answers **403 `MFA_REQUIRED`** for every
   `/api/auth/*` call from a half session except `/two-factor/verify-totp`,
   `/get-session`, `/sign-out`, `/two-factor/enable` **only while the user
   has no confirmed enrolment**, and `/two-factor/verify-backup-code` **only
   once the enrolment is confirmed** (otherwise "enable" + one of the backup
   codes it returns would complete MFA without ever proving the authenticator).
3. `/settings/security` shows enrolment (first time: setup key + one code,
   then 10 backup codes shown once) or verification.
4. Success: first enrolment creates a new session (stamped, 7 days); a later
   verification stamps the existing session and extends it to 7 days from
   that moment. `mfaSatisfied(session)` is the authoritative check, used by
   the resolver: it needs `mfaVerifiedAt` **and** `user.twoFactorEnabled`.
5. Brute force: the stock plugin has no lockout on this (session) path, so we
   count failures twice: per session (`session.mfaFailures`, the session is
   **deleted after 5 wrong codes**) and per user across all sessions
   (`twoFactor.failedVerificationCount`; after **10** wrong codes verification
   is locked for 15 minutes via `twoFactor.lockedUntil`, 429
   `TWO_FACTOR_LOCKED`; reset on success). Better Auth's rate limit on
   `/two-factor/*` (3 per 10 s per IP) applies too.
6. Replay: a TOTP code accepted once for a user is refused for 120 s. The
   code is claimed atomically before verification (released if it fails), so
   two parallel requests cannot both use it. In-memory: correct only because
   there is one replica.
7. Fail closed: if a session cookie is present but the gate's session lookup
   fails (database error), the request gets 503 instead of being treated as
   anonymous.

Recent authentication (step-up): `SessionContext.authenticatedAt` is the time
of the last second-factor proof (`mfaVerifiedAt`). `isRecentlyAuthenticated()`
(300 s) uses it; to step up, the user re-enters a TOTP code on the same
session, which re-stamps `mfaVerifiedAt`. Backup-code regeneration already
requires it (403 `STEP_UP_REQUIRED`).

First-enrolment caveat: whoever controls the invited Google account during the
first 15 minutes can enrol their own authenticator (trust on first use). The
invite link should go to the person directly.

## Sessions

- 7 days absolute (`expiresIn`), `disableSessionRefresh: true` (no sliding),
  cookie cache **off** (revocation and role changes apply on the next request).
- Cookies: HttpOnly, SameSite=Lax, Secure + `__Secure-` prefix when
  `BETTER_AUTH_URL` is https.
- Users see and revoke their sessions on `/settings/security` (session tokens
  never reach the browser; the server action looks them up by id).
- Kill switch for an operator: delete rows from `session` for a user (or all)
  - takes effect immediately.

## Organizations, roles, permissions

Roles are defined with `createAccessControl` in `auth-config.mjs` and
flattened into `SessionContext.permissions`:

| Role | Permissions | Engine scopes (`scopesForClaims`) |
| --- | --- | --- |
| viewer | `campaigns:read` | `campaigns:read` |
| member | `campaigns:read`, `campaigns:write` | read, write |
| admin | + `campaigns:archive`, `org:admin`; can invite, remove, change roles | read, write, `org:admin` |
| owner | same as admin; only owners can invite/promote owners | read, write, `org:admin` |

Archiving campaigns is admin/owner only (`campaigns:archive`, enforced in W2).
Users cannot create or delete organizations (`allowUserToCreateOrganization:
false`, `disableOrganizationDeletion: true`). `requireEmailVerificationOnInvitation: true`.

## Invite-only onboarding

`validateUserInfo` runs before Better Auth creates a user, links an account or
signs an OAuth user in. It rejects:

- anything that is not Google OAuth (`method_not_allowed`);
- `email_verified !== true` (`email_not_verified`) - on every sign-in;
- a **new** user without a pending, unexpired invitation for that email (`not_invited`).

No user row is written when it rejects. **Account linking is disabled**
(`accountLinking.enabled: false`, and `validateUserInfo` rejects any
`link-account`): a Google identity is bound to its user by Google's `sub`. A
different Google account that presents the same email gets
`account_not_linked`; it is never merged into the existing user.

### Onboarding an organization (operator)

```sh
# in the container (tenant map mounted read-write for this one-shot job)
docker run --rm -v kalos-web-data:/data -v /srv/kalos/config:/config \
  -e KALOS_TENANT_MAP_FILE=/config/tenants.json -e KALOS_PUBLIC_URL=https://kalos.example.com \
  kalos-web:local node scripts/create-org.mjs \
  --name "Acme Bio" --slug acme --owner-email owner@acme.example --tenant acme

# or locally
node scripts/create-org.mjs --name "Acme Bio" --slug acme --owner-email owner@acme.example \
  --tenant acme --tenant-map ./tenants.json --public-url http://localhost:3000
```

It creates the organization and a pending **owner** invitation (inviter: a
non-loginable `kalos-system` user with an `.invalid` email) in one
transaction, adds `{ "<org id>": "acme" }` to the tenant map (atomic rename;
existing entries are never changed; a tenant id already in use is refused),
and prints `https://…/accept-invite/<id>`. Send that link yourself. The owner
signs in with Google, enrols TOTP, accepts. The tenant map is re-read on
change (no restart).

### Inviting people (org owner/admin)

`/settings/organization` (workspace menu → Members; owners/admins only):
invite by email + role (viewer, member, admin; owner only for owners), copy
the `<KALOS_PUBLIC_URL>/accept-invite/<id>` link and send it yourself, cancel
pending invitations, remove members. Invitations expire after 7 days; a
re-invite cancels the previous one. The link only works for the invited
email, after Google sign-in and TOTP enrolment. Role changes are available
through Better Auth's `/api/auth/organization/update-member-role` (no UI yet).

## Google Cloud OAuth client (owner must do this; free, no billing)

1. <https://console.cloud.google.com/> → create (or pick) a project. No billing account is needed.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience):
   user type **External**, app name "Kalos", support email, developer email.
   Leave publishing status **Testing**. Under **Test users** add every invited Google address
   (Testing mode allows up to 100). Scopes: only the defaults `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` - add nothing else (no verification review is needed for these).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000` (and later `https://<your domain>`).
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
     (and later `https://<your domain>/api/auth/callback/google`).
4. Copy the client ID / secret into your **local** `.env.local` (gitignored) or the server's env file
   as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Never commit them.

In Testing mode Google shows an "unverified app" screen to test users; that is expected.

## Environment variables

All documented with placeholders in `env.example`.

| Variable | Required in prod | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random chars (`openssl rand -base64 32`). Encrypts TOTP secrets and OAuth tokens and signs cookies/state: rotating it signs everyone out **and** invalidates every enrolled authenticator (users would need an operator reset). |
| `BETTER_AUTH_URL` | yes | Origin, https (http only for localhost). Also the only trusted origin. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | See above. |
| `KALOS_ENGINE_JWT_PRIVATE_KEY_FILE`, `KALOS_ENGINE_JWT_KID` | yes | Ed25519 key file is loaded at boot. |
| `KALOS_TENANT_MAP_FILE` | warned | Without it every org is unmapped (403 in W2). Validated at boot if set. |
| `KALOS_PUBLIC_URL` | no | Origin in printed invite links; defaults to `BETTER_AUTH_URL`. |
| `AUTH_DB_PATH` | no | Default `./data/auth.db`; `/data/auth.db` in the image. |
| `AUTH_MIGRATE` | no | `1` migrate+serve, `only` migrate+exit, `sql` print SQL+exit. |
| `AUTH_TRUSTED_PROXIES` | yes | Proxy IP/CIDR list, or `none` (explicit: no reverse proxy). See "Reverse proxy". |
| `AUTH_IP_ADDRESS_HEADERS` | no | See "Reverse proxy". |

Boot check (production only, `lib/server/boot-check.ts`): missing or
placeholder values of the required variables, a short secret, a non-https URL,
an unreadable/non-Ed25519 engine key or an invalid tenant map → the names (never
the values) are logged and the process **exits 1**. There is no switch to skip
it, and no auth bypass flag exists: tests replace the auth module with
`vi.mock` / dependency injection.

### Reverse proxy

Rate limiting keys on the client IP. `AUTH_TRUSTED_PROXIES` is **required in
production** (the boot check exits 1 without it). Set it to the exact IP/CIDR
of your proxy (not a broad private range) and make the proxy **overwrite**
`X-Forwarded-For` (or set `AUTH_IP_ADDRESS_HEADERS=x-real-ip`). The documented
override `AUTH_TRUSTED_PROXIES=none` states that clients connect directly:
Better Auth then trusts only a single-value header - which a client can spoof
unless something in front overwrites it - and multi-hop values resolve to no
IP (one shared bucket); the boot check logs a warning. Rate-limit state is stored in the
database (`rateLimit` table).

## Running it locally

```sh
cp env.example .env.local          # then fill in real values locally (never commit)
mkdir -p data
AUTH_MIGRATE=1 npm run dev         # creates ./data/auth.db (0600) and serves
                                   # (Better Auth logs "Database schema mismatch" once, before the migration runs)
node scripts/create-org.mjs --name "Dev" --slug dev --owner-email you@gmail.com \
  --tenant dev --tenant-map ./tenants.json --public-url http://localhost:3000
```

## Deployment

- Image: `Dockerfile` (`npm ci --ignore-scripts`, standalone output, uid 10001,
  `VOLUME /data`). **Build on the production architecture** (alpine/musl,
  same CPU arch): the build fails if `better-sqlite3/prebuilds/linuxmusl-<arch>.node`
  is not in the standalone trace.
- **Single web replica.** SQLite on one volume, in-memory TOTP replay cache:
  do not scale `web` horizontally or run two containers on the same volume.
- Migrations: run a one-shot job before starting a new version:
  `docker run --rm -v kalos-web-data:/data --env-file web.env kalos-web:local` with
  `AUTH_MIGRATE=only` (the production boot check applies, so pass the full env). Any failure exits 1.
  Migrations are additive (Better Auth refuses unsafe changes). The reviewed SQL is
  `migrations/0001_better_auth.sql`.

### Backup and restore

The database holds accounts, sessions, encrypted TOTP secrets and org data.

```sh
docker build -t kalos-auth-backup:local -f deploy/Dockerfile.backup deploy
AUTH_VOLUME=kalos-web-data OUT_DIR=/srv/backups AGE_RECIPIENT=age1... scripts/auth-backup.sh
BACKUP=/srv/backups/auth-<ts>.db.age AGE_KEY_FILE=/secure/age.key ENV_FILE=/srv/kalos/web.env \
  RUN_ARGS="-v /srv/kalos/secrets:/run/secrets:ro" scripts/auth-restore-drill.sh
```

- Online snapshot with SQLite's backup API while the app runs, integrity-checked, encrypted with
  [age](https://age-encryption.org) only (authenticated encryption: a tampered file fails to
  decrypt). The recipient is validated and passed to the sidecar as an environment variable; the
  output directory is handed to uid 10001 with mode 0700.
- The restore drill decrypts into a **new** volume, checks integrity and user count, boots the
  app on it without migrating, and probes `/api/health`. Run it after every schema change and on a schedule.
- A backup is only usable with the same `BETTER_AUTH_SECRET`. Store the secret, the age identity
  and the backups in three different places.
- The tenant map file is configuration: back it up with the deployment config.

## Upgrade checklist (better-auth / better-sqlite3 / next)

1. Bump the exact version; read the release notes for session, OAuth, two-factor, organization changes.
2. `npm ci --ignore-scripts && npm test && npm run test:auth-integration` - **always run the
   integration suite on a better-auth upgrade**: it proves the OAuth MFA gap is still closed by
   our gate, scopes/idToken guards, invite-only and email_verified rejection, session policy,
   member-table authorization and the shared rate limit.
3. If `schema.int.ts` fails: review `AUTH_MIGRATE=sql` output, update
   `migrations/0001_better_auth.sql` (or add `0002_…`), and run the restore drill.
4. `npx next build`, build the image on the production arch, run a migrate job on a copy of the volume.
5. Re-check `DISABLED_PATHS` against new endpoints the release adds.

## Limits (by design, for this beta)

- One web replica (SQLite file, in-memory replay cache).
- No email: no verification mails, no password reset, no invitation mails (links are copied by hand).
- No passwords at all; Google is the only identity provider.
- Lost authenticator **and** backup codes → operator reset (delete the user's `twoFactor` row and
  sessions, set `user.twoFactorEnabled = 0`; the user re-enrols after the next Google sign-in).
- TOTP setup shows a setup key + `otpauth://` link, no QR code (no new UI dependency).

## Not implemented yet

- W2: engine proxy uses `requireApiSession()` → `resolveTenant()` → `scopesForClaims()` →
  `mintEngineTokenForSession()`; step-up for destructive engine calls; archive = admin only.
- Role-change UI (API exists; `/settings/organization` covers invite, cancel, remove).
- Operator commands for MFA reset and "sign out user everywhere" (SQL documented above).

## Alternative: WorkOS

WorkOS AuthKit is a documented alternative provider (hosted, paid beyond its
free tier). It would satisfy the same `SessionContext` contract; see
[AUTH_PROVIDER_INTERFACE.md](AUTH_PROVIDER_INTERFACE.md). It is not used.
