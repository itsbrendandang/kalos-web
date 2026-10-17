// Regression tests for the independent review of PR #75 (probes in
// /tmp/rev-ba/probe{2,5,6}.mjs): B2 backup code before TOTP is confirmed,
// M1 per-user TOTP lock across sessions, M2 no linking of a different Google
// account with the same email, m2 parallel reuse of one TOTP code.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, totpAt } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { MFA_MAX_FAILURES_PER_SESSION, MFA_MAX_FAILURES_PER_USER, mfaSatisfied } from "@/lib/server/auth-config.mjs";
import { createSessionResolver, type AuthBackend } from "@/lib/server/session";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let env: any;
let n = 0;

function invite(email: string) {
  n += 1;
  return createOrg({ name: `R${n}`, slug: `r${n}`, ownerEmail: email, tenant: `r${n}`, db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
}
async function signIn(email: string, sub = `g-${email}`) {
  claims = { sub, email, email_verified: true, name: email };
  const c = client(env.auth);
  const r = await googleSignIn(c);
  return { c, r };
}
const sessionOf = (c: any) => c.req("/get-session").then((r: any) => r.json);

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  env = await freshAuth();
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

describe("B2: a backup code cannot complete MFA before the TOTP enrolment is confirmed", () => {
  it("enable -> verify-backup-code is refused; nothing is stamped; the resolver stays mfa_required", async () => {
    invite("b2@example.com");
    const { c } = await signIn("b2@example.com");
    const en = await c.req("/two-factor/enable", { method: "POST", body: {} });
    expect(en.status).toBe(200);
    const vb = await c.req("/two-factor/verify-backup-code", { method: "POST", body: { code: en.json.backupCodes[0] } });
    expect(vb.status).toBe(403);
    expect(vb.json.code).toBe("MFA_REQUIRED");
    const s = await sessionOf(c);
    expect(s.session.mfaVerifiedAt).toBeNull();
    expect(s.user.twoFactorEnabled).toBe(false);
    expect(mfaSatisfied(s)).toBe(false);
    const backend: AuthBackend = { getSession: (h) => env.auth.api.getSession({ headers: h }), findMembership: async () => null, listMemberships: async () => [] };
    expect((await createSessionResolver(backend)(c.headers())).status).toBe("mfa_required");
    // a forged stamp without confirmed enrolment still does not count
    env.db.prepare("UPDATE session SET mfaVerifiedAt = ? WHERE id = ?").run(new Date().toISOString(), s.session.id);
    expect(mfaSatisfied(await sessionOf(c))).toBe(false);
    expect((await createSessionResolver(backend)(c.headers())).status).toBe("mfa_required");
    expect((await c.req("/list-sessions")).status).toBe(403);
  });
});

describe("M1: TOTP guessing is capped per USER across sessions", () => {
  it(`locks verification after ${MFA_MAX_FAILURES_PER_USER} wrong codes spread over many sessions; resets on success`, async () => {
    invite("m1@example.com");
    const { c } = await signIn("m1@example.com");
    const { totpURI } = await enrolTotp(c);
    const perSession = MFA_MAX_FAILURES_PER_SESSION - 2; // stay below the per-session revocation
    let failures = 0;
    while (failures < MFA_MAX_FAILURES_PER_USER) {
      const { c: h } = await signIn("m1@example.com");
      for (let i = 0; i < perSession && failures < MFA_MAX_FAILURES_PER_USER; i++, failures++) {
        expect((await h.req("/two-factor/verify-totp", { method: "POST", body: { code: "000001" } })).status).toBe(401);
      }
    }
    const tf = env.db.prepare("SELECT failedVerificationCount, lockedUntil FROM twoFactor t JOIN user u ON u.id = t.userId WHERE u.email = 'm1@example.com'").get();
    expect(tf.lockedUntil).not.toBeNull();
    // the CORRECT code is now refused on a fresh session, TOTP and backup code alike
    const { c: fresh } = await signIn("m1@example.com");
    const locked = await fresh.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } });
    expect(locked.status).toBe(429);
    expect(locked.json.code).toBe("TWO_FACTOR_LOCKED");
    expect((await fresh.req("/two-factor/verify-backup-code", { method: "POST", body: { code: "xxxxx-xxxxx" } })).status).toBe(429);
    expect((await sessionOf(fresh)).session.mfaVerifiedAt).toBeNull();
    // lock expires -> correct code works and the counter resets
    env.db.prepare("UPDATE twoFactor SET lockedUntil = ? WHERE userId = (SELECT id FROM user WHERE email = 'm1@example.com')").run(new Date(Date.now() - 1000).toISOString());
    expect((await fresh.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } })).status).toBe(200);
    const after = env.db.prepare("SELECT failedVerificationCount, lockedUntil FROM twoFactor t JOIN user u ON u.id = t.userId WHERE u.email = 'm1@example.com'").get();
    expect(after).toEqual({ failedVerificationCount: 0, lockedUntil: null });
  });
});

describe("M2: same email, different Google account (sub)", () => {
  it("is not linked into the existing user; the original Google account still signs in", async () => {
    invite("m2@example.com");
    const { c } = await signIn("m2@example.com", "g-original");
    await enrolTotp(c);
    const other = await signIn("m2@example.com", "g-attacker");
    expect(other.r.location).toMatch(/\/sign-in\?error=account_not_linked/);
    expect(await sessionOf(other.c)).toBeNull();
    const accounts = env.db.prepare("SELECT accountId FROM account a JOIN user u ON u.id = a.userId WHERE u.email = 'm2@example.com'").all();
    expect(accounts).toEqual([{ accountId: "g-original" }]);
    const again = await signIn("m2@example.com", "g-original");
    expect(again.r.location).toBe("/");
    expect(await sessionOf(again.c)).not.toBeNull();
  });
});

describe("m2: one TOTP code, two parallel verifications", () => {
  it("exactly one succeeds", async () => {
    invite("m2b@example.com");
    const { c } = await signIn("m2b@example.com");
    const { totpURI } = await enrolTotp(c);
    const { c: s1 } = await signIn("m2b@example.com");
    const { c: s2 } = await signIn("m2b@example.com");
    const code = await totpAt(totpURI, 1);
    const [a, b] = await Promise.all([s1, s2].map((s) => s.req("/two-factor/verify-totp", { method: "POST", body: { code } })));
    expect([a.status, b.status].sort()).toEqual([200, 401]);
    expect([a, b].find((r) => r.status === 401).json.code).toBe("TOTP_REPLAYED");
  });

  it("a wrong code does not burn anything: the right code still works afterwards", async () => {
    invite("m2c@example.com");
    const { c } = await signIn("m2c@example.com");
    const { totpURI } = await enrolTotp(c);
    const { c: s } = await signIn("m2c@example.com");
    expect((await s.req("/two-factor/verify-totp", { method: "POST", body: { code: "000002" } })).status).toBe(401);
    expect((await s.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } })).status).toBe(200);
  });
});
