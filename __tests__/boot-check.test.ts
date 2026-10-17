import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkEnv, checkProductionBoot, REQUIRED_IN_PRODUCTION } from "@/lib/server/boot-check";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kalos-boot-"));
const keyFile = path.join(dir, "engine.pem");
fs.writeFileSync(keyFile, generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string);
const mapFile = path.join(dir, "tenants.json");
fs.writeFileSync(mapFile, JSON.stringify({ org_1: "acme" }));

const good = {
  BETTER_AUTH_SECRET: "q7Zr1x9P0aVt3mKc8sLw2YbN5eHj6uFd4gTo", // test value, not a real secret
  BETTER_AUTH_URL: "https://kalos.example.com",
  GOOGLE_CLIENT_ID: "123456-abc.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-only-google-secret",
  KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: keyFile,
  KALOS_ENGINE_JWT_KID: "web-prod-1",
  KALOS_TENANT_MAP_FILE: mapFile,
  AUTH_TRUSTED_PROXIES: "10.0.0.5",
};

describe("boot check", () => {
  it("passes a complete configuration", async () => {
    expect(await checkProductionBoot(good)).toEqual({ errors: [], warnings: [] });
  });
  it("names every missing required variable (and never prints values)", () => {
    const { errors } = checkEnv({});
    for (const name of REQUIRED_IN_PRODUCTION) expect(errors).toContain(`${name} is not set`);
  });
  it("rejects env.example placeholders, short secrets, non-https URLs", () => {
    expect(checkEnv({ ...good, BETTER_AUTH_SECRET: "change-me" }).errors.join()).toMatch(/BETTER_AUTH_SECRET still holds/);
    expect(checkEnv({ ...good, BETTER_AUTH_SECRET: "short-but-real-1" }).errors.join()).toMatch(/at least 32/);
    expect(checkEnv({ ...good, GOOGLE_CLIENT_SECRET: "<google-client-secret>" }).errors.join()).toMatch(/GOOGLE_CLIENT_SECRET still holds/);
    expect(checkEnv({ ...good, BETTER_AUTH_URL: "http://kalos.example.com" }).errors.join()).toMatch(/https/);
    expect(checkEnv({ ...good, BETTER_AUTH_URL: "http://localhost:3000" }).errors).toEqual([]);
    expect(checkEnv({ ...good, BETTER_AUTH_URL: "https://kalos.example.com/app" }).errors.join()).toMatch(/origin/);
    expect(checkEnv({ ...good, AUTH_TRUSTED_PROXIES: "10.0.0.0/8, nope" }).errors.join()).toMatch(/AUTH_TRUSTED_PROXIES/);
    expect(JSON.stringify(checkEnv({ ...good, BETTER_AUTH_SECRET: "tooshort" }))).not.toContain("tooshort");
  });
  it("requires AUTH_TRUSTED_PROXIES in production; 'none' is the explicit direct-exposure override", () => {
    expect(checkEnv({ ...good, AUTH_TRUSTED_PROXIES: undefined }).errors.join()).toMatch(/AUTH_TRUSTED_PROXIES is not set/);
    expect(checkEnv({ ...good, AUTH_TRUSTED_PROXIES: "" }).errors.join()).toMatch(/AUTH_TRUSTED_PROXIES is not set/);
    const none = checkEnv({ ...good, AUTH_TRUSTED_PROXIES: "none" });
    expect(none.errors).toEqual([]);
    expect(none.warnings.join()).toMatch(/AUTH_TRUSTED_PROXIES=none/);
    expect(checkEnv({ ...good, AUTH_TRUSTED_PROXIES: "none,10.0.0.1" }).errors.join()).toMatch(/cannot be combined/);
    expect(checkEnv({ ...good, AUTH_TRUSTED_PROXIES: "10.0.0.0/8, 192.0.2.10" }).errors).toEqual([]);
  });
  it("loads the engine key and validates the tenant map", async () => {
    expect((await checkProductionBoot({ ...good, KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: path.join(dir, "missing.pem") })).errors.join()).toMatch(/not readable/);
    const rsa = path.join(dir, "rsa.pem");
    fs.writeFileSync(rsa, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    expect((await checkProductionBoot({ ...good, KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: rsa })).errors.join()).toMatch(/Ed25519/);
    const badMap = path.join(dir, "bad.json");
    fs.writeFileSync(badMap, "[1]");
    expect((await checkProductionBoot({ ...good, KALOS_TENANT_MAP_FILE: badMap })).errors.join()).toMatch(/KALOS_TENANT_MAP_FILE/);
    expect((await checkProductionBoot({ ...good, KALOS_TENANT_MAP_FILE: undefined })).warnings.join()).toMatch(/KALOS_TENANT_MAP_FILE/);
  });
  it("instrumentation exits 1 on errors and has no skip switch", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib/server/instrumentation-node.ts"), "utf8");
    expect(src).toMatch(/process\.exit\(1\)/);
    expect(src).not.toMatch(/SKIP|BYPASS|DISABLE/i);
  });
});
