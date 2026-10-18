#!/usr/bin/env node
// Prints the PUBLIC JWKS the kalos engine must trust for kalos-web engine
// tokens (kalos-engine: KALOS_JWT_PUBLIC_KEYS_FILE). Derived from the same
// PKCS#8 Ed25519 PEM kalos-web signs with, so the two cannot drift apart.
//
//   KALOS_ENGINE_JWT_PRIVATE_KEY_FILE=/run/secrets/engine.pem \
//   KALOS_ENGINE_JWT_KID=kalos-web-2026-10 \
//   node scripts/engine-jwks.mjs > /config/engine-jwks.json
//
// Output contains ONLY public members (kty, crv, x, kid, alg, use). The
// engine refuses any key that carries `d`, so this script never prints it.
// Exit status 2 on any configuration error (nothing is printed to stdout).
// See docs/ENGINE_AUTH.md.
import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";

const KID = /^[A-Za-z0-9._-]{1,64}$/;

function fail(message) {
  process.stderr.write(`engine-jwks: ${message}\n`);
  process.exit(2);
}

const file = process.env.KALOS_ENGINE_JWT_PRIVATE_KEY_FILE?.trim();
const kid = process.env.KALOS_ENGINE_JWT_KID?.trim();
if (!file) fail("KALOS_ENGINE_JWT_PRIVATE_KEY_FILE is not set");
if (!kid || !KID.test(kid)) fail("KALOS_ENGINE_JWT_KID is missing or not 1-64 of [A-Za-z0-9._-]");

let key;
try {
  key = createPrivateKey({ key: readFileSync(file, "utf8"), format: "pem" });
} catch {
  fail("private key file is not a readable PEM private key");
}
if (key.asymmetricKeyType !== "ed25519") fail("private key is not Ed25519");

const { crv, kty, x } = createPublicKey(key).export({ format: "jwk" });
if (kty !== "OKP" || crv !== "Ed25519" || typeof x !== "string") fail("could not derive the public key");

process.stdout.write(JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", x, kid, alg: "EdDSA", use: "sig" }] }, null, 2) + "\n");
