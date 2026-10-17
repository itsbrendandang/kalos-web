import "server-only";

// Per-request engine tokens.
//
// After the auth provider's session has been validated server-side and
// turned into a SessionContext (lib/server/session-context.ts), the engine
// proxy route mints a short-lived JWT that the engine verifies with the
// matching public key. The engine never sees auth-provider tokens and never
// trusts anything the browser sent: every claim below is computed here, on
// the server, from the SessionContext and the server-side tenant map.
//
//   header:  { alg: "EdDSA", typ: "JWT", kid: KALOS_ENGINE_JWT_KID }
//   claims:  iss "kalos-web", aud "kalos-engine", sub <SessionContext.userId>,
//            tenant <internal tenant id>, scopes [..], sid <SessionContext.sessionId>,
//            jti <uuid v4>, iat, nbf (= iat), exp (= iat + ttl, ttl <= min(120, KALOS_ENGINE_JWT_MAX_TTL_S))
//
// The private key (Ed25519, PKCS#8 PEM) is read from the file named by
// KALOS_ENGINE_JWT_PRIVATE_KEY_FILE - never from an env var value, never
// from NEXT_PUBLIC_*. Each environment (dev / staging / production) has its
// own key pair and kid; see docs/AUTH.md. Shared test vectors for the engine
// live in __tests__/vectors/engine-token.json.
import { readFileSync } from "node:fs";
import { createPrivateKey, randomUUID } from "node:crypto";
import { SignJWT, type KeyLike } from "jose";
import { ENGINE_SCOPES, type EngineScope } from "@/lib/server/scopes";
import type { SessionContext } from "@/lib/server/session-context";
import { TENANT_ID_PATTERN } from "@/lib/server/tenants";

export const ENGINE_TOKEN_ISSUER = "kalos-web";
export const ENGINE_TOKEN_AUDIENCE = "kalos-engine";
export const ENGINE_TOKEN_ALG = "EdDSA";
/** Hard upper bound on token lifetime. Requests asking for more get exactly this. */
export const ENGINE_TOKEN_MAX_TTL_SECONDS = 120;
export const ENGINE_TOKEN_DEFAULT_TTL_SECONDS = 60;
export const KID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export interface EngineTokenSigner {
  kid: string;
  key: KeyLike | Uint8Array;
}

export interface EngineTokenInput {
  /** SessionContext.userId (validated session). */
  userId: string;
  /** SessionContext.sessionId. */
  sessionId: string;
  /** Internal tenant id from resolveTenant() - never from the request. */
  tenant: string;
  scopes: readonly EngineScope[];
  /** Requested lifetime; clamped to [1, ENGINE_TOKEN_MAX_TTL_SECONDS]. */
  ttlSeconds?: number;
  /** Clock override (unix seconds) for tests and vectors. */
  now?: number;
  /** jti override for deterministic vectors; must be a UUID. */
  jti?: string;
}

export interface EngineTokenClaims {
  iss: typeof ENGINE_TOKEN_ISSUER;
  aud: typeof ENGINE_TOKEN_AUDIENCE;
  sub: string;
  tenant: string;
  scopes: EngineScope[];
  sid: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
}

export class EngineTokenConfigError extends Error {}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Effective max TTL: KALOS_ENGINE_JWT_MAX_TTL_S (positive integer) lowers the
 * hard ceiling of 120 s; unset/invalid/larger values fall back to 120.
 */
export function maxTtlSeconds(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env.KALOS_ENGINE_JWT_MAX_TTL_S?.trim();
  if (!raw || !/^[0-9]{1,6}$/.test(raw)) return ENGINE_TOKEN_MAX_TTL_SECONDS;
  const n = Number(raw);
  return n >= 1 ? Math.min(n, ENGINE_TOKEN_MAX_TTL_SECONDS) : ENGINE_TOKEN_MAX_TTL_SECONDS;
}

/** Clamp a requested TTL into [1, maxTtlSeconds()]; non-finite input gets the default (60, itself clamped). */
export function clampTtl(
  ttlSeconds: number | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const max = maxTtlSeconds(env);
  if (ttlSeconds === undefined || !Number.isFinite(ttlSeconds)) return Math.min(ENGINE_TOKEN_DEFAULT_TTL_SECONDS, max);
  return Math.min(max, Math.max(1, Math.floor(ttlSeconds)));
}

/** sub/sid charset shared with the engine verifier: 1-256 printable ASCII, no space, no comma. */
const ID_PATTERN = /^[\x21-\x2b\x2d-\x7e]{1,256}$/;

/** Build (and validate) the claim set. Pure; exported for tests and vectors. */
export function buildEngineClaims(input: EngineTokenInput): EngineTokenClaims {
  if (typeof input.userId !== "string" || !ID_PATTERN.test(input.userId)) {
    throw new EngineTokenConfigError("engine token needs a valid user id");
  }
  if (typeof input.sessionId !== "string" || !ID_PATTERN.test(input.sessionId)) {
    throw new EngineTokenConfigError("engine token needs a valid session id");
  }
  if (typeof input.tenant !== "string" || !TENANT_ID_PATTERN.test(input.tenant)) {
    throw new EngineTokenConfigError("engine token tenant id is invalid");
  }
  if (
    !Array.isArray(input.scopes) ||
    !input.scopes.every((s) => typeof s === "string" && (ENGINE_SCOPES as readonly string[]).includes(s))
  ) {
    throw new EngineTokenConfigError("engine token scopes must be an array of known scopes");
  }
  const scopes = ENGINE_SCOPES.filter((s) => input.scopes.includes(s));
  if (scopes.length === 0) throw new EngineTokenConfigError("engine token needs at least one scope");
  const jti = input.jti ?? randomUUID();
  if (!UUID_PATTERN.test(jti)) throw new EngineTokenConfigError("engine token jti must be a UUID");

  const iat = Math.floor(input.now ?? Date.now() / 1000);
  return {
    iss: ENGINE_TOKEN_ISSUER,
    aud: ENGINE_TOKEN_AUDIENCE,
    sub: input.userId,
    tenant: input.tenant,
    scopes,
    sid: input.sessionId,
    jti,
    iat,
    nbf: iat,
    exp: iat + clampTtl(input.ttlSeconds),
  };
}

/** Sign a claim set. Claim order is fixed so Ed25519 output is reproducible for vectors. */
export async function signEngineClaims(claims: EngineTokenClaims, signer: EngineTokenSigner): Promise<string> {
  if (!KID_PATTERN.test(signer.kid)) throw new EngineTokenConfigError("KALOS_ENGINE_JWT_KID is invalid");
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ENGINE_TOKEN_ALG, typ: "JWT", kid: signer.kid })
    .sign(signer.key);
}

let cachedSigner: { file: string; kid: string; signer: Promise<EngineTokenSigner> } | null = null;

/** Load the signer from KALOS_ENGINE_JWT_PRIVATE_KEY_FILE + KALOS_ENGINE_JWT_KID (cached per file+kid). */
export function loadEngineSigner(env: Readonly<Record<string, string | undefined>> = process.env): Promise<EngineTokenSigner> {
  const file = env.KALOS_ENGINE_JWT_PRIVATE_KEY_FILE?.trim();
  const kid = env.KALOS_ENGINE_JWT_KID?.trim();
  if (!file) return Promise.reject(new EngineTokenConfigError("KALOS_ENGINE_JWT_PRIVATE_KEY_FILE is not set"));
  if (!kid || !KID_PATTERN.test(kid)) return Promise.reject(new EngineTokenConfigError("KALOS_ENGINE_JWT_KID is missing or invalid"));
  if (cachedSigner && cachedSigner.file === file && cachedSigner.kid === kid) return cachedSigner.signer;

  const signer = (async () => {
    let pem: string;
    try {
      pem = readFileSync(file, "utf8");
    } catch {
      throw new EngineTokenConfigError("engine signing key file is not readable");
    }
    let key: ReturnType<typeof createPrivateKey> | null = null;
    try {
      key = createPrivateKey({ key: pem, format: "pem" });
    } catch {
      // falls through to the error below
    }
    // Checked explicitly: jose would happily sign "EdDSA" with an RSA key object.
    if (!key || key.asymmetricKeyType !== "ed25519") {
      throw new EngineTokenConfigError("engine signing key is not an Ed25519 PKCS#8 PEM private key");
    }
    return { kid, key };
  })();
  cachedSigner = { file, kid, signer };
  // A failed load must not stick: the next request retries.
  signer.catch(() => {
    if (cachedSigner?.signer === signer) cachedSigner = null;
  });
  return signer;
}

/** Mint a token for one engine request. */
export async function mintEngineToken(input: EngineTokenInput, signer?: EngineTokenSigner): Promise<string> {
  const claims = buildEngineClaims(input);
  return signEngineClaims(claims, signer ?? (await loadEngineSigner()));
}

/**
 * Mint for a validated session. `tenant` must come from resolveTenant(session.orgId)
 * and `scopes` from scopesForClaims(session); both are passed explicitly so the
 * caller has already made (and can 403 on) those decisions before anything is signed.
 */
export function mintEngineTokenForSession(
  session: Pick<SessionContext, "userId" | "sessionId">,
  tenant: string,
  scopes: readonly EngineScope[],
  signer?: EngineTokenSigner,
): Promise<string> {
  return mintEngineToken({ userId: session.userId, sessionId: session.sessionId, tenant, scopes }, signer);
}
