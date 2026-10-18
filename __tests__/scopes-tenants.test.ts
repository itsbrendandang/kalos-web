import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENGINE_SCOPES, requiredScopeForMethod, scopesForClaims } from "@/lib/server/scopes";
import { fileTenantResolver, parseTenantMap, validateTenantMapFile } from "@/lib/server/tenants";

describe("scopesForClaims (lib/server/scopes.ts)", () => {
  it("uses exactly the engine scope names", () => {
    expect(ENGINE_SCOPES).toEqual(["campaigns:read", "campaigns:write", "org:admin"]);
  });

  it("maps roles: viewer -> read, member -> read+write, admin -> read+write+org:admin", () => {
    expect(scopesForClaims({ role: "viewer" })).toEqual(["campaigns:read"]);
    expect(scopesForClaims({ role: "member" })).toEqual(["campaigns:read", "campaigns:write"]);
    expect(scopesForClaims({ role: "admin" })).toEqual(["campaigns:read", "campaigns:write", "org:admin"]);
  });

  it("gives nothing for unknown/missing roles (caller must 403)", () => {
    expect(scopesForClaims({})).toEqual([]);
    expect(scopesForClaims({ role: "owner" })).toEqual([]);
    expect(scopesForClaims({ role: "constructor" })).toEqual([]);
    expect(scopesForClaims({ role: "__proto__" })).toEqual([]);
    expect(scopesForClaims({ role: null, roles: null, permissions: null })).toEqual([]);
  });

  it("treats permissions as authoritative when present", () => {
    expect(scopesForClaims({ role: "admin", permissions: ["campaigns:read"] })).toEqual(["campaigns:read"]);
    expect(scopesForClaims({ role: "viewer", permissions: ["campaigns:write", "campaigns:read"] })).toEqual([
      "campaigns:read",
      "campaigns:write",
    ]);
    expect(scopesForClaims({ role: "admin", permissions: ["something:else"] })).toEqual([]);
    // empty permissions array -> role fallback
    expect(scopesForClaims({ role: "member", permissions: [] })).toEqual(["campaigns:read", "campaigns:write"]);
  });

  it("unions multiple roles", () => {
    expect(scopesForClaims({ roles: ["viewer", "admin"] })).toEqual(["campaigns:read", "campaigns:write", "org:admin"]);
  });

  it("maps methods to required scopes", () => {
    expect(requiredScopeForMethod("GET")).toBe("campaigns:read");
    expect(requiredScopeForMethod("HEAD")).toBe("campaigns:read");
    for (const m of ["POST", "PATCH", "DELETE", "put"]) expect(requiredScopeForMethod(m)).toBe("campaigns:write");
  });
});

function mapFile(contents: string) {
  const dir = mkdtempSync(join(tmpdir(), "kalos-tenant-map-"));
  const file = join(dir, "tenants.json");
  writeFileSync(file, contents);
  return file;
}

describe("tenant resolver (lib/server/tenants.ts)", () => {
  it("parses a valid map", () => {
    const m = parseTenantMap(JSON.stringify({ org_01ABC: "acme-bio", org_02DEF: "beta_lab" }));
    expect(m.get("org_01ABC")).toBe("acme-bio");
  });

  it("rejects the whole map on any invalid entry", () => {
    expect(() => parseTenantMap("not json")).toThrow(/JSON/);
    expect(() => parseTenantMap("[]")).toThrow(/object/);
    expect(() => parseTenantMap(JSON.stringify({ org_01ABC: "acme/bio" }))).toThrow(/tenant id/);
    expect(() => parseTenantMap(JSON.stringify({ org_01ABC: 5 }))).toThrow(/tenant id/);
    expect(() => parseTenantMap(JSON.stringify({ "not an org!": "acme" }))).toThrow(/org id/);
  });

  it("resolves mapped orgs and fails closed (null) for unmapped, malformed or unconfigured", async () => {
    const file = mapFile(JSON.stringify({ org_01ABC: "acme-bio" }));
    const r = fileTenantResolver(() => file);
    expect(await r.resolveTenant("org_01ABC")).toBe("acme-bio");
    expect(await r.resolveTenant("org_99ZZZ")).toBeNull();
    expect(await r.resolveTenant("__proto__")).toBeNull();
    expect(await r.resolveTenant("toString")).toBeNull();
    expect(await r.resolveTenant("../org_01ABC")).toBeNull();

    expect(await fileTenantResolver(() => undefined).resolveTenant("org_01ABC")).toBeNull();
    expect(await fileTenantResolver(() => "/nonexistent.json").resolveTenant("org_01ABC")).toBeNull();
    const bad = mapFile(JSON.stringify({ org_01ABC: "acme-bio", org_02DEF: "bad tenant" }));
    expect(await fileTenantResolver(() => bad).resolveTenant("org_01ABC")).toBeNull();
  });

  it("re-reads the map when the file changes", async () => {
    const file = mapFile(JSON.stringify({ org_01ABC: "acme-bio" }));
    const r = fileTenantResolver(() => file);
    expect(await r.resolveTenant("org_02DEF")).toBeNull();
    writeFileSync(file, JSON.stringify({ org_01ABC: "acme-bio", org_02DEF: "beta" }));
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);
    expect(await r.resolveTenant("org_02DEF")).toBe("beta");
  });

  it("validateTenantMapFile reports problems without throwing", () => {
    expect(validateTenantMapFile(mapFile("{}"))).toBeNull();
    expect(validateTenantMapFile("/nonexistent.json")).toMatch(/not readable/);
    expect(validateTenantMapFile(mapFile("{"))).toMatch(/JSON/);
  });
});
