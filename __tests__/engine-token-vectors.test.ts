// Cross-check against the shared vectors the engine repo reuses
// (__tests__/vectors/engine-token.json, generated independently by
// scripts/gen-engine-token-vectors.mjs). If this fails after an intentional
// claim change, regenerate the file AND tell the engine side.
import { describe, expect, it } from "vitest";
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from "jose";
import vectors from "./vectors/engine-token.json";
import { buildEngineClaims, signEngineClaims } from "@/lib/server/engine-token";
import { generateKeyPair } from "jose";
import { scopesForClaims, type EngineScope } from "@/lib/server/scopes";

const spec = vectors.spec;

/** A minimal reference verifier implementing the spec, as the engine must. */
async function referenceVerify(token: string, at: number): Promise<boolean> {
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "EdDSA" || typeof header.kid !== "string") return false;
    if (header.kid !== vectors.keys.primary.kid) return false;
    const key = await importJWK(vectors.keys.primary.public_jwk as JWK, "EdDSA");
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["EdDSA"],
      issuer: spec.iss,
      audience: spec.aud,
      currentDate: new Date(at * 1000),
      clockTolerance: spec.recommended_clock_leeway_seconds,
      requiredClaims: spec.required_claims,
    });
    const exp = payload.exp as number;
    const iat = payload.iat as number;
    if (exp - iat > spec.max_ttl_seconds) return false;
    if (typeof payload.tenant !== "string" || !new RegExp(spec.tenant_pattern).test(payload.tenant)) return false;
    if (!Array.isArray(payload.scopes) || !payload.scopes.every((s) => typeof s === "string" && spec.scopes.includes(s))) return false;
    if (typeof payload.jti !== "string" || typeof payload.sid !== "string") return false;
    return true;
  } catch {
    return false;
  }
}

describe("shared engine-token vectors", () => {
  it("library builds the documented claims for every valid vector and signs/verifies a round trip", async () => {
    // Private vector keys are not committed; use a throwaway key for the round trip.
    const { privateKey, publicKey } = await generateKeyPair("EdDSA", { extractable: true });
    for (const v of vectors.valid) {
      const claims = buildEngineClaims({ ...v.input, scopes: v.input.scopes as EngineScope[] });
      expect(claims, v.name).toEqual(v.claims);
      const token = await signEngineClaims(claims, { kid: "roundtrip", key: privateKey });
      const { payload } = await jwtVerify(token, publicKey, { algorithms: ["EdDSA"], issuer: "kalos-web", audience: "kalos-engine", currentDate: new Date(v.verify_at * 1000) });
      expect(payload.tenant, v.name).toBe(v.claims.tenant);
    }
  });

  it("reference verifier accepts every valid vector", async () => {
    for (const v of vectors.valid) expect(await referenceVerify(v.token, v.verify_at), v.name).toBe(true);
  });

  it("reference verifier rejects every invalid vector", async () => {
    expect(vectors.invalid.length).toBeGreaterThanOrEqual(10);
    for (const v of vectors.invalid) expect(await referenceVerify(v.token, v.verify_at), v.name).toBe(false);
  });

  it("scope mapping vectors match lib/server/scopes.ts", () => {
    for (const v of vectors.scope_mapping) expect(scopesForClaims(v.claims), v.name).toEqual(v.scopes);
  });
});
