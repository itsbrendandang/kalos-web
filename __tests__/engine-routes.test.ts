import { describe, expect, it } from "vitest";
import { ENGINE_ROUTES, isSafeRawPath, isSafeSegment, matchEngineRoute } from "@/lib/server/engine-routes";
import manifestJson from "./fixtures/engine-route-scopes.json";

const CMP = "cmp_0123456789abcdef0123456789abcdef";
const RUN = "0123456789abcdef0123456789abcdef";

type ManifestEntry = { method: string; path: string; scopes: string[]; auth: string; conditional_scopes?: { scope: string; when: string }[] };
// kalos-engine docs/route-scopes.json (engine main, re-vendored with the track-record and assist routes), vendored: the scope each engine route enforces.
const MANIFEST = manifestJson as ManifestEntry[];
const ENGINE_SCOPE: Record<string, string> = { read: "campaigns:read", write: "campaigns:write", admin: "org:admin" };
const GATE = "S3";
const JOB = "job_0123456789abcdef0123456789abcdef";

describe("engine route table (lib/server/engine-routes.ts)", () => {
  it.each([
    ["GET", "api/providers", ["campaigns:read"]],
    ["HEAD", "api/providers", ["campaigns:read"]],
    ["POST", "api/scale/readout.json", ["campaigns:write"]],
    ["GET", "api/campaigns", ["campaigns:read"]],
    ["POST", "api/campaigns", ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}`, ["campaigns:read"]],
    ["PATCH", `api/campaigns/${CMP}`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/analysis`, ["campaigns:read"]],
    ["POST", `api/campaigns/${CMP}/runs`, ["campaigns:write"]],
    ["POST", `api/campaigns/${CMP}/runs/${RUN}/result`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/setup`, ["campaigns:read"]],
    ["PUT", `api/campaigns/${CMP}/setup`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/stages`, ["campaigns:read"]],
    ["PUT", `api/campaigns/${CMP}/stages`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/gates`, ["campaigns:read"]],
    ["PUT", `api/campaigns/${CMP}/gates/${GATE}`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/gates/${GATE}/history`, ["campaigns:read"]],
    ["GET", `api/campaigns/${CMP}/export/rows`, ["campaigns:read"]],
    ["GET", `api/campaigns/${CMP}/results/history`, ["campaigns:read"]],
    ["POST", `api/campaigns/${CMP}/operating-ranges`, ["campaigns:write"]],
    ["POST", `api/campaigns/${CMP}/jobs`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/jobs`, ["campaigns:read"]],
    ["POST", `api/campaigns/${CMP}/reanalyze/jobs`, ["campaigns:write"]],
    ["GET", `api/jobs/${JOB}`, ["campaigns:read"]],
    ["POST", `api/jobs/${JOB}/cancel`, ["campaigns:write"]],
    ["GET", `api/campaigns/${CMP}/track-record`, ["campaigns:read"]],
    ["GET", `api/campaigns/${CMP}/track-record/runs`, ["campaigns:read"]],
    ["GET", `api/campaigns/${CMP}/search`, ["campaigns:read"]],
    ["GET", "api/assist/next", ["campaigns:read"]],
    ["GET", "api/assist/index/status", ["campaigns:read"]],
  ])("%s /%s -> %j", (method, path, scopes) => {
    const m = matchEngineRoute(method, path.split("/"));
    expect(m.kind).toBe("ok");
    if (m.kind === "ok") expect(m.route.scopes).toEqual(scopes);
  });

  it("every proxied route exists in the engine's scope manifest and mints exactly the scopes it enforces", () => {
    for (const r of ENGINE_ROUTES) {
      const path = `/${r.pattern.map((seg, i) => (seg === ":id" ? `{${r.pattern[i - 1]}}` : seg)).join("/")}`;
      const pattern = new RegExp(`^${path.replace(/\{[^}]+\}/g, "\\{[a-z_]+\\}").replace(/\./g, "\\.")}$`);
      const hits = MANIFEST.filter((m) => m.method === r.method && pattern.test(m.path));
      expect(hits, `${r.method} ${path}`).toHaveLength(1);
      const [entry] = hits;
      expect(entry.auth).toBe("required");
      expect([...r.scopes].sort()).toEqual(entry.scopes.map((s) => ENGINE_SCOPE[s]).sort());
      // The only conditional scope (admin on archive) is enforced by the proxy's archived-field rule.
      if (entry.conditional_scopes?.length) {
        expect(entry.conditional_scopes.map((c) => c.scope)).toEqual(["admin"]);
        expect(r.admin).toBe("archived-field");
      }
    }
  });

  it("GET operating-ranges is not proxied: it refits the GP, so the engine needs write (manifest a9f020c); the web uses POST", () => {
    expect(matchEngineRoute("GET", `api/campaigns/${CMP}/operating-ranges`.split("/")).kind).toBe("method_not_allowed");
    expect(ENGINE_ROUTES.filter((r) => r.method === "GET").every((r) => r.scopes.every((s) => s === "campaigns:read"))).toBe(true);
  });

  it("the new read routes are GET only and forward no body", () => {
    for (const path of [`api/campaigns/${CMP}/track-record`, `api/campaigns/${CMP}/track-record/runs`, `api/campaigns/${CMP}/search`, "api/assist/next", "api/assist/index/status"]) {
      const m = matchEngineRoute("GET", path.split("/"));
      expect(m.kind === "ok" && m.route.body, path).toBe("none");
      expect(matchEngineRoute("POST", path.split("/")), path).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD"] });
    }
  });

  it("assist routes the web does not call stay unproxied (ask, index rebuild, SOP drafts, setup suggestions)", () => {
    for (const [method, path] of [
      ["POST", "api/assist/index/rebuild"],
      ["GET", "api/assist/sop"],
      ["POST", "api/assist/sop/draft"],
      ["GET", "api/assist/sop/draft_1"],
      ["POST", `api/campaigns/${CMP}/setup/suggestions`],
      ["GET", `api/campaigns/${CMP}/runs/${RUN}/history`],
    ] as const) {
      expect(matchEngineRoute(method, path.split("/")).kind, `${method} ${path}`).not.toBe("ok");
    }
  });

  it("removed legacy, demo and unused routes stay unreachable", () => {
    for (const [method, path] of [
      ["GET", "api/latest"],
      ["POST", "api/run"],
      ["GET", "api/campaign"],
      ["POST", "api/campaign/start"],
      ["POST", "api/campaign/result"],
      ["POST", "api/campaign/reanalyze"],
      ["GET", "api/single"],
      ["GET", "api/multi"],
      ["POST", "api/scale/readout"],
      ["POST", `api/campaigns/${CMP}/upload`],
      ["POST", `api/campaigns/${CMP}/reanalyze`],
      ["POST", "api/assist/ask"],
    ] as const) {
      expect(matchEngineRoute(method, path.split("/")).kind, `${method} ${path}`).toBe("not_found");
    }
  });

  it("GET routes never carry write scope or a body, and no write route mints read", () => {
    for (const r of ENGINE_ROUTES) {
      if (r.method === "GET") {
        expect(r.scopes).toEqual(["campaigns:read"]);
        expect(r.body).toBe("none");
      } else {
        expect(r.scopes).toEqual(["campaigns:write"]);
      }
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
    ["api/latest"],
    ["api/campaign/start/x"],
    ["api/campaigns/a/b/c/d/e/f"],
    ["api"],
    [""],
  ])("unknown path %s -> not_found", (path) => {
    expect(matchEngineRoute("GET", path.split("/")).kind).toBe("not_found");
  });

  it("known path, wrong method -> 405 with Allow", () => {
    expect(matchEngineRoute("POST", ["api", "providers"])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD"] });
    expect(matchEngineRoute("GET", ["api", "scale", "readout.json"])).toEqual({ kind: "method_not_allowed", allow: ["POST"] });
    expect(matchEngineRoute("DELETE", ["api", "campaigns", CMP])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD", "PATCH"] });
    expect(matchEngineRoute("POST", ["api", "campaigns", CMP, "setup"])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD", "PUT"] });
    expect(matchEngineRoute("PUT", ["api", "campaigns", CMP, "analysis"])).toEqual({ kind: "method_not_allowed", allow: ["GET", "HEAD"] });
  });

  it("id segments are opaque but restricted", () => {
    expect(matchEngineRoute("GET", ["api", "campaigns", "cmp_x.y"]).kind).toBe("not_found");
    expect(matchEngineRoute("GET", ["api", "campaigns", "x".repeat(129)]).kind).toBe("not_found");
    expect(matchEngineRoute("PUT", ["api", "campaigns", CMP, "gates", "S1.x"]).kind).toBe("not_found");
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
    expect(isSafeRawPath("/api/engine/api/scale/readout.json")).toBe(true);
  });
});
