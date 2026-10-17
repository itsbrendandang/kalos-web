// lib/server/session.ts with an injected (fake) auth backend, plus the
// default path with the auth layer replaced through vi.mock - there is no
// bypass flag; tests swap the provider module.
import { describe, expect, it, vi } from "vitest";
import { apiDecision, createSessionResolver, pageRedirect, sessionContextFrom, type AuthBackend, type Membership } from "@/lib/server/session";

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const H = new Headers();

function backend(session: unknown, members: Record<string, Membership[]> = {}): AuthBackend & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getSession: async () => session as never,
    findMembership: async (u, o) => {
      calls.push(`find:${o}`);
      return (members[u] ?? []).find((m) => m.organizationId === o) ?? null;
    },
    listMemberships: async (u) => {
      calls.push("list");
      return members[u] ?? [];
    },
  };
}
const verified = (over: Record<string, unknown> = {}) => ({
  session: { id: "s1", userId: "u1", createdAt: new Date(NOW - 60e3), mfaVerifiedAt: new Date(NOW - 30e3), activeOrganizationId: null, ...over },
  user: { id: "u1", email: "u@example.com", twoFactorEnabled: true },
});

describe("createSessionResolver", () => {
  it("no session / backend error -> anonymous", async () => {
    expect((await createSessionResolver(backend(null))(H)).status).toBe("anonymous");
    const throwing: AuthBackend = { ...backend(null), getSession: async () => Promise.reject(new Error("db down")) };
    expect((await createSessionResolver(throwing)(H)).status).toBe("anonymous");
  });

  it("fresh session without MFA -> mfa_required (enrolled flag passed through)", async () => {
    const s = { session: { id: "s1", userId: "u1", createdAt: new Date(NOW - 60e3), mfaVerifiedAt: null }, user: { id: "u1", email: "u@example.com", twoFactorEnabled: false } };
    const st = await createSessionResolver(backend(s), () => NOW)(H);
    expect(st).toEqual({ status: "mfa_required", userId: "u1", sessionId: "s1", email: "u@example.com", enrolled: false });
  });

  it("a half session older than the short TTL is treated as anonymous", async () => {
    const s = { session: { id: "s1", userId: "u1", createdAt: new Date(NOW - 16 * 60e3), mfaVerifiedAt: null }, user: { id: "u1" } };
    expect((await createSessionResolver(backend(s), () => NOW)(H)).status).toBe("anonymous");
  });

  it("org + role come from the member table; the session hint is re-checked", async () => {
    const b = backend(verified({ activeOrganizationId: "org_a" }), { u1: [{ organizationId: "org_a", role: "member" }] });
    const st = await createSessionResolver(b, () => NOW)(H);
    expect(st.status).toBe("ok");
    if (st.status !== "ok") return;
    expect(st.context).toEqual({
      userId: "u1",
      sessionId: "s1",
      orgId: "org_a",
      role: "member",
      roles: ["member"],
      permissions: ["campaigns:read", "campaigns:write"],
      authenticatedAt: Math.floor((NOW - 30e3) / 1000),
      mfaVerified: true,
    });
    expect(b.calls).toEqual(["find:org_a"]);
  });

  it("a stale hint (member removed) never grants that org", async () => {
    const b = backend(verified({ activeOrganizationId: "org_gone" }), { u1: [{ organizationId: "org_b", role: "viewer" }] });
    const st = await createSessionResolver(b, () => NOW)(H);
    // falls back to the single real membership, never to the hinted org
    expect(st.status === "ok" && st.context.orgId).toBe("org_b");
    const none = await createSessionResolver(backend(verified({ activeOrganizationId: "org_gone" }), {}), () => NOW)(H);
    expect(none.status).toBe("no_org");
    if (none.status === "no_org") expect(none.context.permissions).toEqual([]);
  });

  it("several memberships and no valid hint -> no_org (must pick); malformed hints are not looked up", async () => {
    const b = backend(verified({ activeOrganizationId: "bad id!" }), { u1: [{ organizationId: "a", role: "member" }, { organizationId: "b", role: "admin" }] });
    const st = await createSessionResolver(b, () => NOW)(H);
    expect(st).toMatchObject({ status: "no_org", membershipCount: 2 });
    expect(b.calls).toEqual(["list"]);
  });

  it("an unknown role grants nothing", async () => {
    const st = await createSessionResolver(backend(verified(), { u1: [{ organizationId: "a", role: "superuser" }] }), () => NOW)(H);
    expect(st.status).toBe("no_org");
  });
});

describe("decisions", () => {
  const ctx = sessionContextFrom(verified() as never, { organizationId: "a", role: "admin" });
  it("API: 401 / 403 JSON, never a redirect", () => {
    expect(apiDecision({ status: "anonymous" })).toEqual({ ok: false, status: 401, error: "unauthenticated" });
    expect(apiDecision({ status: "mfa_required", userId: "u", sessionId: "s", email: null, enrolled: true })).toMatchObject({ status: 403, error: "mfa_required" });
    expect(apiDecision({ status: "no_org", context: { ...ctx, orgId: null }, email: null, membershipCount: 0 })).toMatchObject({ status: 403, error: "no_organization" });
    expect(apiDecision({ status: "ok", context: { ...ctx, orgId: "a" }, email: null })).toMatchObject({ ok: true });
  });
  it("pages: sign-in, then MFA, then org picker", () => {
    expect(pageRedirect({ status: "anonymous" }, { needOrg: true, next: "/x" })).toBe("/sign-in?next=%2Fx");
    expect(pageRedirect({ status: "mfa_required", userId: "u", sessionId: "s", email: null, enrolled: false }, { needOrg: false })).toBe("/settings/security");
    expect(pageRedirect({ status: "no_org", context: ctx, email: null, membershipCount: 2 }, { needOrg: true })).toBe("/select-org");
    expect(pageRedirect({ status: "no_org", context: ctx, email: null, membershipCount: 2 }, { needOrg: false })).toBeNull();
  });
});

describe("requireApiSession with the auth layer mocked (vi.mock, no bypass flag)", () => {
  it("401 without a session, context with one", async () => {
    vi.resetModules();
    const getSession = vi.fn();
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    vi.doMock("@/lib/server/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
    vi.doMock("@/lib/server/auth-db", () => ({
      authDb: () => ({
        prepare: (sql: string) => ({
          get: () => (sql.includes("organizationId = ?") ? { organizationId: "org_a", role: "viewer" } : undefined),
          all: () => [{ organizationId: "org_a", role: "viewer" }],
        }),
      }),
    }));
    const mod = await import("@/lib/server/session");
    getSession.mockResolvedValueOnce(null);
    const denied = await mod.requireApiSession(new Headers());
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(401);
      expect(denied.response.headers.get("cache-control")).toBe("no-store");
    }
    getSession.mockResolvedValueOnce({ ...verified({ activeOrganizationId: "org_a", createdAt: new Date(), mfaVerifiedAt: new Date() }) });
    const ok = await mod.requireApiSession(new Headers());
    expect(ok.ok && ok.context.permissions).toEqual(["campaigns:read"]);
    vi.doUnmock("@/lib/server/auth");
    vi.doUnmock("@/lib/server/auth-db");
    vi.doUnmock("next/headers");
  });
});
