// (B-3) The MFA failure counters are atomic. Before the fix, 30 parallel wrong
// codes across 30 sessions were all verified: each request read the counter as
// 0 and wrote 1. Regression: however many wrong codes are in flight at once,
// at most MFA_MAX_FAILURES_PER_USER (per user) / MFA_MAX_FAILURES_PER_SESSION
// (per session) reach the verifier.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, totpNow } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { admitVerifyAttempt, exclusiveMfaAccounting, MFA_MAX_FAILURES_PER_SESSION, MFA_MAX_FAILURES_PER_USER, MFA_USER_LOCK_SECONDS } from "@/lib/server/auth-config.mjs";
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

  // Regression (double count): each wrong code was counted by the stock
  // accountLockout AND by Kalos, so the lock fired after 5 wrong codes. Exactly
  // MFA_MAX_FAILURES_PER_USER wrong codes are allowed; the next one is refused.
  // A fresh challenge per attempt: Better Auth also caps one challenge cookie at 5.
  it(`exactly ${MFA_MAX_FAILURES_PER_USER} wrong codes are allowed without a session; the ${MFA_MAX_FAILURES_PER_USER + 1}th is locked`, async () => {
    const email = "race-exact@example.com";
    invite(email);
    const owner = await halfSession(email);
    const enrolled = await enrolTotp(owner);
    const userId = env.db.prepare("SELECT id FROM user WHERE email = ?").get(email).id;
    const cur = await totpNow(enrolled.totpURI);
    const wrong = () => String((Number(cur) + 500_000) % 1_000_000).padStart(6, "0"); // never a neighbouring valid step

    const seen: Array<[number, unknown]> = [];
    for (let i = 0; i < MFA_MAX_FAILURES_PER_USER; i++) {
      const r = await sessionless(userId, wrong());
      seen.push([r.status, r.json?.code]);
      expect(reachedVerifier(r), `wrong code ${i + 1}: ${JSON.stringify(seen)}`).toBe(true);
    }
    const over = await sessionless(userId, wrong());
    expect(over.status).toBe(429);
    expect(over.json?.code).toBe("TWO_FACTOR_LOCKED");
    const right = await sessionless(userId, await totpNow(enrolled.totpURI));
    expect(right.status).toBe(429);
  });

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

// (M-3) A timed-out accounting section keeps running in the background. Its
// counter writes must be increments (or guarded), never a value read before the
// section timed out: a late write must not clear a lock set after the timeout.
describe("M-3: a late write from a timed-out section cannot corrupt the counter", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Every write of the adapter lands `ms` late (reads are immediate).
  function delayWrites(adapter: any, ms: number) {
    const late = (fn: any) => async (a: any) => {
      await sleep(ms);
      return fn(a);
    };
    return { ...adapter, update: late(adapter.update), incrementOne: late(adapter.incrementOne), findOne: adapter.findOne };
  }

  it("a section that overruns its deadline cannot clear a lock set after it timed out", async () => {
    const email = "race-late@example.com";
    invite(email);
    const owner = await halfSession(email);
    await enrolTotp(owner);
    const base = await env.auth.$context;
    const userId = env.db.prepare("SELECT id FROM user WHERE email = ?").get(email).id;
    const subject = { userId, token: null };
    const slowCtx = { context: { adapter: delayWrites(base.adapter, 80), internalAdapter: base.internalAdapter } };

    // The section's writes land ~80 ms in; its deadline is 20 ms.
    const err: any = await exclusiveMfaAccounting(userId, () => admitVerifyAttempt(slowCtx, subject), { timeoutMs: 20 }).catch((e) => e);
    expect(err?.body?.code ?? err?.code).toBe("MFA_ACCOUNTING_TIMEOUT");

    // Meanwhile the user is locked by another section (budget spent).
    const lockedUntil = new Date(Date.now() + MFA_USER_LOCK_SECONDS * 1000);
    await base.adapter.update({ model: "twoFactor", where: [{ field: "userId", value: userId }], update: { failedVerificationCount: MFA_MAX_FAILURES_PER_USER, lockedUntil } });

    await sleep(300); // let the late writes land
    const tf = await base.adapter.findOne({ model: "twoFactor", where: [{ field: "userId", value: userId }] });
    expect(new Date(tf.lockedUntil).getTime()).toBe(lockedUntil.getTime());
    expect(Number(tf.failedVerificationCount)).toBe(MFA_MAX_FAILURES_PER_USER);
  });
});
