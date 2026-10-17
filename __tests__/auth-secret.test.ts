import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bootCheckRequired } from "@/lib/server/boot-check";
import { makeAuth } from "@/lib/server/auth-config.mjs";
import { resolveAuthSecret } from "@/lib/server/auth";

describe("resolveAuthSecret (m5)", () => {
  it("uses BETTER_AUTH_SECRET when set", () => expect(resolveAuthSecret({ BETTER_AUTH_SECRET: " s3cret-value " , NODE_ENV: "production" })).toBe("s3cret-value"));
  it("falls back to the insecure dev secret ONLY in development or test", () => {
    expect(resolveAuthSecret({ NODE_ENV: "development" })).toMatch(/dev-only-insecure/);
    expect(resolveAuthSecret({ NODE_ENV: "test" })).toMatch(/dev-only-insecure/);
    for (const NODE_ENV of ["production", undefined, "staging", "prod", ""]) expect(resolveAuthSecret({ NODE_ENV }), String(NODE_ENV)).toBeUndefined();
    expect(resolveAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBeUndefined();
  });
});

// B-4: the boot check runs for everything except development/test, and no
// code path hands Better Auth an empty secret (it would use its public default).
describe("boot check and secret fail closed (B-4)", () => {
  it("boot check is skipped ONLY for development and test", () => {
    expect(bootCheckRequired("development")).toBe(false);
    expect(bootCheckRequired("test")).toBe(false);
    for (const NODE_ENV of ["production", undefined, "staging", "prod", "Production", ""]) expect(bootCheckRequired(NODE_ENV), String(NODE_ENV)).toBe(true);
  });
  it("unset / staging / production: no dev fallback secret, makeAuth refuses to start", () => {
    for (const NODE_ENV of ["production", undefined, "staging", "prod", ""]) {
      expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_SECRET: "   " }), String(NODE_ENV)).toBeUndefined();
    }
    const base = { database: null, baseURL: "https://kalos.example.com", googleClientId: "x", googleClientSecret: "y" };
    for (const secret of [undefined, "", "   "]) expect(() => makeAuth({ ...base, secret } as never)).toThrow(/secret is required/);
  });
  it("the instrumentation hook uses the fail-closed predicate (no production-only gate)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib/server/instrumentation-node.ts"), "utf8");
    expect(src).toMatch(/bootCheckRequired\(process\.env\.NODE_ENV\)/);
    expect(src).not.toMatch(/NODE_ENV === "production"/);
  });
  it("build() refuses to run without a secret (auth.ts)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib/server/auth.ts"), "utf8");
    expect(src).toMatch(/if \(!secret\) \{[\s\S]*throw new Error/);
  });
});
