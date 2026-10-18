// (B-1) The authenticated engine proxy on a REAL Better Auth database.
//
// Probes the requirement from the security review item B-1 end to end:
// real sessions (Google sign-in through the fake provider, TOTP enrolment,
// sign-out, expiry set in the DB), real member rows, the real tenant map file,
// a real Ed25519 signing key (KALOS_ENGINE_JWT_PRIVATE_KEY_FILE), the real
// session resolver (lib/server/session.ts over Better Auth) and the real proxy
// (lib/server/engine-proxy.ts). Only the engine is replaced: a recording fetch.
//
// The Next route wrapper (app/api/engine/[...path]/route.ts) is not loaded
// here (it binds the process-wide auth singleton); the proxy is built with
// the same deps the route uses.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { execFileSync } from "node:child_process";
import { client, enrolTotp, freshAuth, googleSignIn, interceptGoogle, makeSigner, tempDir, BASE } from "./helpers.mjs";
import { createSessionResolver, type AuthBackend, type Membership } from "@/lib/server/session";
import { SYSTEM_USER_ID } from "../../scripts/create-org.mjs";
import { createEngineProxy } from "@/lib/server/engine-proxy";
import { loadEngineSigner } from "@/lib/server/engine-token";
import { fileTenantResolver } from "@/lib/server/tenants";
import { createRateLimiter } from "@/lib/server/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ENGINE = "http://engine.internal:8050";
const KID = "kalos-web-int-1";

let claims: Record<string, unknown> = {};
let google: { restore: () => void };
let auth: any;
let db: any;
let dir: string;
let publicKey: KeyObject;
let env: Record<string, string | undefined>;
let engineReply: (init: RequestInit) => Promise<Response> | Response;
let engineCalls: { url: string; init: RequestInit }[];
let handle: (req: Request, segments: string[]) => Promise<Response>;
const ids: Record<string, string> = {};

const engineOk = () => Response.json({ ok: true });

/** Sign in through the fake Google provider; returns the cookie-jar client. */
async function signIn(email: string) {
  // Sign-up is invitation-only: a pending invitation for the email is the gate.
  const iso = new Date().toISOString();
  db.prepare(
    "INSERT INTO invitation (id, organizationId, email, role, status, expiresAt, createdAt, inviterId) VALUES (?, 'org-a', ?, 'member', 'pending', ?, ?, ?)",
  ).run(`inv_${email}`, email, new Date(Date.now() + 86_400_000).toISOString(), iso, SYSTEM_USER_ID);
  claims = { sub: `g-${email}`, email, email_verified: true, name: email };
  const c = client(auth, { userAgent: "vitest" });
  await googleSignIn(c);
  const row = db.prepare('SELECT id FROM "user" WHERE email=?').get(email) as { id: string };
  ids[email] = row.id;
  return c;
}
const sessionRow = (userEmail: string) =>
  db.prepare('SELECT s.id AS id FROM session s JOIN "user" u ON u.id=s.userId WHERE u.email=? ORDER BY s.createdAt DESC LIMIT 1').get(userEmail) as { id: string };

function addMember(email: string, orgId: string, role: string) {
  db.prepare('INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?,?,?,?,?)').run(
    `m_${email}_${orgId}`,
    orgId,
    ids[email],
    role,
    new Date().toISOString(),
  );
}
function removeMember(email: string, orgId: string) {
  db.prepare("DELETE FROM member WHERE userId=? AND organizationId=?").run(ids[email], orgId);
}

/** Request through the proxy. `cookie` is a raw cookie header or a cookie-jar client. */
async function api(
  method: string,
  segs: string[],
  o: { cookie?: string | null; headers?: Record<string, string>; body?: BodyInit; query?: string; csrf?: boolean; url?: string } = {},
) {
  const headers = new Headers(o.headers ?? {});
  if (o.cookie !== null) headers.set("cookie", o.cookie ?? "");
  if (method !== "GET" && method !== "HEAD" && o.csrf !== false) {
    // Browser defaults for a same-origin fetch, unless the test sets its own.
    if (!headers.has("origin")) headers.set("origin", BASE);
    if (!headers.has("sec-fetch-site")) headers.set("sec-fetch-site", "same-origin");
    if (!headers.has("x-kalos-csrf")) headers.set("x-kalos-csrf", "1");
  }
  const url = o.url ?? `${BASE}/api/engine/${segs.map((s) => encodeURIComponent(s)).join("/")}${o.query ? `?${o.query}` : ""}`;
  const init: RequestInit & { duplex?: string } = { method, headers, body: o.body };
  if (o.body instanceof ReadableStream) init.duplex = "half";
  return handle(new Request(url, init), segs);
}
const cookieOf = (c: { headers: () => Headers }) => c.headers().get("cookie") ?? "";
const sent = () => engineCalls.at(-1)!;
const sentHeaders = () => new Headers(sent().init.headers as HeadersInit);
async function claimsOf(i = engineCalls.length - 1) {
  const auth = new Headers(engineCalls[i].init.headers as HeadersInit).get("authorization") ?? "";
  expect(auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  const token = auth.slice(7);
  const { payload } = await jwtVerify(token, publicKey, { issuer: "kalos-web", audience: "kalos-engine", algorithms: ["EdDSA"] });
  return { payload, header: decodeProtectedHeader(token), token };
}

beforeAll(async () => {
  google = interceptGoogle(await makeSigner(), () => claims);
  const f = await freshAuth();
  auth = f.auth;
  db = f.db;
  dir = tempDir("kalos-engine-int-");

  // Engine signing key: PKCS#8 PEM file, as the deployment mounts it.
  const pair = generateKeyPairSync("ed25519");
  publicKey = pair.publicKey;
  const keyFile = path.join(dir, "engine.pem");
  fs.writeFileSync(keyFile, pair.privateKey.export({ type: "pkcs8", format: "pem" }) as string);

  // Operator tenant map (org -> tenant). org-c is deliberately unmapped.
  const tenantFile = path.join(dir, "tenants.json");
  fs.writeFileSync(tenantFile, JSON.stringify({ "org-a": "tenant-a", "org-b": "tenant-b" }));

  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO \"user\" (id, name, email, emailVerified, image, createdAt, updatedAt, twoFactorEnabled) VALUES (?, 'Kalos operator', 'operator@kalos.invalid', 0, NULL, ?, ?, 0)",
  ).run(SYSTEM_USER_ID, now, now);
  for (const [id, name] of [["org-a", "Org A"], ["org-b", "Org B"], ["org-c", "Org C (unmapped)"]]) {
    db.prepare('INSERT INTO organization (id, name, slug, createdAt) VALUES (?,?,?,?)').run(id, name, id, now);
  }

  // The production resolver, over THIS Better Auth instance.
  const backend: AuthBackend = {
    getSession: (h) => auth.api.getSession({ headers: h }),
    findMembership: async (u, o) => (db.prepare("SELECT organizationId, role FROM member WHERE userId=? AND organizationId=?").get(u, o) as Membership) ?? null,
    listMemberships: async (u) => db.prepare("SELECT m.organizationId AS organizationId, m.role AS role FROM member m WHERE m.userId=?").all(u) as Membership[],
  };
  const resolve = createSessionResolver(backend);

  env = {
    NODE_ENV: "production",
    KALOS_PUBLIC_URL: BASE,
    KALOS_ENGINE_URL: ENGINE,
    KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: keyFile,
    KALOS_ENGINE_JWT_KID: KID,
    KALOS_TENANT_MAP_FILE: tenantFile,
  };
  const tenants = fileTenantResolver(() => env.KALOS_TENANT_MAP_FILE);
  handle = createEngineProxy({
    resolveSession: (h) => resolve(h as Headers),
    resolveTenant: (orgId) => tenants.resolveTenant(orgId),
    loadSigner: () => loadEngineSigner(env),
    fetch: () => (async (url: string | URL | Request, init?: RequestInit) => {
      engineCalls.push({ url: String(url), init: init ?? {} });
      // Like undici: a streamed request body is read, so a body that breaks
      // the cap surfaces as a fetch failure (the proxy then answers 413).
      if (init?.body instanceof ReadableStream) await new Response(init.body).arrayBuffer();
      return engineReply(init ?? {});
    }) as typeof fetch,
    env: () => env,
    rateLimiter: createRateLimiter(),
    log: () => {},
  });
});
beforeEach(() => {
  engineCalls = [];
  engineReply = engineOk;
});
afterAll(() => {
  google.restore();
  db?.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// Accounts: owner (MFA, org-a admin), admin, member, viewer, multi (member of
// org-a and org-b), stranger (no membership), half (never enrolled TOTP).
let cOwner: ReturnType<typeof client>, cAdmin: ReturnType<typeof client>, cMember: ReturnType<typeof client>;
let cViewer: ReturnType<typeof client>, cMulti: ReturnType<typeof client>, cStranger: ReturnType<typeof client>;
let cHalf: ReturnType<typeof client>;

beforeAll(async () => {
  cOwner = await signIn("owner@example.com");
  await enrolTotp(cOwner);
  cAdmin = await signIn("admin@example.com");
  await enrolTotp(cAdmin);
  cMember = await signIn("member@example.com");
  await enrolTotp(cMember);
  cViewer = await signIn("viewer@example.com");
  await enrolTotp(cViewer);
  cMulti = await signIn("multi@example.com");
  await enrolTotp(cMulti);
  cStranger = await signIn("stranger@example.com");
  await enrolTotp(cStranger);
  cHalf = await signIn("half@example.com");

  addMember("owner@example.com", "org-a", "owner");
  addMember("admin@example.com", "org-a", "admin");
  addMember("member@example.com", "org-a", "member");
  addMember("viewer@example.com", "org-a", "viewer");
  addMember("multi@example.com", "org-a", "viewer");
  addMember("multi@example.com", "org-b", "member");
  addMember("half@example.com", "org-a", "member");
});

describe("B-1: every request is authenticated by a real session", () => {
  it("no cookie -> 401, engine never called", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: null });
    expect(r.status).toBe(401);
    expect(engineCalls).toHaveLength(0);
  });

  it("a forged session token -> 401 (cookie presence is not authentication)", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: "better-auth.session_token=forged.0000" });
    expect(r.status).toBe(401);
    expect(engineCalls).toHaveLength(0);
  });

  it("a session row that does not exist in the DB -> 401", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: "better-auth.session_token=00000000000000000000000000000000.deadbeef" });
    expect(r.status).toBe(401);
  });

  it("valid member session -> 200, engine called with a server-minted token", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(r.status).toBe(200);
    expect(engineCalls).toHaveLength(1);
  });

  it("expired session (expiresAt in the past in the DB) -> 401", async () => {
    const c = await signIn("expired@example.com");
    await enrolTotp(c);
    addMember("expired@example.com", "org-a", "member");
    const s = sessionRow("expired@example.com");
    db.prepare("UPDATE session SET expiresAt=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), s.id);
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(c) });
    expect(r.status).toBe(401);
    expect(engineCalls).toHaveLength(0);
  });

  it("revoked session (sign-out): the very next proxied request is 401", async () => {
    const c = await signIn("revoked@example.com");
    await enrolTotp(c);
    addMember("revoked@example.com", "org-a", "member");
    expect((await api("GET", ["api", "latest"], { cookie: cookieOf(c) })).status).toBe(200);
    await c.req("/sign-out", { method: "POST", body: {} });
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(c) });
    expect(r.status).toBe(401);
    expect(engineCalls).toHaveLength(1); // only the pre-revocation call
  });

  it("MFA-pending session (signed in, TOTP never verified) -> 403 MFA_REQUIRED, engine never called", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cHalf) });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "mfa_required", code: "MFA_REQUIRED" });
    const w = await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cHalf),
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(w.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });

  it("signed-in user with no organization membership -> 403, engine never called", async () => {
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cStranger) });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });

  it("removing the only membership takes effect on the next request (no stale grant)", async () => {
    const c = await signIn("leaver@example.com");
    await enrolTotp(c);
    addMember("leaver@example.com", "org-a", "member");
    expect((await api("GET", ["api", "latest"], { cookie: cookieOf(c) })).status).toBe(200);
    removeMember("leaver@example.com", "org-a");
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(c) });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(1);
  });
});

describe("B-1: tenant comes from the member table and the server map only", () => {
  it("token tenant is the mapped tenant of the member's organization", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const { payload } = await claimsOf();
    expect(payload.tenant).toBe("tenant-a");
    expect(payload.sub).toBe(ids["member@example.com"]);
    expect(payload.sid).toBe(sessionRow("member@example.com").id);
  });

  it("an organization with no tenant mapping -> 403 organization_not_provisioned (never a default tenant)", async () => {
    const c = await signIn("unmapped@example.com");
    await enrolTotp(c);
    addMember("unmapped@example.com", "org-c", "member");
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(c) });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "organization_not_provisioned" });
    expect(engineCalls).toHaveLength(0);
  });

  it("cross-org: a session hint naming an org the user does NOT belong to -> 403, never that org's tenant", async () => {
    // multi belongs to org-a and org-b; the hint names org-c (no membership).
    const s = sessionRow("multi@example.com");
    db.prepare("UPDATE session SET activeOrganizationId=? WHERE id=?").run("org-c", s.id);
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMulti) });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });

  it("cross-org: a hint naming another org the user DOES belong to -> that org's tenant and role", async () => {
    const s = sessionRow("multi@example.com");
    db.prepare("UPDATE session SET activeOrganizationId=? WHERE id=?").run("org-b", s.id);
    const r = await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cMulti),
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    // multi is a plain member of org-b: write allowed, tenant is org-b's.
    expect(r.status).toBe(200);
    const { payload } = await claimsOf();
    expect(payload.tenant).toBe("tenant-b");
    expect(payload.scopes).toEqual(["campaigns:write"]); // the route's scope only (least privilege)
  });

  it("a client cannot pick the tenant: headers, query, body and path all ignored", async () => {
    await api("GET", ["api", "campaigns", "cmp_0123456789abcdef0123456789abcdef"], {
      cookie: cookieOf(cMember),
      query: "tenant=tenant-b&org=org-b",
      headers: { "x-kalos-tenant": "tenant-b", "x-tenant-id": "tenant-b", "x-org-id": "org-b" },
    });
    expect((await claimsOf()).payload.tenant).toBe("tenant-a");
    await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cMember),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant: "tenant-b", tenant_id: "default", org_id: "org-b" }),
    });
    expect((await claimsOf()).payload.tenant).toBe("tenant-a");
  });
});

describe("B-1: role scope (viewer read-only; write and admin by role)", () => {
  it("viewer read -> token carries campaigns:read only", async () => {
    expect((await api("GET", ["api", "campaigns"], { cookie: cookieOf(cViewer) })).status).toBe(200);
    expect((await claimsOf()).payload.scopes).toEqual(["campaigns:read"]);
  });

  it("viewer write -> 403 insufficient_scope, engine never called", async () => {
    const r = await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cViewer),
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "insufficient_scope" });
    expect(engineCalls).toHaveLength(0);
  });

  it("viewer upload (multipart) -> 403, engine never called", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "a.csv");
    const r = await api("POST", ["api", "run"], { cookie: cookieOf(cViewer), body: fd });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });

  it("member write -> token carries campaigns:write only, never org:admin", async () => {
    expect((await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(cMember), headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(200);
    expect((await claimsOf()).payload.scopes).toEqual(["campaigns:write"]);
  });

  it("admin read still gets only campaigns:read (least privilege per request)", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cAdmin) });
    expect((await claimsOf()).payload.scopes).toEqual(["campaigns:read"]);
  });

  it("removing a member's role takes effect on the next request (role read from the member row)", async () => {
    const c = await signIn("demoted@example.com");
    await enrolTotp(c);
    addMember("demoted@example.com", "org-a", "member");
    await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(c), headers: { "content-type": "application/json" }, body: "{}" });
    expect((await claimsOf()).payload.scopes).toContain("campaigns:write");
    db.prepare("UPDATE member SET role='viewer' WHERE userId=? AND organizationId='org-a'").run(ids["demoted@example.com"]);
    const r = await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(c), headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });
});

describe("B-1: the engine token (60 s EdDSA, claims from the server-side session)", () => {
  it("alg EdDSA, kid, iss, aud, sub, sid, tenant, scopes, jti, iat/nbf/exp with exp-iat = 60", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const { payload, header } = await claimsOf();
    expect(header).toMatchObject({ alg: "EdDSA", typ: "JWT", kid: KID });
    expect(payload).toMatchObject({ iss: "kalos-web", aud: "kalos-engine", tenant: "tenant-a" });
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(payload.nbf).toBe(payload.iat);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "nbf", "scopes", "sid", "sub", "tenant"]);
  });

  it("a fresh jti per request, and the token is not the client's", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember), headers: { authorization: "Bearer eyJhbGciOiJFZERTQSJ9.e30.x" } });
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const a = await claimsOf(engineCalls.length - 2);
    const b = await claimsOf(engineCalls.length - 1);
    expect(a.payload.jti).not.toBe(b.payload.jti);
    expect(a.token).not.toContain("eyJhbGciOiJFZERTQSJ9");
  });

  it("the token does not verify with any other key", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const { token } = await claimsOf();
    const other = generateKeyPairSync("ed25519").publicKey;
    await expect(jwtVerify(token, other, { issuer: "kalos-web", audience: "kalos-engine", algorithms: ["EdDSA"] })).rejects.toThrow();
  });

  it("the engine's wrong 401 becomes 502 (never a 401 that looks like a sign-out)", async () => {
    engineReply = () => new Response("nope", { status: 401 });
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: "engine_auth_failed" });
  });
});

describe("B-1: client headers never reach the engine", () => {
  it("client Authorization, Cookie, X-Forwarded-*, X-Kalos-*, Host are not forwarded; the engine sees only the minted token", async () => {
    await api("GET", ["api", "latest"], {
      cookie: cookieOf(cMember),
      headers: {
        authorization: "Bearer forged.forged.forged",
        "x-forwarded-for": "203.0.113.9",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
        "x-kalos-tenant": "tenant-b",
        "x-real-ip": "203.0.113.9",
        host: "evil.example",
        "x-internal-debug": "1",
      },
    });
    const h = sentHeaders();
    for (const k of ["cookie", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-kalos-tenant", "x-real-ip", "host", "x-internal-debug"]) {
      expect(h.has(k), k).toBe(false);
    }
    expect(h.get("authorization")).not.toContain("forged");
    expect((await claimsOf()).payload.tenant).toBe("tenant-a");
  });

  it("the browser cookie never reaches the engine even when the engine echoes it", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(JSON.stringify(engineCalls[0].init.headers ?? {})).not.toContain("better-auth.session_token");
  });
});

describe("B-1: CSRF / origin on every mutating method, cross-site reads refused", () => {
  const body = { headers: { "content-type": "application/json" }, body: "{}" };
  it("POST with a cross-origin Origin -> 403, engine never called", async () => {
    const r = await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(cMember), ...body, headers: { ...body.headers, origin: "https://evil.example", "sec-fetch-site": "cross-site", "x-kalos-csrf": "1" } });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });
  it("POST without Origin -> 403", async () => {
    const r = await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(cMember), ...body, headers: { ...body.headers, "x-kalos-csrf": "1" }, csrf: false });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });
  it("POST without the X-Kalos-CSRF marker (plain HTML form style) -> 403", async () => {
    const r = await api("POST", ["api", "campaign", "start"], { cookie: cookieOf(cMember), ...body, csrf: false, headers: { ...body.headers, origin: BASE } });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });
  it("PATCH and DELETE are CSRF-checked too", async () => {
    // PATCH exists in the table (CSRF runs first). DELETE has no route at all, so it is 405 before any check.
    const p = await api("PATCH", ["api", "campaigns", "cmp_0123456789abcdef0123456789abcdef"], { cookie: cookieOf(cMember), ...body, csrf: false });
    expect(p.status).toBe(403);
    const d = await api("DELETE", ["api", "campaigns", "cmp_0123456789abcdef0123456789abcdef"], { cookie: cookieOf(cMember), csrf: false });
    expect(d.status).toBe(405);
    expect(engineCalls).toHaveLength(0);
  });
  it("a cross-site GET (third-party page) is refused before any engine work", async () => {
    const r = await api("GET", ["api", "single"], { cookie: cookieOf(cMember), headers: { "sec-fetch-site": "cross-site" } });
    expect(r.status).toBe(403);
    expect(engineCalls).toHaveLength(0);
  });
});

describe("B-1: path allow-list (no traversal, no encoded slash, no absolute URL, exact routes)", () => {
  const cases: [string, string[], string?][] = [
    ["dot-dot segment", ["api", "..", "healthz"]],
    ["encoded dot-dot (decoded by Next to ..)", ["api", "campaigns", ".."]],
    ["encoded slash (decoded to /)", ["api", "campaigns", "a/b"]],
    ["double-encoded slash survives as %2f in a segment", ["api", "latest%2f.."]],
    ["backslash traversal", ["api", "latest\\..\\healthz"]],
    ["absolute URL as segments", ["http:", "", "evil.example", "api", "latest"]],
    ["protocol-relative as segments", ["", "evil.example", "api", "latest"]],
    ["engine health probe (not in the table)", ["healthz"]],
    ["engine readiness probe (not in the table)", ["readyz"]],
    ["unknown route", ["api", "admin", "users"]],
    ["NUL byte", ["api", "latest\u0000"]],
    ["empty segment", ["api", "", "latest"]],
  ];
  for (const [name, segs] of cases) {
    it(`${name} -> 404, engine never called`, async () => {
      const r = await api("GET", segs, { cookie: cookieOf(cMember), url: `${BASE}/api/engine/x` });
      expect(r.status).toBe(404);
      expect(engineCalls).toHaveLength(0);
    });
  }

  it("raw percent-encoded slash / dot-dot / double encoding in the URL -> 404 even when Next decoded them away", async () => {
    for (const raw of ["/api/engine/api/campaigns/a%2fb", "/api/engine/api/latest%252f..", "/api/engine/api/latest%5c..", "/api/engine/api/latest%00"]) {
      const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember), url: BASE + raw });
      expect(r.status, raw).toBe(404);
    }
    // %2e%2e is a dot-segment: the WHATWG URL parser (and Next's routing) resolve it
    // before the proxy runs, so the request arrives as /api/engine/healthz.
    const dd = await api("GET", ["healthz"], { cookie: cookieOf(cMember), url: `${BASE}/api/engine/api/%2e%2e/healthz` });
    expect(dd.status).toBe(404);
    expect(engineCalls).toHaveLength(0);
  });

  it("the engine URL is built from the origin only: segments are re-encoded, never a host", async () => {
    await api("GET", ["api", "campaigns", "cmp_0123456789abcdef0123456789abcdef"], { cookie: cookieOf(cMember) });
    expect(engineCalls[0].url).toBe(`${ENGINE}/api/campaigns/cmp_0123456789abcdef0123456789abcdef`);
  });

  it("an allowed method on a path that exists with another method -> 405 (not forwarded)", async () => {
    const r = await api("DELETE", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(r.status).toBe(405);
    expect(engineCalls).toHaveLength(0);
  });
});

describe("B-1: response filtering, size and timeout limits", () => {
  it("engine Set-Cookie and other non-allow-listed headers are dropped on the way back", async () => {
    engineReply = () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "engine=1; Path=/", "x-engine-build": "abc", server: "uvicorn" },
      });
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(r.headers.get("x-engine-build")).toBeNull();
    expect(r.headers.get("server")).toBeNull();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("a declared JSON body over 1 MiB -> 413, engine never called", async () => {
    const r = await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cMember),
      headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024) },
      body: "{}",
    });
    expect(r.status).toBe(413);
    expect(engineCalls).toHaveLength(0);
  });

  it("a streamed JSON body with no Content-Length, past the cap -> 413 (counted while streaming)", async () => {
    const chunk = new Uint8Array(600 * 1024).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(chunk);
        ctl.enqueue(chunk);
        ctl.close();
      },
    });
    const r = await api("POST", ["api", "campaign", "start"], {
      cookie: cookieOf(cMember),
      headers: { "content-type": "application/json" },
      body: stream as unknown as BodyInit,
    });
    expect(r.status).toBe(413);
  });

  it("an engine that never answers -> 504 and the engine request is aborted", async () => {
    env.KALOS_ENGINE_TIMEOUT_MS = "50";
    let aborted = false;
    engineReply = (init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      });
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    delete env.KALOS_ENGINE_TIMEOUT_MS;
    expect(r.status).toBe(504);
    expect(aborted).toBe(true);
  });

  it("engine 5xx bodies (stack traces) never reach the client", async () => {
    engineReply = () => new Response("Traceback (most recent call last): /srv/kalos/secret.py", { status: 500 });
    const r = await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("Traceback");
  });
});

describe("B-1: the token is short-lived and the audit line has identifiers only", () => {
  it("decodeJwt of the forwarded token: exp is at most 60 s after iat", async () => {
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const tok = (sentHeaders().get("authorization") ?? "").slice(7);
    const p = decodeJwt(tok);
    expect(p.exp! - p.iat!).toBeLessThanOrEqual(60);
  });
});

describe("B-1: the engine's trust store (public JWKS derived from the signing key)", () => {
  const jwksScript = path.join(__dirname, "..", "..", "scripts", "engine-jwks.mjs");
  const runJwks = (extra: Record<string, string | undefined> = {}) => {
    const childEnv: Record<string, string> = { PATH: process.env.PATH ?? "", ...(env as Record<string, string>) };
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) delete childEnv[k];
      else childEnv[k] = v;
    }
    return execFileSync(process.execPath, [jwksScript], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] }).toString();
  };

  it("the JWKS has exactly one Ed25519 OKP key with the configured kid and NO private member", () => {
    const doc = JSON.parse(runJwks());
    expect(doc.keys).toHaveLength(1);
    expect(doc.keys[0]).toEqual({ kty: "OKP", crv: "Ed25519", x: expect.any(String), kid: KID, alg: "EdDSA", use: "sig" });
    expect(doc.keys[0]).not.toHaveProperty("d");
  });

  it("a proxied token verifies with the key from the JWKS (what the engine will do)", async () => {
    const [jwk] = JSON.parse(runJwks()).keys;
    const key = await importJWK(jwk, "EdDSA");
    await api("GET", ["api", "latest"], { cookie: cookieOf(cMember) });
    const token = (sentHeaders().get("authorization") ?? "").slice(7);
    const { payload, protectedHeader } = await jwtVerify(token, key, { issuer: "kalos-web", audience: "kalos-engine", algorithms: ["EdDSA"] });
    expect(protectedHeader.kid).toBe(jwk.kid);
    expect(payload.tenant).toBe("tenant-a");
  });

  it("refuses a missing kid, a bad kid, a missing file and an RSA key (exit 2, nothing on stdout)", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const rsaFile = path.join(dir, "rsa.pem");
    fs.writeFileSync(rsaFile, rsa);
    for (const extra of [
      { KALOS_ENGINE_JWT_KID: undefined },
      { KALOS_ENGINE_JWT_KID: "bad kid/with spaces" },
      { KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: path.join(dir, "missing.pem") },
      { KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: rsaFile },
    ]) {
      let out = "";
      try {
        out = runJwks(extra);
      } catch (err) {
        expect((err as { status: number }).status).toBe(2);
        out = String((err as { stdout: Buffer }).stdout ?? "");
      }
      expect(out).toBe("");
    }
  });
});
