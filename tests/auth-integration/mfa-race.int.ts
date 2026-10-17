// (B-3) The MFA failure counters are atomic. Before the fix, 30 parallel wrong
// codes across 30 sessions were all verified: each request read the counter as
// 0 and wrote 1. Regression: however many wrong codes are in flight at once,
// at most MFA_MAX_FAILURES_PER_USER (per user) / MFA_MAX_FAILURES_PER_SESSION
// (per session) reach the verifier.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { MFA_MAX_FAILURES_PER_SESSION, MFA_MAX_FAILURES_PER_USER } from "@/lib/server/auth-config.mjs";

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
