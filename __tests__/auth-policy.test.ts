// Unit tests for the Better Auth policy in lib/server/auth-config.mjs (no DB).
import { describe, expect, it } from "vitest";
import {
  ALLOWED_WITHOUT_MFA,
  assertSocialRequestAllowed,
  DISABLED_PATHS,
  GOOGLE_SCOPES,
  hasPendingInvitation,
  gateSessionLookup,
  MFA_MAX_FAILURES_PER_USER,
  MFA_USER_LOCK_SECONDS,
  mfaGateDecision,
  mfaSatisfied,
  nextUserFailureState,
  userMfaLocked,
  MFA_VERIFY_PATHS,
  parseRoles,
  permissionsForRole,
  RECENT_AUTH_MAX_AGE_SECONDS,
  SESSION_TTL_SECONDS,
  UNVERIFIED_SESSION_TTL_SECONDS,
  validateUserInfo,
} from "@/lib/server/auth-config.mjs";
import { RECENT_AUTH_MAX_AGE_SECONDS as NEUTRAL_RECENT } from "@/lib/server/session-context";
import { scopesForClaims } from "@/lib/server/scopes";

const sess = (mfaVerifiedAt: Date | null, twoFactorEnabled = true) => ({
  session: { id: "s1", userId: "u1", mfaVerifiedAt },
  user: { id: "u1", twoFactorEnabled },
});

function fakeAdapter(rows: Array<{ email: string; status: string; expiresAt: string }>) {
  return {
    findMany: async ({ where }: { where: Array<{ field: string; value: string }> }) =>
      rows.filter((r) => where.every((w) => (r as Record<string, string>)[w.field] === w.value)),
  };
}
const oauth = (action: string, providerId = "google") => ({ method: "oauth", action, oauth: { providerId } });
const future = new Date(Date.now() + 3600e3).toISOString();

describe("policy constants", () => {
  it("Google scopes are exactly openid email profile", () => expect([...GOOGLE_SCOPES]).toEqual(["openid", "email", "profile"]));
  it("session lifetimes", () => {
    expect(SESSION_TTL_SECONDS).toBe(7 * 86400);
    expect(UNVERIFIED_SESSION_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });
  it("recent-auth window matches the provider-neutral contract", () => expect(RECENT_AUTH_MAX_AGE_SECONDS).toBe(NEUTRAL_RECENT));
  it("email/password, reset, linking and 2FA-disable endpoints are disabled", () => {
    for (const p of ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/reset-password", "/link-social", "/two-factor/disable", "/send-verification-email"]) {
      expect(DISABLED_PATHS).toContain(p);
    }
  });
  it("only the 2FA verify endpoints prove MFA", () => expect([...MFA_VERIFY_PATHS].sort()).toEqual(["/two-factor/verify-backup-code", "/two-factor/verify-totp"]));
});

describe("roles -> permissions (createAccessControl)", () => {
  it.each([
    ["viewer", ["campaigns:read"]],
    ["member", ["campaigns:read", "campaigns:write"]],
    ["admin", ["campaigns:archive", "campaigns:read", "campaigns:write", "org:admin"]],
    ["owner", ["campaigns:archive", "campaigns:read", "campaigns:write", "org:admin"]],
    ["admin,viewer", ["campaigns:archive", "campaigns:read", "campaigns:write", "org:admin"]],
    ["unknown", []],
    ["__proto__", []],
    ["", []],
  ])("%s", (role, perms) => expect(permissionsForRole(role)).toEqual(perms));

  it("archiving is admin/owner only", () => {
    expect(permissionsForRole("member")).not.toContain("campaigns:archive");
    expect(permissionsForRole("viewer")).not.toContain("campaigns:archive");
  });
  it("maps to engine scopes through scopesForClaims (archive is not an engine scope)", () => {
    expect(scopesForClaims({ permissions: permissionsForRole("viewer") })).toEqual(["campaigns:read"]);
    expect(scopesForClaims({ permissions: permissionsForRole("member") })).toEqual(["campaigns:read", "campaigns:write"]);
    expect(scopesForClaims({ permissions: permissionsForRole("owner") })).toEqual(["campaigns:read", "campaigns:write", "org:admin"]);
  });
  it("parseRoles keeps only known roles", () => expect(parseRoles(" admin , bogus,admin")).toEqual(["admin"]));
});

describe("validateUserInfo (onboarding)", () => {
  const ctx = (rows: Parameters<typeof fakeAdapter>[0]) => ({ context: { adapter: fakeAdapter(rows) } });
  it("rejects unverified Google emails on every action", async () => {
    for (const action of ["create-user", "sign-in", "link-account"]) {
      expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: false }, source: oauth(action) }, ctx([]))).toMatchObject({ error: "email_not_verified" });
    }
  });
  it("rejects a NEW user without a pending invitation (invite-only)", async () => {
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("create-user") }, ctx([]))).toMatchObject({ error: "not_invited" });
  });
  it("rejects expired or non-pending invitations", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("create-user") }, ctx([{ email: "a@x.com", status: "pending", expiresAt: past }]))).toMatchObject({ error: "not_invited" });
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("create-user") }, ctx([{ email: "a@x.com", status: "accepted", expiresAt: future }]))).toMatchObject({ error: "not_invited" });
  });
  it("admits an invited, verified email (case-insensitive)", async () => {
    expect(await validateUserInfo({ user: { email: "A@X.com", emailVerified: true }, source: oauth("create-user") }, ctx([{ email: "a@x.com", status: "pending", expiresAt: future }]))).toBeUndefined();
  });
  it("fails closed without an adapter", async () => {
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("create-user") }, undefined)).toMatchObject({ error: "not_invited" });
  });
  it("M2: refuses to link another Google account into an existing user", async () => {
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("link-account") }, ctx([]))).toMatchObject({ error: "account_not_linked" });
  });
  it("rejects non-Google and non-OAuth methods", async () => {
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("create-user", "github") }, ctx([]))).toMatchObject({ error: "method_not_allowed" });
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: { method: "email-password", action: "create-user" } }, ctx([]))).toMatchObject({ error: "method_not_allowed" });
  });
  it("existing users signing in again only need a verified email", async () => {
    expect(await validateUserInfo({ user: { email: "a@x.com", emailVerified: true }, source: oauth("sign-in") }, ctx([]))).toBeUndefined();
  });
  it("hasPendingInvitation ignores empty input", async () => expect(await hasPendingInvitation(fakeAdapter([]), "")).toBe(false));
});

describe("scope guard on /sign-in/social", () => {
  it("rejects scopes, idToken and non-Google providers", () => {
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "google", scopes: ["drive"] })).toThrow(/Extra scopes/);
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "google", scopes: [] })).not.toThrow();
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "google", scopes: "drive" })).toThrow(/Extra scopes/);
    expect(() => assertSocialRequestAllowed("/link-social", { provider: "google", scopes: ["drive"] })).toThrow(/Extra scopes/);
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "google", idToken: { token: "x" } })).toThrow(/ID token/);
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "github" })).toThrow(/Only Google/);
    expect(() => assertSocialRequestAllowed("/sign-in/social", { provider: "google", callbackURL: "/" })).not.toThrow();
    expect(() => assertSocialRequestAllowed("/get-session", { scopes: ["x"] })).not.toThrow();
  });
});

describe("per-user TOTP lock (M1)", () => {
  const now = Date.UTC(2026, 9, 17);
  it("counts failures and locks after the limit", () => {
    let row: { failedVerificationCount: number; lockedUntil: Date | null } = { failedVerificationCount: 0, lockedUntil: null };
    for (let i = 1; i < MFA_MAX_FAILURES_PER_USER; i++) {
      row = nextUserFailureState(row, now);
      expect(row).toEqual({ failedVerificationCount: i, lockedUntil: null });
    }
    row = nextUserFailureState(row, now);
    expect(row.lockedUntil?.getTime()).toBe(now + MFA_USER_LOCK_SECONDS * 1000);
    expect(userMfaLocked(row, now + 1000)).toBe(true);
    expect(userMfaLocked(row, now + MFA_USER_LOCK_SECONDS * 1000 + 1)).toBe(false);
  });
  it("an expired lock starts a fresh count", () => {
    expect(nextUserFailureState({ failedVerificationCount: 7, lockedUntil: new Date(now - 1) }, now)).toEqual({ failedVerificationCount: 1, lockedUntil: null });
    expect(userMfaLocked(null)).toBe(false);
    expect(userMfaLocked({ lockedUntil: "garbage" })).toBe(false);
  });
});

describe("gate session lookup fails closed (m3)", () => {
  const boom = () => Promise.reject(new Error("db down"));
  it("throws when a session cookie is present and the lookup fails", async () => {
    await expect(gateSessionLookup(boom, new Headers({ cookie: "better-auth.session_token=abc" }))).rejects.toMatchObject({ statusCode: 503 });
    await expect(gateSessionLookup(boom, new Headers({ cookie: "__Secure-better-auth.session_token=abc" }))).rejects.toMatchObject({ statusCode: 503 });
  });
  it("treats a cookie-less failed lookup as no session, and passes results through", async () => {
    expect(await gateSessionLookup(boom, new Headers())).toBeNull();
    expect(await gateSessionLookup(boom, undefined)).toBeNull();
    expect(await gateSessionLookup(async () => ({ ok: 1 }), new Headers())).toEqual({ ok: 1 });
  });
});

describe("MFA gate", () => {
  it("mfaSatisfied needs a valid mfaVerifiedAt", () => {
    expect(mfaSatisfied(null)).toBe(false);
    expect(mfaSatisfied(sess(null))).toBe(false);
    expect(mfaSatisfied(sess(new Date()))).toBe(true);
    expect(mfaSatisfied({ session: { mfaVerifiedAt: "not a date" } } as never)).toBe(false);
  });
  it("B2: mfaVerifiedAt without a confirmed enrolment (twoFactorEnabled) is NOT satisfied", () => {
    expect(mfaSatisfied(sess(new Date(), false))).toBe(false);
    expect(mfaSatisfied({ session: { id: "s", userId: "u", mfaVerifiedAt: new Date() }, user: { id: "u" } })).toBe(false);
  });
  it("B2: backup codes are refused until the TOTP enrolment is confirmed", () => {
    expect(mfaGateDecision("/two-factor/verify-backup-code", sess(null, false))).toBe("mfa_required");
    expect(mfaGateDecision("/two-factor/verify-backup-code", sess(null, true))).toBe("allow");
    expect(mfaGateDecision("/two-factor/verify-totp", sess(null, false))).toBe("allow"); // confirms the enrolment
  });
  it("a half session may only enrol (first time), verify, read itself and sign out", () => {
    for (const p of ALLOWED_WITHOUT_MFA) expect(mfaGateDecision(p, sess(null))).toBe("allow");
    expect(mfaGateDecision("/two-factor/enable", sess(null, false))).toBe("allow");
    expect(mfaGateDecision("/two-factor/enable", sess(null, true))).toBe("mfa_required");
    for (const p of ["/list-sessions", "/revoke-sessions", "/organization/accept-invitation", "/organization/set-active", "/update-user", "/two-factor/generate-backup-codes"]) {
      expect(mfaGateDecision(p, sess(null))).toBe("mfa_required");
    }
  });
  it("pre-session endpoints and session-less calls are not gated", () => {
    expect(mfaGateDecision("/sign-in/social", sess(null))).toBe("allow");
    expect(mfaGateDecision("/callback/google", sess(null))).toBe("allow");
    expect(mfaGateDecision("/list-sessions", null)).toBe("allow"); // endpoint answers 401 itself
    expect(mfaGateDecision(undefined, sess(null))).toBe("allow");
  });
  it("backup-code regeneration needs MFA within the recent-auth window", () => {
    const now = Date.now();
    expect(mfaGateDecision("/two-factor/generate-backup-codes", sess(new Date(now - 60e3)), now)).toBe("allow");
    expect(mfaGateDecision("/two-factor/generate-backup-codes", sess(new Date(now - (RECENT_AUTH_MAX_AGE_SECONDS + 1) * 1000)), now)).toBe("step_up_required");
  });
});
