import { describe, expect, it } from "vitest";
import { ENGINE_ROUTES, isSafeRawPath, isSafeSegment, matchEngineRoute } from "@/lib/server/engine-routes";

const CMP = "cmp_0123456789abcdef0123456789abcdef";
const RUN = "0123456789abcdef0123456789abcdef";

describe("engine route table (lib/server/engine-routes.ts)", () => {
  it.each([
    ["GET", "api/latest", ["campaigns:read"]],
    ["HEAD", "api/latest", ["campaigns:read"]],
    ["GET", "api/campaign", ["campaigns:read"]],
    ["POST", "api/run", ["campaigns:write"]],
    ["POST", "api/campaign/start", ["campaigns:write"]],
    ["POST", "api/campaign/result", ["campaigns:write"]],
    ["POST", "api/campaign/reanalyze", ["campaigns:write"]],
    ["POST", "api/scale/readout", ["campaigns:write"]],
    ["GET", "api/providers", ["campaigns:read"]],
    ["GET", "api/campaigns", ["campaigns:read"]],
    ["POST", "api/campaigns", ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}`, ["campaigns:read"]],
    ["PATCH", `api/campaigns/${CMP}`, ["campaigns:write"]],
    ["POST", `api/campaigns/${CMP}/upload`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/analysis`, ["campaigns:read"]],
    ["POST", `api/campaigns/${CMP}/runs`, ["campaigns:write"]],
    ["POST", `api/campaigns/${CMP}/runs/${RUN}/result`, ["campaigns:write"]],
    ["POST", `api/campaigns/${CMP}/reanalyze`, ["campaigns:write"]],
  ])("%s /%s -> %j", (method, path, scopes) => {
    const m = matchEngineRoute(method, path.split("/"));
    expect(m.kind).toBe("ok");
    if (m.kind === "ok") expect(m.route.scopes).toEqual(scopes);
  });

  it("reads are GET-only and every write route is POST/PATCH (no write scope on GET)", () => {
    for (const r of ENGINE_ROUTES) {
      expect(r.scopes).toEqual(r.method === "GET" ? ["campaigns:read"] : ["campaigns:write"]);
      if (r.method === "GET") expect(r.body).toBe("none");
    }
  });

  it("only PATCH /api/campaigns/{id} is an admin action (archive/unarchive)", () => {
    expect(ENGINE_ROUTES.filter((r) => r.admin).map((r) => `${r.method} ${r.pattern.join("/")}`)).toEqual(["PATCH api/campaigns/:id"]);
  });

  it.each([
    ["healthz"],
    ["readyz"],
    ["api/healthz"],
    ["api/admin/secrets"],
    ["api/experiments"],
    ["api/campaignish"],
    ["api/scaley"],
    ["api/latest/extra"],
    ["api/campaign/start/x"],
    ["api/campaigns/a/b/c/d/e/f"],
    ["api"],
    [""],
  ])("unknown path %s -> not_found", (path) => {
    expect(matchEngineRoute("GET", path.split("/")).kind).toBe("not_found");
  });

  it("known path, wrong method -> 405 with Allow", () => {
    expect(matchEngineRoute("POST", ["api", "latest"])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD"] });
    expect(matchEngineRoute("GET", ["api", "run"])).toEqual({ kind: "method_not_allowed", allow: ["POST"] });
    expect(matchEngineRoute("DELETE", ["api", "campaigns", CMP])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD", "PATCH"] });
  });

  it("id segments are opaque but restricted", () => {
    expect(matchEngineRoute("GET", ["api", "campaigns", "cmp_x.y"]).kind).toBe("not_found");
    expect(matchEngineRoute("GET", ["api", "campaigns", "x".repeat(129)]).kind).toBe("not_found");
  });
});

describe("traversal protection (PR #64 isSafeSegment, adopted)", () => {
  it.each([
    ["dot-dot", ["api", "run", "..", "..", "admin"]],
    ["single dot", ["api", "run", ".", "x"]],
    ["empty segment", ["api", "run", "", "x"]],
    ["encoded slash (decoded once by Next)", ["api", "campaigns", "..%2f..%2fadmin"]],
    ["decoded slash", ["api", "campaigns", "a/b"]],
    ["backslash", ["api", "campaigns", "a\\b"]],
    ["query injection", ["api", "campaigns", "x?a=b"]],
    ["fragment injection", ["api", "campaigns", "x#y"]],
    ["double encoding", ["api", "campaigns", "%2e%2e"]],
    ["double-encoded slash", ["api", "campaigns", "a%2fb"]],
    ["null byte", ["api", "campaigns", "a\u0000b"]],
    ["control character", ["api", "campaigns", "a\nb"]],
  ])("rejects %s", (_name, segs) => {
    expect(segs.every(isSafeSegment)).toBe(false);
    expect(matchEngineRoute("GET", segs).kind).toBe("not_found");
  });

  it.each([
    "/api/engine/api/campaigns/%2e%2e/x",
    "/api/engine/api/%2E%2E/run",
    "/api/engine/api/campaigns/a%2fb",
    "/api/engine/api/campaigns/a%2Fb",
    "/api/engine/api/campaigns/a%5cb",
    "/api/engine/api/campaigns/a%00b",
    "/api/engine/api/campaigns/a%252fb",
    "/api/engine/api/campaigns/a\\b",
    "/api/engine/api/../run",
    "/api/engine/./api/run",
  ])("raw path %s is unsafe", (p) => {
    expect(isSafeRawPath(p)).toBe(false);
  });

  it("ordinary raw paths are safe", () => {
    expect(isSafeRawPath(`/api/engine/api/campaigns/${CMP}/runs/${RUN}/result`)).toBe(true);
    expect(isSafeRawPath("/api/engine/api/latest")).toBe(true);
  });
});
