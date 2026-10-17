// (B-3) The MFA failure counters are atomic. Before the fix, 30 parallel wrong
// codes across 30 sessions were all verified: each request read the counter as
// 0 and wrote 1. Regression: however many wrong codes are in flight at once,
// at most MFA_MAX_FAILURES_PER_USER (per user) / MFA_MAX_FAILURES_PER_SESSION
// (per session) reach the verifier.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, totpNow } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { MFA_MAX_FAILURES_PER_SESSION, MFA_MAX_FAILURES_PER_USER } from "@/lib/server/auth-config.mjs";
import { serializeSignedCookie } from "better-call";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let env: any;
let n = 0;
const PARALLEL = 30;
// Reached the verifier = the verifier itself rejected the code (INVALID_CODE).
// Refused by the counters (429 TWO_FACTOR_LOCKED, 401 SESSION_REVOKED) or by a
// revoked session (INVALID_TWO_FACTOR_COOKIE) does not count.
const reachedVerifier = (r: any) => r.status === 401 && r.json?.code === "INVALID_CODE";

function invite(email: string) {
  n += 1;
  return createOrg({ name: `Race ${n}`, slug: `race-${n}`, ownerEmail: email, tenant: `race-${n}`, db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
}
async function halfSession(email: string) {
  claims = { sub: `g-${email}`, email, email_verified: true, name: email };
  const c = client(env.auth);
  await googleSignIn(c);
  return c;
}

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  env = await freshAuth();
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

describe("B-3: parallel wrong codes cannot exceed the caps", () => {
  it(`per USER: ${PARALLEL} parallel wrong codes over ${PARALLEL} sessions -> at most ${MFA_MAX_FAILURES_PER_USER} reach the verifier`, async () => {
    const email = "race-user@example.com";
    invite(email);
    const owner = await halfSession(email);
    await enrolTotp(owner);
    const sessions: any[] = [];
    for (let i = 0; i < PARALLEL; i++) sessions.push(await halfSession(email));

    const res = await Promise.all(sessions.map((h, i) => h.req("/two-factor/verify-totp", { method: "POST", body: { code: String(100000 + i * 7).padStart(6, "0") } })));

    const reached = res.filter(reachedVerifier).length;
    const refused = res.filter((r) => r.status === 429 && r.json?.code === "TWO_FACTOR_LOCKED").length;
    expect(reached, JSON.stringify(res.map((r) => [r.status, r.json?.code]))).toBeLessThanOrEqual(MFA_MAX_FAILURES_PER_USER);
    expect(reached + refused).toBe(PARALLEL);
    expect(refused).toBeGreaterThanOrEqual(PARALLEL - MFA_MAX_FAILURES_PER_USER);

    const tf = env.db.prepare("SELECT failedVerificationCount, lockedUntil FROM twoFactor t JOIN user u ON u.id = t.userId WHERE u.email = ?").get(email);
    expect(tf.lockedUntil).not.toBeNull();
    // and the lock holds for a correct code on a fresh session
    const fresh = await halfSession(email);
    expect((await fresh.req("/two-factor/verify-backup-code", { method: "POST", body: { code: "xxxxx-xxxxx" } })).status).toBe(429);
  });

  it(`per SESSION: ${PARALLEL} parallel wrong codes on ONE session -> at most ${MFA_MAX_FAILURES_PER_SESSION} reach the verifier, then the session is revoked`, async () => {
    const email = "race-session@example.com";
    invite(email);
    const owner = await halfSession(email);
    await enrolTotp(owner);
    const h = await halfSession(email);

    const res = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => h.req("/two-factor/verify-totp", { method: "POST", body: { code: String(200000 + i * 3).padStart(6, "0") } })));

    const reached = res.filter(reachedVerifier).length;
    expect(reached, JSON.stringify(res.map((r) => [r.status, r.json?.code]))).toBeLessThanOrEqual(MFA_MAX_FAILURES_PER_SESSION);
    expect(reached).toBeGreaterThanOrEqual(1);
    const row = env.db.prepare("SELECT s.id FROM session s JOIN user u ON u.id = s.userId WHERE u.email = ?").all(email);
    expect(row.length).toBe(1); // only the owner's (already elevated) session survives
  });
});

describe("I5: session-less verification (two_factor challenge cookie) is counted too", () => {
  // A challenge cookie + verification row stand in for a sign-in that did not
  // create a session (Better Auth's two-factor challenge). Kalos disables the
  // password sign-in that normally creates one, so this is defence in depth.
  async function challengeCookie(userId: string) {
    const ctx = await env.auth.$context;
    const identifier = `2fa-${Math.random().toString(36).slice(2)}${Date.now()}`;
    const expiresAt = new Date(Date.now() + 600_000);
    await ctx.internalAdapter.createVerificationValue({ value: userId, identifier, expiresAt });
    await ctx.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt });
    const name = ctx.createAuthCookie("two_factor").name;
    const header = (await serializeSignedCookie(name, identifier, ctx.secret)).split(";")[0];
    return { name, value: header.slice(header.indexOf("=") + 1) };
  }
  async function sessionless(userId: string, code: string) {
    const c = client(env.auth);
    const ch = await challengeCookie(userId);
    c.jar.set(ch.name, ch.value);
    return c.req("/two-factor/verify-totp", { method: "POST", body: { code } });
  }

  it(`${PARALLEL} parallel wrong codes without a session -> at most ${MFA_MAX_FAILURES_PER_USER} reach the verifier, then the user is locked`, async () => {
    const email = "race-challenge@example.com";
    invite(email);
    const owner = await halfSession(email);
    const enrolled = await enrolTotp(owner);
    const userId = env.db.prepare("SELECT id FROM user WHERE email = ?").get(email).id;

    const res = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => sessionless(userId, String(300000 + i * 11).padStart(6, "0"))));
    const reached = res.filter(reachedVerifier).length;
    expect(reached, JSON.stringify(res.map((r) => [r.status, r.json?.code]))).toBeLessThanOrEqual(MFA_MAX_FAILURES_PER_USER);
    expect(reached + res.filter((r) => r.status === 429).length).toBe(PARALLEL);

    // the lock holds for the CORRECT code too
    const after = await sessionless(userId, await totpNow(enrolled.totpURI));
    expect(after.status).toBe(429);
    expect(after.json?.code).toBe("TWO_FACTOR_LOCKED");
  });
});
