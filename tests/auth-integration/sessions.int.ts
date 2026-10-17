// (E) Session policy, revocation, authorization from the member table, the
// SessionContext resolver on a real database, shared rate limiting, proxy IPs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, tempDir, totpAt } from "./helpers.mjs";
import { createOrg } from "../../scripts/create-org.mjs";
import { SESSION_TTL_SECONDS } from "@/lib/server/auth-config.mjs";
import { createSessionResolver, type AuthBackend, type Membership } from "@/lib/server/session";

/* eslint-disable @typescript-eslint/no-explicit-any */
let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let env: any;
let resolve: (h: Headers) => ReturnType<ReturnType<typeof createSessionResolver>>;
let n = 0;

function seed(email: string) {
  n += 1;
  return createOrg({ name: `Org ${n}`, slug: `org-${n}`, ownerEmail: email, tenant: `tenant-${n}`, db: env.file, tenantMap: `${env.dir}/tenants.json`, publicUrl: "http://localhost:3000" }, () => {});
}
async function signIn(email: string) {
  claims = { sub: `g-${email}`, email, email_verified: true, name: email };
  const c = client(env.auth, { userAgent: "vitest" });
  await googleSignIn(c);
  return c;
}

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  env = await freshAuth();
  // The production resolver, with a backend over THIS auth instance and DB.
  const backend: AuthBackend = {
    getSession: (h) => env.auth.api.getSession({ headers: h }),
    findMembership: async (u, o) => (env.db.prepare("SELECT organizationId, role FROM member WHERE userId=? AND organizationId=?").get(u, o) as Membership) ?? null,
    listMemberships: async (u) => env.db.prepare("SELECT organizationId, role FROM member WHERE userId=?").all(u) as Membership[],
  };
  resolve = createSessionResolver(backend);
});
afterAll(() => {
  google.restore();
  env.cleanup();
});

describe("session lifetime", () => {
  it("7-day absolute expiry, no sliding refresh, no session_data cookie, expired -> anonymous", async () => {
    seed("life@example.com");
    const c = await signIn("life@example.com");
    await enrolTotp(c);
    const s0 = (await c.req("/get-session")).json.session;
    expect(Math.abs(new Date(s0.expiresAt).getTime() - new Date(s0.createdAt).getTime() - SESSION_TTL_SECONDS * 1000)).toBeLessThan(5000);
    const near = new Date(Date.now() + 86400e3 - 60e3).toISOString();
    env.db.prepare("UPDATE session SET expiresAt=? WHERE id=?").run(near, s0.id);
    const r = await c.req("/get-session");
    expect(env.db.prepare("SELECT expiresAt FROM session WHERE id=?").get(s0.id).expiresAt).toBe(near);
    expect(r.headers.getSetCookie().join(";")).not.toMatch(/session_data/);
    expect([...c.jar.keys()].some((k: string) => k.includes("session_data"))).toBe(false);
    env.db.prepare("UPDATE session SET expiresAt=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), s0.id);
    expect((await c.req("/get-session")).json).toBeNull();
    expect((await resolve(c.headers())).status).toBe("anonymous");
  });

  it("cookies are HttpOnly, SameSite=Lax (Secure with an https base URL)", async () => {
    seed("cookie@example.com");
    claims = { sub: "g-cookie", email: "cookie@example.com", email_verified: true, name: "C" };
    const c = client(env.auth);
    const r = await googleSignIn(c);
    const sc = r.cb.headers.getSetCookie().find((x: string) => x.includes("session_token"));
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
  });
});

describe("revocation", () => {
  it("revoking another device's session takes effect on its next request", async () => {
    seed("rev@example.com");
    const a = await signIn("rev@example.com");
    const { totpURI } = await enrolTotp(a);
    const b = await signIn("rev@example.com");
    expect((await b.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpAt(totpURI, 1) } })).status).toBe(200);
    const sessions = (await a.req("/list-sessions")).json;
    const bId = (await b.req("/get-session")).json.session.id;
    const target = sessions.find((s: any) => s.id === bId);
    expect((await a.req("/revoke-session", { method: "POST", body: { token: target.token } })).status).toBe(200);
    expect((await b.req("/get-session")).json).toBeNull();
    expect((await resolve(b.headers())).status).toBe("anonymous");
    const ctx = await env.auth.$context;
    await ctx.internalAdapter.deleteUserSessions((await a.req("/get-session")).json.user.id);
    expect((await a.req("/get-session")).json).toBeNull();
  });
});

describe("authorization comes from the member table", () => {
  it("resolves org + role + permissions; a removed member loses access on the next request despite a stale activeOrganizationId", async () => {
    const { orgId, invitationId } = seed("boss@example.com");
    const boss = await signIn("boss@example.com");
    await enrolTotp(boss);
    expect((await resolve(boss.headers())).status).toBe("no_org"); // MFA'd, no membership yet
    expect((await boss.req("/organization/accept-invitation", { method: "POST", body: { invitationId } })).status).toBe(200);

    const st = await resolve(boss.headers());
    expect(st.status).toBe("ok");
    if (st.status !== "ok") return;
    expect(st.context.orgId).toBe(orgId);
    expect(st.context.role).toBe("owner");
    expect(st.context.permissions).toEqual(["campaigns:archive", "campaigns:read", "campaigns:write", "org:admin"]);
    expect(st.context.mfaVerified).toBe(true);
    expect(typeof st.context.authenticatedAt).toBe("number");

    const inv = await boss.req("/organization/invite-member", { method: "POST", body: { email: "m@example.com", role: "member", organizationId: orgId } });
    const m = await signIn("m@example.com");
    await enrolTotp(m);
    expect((await m.req("/organization/accept-invitation", { method: "POST", body: { invitationId: inv.json.id } })).status).toBe(200);
    const ms = await resolve(m.headers());
    expect(ms.status === "ok" && ms.context.permissions).toEqual(["campaigns:read", "campaigns:write"]);

    // role change is picked up immediately
    const memberId = env.db.prepare("SELECT id FROM member WHERE organizationId=? AND userId=(SELECT id FROM user WHERE email='m@example.com')").get(orgId).id;
    expect((await boss.req("/organization/update-member-role", { method: "POST", body: { memberId, role: "viewer", organizationId: orgId } })).status).toBe(200);
    const vs = await resolve(m.headers());
    expect(vs.status === "ok" && vs.context.permissions).toEqual(["campaigns:read"]);

    // removal
    expect((await boss.req("/organization/remove-member", { method: "POST", body: { memberIdOrEmail: "m@example.com", organizationId: orgId } })).status).toBe(200);
    expect((await m.req("/get-session")).json.session.activeOrganizationId).toBe(orgId); // stale hint in the session row
    const gone = await resolve(m.headers());
    expect(gone.status).toBe("no_org");
    if (gone.status === "no_org") {
      expect(gone.context.orgId).toBeNull();
      expect(gone.context.permissions).toEqual([]);
    }
  });

  it("a half (un-MFA'd) session never resolves to a usable context", async () => {
    seed("halfctx@example.com");
    const c = await signIn("halfctx@example.com");
    expect((await resolve(c.headers())).status).toBe("mfa_required");
  });
});

describe("rate limiting and client IPs", () => {
  const run = (args: string[], extraEnv: Record<string, string> = {}) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
    delete childEnv.TEST; // Better Auth's isTest() would short-circuit IP resolution
    return JSON.parse(
      execFileSync(process.execPath, args, { env: childEnv, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim()
        .split("\n")
        .pop()!,
    );
  };

  it("storage 'database' shares the limit across processes on one DB file (memory would not)", () => {
    const dir = tempDir("kalos-rl-");
    try {
      for (const storage of ["database", "memory"]) {
        const file = path.join(dir, `${storage}.db`);
        const worker = path.join(__dirname, "_rl-worker.mjs");
        const r1 = run([worker, storage, file, "3"]);
        const r2 = run([worker, storage, file, "3"]);
        const n429 = [...r1, ...r2].filter((x: number) => x === 429).length;
        expect(n429, `${storage}: ${r1} | ${r2}`).toBe(storage === "database" ? 3 : 0);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AUTH_TRUSTED_PROXIES / AUTH_IP_ADDRESS_HEADERS drive client-IP resolution", () => {
    const ip = run([path.join(__dirname, "_ip-worker.mjs")], { NODE_ENV: "production" });
    expect(ip.trusted).toBe("198.51.100.1");
    expect(ip.multiNoTrust).toBeNull();
    expect(ip.single).toBe("6.6.6.6"); // spoofable unless the proxy overwrites XFF - see docs/AUTH.md
    expect(ip.realIp).toBe("198.51.100.2");
    expect(ip.none).toBeNull();
  });
});
