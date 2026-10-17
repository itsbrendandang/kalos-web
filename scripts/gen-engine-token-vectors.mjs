#!/usr/bin/env node
// Regenerates __tests__/vectors/engine-token.json - the shared engine-token
// test vectors kalos-web and the kalos engine both test against.
//
//   node scripts/gen-engine-token-vectors.mjs
//
// Deliberately independent of lib/server/engine-token.ts (it builds claims by
// hand with jose) so __tests__/engine-token-vectors.test.ts is a real
// cross-check: the library must reproduce these tokens byte for byte
// (Ed25519 signatures are deterministic).
//
// The two key pairs inside the file are TEST-ONLY, generated for this file,
// valid nowhere. The first run creates them; later runs reuse them so the
// vectors stay stable. The boot check (lib/server/boot-check.ts) refuses to
// start production with either of them configured.
import { generateKeyPairSync, createPublicKey } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importPKCS8, exportJWK, SignJWT, base64url } from "jose";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "__tests__", "vectors", "engine-token.json");
const NOW = 1767225600; // 2026-01-01T00:00:00Z
const LEEWAY = 30;

function newKeyPem() {
  return generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
}

// Private keys are NEVER committed: they live in a gitignored local file so that
// regenerating keeps the committed public vectors stable on this machine.
const KEYFILE = join(dirname(OUT), ".local-private-keys.json");
const stored = existsSync(KEYFILE) ? JSON.parse(readFileSync(KEYFILE, "utf8")) : null;
const keyPems = { primary: stored?.primary ?? newKeyPem(), other: stored?.other ?? newKeyPem() };
writeFileSync(KEYFILE, JSON.stringify(keyPems), { mode: 0o600 });
const KID = "kalos-test-vectors-ed25519-1";
const OTHER_KID = "kalos-test-vectors-ed25519-other";

async function keyEntry(pem, kid) {
  const key = await importPKCS8(pem, "EdDSA");
  const publicPem = createPublicKey(pem).export({ type: "spki", format: "pem" });
  const jwk = await exportJWK(createPublicKey(pem));
  return { key, entry: { kid, alg: "EdDSA", public_jwk: { ...jwk, kid, alg: "EdDSA", use: "sig" }, public_spki_pem: publicPem } };
}

const primary = await keyEntry(keyPems.primary, KID);
const other = await keyEntry(keyPems.other, OTHER_KID);

function claims({ sub, tenant, scopes, sid, jti, iat, ttl }) {
  return { iss: "kalos-web", aud: "kalos-engine", sub, tenant, scopes, sid, jti, iat, nbf: iat, exp: iat + ttl };
}

async function sign(payload, { key = primary.key, header = { alg: "EdDSA", typ: "JWT", kid: KID } } = {}) {
  return new SignJWT(payload).setProtectedHeader(header).sign(key);
}

const base = {
  sub: "user_01JTESTVECTORUSER000000001",
  tenant: "acme-bio",
  scopes: ["campaigns:read", "campaigns:write"],
  sid: "session_01JTESTVECTORSESSION00001",
  jti: "6f1c1f9e-2b0a-4d5e-9c3b-7a8d9e0f1a2b",
  iat: NOW,
  ttl: 60,
};

const valid = [];
for (const [name, over] of [
  ["member_default_ttl", {}],
  ["viewer_read_only", { scopes: ["campaigns:read"], jti: "0b6f0c1e-8a7d-4c3b-9e2f-1d0c9b8a7f6e" }],
  ["admin_max_ttl_120", { scopes: ["campaigns:read", "campaigns:write", "org:admin"], ttl: 120, jti: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }],
]) {
  const input = { ...base, ...over };
  const c = claims(input);
  valid.push({
    name,
    input: { userId: input.sub, sessionId: input.sid, tenant: input.tenant, scopes: input.scopes, ttlSeconds: input.ttl, now: input.iat, jti: input.jti },
    header: { alg: "EdDSA", typ: "JWT", kid: KID },
    claims: c,
    verify_at: NOW + 5,
    token: await sign(c),
  });
}

const omit = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
const good = claims(base);
const goodToken = await sign(good);
const [h, p] = goodToken.split(".");
const tamperedPayload = base64url.encode(JSON.stringify({ ...good, tenant: "other-tenant" }));
const noneHeader = base64url.encode(JSON.stringify({ alg: "none", typ: "JWT", kid: KID }));

const invalid = [
  { name: "expired", reason: "exp is in the past (beyond leeway)", verify_at: good.exp + LEEWAY + 1, token: goodToken },
  { name: "not_yet_valid", reason: "nbf is in the future (beyond leeway)", verify_at: good.nbf - LEEWAY - 1, token: goodToken },
  { name: "wrong_audience", reason: "aud != kalos-engine", verify_at: NOW + 5, token: await sign({ ...good, aud: "kalos-other" }) },
  { name: "wrong_issuer", reason: "iss != kalos-web", verify_at: NOW + 5, token: await sign({ ...good, iss: "https://auth.example.com" }) },
  { name: "ttl_over_120", reason: "exp - iat > 120 s: engine must reject even though the signature is valid", verify_at: NOW + 5, token: await sign({ ...good, exp: good.iat + 600 }) },
  { name: "missing_kid", reason: "header has no kid", verify_at: NOW + 5, token: await sign(good, { header: { alg: "EdDSA", typ: "JWT" } }) },
  { name: "unknown_kid", reason: "kid not in the engine's key set", verify_at: NOW + 5, token: await sign(good, { header: { alg: "EdDSA", typ: "JWT", kid: "kalos-unknown-kid" } }) },
  { name: "signed_by_other_key_same_kid", reason: "signature does not verify with the key registered for this kid", verify_at: NOW + 5, token: await sign(good, { key: other.key }) },
  { name: "tampered_payload", reason: "payload changed after signing", verify_at: NOW + 5, token: `${h}.${tamperedPayload}.${goodToken.split(".")[2]}` },
  { name: "alg_none", reason: "alg none must never be accepted", verify_at: NOW + 5, token: `${noneHeader}.${p}.` },
  { name: "invalid_tenant_format", reason: "tenant does not match ^[A-Za-z0-9_-]{1,64}$ (reject, never sanitise)", verify_at: NOW + 5, token: await sign({ ...good, tenant: "acme/bio" }) },
  { name: "missing_tenant", reason: "tenant claim absent", verify_at: NOW + 5, token: await sign(omit(good, "tenant")) },
  { name: "unknown_scope", reason: "scopes contains a value outside campaigns:read, campaigns:write, org:admin", verify_at: NOW + 5, token: await sign({ ...good, scopes: ["campaigns:read", "superuser"] }) },
  { name: "scopes_not_array", reason: "scopes must be a JSON array of strings", verify_at: NOW + 5, token: await sign({ ...good, scopes: "campaigns:read campaigns:write" }) },
  { name: "missing_jti", reason: "jti claim absent", verify_at: NOW + 5, token: await sign(omit(good, "jti")) },
  { name: "missing_sub", reason: "sub claim absent", verify_at: NOW + 5, token: await sign(omit(good, "sub")) },
];

const scopeMapping = [
  { name: "viewer_role", claims: { role: "viewer" }, scopes: ["campaigns:read"] },
  { name: "member_role", claims: { role: "member" }, scopes: ["campaigns:read", "campaigns:write"] },
  { name: "admin_role", claims: { role: "admin" }, scopes: ["campaigns:read", "campaigns:write", "org:admin"] },
  { name: "unknown_role", claims: { role: "billing" }, scopes: [] },
  { name: "no_claims", claims: {}, scopes: [] },
  { name: "multiple_roles_union", claims: { roles: ["viewer", "member"] }, scopes: ["campaigns:read", "campaigns:write"] },
  { name: "permissions_authoritative_over_role", claims: { role: "admin", permissions: ["campaigns:read"] }, scopes: ["campaigns:read"] },
  { name: "permissions_unrelated_only", claims: { role: "admin", permissions: ["widgets:edit"] }, scopes: [] },
  { name: "permissions_exact_slugs", claims: { permissions: ["org:admin", "campaigns:write", "campaigns:read"] }, scopes: ["campaigns:read", "campaigns:write", "org:admin"] },
  { name: "proto_role_ignored", claims: { role: "__proto__" }, scopes: [] },
];

const doc = {
  description:
    "Shared test vectors for the kalos-web -> kalos-engine request token. Generated by kalos-web scripts/gen-engine-token-vectors.mjs; verified by kalos-web __tests__/engine-token-vectors.test.ts. The engine should load `keys.primary.public_jwk` (or public_spki_pem) as the key for its kid, accept every `valid` token at its `verify_at` unix time, and reject every `invalid` token at its `verify_at`.",
  warning: "TEST-ONLY KEYS. Generated for this file, valid nowhere. Never configure them in any environment; kalos-web refuses to boot in production with them.",
  spec: {
    alg: "EdDSA",
    crv: "Ed25519",
    typ: "JWT",
    header_kid_required: true,
    iss: "kalos-web",
    aud: "kalos-engine",
    required_claims: ["iss", "aud", "sub", "tenant", "scopes", "sid", "jti", "iat", "nbf", "exp"],
    max_ttl_seconds: 120,
    recommended_clock_leeway_seconds: LEEWAY,
    tenant_pattern: "^[A-Za-z0-9_-]{1,64}$",
    scopes: ["campaigns:read", "campaigns:write", "org:admin"],
    scope_semantics: { GET: "campaigns:read", HEAD: "campaigns:read", POST: "campaigns:write", PATCH: "campaigns:write", DELETE: "campaigns:write" },
  },
  keys: { primary: primary.entry, other: other.entry },
  valid,
  invalid,
  scope_mapping: scopeMapping,
};

writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${OUT}`);
