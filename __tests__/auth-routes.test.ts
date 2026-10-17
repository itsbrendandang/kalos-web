import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { classifyRoute, isSessionFlowPage, proxyDecision, safeNextPath } from "@/lib/auth-routes";
import { proxy, config } from "@/proxy";

describe("classifyRoute", () => {
  it.each([
    ["/sign-in", "public"],
    ["/sign-in/", "public"],
    ["/signed-out", "public"],
    ["/accept-invite/AbC_12-x", "public"],
    ["/api/auth/sign-in/social", "public"],
    ["/api/auth", "public"],
    ["/api/health", "public"],
    ["/file.svg", "public"],
    ["/favicon.ico", "public"],
    ["/_next/static/chunks/a.js", "public"],
  ])("%s -> %s", (p, kind) => expect(classifyRoute(p)).toBe(kind));

  it.each([
    ["/api/engine/campaigns", "api"],
    ["/api/engine/x.json", "api"],
    ["/api/authx", "api"],
    ["/api/healthz", "api"],
    ["/api", "api"],
    ["/api/health/extra", "api"],
    ["/", "page"],
    ["/campaign/plan", "page"],
    ["/settings/security", "page"],
    ["/select-org", "page"],
    ["/sign-in-other", "page"],
    ["/accept-invite", "page"],
    ["/accept-invite/a/b", "page"],
    ["/accept-invite/a.b", "page"],
    ["/campaign/x.svg", "page"],
    ["relative", "page"],
  ])("%s -> %s", (p, kind) => expect(classifyRoute(p)).toBe(kind));

  it("session-flow pages", () => {
    expect(isSessionFlowPage("/settings/security")).toBe(true);
    expect(isSessionFlowPage("/select-org/")).toBe(true);
    expect(isSessionFlowPage("/settings")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/campaign/plan?x=1", "/campaign/plan?x=1"],
    ["/", "/"],
  ])("keeps %s", (raw, out) => expect(safeNextPath(raw)).toBe(out));
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", "/api/engine/x", "/a\nb", 42, null, "x".repeat(600)])(
    "rejects %s",
    (raw) => expect(safeNextPath(raw)).toBe("/"),
  );
});

describe("proxyDecision", () => {
  it("lets public routes and any request with a session cookie through", () => {
    expect(proxyDecision("/sign-in", "", false)).toEqual({ action: "next" });
    expect(proxyDecision("/campaign/plan", "", true)).toEqual({ action: "next" });
    expect(proxyDecision("/api/engine/x", "", true)).toEqual({ action: "next" });
  });
  it("401 for /api/* without a cookie, redirect to /sign-in for pages", () => {
    expect(proxyDecision("/api/engine/x", "", false)).toEqual({ action: "unauthorized" });
    expect(proxyDecision("/", "", false)).toEqual({ action: "redirect", location: "/sign-in" });
    expect(proxyDecision("/campaign/plan", "?a=1", false)).toEqual({ action: "redirect", location: "/sign-in?next=%2Fcampaign%2Fplan%3Fa%3D1" });
  });
});

describe("proxy.ts", () => {
  const run = (url: string, cookie?: string) => proxy(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
  it("redirects pages, 401s APIs, passes public paths", async () => {
    const page = run("http://localhost:3000/data");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fdata");
    const api = run("http://localhost:3000/api/engine/campaigns");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "unauthenticated" });
    expect(run("http://localhost:3000/api/auth/get-session").headers.get("x-middleware-next")).toBe("1");
    expect(run("http://localhost:3000/api/health").headers.get("x-middleware-next")).toBe("1");
  });
  it("only checks cookie PRESENCE (secure or plain name) - real checks are server-side", () => {
    expect(run("http://localhost:3000/data", "better-auth.session_token=x").headers.get("x-middleware-next")).toBe("1");
    expect(run("http://localhost:3000/data", "__Secure-better-auth.session_token=x").headers.get("x-middleware-next")).toBe("1");
    expect(run("http://localhost:3000/data", "other=x").status).toBe(307);
  });
  it("has no runtime export and a matcher that does not skip dotted /api paths", async () => {
    const mod = await import("@/proxy");
    expect("runtime" in mod).toBe(false);
    const re = new RegExp(`^${config.matcher[0].replace("/((?!", "/(?!").replace(").*)", ").*")}`);
    expect(re.test("/api/engine/x.json")).toBe(true);
    expect(re.test("/_next/static/chunks/a.js")).toBe(false);
  });
});
