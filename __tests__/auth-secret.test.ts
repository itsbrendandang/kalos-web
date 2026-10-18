import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bootCheckRequired, checkEnv } from "@/lib/server/boot-check";
import { devFallbackAllowed, isLoopbackUrl, DEV_ONLY_INSECURE_SECRET } from "@/lib/server/secret-policy.mjs";
import { makeAuth } from "@/lib/server/auth-config.mjs";
import { resolveAuthSecret } from "@/lib/server/auth";

const LOOPBACK_URLS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://LOCALHOST:3010"];
const REMOTE_URLS = ["https://kalos.example.com", "http://10.0.0.5:3000", "http://localhost.evil.example", "http://127.0.0.2:3000", "https://127.0.0.1.nip.io", "not a url"];

describe("resolveAuthSecret (m5)", () => {
  it("uses BETTER_AUTH_SECRET when set", () => expect(resolveAuthSecret({ BETTER_AUTH_SECRET: " s3cret-value " , NODE_ENV: "production" })).toBe("s3cret-value"));
  it("falls back to the insecure dev secret ONLY in development or test", () => {
    expect(resolveAuthSecret({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" })).toMatch(/dev-only-insecure/);
    expect(resolveAuthSecret({ NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3000" })).toMatch(/dev-only-insecure/);
    for (const NODE_ENV of ["production", undefined, "staging", "prod", ""]) expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_URL: "http://localhost:3000" }), String(NODE_ENV)).toBeUndefined();
    expect(resolveAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBeUndefined();
  });
});

// C-3: NODE_ENV=development/test on a deployed container must not get the public secret.
describe("dev fallback secret only for loopback (C-3)", () => {
  it("development and test with a loopback BETTER_AUTH_URL get the dev secret", () => {
    for (const NODE_ENV of ["development", "test"]) {
      for (const BETTER_AUTH_URL of LOOPBACK_URLS) {
        expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_URL }), `${NODE_ENV} ${BETTER_AUTH_URL}`).toBe(DEV_ONLY_INSECURE_SECRET);
      }
    }
  });
  it("development or test with a real origin gets NO fallback, even with NODE_ENV=development", () => {
    for (const NODE_ENV of ["development", "test"]) {
      for (const BETTER_AUTH_URL of REMOTE_URLS) {
        expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_URL }), `${NODE_ENV} ${BETTER_AUTH_URL}`).toBeUndefined();
      }
    }
  });
  // Regression (secret policy hole): an unset BETTER_AUTH_URL used to get the
  // public dev secret under NODE_ENV=test, which skipped the boot check and let
  // anyone with the DB decrypt TOTP secrets. No environment gets it now.
  it("unset or blank BETTER_AUTH_URL: no dev fallback in ANY environment, including test", () => {
    for (const NODE_ENV of ["test", "development"]) {
      expect(resolveAuthSecret({ NODE_ENV }), NODE_ENV).toBeUndefined();
      expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_URL: "   " }), NODE_ENV).toBeUndefined();
      expect(devFallbackAllowed({ NODE_ENV }), NODE_ENV).toBe(false);
      expect(bootCheckRequired({ NODE_ENV }), NODE_ENV).toBe(true);
    }
  });
  it("an explicit BETTER_AUTH_SECRET is accepted in every environment, with or without a URL", () => {
    for (const NODE_ENV of ["test", "development", "production", undefined]) {
      expect(resolveAuthSecret({ NODE_ENV, BETTER_AUTH_SECRET: "explicit-secret-value-0123456789abcdef" }), String(NODE_ENV)).toBe("explicit-secret-value-0123456789abcdef");
    }
  });
  it("isLoopbackUrl accepts exactly localhost, 127.0.0.1 and [::1]", () => {
    for (const u of LOOPBACK_URLS) expect(isLoopbackUrl(u), u).toBe(true);
    for (const u of REMOTE_URLS) expect(isLoopbackUrl(u), u).toBe(false);
    expect(isLoopbackUrl(undefined)).toBe(false);
  });
  it("a deployed container with NODE_ENV=development and no secret fails the boot check", () => {
    const env = { NODE_ENV: "development", BETTER_AUTH_URL: "https://kalos.example.com" };
    expect(bootCheckRequired(env)).toBe(true);
    expect(resolveAuthSecret(env)).toBeUndefined();
    expect(checkEnv(env).errors.join()).toMatch(/BETTER_AUTH_SECRET is not set/);
  });
  it("makeAuth refuses the dev secret for a non-loopback origin, accepts it for loopback", () => {
    const base = { database: null, googleClientId: "x", googleClientSecret: "y" };
    expect(() => makeAuth({ ...base, baseURL: "https://kalos.example.com", secret: DEV_ONLY_INSECURE_SECRET } as never)).toThrow(/development secret is refused/);
    expect(() => makeAuth({ ...base, baseURL: "http://localhost:3000", secret: DEV_ONLY_INSECURE_SECRET, rateLimit: false } as never)).not.toThrow();
  });
});

// B-4: the boot check runs unless the dev fallback is allowed, and no code path
// hands Better Auth an empty secret (it would use its public default).
describe("boot check and secret fail closed (B-4)", () => {
  it("boot check is skipped ONLY for development/test on loopback (or test with no URL)", () => {
    expect(bootCheckRequired({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" })).toBe(false);
    expect(bootCheckRequired({ NODE_ENV: "test", BETTER_AUTH_URL: "http://127.0.0.1:3000" })).toBe(false);
    expect(devFallbackAllowed({ NODE_ENV: "test", BETTER_AUTH_URL: "http://127.0.0.1:3000" })).toBe(true);
    for (const NODE_ENV of ["production", undefined, "staging", "prod", "Production", ""]) {
      expect(bootCheckRequired({ NODE_ENV, BETTER_AUTH_URL: "http://localhost:3000" }), String(NODE_ENV)).toBe(true);
    }
    for (const BETTER_AUTH_URL of REMOTE_URLS) {
      expect(bootCheckRequired({ NODE_ENV: "development", BETTER_AUTH_URL }), BETTER_AUTH_URL).toBe(true);
      expect(bootCheckRequired({ NODE_ENV: "test", BETTER_AUTH_URL }), BETTER_AUTH_URL).toBe(true);
    }
    expect(bootCheckRequired({ NODE_ENV: "development" })).toBe(true);
    expect(bootCheckRequired({ NODE_ENV: "test" })).toBe(true);
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
    expect(src).toMatch(/bootCheckRequired\(process\.env\)/);
    expect(src).not.toMatch(/NODE_ENV === "production"/);
  });
  it("build() refuses to run without a secret (auth.ts)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib/server/auth.ts"), "utf8");
    expect(src).toMatch(/if \(!secret\) \{[\s\S]*throw new Error/);
  });
});
