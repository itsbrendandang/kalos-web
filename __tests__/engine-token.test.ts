import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, importSPKI, jwtVerify, decodeJwt } from "jose";
import {
  buildEngineClaims,
  clampTtl,
  ENGINE_TOKEN_MAX_TTL_SECONDS,
  loadEngineSigner,
  mintEngineToken,
} from "@/lib/server/engine-token";

function tempKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const dir = mkdtempSync(join(tmpdir(), "kalos-engine-key-"));
  const file = join(dir, "engine.pem");
  writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }) as string);
  return { file, publicPem: publicKey.export({ type: "spki", format: "pem" }) as string };
}

const input = {
  userId: "user_01ABC",
  sessionId: "session_01XYZ",
  tenant: "acme-bio",
  scopes: ["campaigns:read", "campaigns:write"] as const,
};

describe("engine token claims (lib/server/engine-token.ts)", () => {
  it("sets iss/aud/sub/tenant/scopes/sid/jti/iat/nbf/exp", () => {
    const c = buildEngineClaims({ ...input, now: 1_000, jti: "6f1c1f9e-2b0a-4d5e-9c3b-7a8d9e0f1a2b" });
    expect(c).toEqual({
      iss: "kalos-web",
      aud: "kalos-engine",
      sub: "user_01ABC",
      tenant: "acme-bio",
      scopes: ["campaigns:read", "campaigns:write"],
      sid: "session_01XYZ",
      jti: "6f1c1f9e-2b0a-4d5e-9c3b-7a8d9e0f1a2b",
      iat: 1_000,
      nbf: 1_000,
      exp: 1_060,
    });
  });

  it("generates a fresh UUID jti per token", () => {
    const a = buildEngineClaims(input);
    const b = buildEngineClaims(input);
    expect(a.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.jti).not.toBe(b.jti);
  });

  it("hard-clamps ttl at 120 s", () => {
    expect(ENGINE_TOKEN_MAX_TTL_SECONDS).toBe(120);
    expect(clampTtl(3600)).toBe(120);
    expect(clampTtl(121)).toBe(120);
    expect(clampTtl(0)).toBe(1);
    expect(clampTtl(-5)).toBe(1);
    expect(clampTtl(Number.POSITIVE_INFINITY)).toBe(60);
    expect(clampTtl(undefined)).toBe(60);
    const c = buildEngineClaims({ ...input, now: 50, ttlSeconds: 86_400 });
    expect(c.exp - c.iat).toBe(120);
  });

  it("rejects an invalid tenant id instead of sanitising it", () => {
    for (const tenant of ["acme/bio", "", "a".repeat(65), "acme bio", "../x"]) {
      expect(() => buildEngineClaims({ ...input, tenant })).toThrow(/tenant/);
    }
  });

  it("refuses to mint with no scopes, and rejects unknown or non-array scopes", () => {
    expect(() => buildEngineClaims({ ...input, scopes: [] })).toThrow(/scope/);
    // @ts-expect-error - runtime guard against a bad caller
    expect(() => buildEngineClaims({ ...input, scopes: ["superuser", "campaigns:read"] })).toThrow(/scope/);
    for (const scopes of ["campaigns:read", null, undefined, { length: 1, 0: "campaigns:read" }]) {
      // @ts-expect-error - runtime guard against a bad caller
      expect(() => buildEngineClaims({ ...input, scopes })).toThrow(/scope/);
    }
  });

  it("requires tenant to be a string (no RegExp coercion)", () => {
    for (const tenant of [["acme-bio"], null, undefined, 5]) {
      // @ts-expect-error - runtime guard against a bad caller
      expect(() => buildEngineClaims({ ...input, tenant })).toThrow(/tenant/);
    }
  });

  it("restricts user/session ids to 1-256 printable ASCII without comma or space", () => {
    for (const bad of ["", "a".repeat(257), "a,b", "a b", "naïve", "a\nb", "a\x7f"]) {
      expect(() => buildEngineClaims({ ...input, userId: bad })).toThrow(/user id/);
      expect(() => buildEngineClaims({ ...input, sessionId: bad })).toThrow(/session id/);
    }
    expect(buildEngineClaims({ ...input, userId: "a".repeat(256), sessionId: "user|1:x~!" }).sub).toHaveLength(256);
  });

  it("honours KALOS_ENGINE_JWT_MAX_TTL_S (can only lower the 120 s ceiling)", () => {
    expect(clampTtl(100, { KALOS_ENGINE_JWT_MAX_TTL_S: "30" })).toBe(30);
    expect(clampTtl(10, { KALOS_ENGINE_JWT_MAX_TTL_S: "30" })).toBe(10);
    expect(clampTtl(undefined, { KALOS_ENGINE_JWT_MAX_TTL_S: "30" })).toBe(30);
    expect(clampTtl(undefined, { KALOS_ENGINE_JWT_MAX_TTL_S: "500" })).toBe(60);
    expect(clampTtl(500, { KALOS_ENGINE_JWT_MAX_TTL_S: "500" })).toBe(120);
    for (const bad of ["abc", "0", "-5", "", "1e2"]) expect(clampTtl(500, { KALOS_ENGINE_JWT_MAX_TTL_S: bad })).toBe(120);
  });
});

describe("engine token signing", () => {
  afterEach(() => {
    delete process.env.KALOS_ENGINE_JWT_PRIVATE_KEY_FILE;
    delete process.env.KALOS_ENGINE_JWT_KID;
  });

  it("signs EdDSA with the kid header, verifiable with the public key, aud/iss enforced", async () => {
    const { file, publicPem } = tempKey();
    const signer = await loadEngineSigner({ KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: file, KALOS_ENGINE_JWT_KID: "web-staging-2026-01" });
    const token = await mintEngineToken(input, signer);

    expect(decodeProtectedHeader(token)).toEqual({ alg: "EdDSA", typ: "JWT", kid: "web-staging-2026-01" });
    const pub = await importSPKI(publicPem, "EdDSA");
    const { payload } = await jwtVerify(token, pub, { issuer: "kalos-web", audience: "kalos-engine", algorithms: ["EdDSA"] });
    expect(payload.tenant).toBe("acme-bio");
    expect(payload.sub).toBe("user_01ABC");
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(120);

    await expect(jwtVerify(token, pub, { audience: "someone-else" })).rejects.toThrow();
    await expect(jwtVerify(token, pub, { issuer: "someone-else" })).rejects.toThrow();
  });

  it("reads the key file + kid from env when no signer is passed", async () => {
    const { file } = tempKey();
    process.env.KALOS_ENGINE_JWT_PRIVATE_KEY_FILE = file;
    process.env.KALOS_ENGINE_JWT_KID = "web-dev-1";
    const token = await mintEngineToken(input);
    expect(decodeProtectedHeader(token).kid).toBe("web-dev-1");
    expect(decodeJwt(token).aud).toBe("kalos-engine");
  });

  it("fails closed on missing/invalid key config", async () => {
    await expect(loadEngineSigner({})).rejects.toThrow(/PRIVATE_KEY_FILE/);
    const { file } = tempKey();
    await expect(loadEngineSigner({ KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: file })).rejects.toThrow(/KID/);
    await expect(loadEngineSigner({ KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: file, KALOS_ENGINE_JWT_KID: "bad kid!" })).rejects.toThrow(/KID/);
    await expect(
      loadEngineSigner({ KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: "/nonexistent/key.pem", KALOS_ENGINE_JWT_KID: "k1" }),
    ).rejects.toThrow(/not readable/);

    const dir = mkdtempSync(join(tmpdir(), "kalos-engine-key-"));
    const rsa = join(dir, "rsa.pem");
    writeFileSync(rsa, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string);
    await expect(loadEngineSigner({ KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: rsa, KALOS_ENGINE_JWT_KID: "k1" })).rejects.toThrow(/Ed25519/);
  });
});
