// app/api/engine/[...path]/route.ts end to end, with only the auth DATABASE
// faked: the real session resolver (lib/server/session.ts
// createSessionResolver: MFA + member-table authorization), the real tenant
// map (temp file), the real minter (temp Ed25519 key) and the real route
// table / CSRF / rate limiter run. The auth layer is replaced with vi.mock -
// there is no bypass flag in production code (asserted at the bottom).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { NextRequest } from "next/server";
import { decodeProtectedHeader, jwtVerify, SignJWT } from "jose";
import type { AuthBackend, Membership } from "@/lib/server/session";

// --- fake auth database, behind the real resolver ---------------------------
type FakeSession = {
  session: { id: string; userId: string; createdAt: Date; expiresAt: Date; mfaVerifiedAt: Date | null; activeOrganizationId: string | null };
  user: { id: string; email: string; twoFactorEnabled: boolean };
};
const db = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  members: [] as { userId: string; organizationId: string; role: string }[],
  now: 0,
  throwOnLookup: false,
}));

vi.mock("@/lib/server/session", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/session")>();
  const backend: AuthBackend = {
    // Emulates Better Auth: DB lookup by the session cookie, expired = none.
    async getSession(h) {
      if (db.throwOnLookup) throw new Error("db down");
      const m = /(?:^|;\s*)better-auth\.session_token=([^;]+)/.exec(h.get("cookie") ?? "");
      const s = m ? (db.sessions.get(m[1]) as FakeSession | undefined) : undefined;
      if (!s || s.session.expiresAt.getTime() <= db.now) return null;
      return s as never;
    },
    async findMembership(userId, organizationId) {
      return (db.members.find((x) => x.userId === userId && x.organizationId === organizationId) as Membership | undefined) ?? null;
    },
    async listMemberships(userId) {
      return db.members.filter((x) => x.userId === userId) as Membership[];
    },
  };
  const resolver = real.createSessionResolver(backend, () => db.now);
  return { ...real, resolveSession: vi.fn((h: Headers) => resolver(h)) };
});

const { GET, HEAD, POST, PATCH, DELETE, PUT, OPTIONS } = await import("@/app/api/engine/[...path]/route");
const { defaultRateLimiter } = await import("@/lib/server/engine-proxy");

// --- fixtures ----------------------------------------------------------------
const APP = "http://localhost:3000";
const ENGINE = "http://engine.internal:8050";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const CMP = "cmp_0123456789abcdef0123456789abcdef";

let dir: string;
let publicKey: KeyObject;
let attackerKey: KeyObject;

function addSession(token: string, userId: string, opts: { activeOrg?: string | null; mfaAgoMs?: number | null; expiresInMs?: number } = {}) {
  const mfa = opts.mfaAgoMs === undefined ? 30_000 : opts.mfaAgoMs;
  db.sessions.set(token, {
    session: {
      id: `S-${token.slice(4)}`, // distinct from the cookie token, as in Better Auth
      userId,
      createdAt: new Date(NOW - 60_000),
      expiresAt: new Date(NOW + (opts.expiresInMs ?? 7 * 86_400_000)),
      mfaVerifiedAt: mfa === null ? null : new Date(NOW - mfa),
      activeOrganizationId: opts.activeOrg ?? null,
    },
    user: { id: userId, email: `${userId}@example.com`, twoFactorEnabled: true },
  } satisfies FakeSession);
}
const cookieFor = (token: string) => `better-auth.session_token=${token}; theme=dark`;

const HANDLERS = { GET, HEAD, POST, PATCH, DELETE, PUT, OPTIONS } as const;
type Method = keyof typeof HANDLERS;

interface CallOpts {
  token?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  query?: string;
  csrf?: boolean;
  signal?: AbortSignal;
  url?: string;
}

function call(method: Method, path: string, o: CallOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.token !== null) headers.cookie = cookieFor(o.token ?? "tok_member");
  if (method !== "GET" && method !== "HEAD" && o.csrf !== false) {
    headers.origin = APP;
    headers["sec-fetch-site"] = "same-origin";
    headers["x-kalos-csrf"] = "1";
  }
  Object.assign(headers, o.headers ?? {});
  const url = o.url ?? `${APP}/api/engine/${path}${o.query ? `?${o.query}` : ""}`;
  const init: Record<string, unknown> = { method, headers, signal: o.signal };
  if (o.body !== undefined && o.body !== null) {
    init.body = o.body;
    if (o.body instanceof ReadableStream) init.duplex = "half";
  }
  const req = new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
  return HANDLERS[method](req, { params: Promise.resolve({ path: path.split("/") }) });
}

const json = (body: unknown) => JSON.stringify(body);
const engineOk = (body: unknown = { ok: true }, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
const sent = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit & { duplex?: string }];
const sentHeaders = (i = 0) => sent(i)[1].headers as Headers;
async function sentClaims(i = 0) {
  const auth = sentHeaders(i).get("authorization") ?? "";
  expect(auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  const token = auth.slice("Bearer ".length);
  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    issuer: "kalos-web",
    audience: "kalos-engine",
    algorithms: ["EdDSA"],
    currentDate: new Date(NOW),
  });
  return { payload, protectedHeader, token };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "kalos-proxy-test-"));
  const kp = generateKeyPairSync("ed25519");
  publicKey = kp.publicKey;
  attackerKey = generateKeyPairSync("ed25519").privateKey;
  writeFileSync(join(dir, "engine.pem"), kp.privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
  writeFileSync(join(dir, "tenants.json"), json({ org_a: "tenant-a", org_b: "tenant-b", org_reserved: "default" }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.now = NOW;
  db.throwOnLookup = false;
  db.sessions.clear();
  db.members = [
    { userId: "u_viewer", organizationId: "org_a", role: "viewer" },
    { userId: "u_member", organizationId: "org_a", role: "member" },
    { userId: "u_admin", organizationId: "org_a", role: "admin" },
    { userId: "u_owner", organizationId: "org_a", role: "owner" },
    { userId: "u_multi", organizationId: "org_a", role: "member" },
    { userId: "u_multi", organizationId: "org_b", role: "admin" },
    { userId: "u_unmapped", organizationId: "org_unmapped", role: "admin" },
    { userId: "u_reserved", organizationId: "org_reserved", role: "admin" },
    { userId: "u_weird", organizationId: "org_a", role: "superuser" },
  ];
  addSession("tok_viewer", "u_viewer");
  addSession("tok_member", "u_member");
  addSession("tok_admin", "u_admin");
  addSession("tok_owner", "u_owner");
  addSession("tok_multi", "u_multi", { activeOrg: "org_a" });
  addSession("tok_unmapped", "u_unmapped");
  addSession("tok_reserved", "u_reserved");
  addSession("tok_weird", "u_weird");
  addSession("tok_nomember", "u_nobody");
  addSession("tok_nomfa", "u_member", { mfaAgoMs: null });
  addSession("tok_expired", "u_member", { expiresInMs: -1 });
  addSession("tok_admin_stale", "u_admin", { mfaAgoMs: 3_600_000 });

  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("KALOS_ENGINE_URL", ENGINE);
  vi.stubEnv("KALOS_PUBLIC_URL", APP);
  vi.stubEnv("BETTER_AUTH_URL", APP);
  vi.stubEnv("KALOS_TENANT_MAP_FILE", join(dir, "tenants.json"));
  vi.stubEnv("KALOS_ENGINE_JWT_PRIVATE_KEY_FILE", join(dir, "engine.pem"));
  vi.stubEnv("KALOS_ENGINE_JWT_KID", "kalos-web-test");
  vi.stubEnv("KALOS_MAX_UPLOAD_MB", "1");
  vi.stubEnv("KALOS_ENGINE_TOKEN", "legacy-static-token-must-never-be-sent");
  fetchMock = vi.fn(async () => engineOk());
  vi.stubGlobal("fetch", fetchMock);
  defaultRateLimiter.reset();
  logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  logSpy.mockRestore();
});

// --- authentication ------------------------------------------------------------
describe("authentication (session resolved server-side on every request)", () => {
  it("anonymous -> 401, engine never called", async () => {
    const res = await call("GET", "api/latest", { token: null });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unknown / forged session cookie -> 401", async () => {
    expect((await call("GET", "api/latest", { token: "tok_forged" })).status).toBe(401);
    expect((await call("GET", "api/latest", { token: null, headers: { cookie: "better-auth.session_token=" } })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expired session -> 401", async () => {
    expect((await call("GET", "api/latest", { token: "tok_expired" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revoked session: the very next request after revocation is 401", async () => {
    expect((await call("GET", "api/latest", { token: "tok_member" })).status).toBe(200);
    db.sessions.delete("tok_member"); // revoke (settings/security or operator kill switch)
    expect((await call("GET", "api/latest", { token: "tok_member" })).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("auth backend failure fails closed (401)", async () => {
    db.throwOnLookup = true;
    expect((await call("GET", "api/latest")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("session without a second factor -> 403 MFA_REQUIRED", async () => {
    const res = await call("GET", "api/latest", { token: "tok_nomfa" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "mfa_required", code: "MFA_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("user without membership in any organization -> 403", async () => {
    const res = await call("GET", "api/latest", { token: "tok_nomember" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "no_organization" });
  });

  it("a member row with an unknown role grants nothing -> 403", async () => {
    expect((await call("GET", "api/latest", { token: "tok_weird" })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only the cookie header reaches the auth layer", async () => {
    const { resolveSession } = await import("@/lib/server/session");
    const spy = vi.mocked(resolveSession);
    spy.mockClear();
    await call("GET", "api/latest", { headers: { authorization: "Bearer x.y.z", "x-forwarded-for": "1.2.3.4" } });
    const h = spy.mock.calls[0][0];
    expect([...h.keys()]).toEqual(["cookie"]);
  });
});

// --- tenancy -----------------------------------------------------------------
describe("tenant (operator map, active membership at request time)", () => {
  it("token tenant follows the ACTIVE org membership; switching orgs switches tenant and scopes", async () => {
    await call("GET", "api/latest", { token: "tok_multi" });
    expect((await sentClaims(0)).payload).toMatchObject({ tenant: "tenant-a", scopes: ["campaigns:read"] });
    (db.sessions.get("tok_multi") as FakeSession).session.activeOrganizationId = "org_b";
    await call("POST", "api/campaign/start", { token: "tok_multi", headers: { "content-type": "application/json" }, body: json({ recipes: [] }) });
    expect((await sentClaims(1)).payload).toMatchObject({ tenant: "tenant-b", scopes: ["campaigns:write"] });
  });

  it("a removed member is refused at once, although the session still names the org", async () => {
    addSession("tok_b_only", "u_b_only", { activeOrg: "org_b" });
    db.members.push({ userId: "u_b_only", organizationId: "org_b", role: "member" });
    expect((await call("GET", "api/latest", { token: "tok_b_only" })).status).toBe(200);
    db.members = db.members.filter((m) => m.userId !== "u_b_only");
    const res = await call("GET", "api/latest", { token: "tok_b_only" });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removal from the active org never keeps that tenant (falls back only to a sole remaining membership)", async () => {
    (db.sessions.get("tok_multi") as FakeSession).session.activeOrganizationId = "org_b";
    db.members = db.members.filter((m) => !(m.userId === "u_multi" && m.organizationId === "org_b"));
    await call("GET", "api/latest", { token: "tok_multi" });
    expect((await sentClaims(0)).payload.tenant).toBe("tenant-a");
  });

  it("an org with no tenant mapping -> 403 (never a default tenant)", async () => {
    const res = await call("GET", "api/latest", { token: "tok_unmapped" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "organization_not_provisioned" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an org mapped to the engine-reserved 'default' tenant -> 403", async () => {
    expect((await call("GET", "api/latest", { token: "tok_reserved" })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no tenant map configured -> 403 for everyone", async () => {
    vi.stubEnv("KALOS_TENANT_MAP_FILE", join(dir, "missing.json"));
    expect((await call("GET", "api/latest", { token: "tok_admin" })).status).toBe(403);
  });

  it("cross-tenant: client-supplied tenant headers, query, body and path ids never change the minted tenant", async () => {
    await call("PATCH", `api/campaigns/${CMP}`, {
      token: "tok_member",
      query: "tenant=tenant-b&tenant_id=tenant-b&org=org_b",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "tenant-b",
        "x-kalos-tenant": "tenant-b",
        "x-organization-id": "org_b",
      },
      body: json({ name: "x", tenant: "tenant-b", organizationId: "org_b" }),
    });
    const { payload } = await sentClaims(0);
    expect(payload.tenant).toBe("tenant-a");
    expect(payload.sub).toBe("u_member");
    const h = sentHeaders(0);
    expect(h.has("x-tenant-id")).toBe(false);
    expect(h.has("x-kalos-tenant")).toBe(false);
    expect(h.has("x-organization-id")).toBe(false);
  });
});

// --- authorization -----------------------------------------------------------
describe("scopes (role from the member table x route)", () => {
  it("viewer GET -> forwarded with campaigns:read only", async () => {
    expect((await call("GET", "api/campaign", { token: "tok_viewer" })).status).toBe(200);
    expect((await sentClaims()).payload.scopes).toEqual(["campaigns:read"]);
  });

  it.each([
    ["api/campaign/start", "application/json", json({ recipes: [] })],
    ["api/campaigns", "application/json", json({ name: "x" })],
    [`api/campaigns/${CMP}/runs`, "application/json", json({ recipes: [] })],
  ])("viewer POST %s -> 403", async (path, ct, body) => {
    const res = await call("POST", path, { token: "tok_viewer", headers: { "content-type": ct }, body });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "insufficient_scope" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("viewer upload -> 403", async () => {
    const fd = new FormData();
    fd.append("file", new File(["a,b\n1,2"], "s.csv", { type: "text/csv" }));
    expect((await call("POST", "api/run", { token: "tok_viewer", body: fd })).status).toBe(403);
  });

  it("member write -> forwarded with campaigns:write only (least privilege per request)", async () => {
    await call("POST", "api/campaign/result", { headers: { "content-type": "application/json" }, body: json({ id: "x", value: 1 }) });
    expect((await sentClaims()).payload.scopes).toEqual(["campaigns:write"]);
  });

  it("admin GET still gets only campaigns:read (never org:admin on a read)", async () => {
    await call("GET", "api/campaigns", { token: "tok_admin" });
    expect((await sentClaims()).payload.scopes).toEqual(["campaigns:read"]);
  });

  it.each([true, false])("member archive/unarchive (archived=%s) -> 403, engine never called", async (archived) => {
    const res = await call("PATCH", `api/campaigns/${CMP}`, { headers: { "content-type": "application/json" }, body: json({ archived }) });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "insufficient_scope", required: "org:admin" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("member rename (no `archived`, or archived: null) is a plain write", async () => {
    await call("PATCH", `api/campaigns/${CMP}`, { headers: { "content-type": "application/json" }, body: json({ name: "Round 2" }) });
    await call("PATCH", `api/campaigns/${CMP}`, { headers: { "content-type": "application/json" }, body: json({ name: "Round 3", archived: null }) });
    expect((await sentClaims(0)).payload.scopes).toEqual(["campaigns:write"]);
    expect((await sentClaims(1)).payload.scopes).toEqual(["campaigns:write"]);
    // The exact bytes that were inspected are the bytes forwarded.
    expect(new TextDecoder().decode(sent(1)[1].body as Uint8Array)).toBe(json({ name: "Round 3", archived: null }));
  });

  it.each(["tok_admin", "tok_owner"])("%s archive with a recent second factor -> write + org:admin", async (token) => {
    const res = await call("PATCH", `api/campaigns/${CMP}`, { token, headers: { "content-type": "application/json" }, body: json({ archived: true }) });
    expect(res.status).toBe(200);
    expect((await sentClaims()).payload.scopes).toEqual(["campaigns:write", "org:admin"]);
  });

  it("admin archive with a stale second factor -> 403 STEP_UP_REQUIRED", async () => {
    const res = await call("PATCH", `api/campaigns/${CMP}`, { token: "tok_admin_stale", headers: { "content-type": "application/json" }, body: json({ archived: true }) });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "step_up_required", code: "STEP_UP_REQUIRED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("archive detection cannot be dodged by escapes in the key", async () => {
    const res = await call("PATCH", `api/campaigns/${CMP}`, { headers: { "content-type": "application/json" }, body: '{"\\u0061rchived": true}' });
    expect(res.status).toBe(403);
  });

  it("PATCH body that is not a JSON object -> 400, engine never called", async () => {
    for (const body of ["not json", "[1]", "null"]) {
      const res = await call("PATCH", `api/campaigns/${CMP}`, { token: "tok_admin", headers: { "content-type": "application/json" }, body });
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- client credentials are ignored --------------------------------------------
describe("client-supplied credentials", () => {
  async function forgedJwt() {
    return new SignJWT({ tenant: "tenant-b", scopes: ["campaigns:read", "campaigns:write", "org:admin"], sid: "s", jti: crypto.randomUUID() })
      .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: "kalos-web-test" })
      .setIssuer("kalos-web")
      .setAudience("kalos-engine")
      .setSubject("u_admin")
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(attackerKey);
  }

  it("a forged engine JWT in Authorization without a session -> 401", async () => {
    const res = await call("GET", "api/latest", { token: null, headers: { authorization: `Bearer ${await forgedJwt()}` } });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with a session, the client's Authorization is replaced by the server-minted token", async () => {
    const forged = await forgedJwt();
    await call("GET", "api/latest", { headers: { authorization: `Bearer ${forged}`, "proxy-authorization": "Basic eDp5" } });
    const { payload, token } = await sentClaims();
    expect(token).not.toBe(forged);
    expect(payload).toMatchObject({ tenant: "tenant-a", sub: "u_member", scopes: ["campaigns:read"] });
    expect(sentHeaders().has("proxy-authorization")).toBe(false);
  });

  it("the legacy static KALOS_ENGINE_TOKEN is never sent", async () => {
    await call("GET", "api/latest");
    expect(sentHeaders().get("authorization")).not.toContain("legacy-static-token");
  });
});

// --- CSRF ----------------------------------------------------------------------
describe("CSRF / origin", () => {
  const post = (headers: Record<string, string>, body: BodyInit = json({ recipes: [] })) =>
    call("POST", "api/campaign/start", { csrf: false, headers: { "content-type": "application/json", ...headers }, body });

  it("cross-origin POST -> 403", async () => {
    const res = await post({ origin: "https://evil.example", "x-kalos-csrf": "1" });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "csrf_rejected", reason: "origin_mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST without Origin -> 403", async () => {
    const res = await post({ "x-kalos-csrf": "1", "sec-fetch-site": "same-origin", referer: `${APP}/campaign/plan` });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ reason: "origin_missing" });
  });

  it("POST without the X-Kalos-CSRF marker -> 403", async () => {
    expect((await post({ origin: APP, "sec-fetch-site": "same-origin" })).status).toBe(403);
  });

  it("Sec-Fetch-Site: cross-site wins over a spoofed Origin", async () => {
    expect((await post({ origin: APP, "x-kalos-csrf": "1", "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it.each(["application/x-www-form-urlencoded", "text/plain", "text/plain;charset=UTF-8"])(
    "form-post content type %s -> 415 even with valid CSRF headers",
    async (ct) => {
      const res = await call("POST", "api/campaign/start", { headers: { "content-type": ct }, body: "recipes=x" });
      expect(res.status).toBe(415);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("multipart on a JSON route and JSON on an upload route -> 415", async () => {
    const fd = new FormData();
    fd.append("x", "y");
    expect((await call("POST", "api/campaign/start", { body: fd })).status).toBe(415);
    expect((await call("POST", "api/run", { headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(415);
  });

  it("a cross-site GET is refused too (no engine work on a third-party page's behalf)", async () => {
    expect((await call("GET", "api/single", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await call("GET", "api/latest", { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CSRF is checked before the session (no session work for a forged cross-site POST)", async () => {
    const res = await call("POST", "api/campaign/start", { token: null, csrf: false, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});

// --- paths and methods ---------------------------------------------------------
describe("paths and methods", () => {
  it.each([
    ["dot-dot", "api/run/../../admin"],
    ["single dot", "api/run/./x"],
    ["empty segment", "api/campaigns//x"],
    ["decoded encoded slash", "api/campaigns/..%2f..%2fadmin"],
    ["backslash", "api/campaigns/a\\b"],
    ["query injection", "api/campaigns/x?a=b"],
    ["fragment injection", "api/campaigns/x#y"],
    ["double encoding", "api/campaigns/%2e%2e"],
    ["null byte", "api/campaigns/a\u0000b"],
    ["unknown route", "api/admin/secrets"],
    ["engine probe", "healthz"],
    ["engine readiness", "readyz"],
    ["removed experiments route", "api/experiments"],
    ["prefix collision", "api/campaignish"],
  ])("%s -> 404, engine never called", async (_n, path) => {
    const res = await call("GET", path, { url: `${APP}/api/engine/api/latest` });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    `${APP}/api/engine/api/campaigns/a%2fb`,
    `${APP}/api/engine/api/campaigns/a%5Cb`,
    `${APP}/api/engine/api/campaigns/a%252e%252e`,
    `${APP}/api/engine/api/campaigns/a%00`,
  ])("raw URL %s -> 404 even if the decoded segments look fine", async (url) => {
    const res = await call("GET", `api/campaigns/${CMP}`, { url });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only to KALOS_ENGINE_URL, with re-encoded path and re-serialised query", async () => {
    await call("GET", "api/campaigns", { query: "include_archived=true&x=a%20b" });
    expect(sent()[0]).toBe(`${ENGINE}/api/campaigns?include_archived=true&x=a+b`);
    expect(sent()[1].redirect).toBe("manual");
  });

  it("keeps an engine base path (root_path deployments)", async () => {
    vi.stubEnv("KALOS_ENGINE_URL", "http://engine.internal:8050/kalos/");
    await call("GET", "api/latest");
    expect(sent()[0]).toBe("http://engine.internal:8050/kalos/api/latest");
  });

  it.each(["ftp://engine", "http://user:pw@engine.internal", "http://engine.internal/?x=1", "not a url", ""])(
    "KALOS_ENGINE_URL %j is refused (502, no fetch)",
    async (v) => {
      vi.stubEnv("KALOS_ENGINE_URL", v);
      const res = await call("GET", "api/latest");
      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual({ error: "engine_not_configured" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("PUT and OPTIONS -> 405", async () => {
    expect((await call("PUT", "api/campaign/start")).status).toBe(405);
    const res = await call("OPTIONS", "api/latest", { csrf: false, headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("known path with the wrong method -> 405 with Allow", async () => {
    const res = await call("POST", "api/latest", { headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
    expect((await call("DELETE", `api/campaigns/${CMP}`)).status).toBe(405);
  });

  it("HEAD is forwarded as HEAD with read scope and no body", async () => {
    const res = await call("HEAD", "api/latest");
    expect(res.status).toBe(200);
    expect(sent()[1].method).toBe("HEAD");
    expect(res.body).toBeNull();
  });

  it("query strings with control characters or over 2 KB -> 400", async () => {
    expect((await call("GET", "api/campaigns", { query: "a=%0d%0aX-Injected:1" })).status).toBe(400);
    expect((await call("GET", "api/campaigns", { query: `a=${"x".repeat(3000)}` })).status).toBe(400);
  });
});

// --- forwarding ------------------------------------------------------------------
describe("request forwarding", () => {
  it("strips client Authorization, Cookie, Host, X-Forwarded-*, x-kalos-*, hop-by-hop and other headers", async () => {
    await call("POST", "api/campaign/start", {
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: "Bearer attacker",
        "x-forwarded-for": "6.6.6.6",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
        forwarded: "for=6.6.6.6",
        "x-real-ip": "6.6.6.6",
        "x-kalos-tenant": "tenant-b",
        "x-kalos-anything": "1",
        "x-tenant-id": "tenant-b",
        connection: "keep-alive, x-foo",
        "keep-alive": "timeout=5",
        te: "trailers",
        upgrade: "websocket",
        "x-foo": "bar",
        "user-agent": "curl/8",
        "x-request-id": "client-chosen",
      },
      body: json({ recipes: [] }),
    });
    const h = sentHeaders();
    expect([...h.keys()].sort()).toEqual(["accept", "authorization", "content-type", "x-request-id"]);
    expect(h.get("x-request-id")).not.toBe("client-chosen");
    expect(h.get("content-type")).toBe("application/json");
  });

  it("streams a multipart upload through with the boundary intact", async () => {
    const fd = new FormData();
    fd.append("file", new File(["a,b\n1,2"], "sheet.csv", { type: "text/csv" }));
    fd.append("name", "Feed test");
    fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => engineOk({ got: await new Response(init.body as ReadableStream).text() }));
    const res = await call("POST", "api/run", { body: fd });
    const [url, init] = sent();
    expect(url).toBe(`${ENGINE}/api/run`);
    expect((init.headers as Headers).get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.duplex).toBe("half");
    const { got } = (await res.json()) as { got: string };
    expect(got).toContain("Feed test");
    expect(got).toContain("a,b\n1,2");
  });

  it("a JSON route called without a content type forwards no body (reanalyze)", async () => {
    const res = await call("POST", "api/campaign/reanalyze");
    expect(res.status).toBe(200);
    expect(sent()[1].body).toBeUndefined();
    expect(sentHeaders().has("content-type")).toBe(false);
  });

  it("client abort propagates to the engine request", async () => {
    const ac = new AbortController();
    let engineSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => {
      engineSignal = init.signal ?? undefined;
      return new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    });
    const pending = call("GET", "api/latest", { signal: ac.signal });
    await vi.waitFor(() => expect(engineSignal).toBeDefined());
    ac.abort();
    const res = await pending;
    expect(engineSignal?.aborted).toBe(true);
    expect(res.status).toBe(499);
  });
});

// --- body limits -----------------------------------------------------------------
describe("body size limits", () => {
  it("declared Content-Length over the upload cap -> 413, engine never called", async () => {
    const res = await call("POST", "api/run", {
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(3 * 1024 * 1024) },
      body: "x",
    });
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chunked upload streaming past the cap is cut off -> 413", async () => {
    fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => {
      const reader = (init.body as ReadableStream<Uint8Array>).getReader();
      for (;;) if ((await reader.read()).done) break;
      return engineOk();
    });
    const chunk = new Uint8Array(512 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 6; i++) c.enqueue(chunk); // 3 MiB > 1 MiB + 1 MiB headroom
        c.close();
      },
    });
    const res = await call("POST", "api/run", { headers: { "content-type": "multipart/form-data; boundary=x" }, body: stream });
    expect(res.status).toBe(413);
  });

  it("multipart headroom: a file at the limit plus framing still goes through", async () => {
    fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => {
      await new Response(init.body as ReadableStream).arrayBuffer();
      return engineOk();
    });
    const res = await call("POST", "api/run", { headers: { "content-type": "multipart/form-data; boundary=x" }, body: "a".repeat(1024 * 1024 + 100_000) });
    expect(res.status).toBe(200);
  });

  it("JSON bodies are capped at 1 MiB (declared and streamed)", async () => {
    const big = json({ recipes: "x".repeat(1024 * 1024 + 10) });
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      await new Response(init.body as ReadableStream).arrayBuffer();
      return engineOk();
    });
    expect((await call("POST", "api/campaign/start", { headers: { "content-type": "application/json" }, body: big })).status).toBe(413);
    expect((await call("PATCH", `api/campaigns/${CMP}`, { headers: { "content-type": "application/json" }, body: big })).status).toBe(413);
  });
});

// --- engine responses ----------------------------------------------------------------
describe("engine responses", () => {
  it("passes status/body through and drops Set-Cookie and every non-allow-listed header", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(json({ has_data: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "engine=1; Path=/",
          server: "uvicorn",
          "x-powered-by": "fastapi",
          "access-control-allow-origin": "*",
          "x-kalos-internal": "1",
          "www-authenticate": "Bearer",
        },
      }),
    );
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ has_data: true });
    for (const h of ["set-cookie", "server", "x-powered-by", "access-control-allow-origin", "x-kalos-internal", "www-authenticate"]) {
      expect(res.headers.get(h), h).toBeNull();
    }
  });

  it("adds security headers to success and error responses", async () => {
    for (const res of [await call("GET", "api/latest"), await call("GET", "api/latest", { token: null })]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("documented engine error envelopes pass through (constant target, upload errors, 413)", async () => {
    fetchMock.mockResolvedValueOnce(engineOk({ error: "The target column is constant.", code: "constant_target" }, 400));
    const fd = new FormData();
    fd.append("file", new File(["a\n1"], "s.csv"));
    const res = await call("POST", "api/run", { body: fd });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "The target column is constant.", code: "constant_target" });

    fetchMock.mockResolvedValueOnce(engineOk({ error: "upload too large", code: "too_large" }, 413));
    expect((await call("POST", "api/run", { body: fd })).status).toBe(413);
    fetchMock.mockResolvedValueOnce(engineOk({ detail: "requires 'write' scope" }, 403));
    expect((await call("POST", "api/run", { body: fd })).status).toBe(403);
  });

  it("503 busy keeps Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(engineOk({ error: "An analysis is already running." }, 503, { "retry-after": "60" }));
    const res = await call("POST", "api/campaign/reanalyze");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("engine 5xx bodies (stack traces, paths) never reach the client", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Traceback (most recent call last):\n  File "/srv/kalos/portal/app.py"\nKeyError: secret', { status: 500, headers: { "content-type": "text/plain" } }),
    );
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toBe(json({ error: "engine_error" }));
  });

  it("engine 401 (token refused) -> 502 engine_auth_failed, never a 401 that looks like a sign-out", async () => {
    fetchMock.mockResolvedValueOnce(engineOk({ detail: "invalid or expired token" }, 401, { "www-authenticate": "Bearer" }));
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "engine_auth_failed" });
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("engine redirects are not followed or relayed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://evil.example/" } }));
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(502);
    expect(res.headers.get("location")).toBeNull();
  });

  it("engine unreachable -> 502", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "engine_unreachable" });
  });

  it("engine timeout -> 504 and the engine request is aborted", async () => {
    vi.useRealTimers();
    vi.stubEnv("KALOS_ENGINE_TIMEOUT_MS", "20");
    let engineSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => {
      engineSignal = init.signal ?? undefined;
      return new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    });
    db.now = Date.now();
    for (const s of db.sessions.values()) {
      const f = s as FakeSession;
      f.session.mfaVerifiedAt = new Date(db.now - 30_000);
      f.session.expiresAt = new Date(db.now + 86_400_000);
    }
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toEqual({ error: "engine_timeout" });
    expect(engineSignal?.aborted).toBe(true);
  });

  it("the engine token never appears in the response", async () => {
    const res = await call("GET", "api/latest");
    const { token } = await sentClaims();
    const text = await res.text();
    expect(text).not.toContain(token);
    for (const [, v] of res.headers) expect(v).not.toContain(token);
  });
});

// --- token claims ------------------------------------------------------------------
describe("engine token", () => {
  it("is a 60 s EdDSA JWT with iss/aud/sub/sid/tenant/scopes/jti from the server-side session", async () => {
    await call("GET", "api/latest", { token: "tok_viewer" });
    const { payload, protectedHeader, token } = await sentClaims();
    expect(protectedHeader).toEqual({ alg: "EdDSA", typ: "JWT", kid: "kalos-web-test" });
    expect(decodeProtectedHeader(token).alg).toBe("EdDSA");
    expect(payload).toMatchObject({
      iss: "kalos-web",
      aud: "kalos-engine",
      sub: "u_viewer",
      sid: "S-viewer",
      tenant: "tenant-a",
      scopes: ["campaigns:read"],
    });
    expect(payload.iat).toBe(Math.floor(NOW / 1000));
    expect(payload.nbf).toBe(payload.iat);
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(60);
    expect(payload.exp! - payload.iat!).toBeGreaterThan(0);
    expect(payload.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("a fresh jti per request", async () => {
    await call("GET", "api/latest");
    await call("GET", "api/latest");
    expect((await sentClaims(0)).payload.jti).not.toBe((await sentClaims(1)).payload.jti);
  });

  it("signing key unavailable -> 503, engine never called, no detail leaked", async () => {
    vi.stubEnv("KALOS_ENGINE_JWT_PRIVATE_KEY_FILE", join(dir, "nope.pem"));
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(json({ error: "engine_credentials_unavailable" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// --- rate limits and audit ---------------------------------------------------------------
describe("rate limits (in memory, single replica) and audit log", () => {
  it("per-session limit -> 429 with Retry-After", async () => {
    vi.stubEnv("KALOS_PROXY_RATE_LIMIT_SESSION", "2");
    expect((await call("GET", "api/latest")).status).toBe(200);
    expect((await call("GET", "api/latest")).status).toBe(200);
    const res = await call("GET", "api/latest");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // another session is unaffected
    expect((await call("GET", "api/latest", { token: "tok_viewer" })).status).toBe(200);
  });

  it("per-session write limit is separate and tighter", async () => {
    vi.stubEnv("KALOS_PROXY_RATE_LIMIT_WRITES", "1");
    expect((await call("POST", "api/campaign/reanalyze")).status).toBe(200);
    expect((await call("POST", "api/campaign/reanalyze")).status).toBe(429);
    expect((await call("GET", "api/latest")).status).toBe(200);
  });

  it("per-tenant limit spans sessions", async () => {
    vi.stubEnv("KALOS_PROXY_RATE_LIMIT_TENANT", "2");
    expect((await call("GET", "api/latest", { token: "tok_member" })).status).toBe(200);
    expect((await call("GET", "api/latest", { token: "tok_viewer" })).status).toBe(200);
    expect((await call("GET", "api/latest", { token: "tok_admin" })).status).toBe(429);
  });

  it("writes one audit line per request with identifiers only (no body, query, cookie, email, token)", async () => {
    await call("POST", "api/campaign/start", {
      query: "secretq=1",
      headers: { "content-type": "application/json" },
      body: json({ recipes: [{ recipe: { "secret-recipe": 1 } }] }),
    });
    await call("GET", "api/latest", { token: null });
    const lines = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[kalos-audit] "));
    expect(lines).toHaveLength(2);
    const rec = JSON.parse(lines[0].slice("[kalos-audit] ".length));
    expect(rec).toMatchObject({ evt: "engine_proxy", method: "POST", route: "api/campaign/start", status: 200, outcome: "ok", tenant: "tenant-a", uid: "u_member", sid: "S-member" });
    expect(rec.jti).toBe((await sentClaims()).payload.jti);
    const all = lines.join("\n");
    for (const s of ["secret-recipe", "secretq", "tok_member", "@example.com", "Bearer", "theme=dark"]) expect(all).not.toContain(s);
    expect(JSON.parse(lines[1].slice(14))).toMatchObject({ status: 401, outcome: "unauthenticated", uid: null });
  });
});

// --- no bypass -------------------------------------------------------------------------
describe("no production bypass", () => {
  it("the route and proxy contain no env/test switch that skips authentication", () => {
    for (const f of ["app/api/engine/[...path]/route.ts", "lib/server/engine-proxy.ts", "lib/server/csrf.ts", "lib/server/engine-routes.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/BYPASS|SKIP_AUTH|DISABLE_AUTH|VITEST|NODE_ENV\s*===\s*["']test|KALOS_ENGINE_TOKEN/);
    }
  });
});
