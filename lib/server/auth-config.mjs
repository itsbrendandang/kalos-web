// Better Auth configuration for kalos-web (better-auth pinned to 1.7.10).
//
// Plain ESM (with auth-config.d.mts for types) so the same policy is used by
// the Next app (lib/server/auth.ts), the operator CLI (scripts/create-org.mjs)
// and the integration tests (tests/auth-integration/*.mjs) without a TS loader.
// Do NOT import "server-only" here (node scripts import this file); it must
// still never be imported from client code - lib/server/auth.ts is the app's
// only entry point to it.
//
// Policy (docs/AUTH.md):
//   - Google OAuth only, scopes exactly "openid email profile", no id-token
//     sign-in, no email/password, no password reset, no email transport.
//   - Invite-only: a NEW user is created only when a pending, unexpired
//     organization invitation exists for the (Google-verified) email.
//   - MFA (TOTP) is mandatory for every user. A Google sign-in only yields a
//     "half" session (mfaVerifiedAt = null, 15 min TTL) that can do nothing on
//     /api/auth/* except enrol (first time), verify, read itself, sign out.
//   - Sessions: 7 days absolute, no sliding refresh, no cookie cache.
import { betterAuth, getCurrentAdapter } from "better-auth";
import { getSessionCookie } from "better-auth/cookies";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { organization } from "better-auth/plugins/organization";
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

// ---------------------------------------------------------------------------
// Session / MFA policy constants
// ---------------------------------------------------------------------------
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
/** Lifetime of a session that has not (yet) passed the second factor. */
export const UNVERIFIED_SESSION_TTL_SECONDS = 15 * 60;
/** Wrong TOTP / backup codes tolerated on one session before it is revoked. */
export const MFA_MAX_FAILURES_PER_SESSION = 5;
/** Wrong codes tolerated per USER (across all sessions) before verification is locked. */
export const MFA_MAX_FAILURES_PER_USER = 10;
export const MFA_USER_LOCK_SECONDS = 15 * 60;
/** Must equal RECENT_AUTH_MAX_AGE_SECONDS in lib/server/session-context.ts (asserted in tests). */
export const RECENT_AUTH_MAX_AGE_SECONDS = 300;
export const GOOGLE_SCOPES = Object.freeze(["openid", "email", "profile"]);

/** The only endpoints whose success proves the second factor (and stamps mfaVerifiedAt). */
export const MFA_VERIFY_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
/** What a session WITHOUT mfaVerifiedAt may call on /api/auth/*. "/two-factor/enable" is added only before first enrolment. */
export const ALLOWED_WITHOUT_MFA = new Set([...MFA_VERIFY_PATHS, "/get-session", "/sign-out"]);
/** Endpoints that need a fresh second factor (mfaVerifiedAt within RECENT_AUTH_MAX_AGE_SECONDS). */
export const RECENT_MFA_PATHS = new Set(["/two-factor/generate-backup-codes"]);
/** Public, session-creating or session-less endpoints the MFA gate does not apply to. */
const PRE_SESSION_PREFIXES = ["/sign-in/social", "/callback/", "/error", "/ok"];

/**
 * Endpoints switched off entirely (404): email/password, password reset,
 * account linking/unlinking, e-mail change, 2FA disable (MFA is mandatory),
 * OTP-by-email (no transport). Organization creation/deletion are disabled
 * through plugin options below.
 */
export const DISABLED_PATHS = Object.freeze([
  "/sign-in/email",
  "/sign-up/email",
  "/sign-in/username",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
  "/change-password",
  "/set-password",
  "/change-email",
  "/send-verification-email",
  "/verify-email",
  "/delete-user",
  "/delete-user/callback",
  "/link-social",
  "/unlink-account",
  "/refresh-token",
  "/get-access-token",
  "/account-info",
  "/two-factor/disable",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
  "/two-factor/get-totp-uri",
]);

/**
 * True when the Better Auth session passed the second factor. The
 * authoritative check: the session must carry mfaVerifiedAt AND the user must
 * have a confirmed TOTP enrolment (twoFactorEnabled) - a backup code from an
 * unconfirmed enrolment never counts.
 */
export function mfaSatisfied(sessionData) {
  const s = sessionData && sessionData.session;
  if (!s || !s.mfaVerifiedAt) return false;
  if (sessionData.user?.twoFactorEnabled !== true) return false;
  const t = new Date(s.mfaVerifiedAt).getTime();
  return Number.isFinite(t);
}

/** Unix seconds of the last second-factor proof on this session, or null. */
export function mfaVerifiedAtSeconds(sessionData) {
  if (!mfaSatisfied(sessionData)) return null;
  return Math.floor(new Date(sessionData.session.mfaVerifiedAt).getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Organization roles -> Kalos permissions (createAccessControl)
// ---------------------------------------------------------------------------
// Better Auth's default statements (organization/member/invitation/team/ac)
// keep the plugin's own management checks working; `campaigns` and `org` are
// Kalos resources. Flattened "resource:action" slugs for these two resources
// become SessionContext.permissions (engine scopes are the subset
// campaigns:read / campaigns:write / org:admin, see lib/server/scopes.ts).
export const KALOS_RESOURCES = Object.freeze(["campaigns", "org"]);
export const statements = {
  ...defaultStatements,
  campaigns: ["read", "write", "archive"],
  org: ["admin"],
};
export const ac = createAccessControl(statements);
export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, campaigns: ["read", "write", "archive"], org: ["admin"] }),
  admin: ac.newRole({ ...adminAc.statements, campaigns: ["read", "write", "archive"], org: ["admin"] }),
  member: ac.newRole({ ...memberAc.statements, campaigns: ["read", "write"] }),
  viewer: ac.newRole({ campaigns: ["read"] }),
};
export const ROLE_NAMES = Object.freeze(Object.keys(roles));

/** Split a Better Auth member.role value ("admin" or "admin,member") into known role names. */
export function parseRoles(roleValue) {
  if (typeof roleValue !== "string") return [];
  const out = [];
  for (const r of roleValue.split(",")) {
    const name = r.trim();
    if (name && Object.prototype.hasOwnProperty.call(roles, name) && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Kalos permission slugs ("campaigns:read", ...) for a member.role value, sorted, deduplicated. */
export function permissionsForRole(roleValue) {
  const set = new Set();
  for (const name of parseRoles(roleValue)) {
    const st = roles[name].statements;
    for (const res of KALOS_RESOURCES) for (const action of st[res] ?? []) set.add(`${res}:${action}`);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Onboarding policy (validateUserInfo)
// ---------------------------------------------------------------------------
/** True when a pending, unexpired invitation exists for this email. */
export async function hasPendingInvitation(adapter, email) {
  if (typeof email !== "string" || !email) return false;
  const rows = await adapter.findMany({
    model: "invitation",
    where: [
      { field: "email", value: email.toLowerCase() },
      { field: "status", value: "pending" },
    ],
  });
  const now = Date.now();
  return rows.some((r) => new Date(r.expiresAt).getTime() > now);
}

/**
 * Better Auth `user.validateUserInfo`: runs before create-user, link-account
 * and every OAuth sign-in (with the fresh provider claims). Returning an
 * error aborts the flow with 403 / ?error=<code>; no user row is written.
 */
export async function validateUserInfo({ user, source }, ctx) {
  if (source.method !== "oauth" || source.oauth?.providerId !== "google") {
    return { error: "method_not_allowed", errorDescription: "Only Google sign-in is enabled" };
  }
  if (user.emailVerified !== true) {
    return { error: "email_not_verified", errorDescription: "Google has not verified this email address" };
  }
  if (source.action === "link-account") {
    // Defence in depth: linking is disabled in the config as well.
    return { error: "account_not_linked", errorDescription: "Account linking is disabled" };
  }
  if (source.action === "create-user") {
    // create-user runs inside Better Auth's DB transaction: query through the
    // transaction's adapter (the plain adapter would wait on the single
    // SQLite connection the transaction holds - a deadlock).
    const adapter = ctx?.context?.adapter ? await getCurrentAdapter(ctx.context.adapter) : null;
    if (!adapter || !(await hasPendingInvitation(adapter, user.email))) {
      return { error: "not_invited", errorDescription: "Kalos is invite-only" };
    }
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
function forbidden(code, message) {
  return new APIError("FORBIDDEN", { code, message });
}

/** Request-level guard for /sign-in/social (and /link-social, disabled anyway). */
export function assertSocialRequestAllowed(path, body) {
  if (path !== "/sign-in/social" && path !== "/link-social") return;
  if (body && Array.isArray(body.scopes) ? body.scopes.length > 0 : body?.scopes !== undefined) {
    throw new APIError("BAD_REQUEST", { code: "SCOPES_NOT_ALLOWED", message: "Extra scopes are not allowed" });
  }
  if (body?.idToken !== undefined) {
    throw new APIError("BAD_REQUEST", { code: "ID_TOKEN_NOT_ALLOWED", message: "ID token sign-in is disabled" });
  }
  if (body?.provider !== "google") {
    throw new APIError("BAD_REQUEST", { code: "PROVIDER_NOT_ALLOWED", message: "Only Google sign-in is enabled" });
  }
}

/** Pure decision for the MFA gate; exported for unit tests. */
export function mfaGateDecision(path, sessionData, nowMs = Date.now()) {
  if (!path) return "allow"; // server-side internal call without a route
  if (PRE_SESSION_PREFIXES.some((p) => path === p || path.startsWith(p))) return "allow";
  if (!sessionData) return "allow"; // the endpoint's own sessionMiddleware answers 401
  if (mfaSatisfied(sessionData)) {
    if (RECENT_MFA_PATHS.has(path)) {
      const t = mfaVerifiedAtSeconds(sessionData);
      if (t === null || nowMs / 1000 - t > RECENT_AUTH_MAX_AGE_SECONDS) return "step_up_required";
    }
    return "allow";
  }
  const enrolled = sessionData.user?.twoFactorEnabled === true;
  // Backup codes only for a CONFIRMED enrolment: otherwise "enable" + a
  // backup code from that same response would complete MFA without ever
  // proving the authenticator, and the enrolment could be replaced on every
  // Google sign-in.
  if (path === "/two-factor/verify-backup-code") return enrolled ? "allow" : "mfa_required";
  if (ALLOWED_WITHOUT_MFA.has(path)) return "allow";
  if (path === "/two-factor/enable" && !enrolled) return "allow";
  return "mfa_required";
}

/**
 * Session lookup for the gate. Fails CLOSED: if a session cookie is present
 * but the lookup throws (DB error), the request is refused instead of being
 * treated as session-less.
 */
export async function gateSessionLookup(lookup, headers) {
  try {
    return await lookup();
  } catch {
    const hasCookie = !!headers && getSessionCookie(headers) !== null;
    if (hasCookie) throw new APIError("SERVICE_UNAVAILABLE", { code: "SESSION_LOOKUP_FAILED", message: "Try again" });
    return null;
  }
}

/** Pure: is a twoFactor row currently locked? */
export function userMfaLocked(row, nowMs = Date.now()) {
  if (!row?.lockedUntil) return false;
  const t = new Date(row.lockedUntil).getTime();
  return Number.isFinite(t) && t > nowMs;
}

/** Pure: next per-user failure state after one more wrong code. */
export function nextUserFailureState(row, nowMs = Date.now()) {
  const expiredLock = !!row?.lockedUntil && !userMfaLocked(row, nowMs);
  const n = (expiredLock ? 0 : Number(row?.failedVerificationCount ?? 0)) + 1;
  if (n >= MFA_MAX_FAILURES_PER_USER) return { failedVerificationCount: 0, lockedUntil: new Date(nowMs + MFA_USER_LOCK_SECONDS * 1000) };
  return { failedVerificationCount: n, lockedUntil: null };
}

// Single-replica in-memory TOTP replay cache: a code accepted once for a user
// is refused for the rest of its validity window (2 x 30 s steps + skew).
// The before-hook CLAIMS the code synchronously (check + set with no await in
// between), so two parallel requests with the same code cannot both pass;
// the claim is released if verification fails.
const usedCodes = new Map();
const REPLAY_WINDOW_MS = 120_000;
function replayKey(userId, code) {
  return `${userId}:${code}`;
}
function sweepUsedCodes(now) {
  for (const [k, exp] of usedCodes) if (exp <= now) usedCodes.delete(k);
}

/**
 * Build the Better Auth instance.
 * @param {object} o
 * @param {unknown} o.database          better-sqlite3 Database (or any Better Auth adapter input)
 * @param {string}  o.baseURL           BETTER_AUTH_URL
 * @param {string}  o.secret            BETTER_AUTH_SECRET
 * @param {string}  o.googleClientId
 * @param {string}  o.googleClientSecret
 * @param {string[]} [o.trustedProxies] CIDRs/IPs of the reverse proxy in front of the app
 * @param {string[]} [o.ipAddressHeaders]
 * @param {boolean} [o.secureCookies]
 * @param {object|false} [o.rateLimit]  override (tests); default database storage
 * @param {object}  [o.logger]
 */
export function makeAuth(o) {
  const baseURL = o.baseURL;
  return betterAuth({
    appName: "Kalos",
    database: o.database,
    baseURL,
    basePath: "/api/auth",
    secret: o.secret,
    trustedOrigins: [baseURL],
    telemetry: { enabled: false },
    disabledPaths: [...DISABLED_PATHS],
    logger: o.logger,
    emailAndPassword: { enabled: false },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
    onAPIError: { errorURL: "/sign-in" },
    user: {
      validateUserInfo,
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    socialProviders: {
      google: {
        clientId: o.googleClientId,
        clientSecret: o.googleClientSecret,
        disableDefaultScope: true,
        scope: [...GOOGLE_SCOPES],
        includeGrantedScopes: false,
        prompt: "select_account",
        requireEmailVerification: true,
        disableIdTokenSignIn: true,
      },
    },
    account: {
      encryptOAuthTokens: true,
      // Google is the only provider: a Google identity is bound to its user by
      // (providerId, sub). A different Google account (different sub) that
      // claims the same email must NOT be linked into the existing user.
      accountLinking: {
        enabled: false,
        trustedProviders: [],
        allowDifferentEmails: false,
        requireLocalEmailVerified: true,
      },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        mfaVerifiedAt: { type: "date", required: false, input: false },
        mfaFailures: { type: "number", required: false, input: false, defaultValue: 0 },
      },
    },
    rateLimit:
      o.rateLimit === false
        ? { enabled: false }
        : o.rateLimit ?? {
            enabled: true,
            storage: "database",
            window: 60,
            max: 100,
            customRules: {
              "/sign-in/social": { window: 60, max: 10 },
              "/two-factor/*": { window: 10, max: 3 },
              "/organization/accept-invitation": { window: 60, max: 10 },
            },
          },
    advanced: {
      useSecureCookies: o.secureCookies ?? baseURL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      ipAddress: {
        ipAddressHeaders: o.ipAddressHeaders?.length ? o.ipAddressHeaders : ["x-forwarded-for"],
        ...(o.trustedProxies?.length ? { trustedProxies: o.trustedProxies } : {}),
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Fail closed: only the 2FA verify endpoints mint an MFA-verified
          // session; every other new session is a short-lived half session.
          before: async (s, ctx) => {
            const verified = !!ctx && MFA_VERIFY_PATHS.has(ctx.path);
            const now = Date.now();
            return {
              data: {
                ...s,
                mfaVerifiedAt: verified ? new Date(now) : null,
                mfaFailures: 0,
                expiresAt: verified ? new Date(now + SESSION_TTL_SECONDS * 1000) : new Date(now + UNVERIFIED_SESSION_TTL_SECONDS * 1000),
              },
            };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        assertSocialRequestAllowed(ctx.path, ctx.body);
        if (!ctx.path || PRE_SESSION_PREFIXES.some((p) => ctx.path === p || ctx.path.startsWith(p))) return;
        // get-session (every page render) and sign-out need no extra lookup.
        if (ctx.path === "/get-session" || ctx.path === "/sign-out") return;
        const s = await gateSessionLookup(() => getSessionFromCtx(ctx), ctx.headers);
        const decision = mfaGateDecision(ctx.path, s);
        if (decision === "mfa_required") throw forbidden("MFA_REQUIRED", "Second factor required");
        if (decision === "step_up_required") throw forbidden("STEP_UP_REQUIRED", "Re-verify your second factor");
        if (s && MFA_VERIFY_PATHS.has(ctx.path)) {
          // Per-user lock (all sessions together), on top of the per-session cap.
          const tf = await ctx.context.adapter.findOne({ model: "twoFactor", where: [{ field: "userId", value: s.user.id }] });
          if (userMfaLocked(tf)) {
            throw new APIError("TOO_MANY_REQUESTS", { code: "TWO_FACTOR_LOCKED", message: "Too many wrong codes. Try again later." });
          }
          if (ctx.path === "/two-factor/verify-totp" && typeof ctx.body?.code === "string") {
            const now = Date.now();
            sweepUsedCodes(now);
            const key = replayKey(s.user.id, ctx.body.code);
            if (usedCodes.has(key)) {
              throw new APIError("UNAUTHORIZED", { code: "TOTP_REPLAYED", message: "This code was already used" });
            }
            usedCodes.set(key, now + REPLAY_WINDOW_MS); // claim (released on failure)
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (!MFA_VERIFY_PATHS.has(ctx.path)) return;
        const cur = ctx.context.session?.session;
        const r = ctx.context.returned;
        const failed = !r || r instanceof Error || (r instanceof Response && !r.ok) || (typeof r === "object" && r !== null && "statusCode" in r && "status" in r);
        if (!cur) return;
        const tfWhere = [{ field: "userId", value: cur.userId }];
        if (failed) {
          if (ctx.path === "/two-factor/verify-totp" && typeof ctx.body?.code === "string") {
            usedCodes.delete(replayKey(cur.userId, ctx.body.code));
          }
          // Per-user counter (stock plugin counts only on the password
          // sign-in path): lock verification for the user after N failures.
          const tf = await ctx.context.adapter.findOne({ model: "twoFactor", where: tfWhere });
          if (tf) await ctx.context.adapter.update({ model: "twoFactor", where: tfWhere, update: nextUserFailureState(tf) });
          // Per-session counter: revoke this session after N failures.
          const row = await ctx.context.internalAdapter.findSession(cur.token);
          const n = Number(row?.session?.mfaFailures ?? 0) + 1;
          if (n >= MFA_MAX_FAILURES_PER_SESSION) {
            await ctx.context.internalAdapter.deleteSession(cur.token);
          } else {
            await ctx.context.internalAdapter.updateSession(cur.token, { mfaFailures: n });
          }
          return;
        }
        await ctx.context.adapter.update({ model: "twoFactor", where: tfWhere, update: { failedVerificationCount: 0, lockedUntil: null } }).catch(() => null);
        // Step-up on an existing session (first enrolment creates a NEW
        // session that the create hook already stamped; this session row is
        // then gone and updateSession is a no-op).
        const now = new Date();
        const update = { mfaVerifiedAt: now, mfaFailures: 0 };
        if (!cur.mfaVerifiedAt) update.expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
        await ctx.context.internalAdapter.updateSession(cur.token, update).catch(() => null);
      }),
    },
    plugins: [
      twoFactor({
        issuer: "Kalos",
        allowPasswordless: true,
        backupCodeOptions: { amount: 10, length: 10 },
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        // No email transport: admins copy the /accept-invite/<id> link.
      }),
      ...(o.extraPlugins ?? []),
    ],
  });
}

/** Read Better Auth inputs from the environment (shared by the app and the CLI). */
export function authOptionsFromEnv(env = process.env) {
  const list = (v) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return {
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    // "none" = explicitly no reverse proxy (see boot check / docs/AUTH.md).
    trustedProxies: list(env.AUTH_TRUSTED_PROXIES).filter((x) => x.toLowerCase() !== "none"),
    ipAddressHeaders: list(env.AUTH_IP_ADDRESS_HEADERS),
  };
}
