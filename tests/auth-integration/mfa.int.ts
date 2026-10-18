// (A) The MFA gate: Better Auth's two-factor plugin does not challenge OAuth
// sign-ins, so every Google session starts as a 15-minute "half" session that
// can only enrol (first time) / verify / read itself / sign out.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, totpAt } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { mfaSatisfied, MFA_MAX_FAILURES_PER_SESSION, UNVERIFIED_SESSION_TTL_SECONDS, SESSION_TTL_SECONDS } from "@/lib/server/auth-config.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let env: any;
let n = 0;

async function invitedUser(email: string) {
  n += 1;
  createOrg({ name: `O${n}`, slug: `o${n}`, ownerEmail: email, tenant: `t${n}`, db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
  claims = { sub: `g-${email}`, email, email_verified: true, name: email };
  const c = client(env.auth);
  await googleSignIn(c);
  return c;
}
const row = (c: any) => c.req("/get-session").then((r: any) => r.json);

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  env = await freshAuth();
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

describe("half session after Google", () => {
  it("is not MFA-satisfied and expires after the short TTL", async () => {
    const c = await invitedUser("half@example.com");
    const s = await row(c);
    expect(mfaSatisfied(s)).toBe(false);
    const ttl = new Date(s.session.expiresAt).getTime() - new Date(s.session.createdAt).getTime();
    expect(Math.abs(ttl - UNVERIFIED_SESSION_TTL_SECONDS * 1000)).toBeLessThan(5000);
  });

  it("is blocked (403 MFA_REQUIRED) everywhere except enrol/verify/get-session/sign-out", async () => {
    const c = await invitedUser("blocked@example.com");
    for (const [p, body] of [
      ["/list-sessions", undefined],
      ["/organization/list", undefined],
      ["/organization/set-active", { organizationId: "x" }],
      ["/two-factor/generate-backup-codes", {}],
      ["/revoke-sessions", {}],
      ["/update-user", { name: "x" }],
    ] as const) {
      const r = await c.req(p, body ? { method: "POST", body } : {});
      expect(r.status, p).toBe(403);
      expect(r.json?.code, p).toBe("MFA_REQUIRED");
    }
    expect((await c.req("/get-session")).status).toBe(200);
  });

  it("the client cannot stamp mfaVerifiedAt itself", async () => {
    const c = await invitedUser("selfstamp@example.com");
    const r = await c.req("/update-session", { method: "POST", body: { mfaVerifiedAt: new Date().toISOString() } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await row(c)).session.mfaVerifiedAt).toBeNull();
  });
});

describe("enrolment and step-up", () => {
  it("first enrolment yields a NEW stamped 7-day session; re-enrolment is refused", async () => {
    const c = await invitedUser("enrol@example.com");
    const before = (await row(c)).session.id;
    const { totpURI, backupCodes } = await enrolTotp(c);
    expect(backupCodes.length).toBe(10);
    const s = await row(c);
    expect(s.session.id).not.toBe(before);
    expect(mfaSatisfied(s)).toBe(true);
    const ttl = new Date(s.session.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(SESSION_TTL_SECONDS * 1000 - 60_000);
    expect((await c.req("/list-sessions")).status).toBe(200);
    const again = await c.req("/two-factor/enable", { method: "POST", body: {} });
    expect(again.status).toBe(400); // TOTP_ALREADY_ENABLED (MFA'd session)

    // a later Google sign-in is a half session that must VERIFY (cannot re-enrol)
    const c2 = client(env.auth);
    await googleSignIn(c2);
    expect((await c2.req("/two-factor/enable", { method: "POST", body: {} })).status).toBe(403);
    const bad = await c2.req("/two-factor/verify-totp", { method: "POST", body: { code: "000000" } });
    expect(bad.status).toBe(401);
    expect((await row(c2)).session.mfaVerifiedAt).toBeNull();
    const up = await c2.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } });
    expect(up.status).toBe(200);
    const s2 = await row(c2);
    expect(mfaSatisfied(s2)).toBe(true);
    expect(new Date(s2.session.expiresAt).getTime() - Date.now()).toBeGreaterThan(SESSION_TTL_SECONDS * 1000 - 60_000);
  });

  it("a TOTP code is accepted once per user (replay refused)", async () => {
    const c = await invitedUser("replay@example.com");
    const { totpURI } = await enrolTotp(c);
    const code = await totpAt(totpURI, 1);
    const a = client(env.auth);
    await googleSignIn(a);
    expect((await a.req("/two-factor/verify-totp", { method: "POST", body: { code } })).status).toBe(200);
    const b = client(env.auth);
    await googleSignIn(b);
    const r = await b.req("/two-factor/verify-totp", { method: "POST", body: { code } });
    expect(r.status).toBe(401);
    expect(r.json.code).toBe("TOTP_REPLAYED");
  });

  it(`revokes a half session after ${MFA_MAX_FAILURES_PER_SESSION} wrong codes`, async () => {
    const c = await invitedUser("brute@example.com");
    await enrolTotp(c);
    const h = client(env.auth);
    await googleSignIn(h);
    for (let i = 0; i < MFA_MAX_FAILURES_PER_SESSION - 1; i++) {
      expect((await h.req("/two-factor/verify-totp", { method: "POST", body: { code: "000001" } })).status).toBe(401);
    }
    expect((await row(h)).session.mfaFailures).toBe(MFA_MAX_FAILURES_PER_SESSION - 1);
    await h.req("/two-factor/verify-totp", { method: "POST", body: { code: "000001" } });
    expect(await row(h)).toBeNull();
  });

  it("backup-code regeneration needs a second factor within the last 5 minutes", async () => {
    const c = await invitedUser("stepup@example.com");
    const { totpURI } = await enrolTotp(c);
    expect((await c.req("/two-factor/generate-backup-codes", { method: "POST", body: {} })).status).toBe(200);
    const sid = (await row(c)).session.id;
    env.db.prepare("UPDATE session SET mfaVerifiedAt = ? WHERE id = ?").run(new Date(Date.now() - 10 * 60_000).toISOString(), sid);
    const stale = await c.req("/two-factor/generate-backup-codes", { method: "POST", body: {} });
    expect(stale.status).toBe(403);
    expect(stale.json.code).toBe("STEP_UP_REQUIRED");
    expect((await c.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } })).status).toBe(200);
    expect((await c.req("/two-factor/generate-backup-codes", { method: "POST", body: {} })).status).toBe(200);
  });

  it("a backup code also satisfies the gate, once", async () => {
    const c = await invitedUser("backup@example.com");
    const { backupCodes } = await enrolTotp(c);
    const h = client(env.auth);
    await googleSignIn(h);
    expect((await h.req("/two-factor/verify-backup-code", { method: "POST", body: { code: backupCodes[0] } })).status).toBe(200);
    expect(mfaSatisfied(await row(h))).toBe(true);
    const h2 = client(env.auth);
    await googleSignIn(h2);
    expect((await h2.req("/two-factor/verify-backup-code", { method: "POST", body: { code: backupCodes[0] } })).status).toBe(401);
  });
});
