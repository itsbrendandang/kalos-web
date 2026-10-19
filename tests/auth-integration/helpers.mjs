// Shared harness for the Better Auth integration tests (ported from the
// scratch verification project). Everything is in-process: a temp SQLite
// file, the real Better Auth handler, and a FAKE Google - outbound fetches
// to Google's token/JWKS endpoints are intercepted and answered with id
// tokens signed by a throwaway RSA key. Any other request to a Google host
// throws, so the suite never talks to the network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import Database from "better-sqlite3";
import { getMigrations } from "better-auth/db/migration";
import { createOTP } from "@better-auth/utils/otp";
import { makeAuth } from "../../lib/server/auth-config.mjs";

export const BASE = "http://localhost:3000";
export const GOOGLE_CLIENT_ID = "fake-client-id.apps.googleusercontent.com";
export const TEST_SECRET = "integration-test-secret-0123456789abcdef0123456789";

export function tempDir(prefix = "kalos-auth-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function openDb(file) {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
}

/** A migrated Better Auth instance on a fresh temp DB file. */
export async function freshAuth(opts = {}) {
  const dir = tempDir();
  const file = path.join(dir, "auth.db");
  const db = openDb(file);
  const auth = makeAuth({
    database: db,
    baseURL: BASE,
    secret: TEST_SECRET,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: "fake-secret",
    rateLimit: false,
    logger: { disabled: true },
    ...opts,
  });
  const m = await getMigrations(auth.options);
  await m.runMigrations();
  return { auth, db, file, dir, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** Minimal cookie-jar client around auth.handler. */
export function client(auth, { ip, userAgent } = {}) {
  const jar = new Map();
  async function req(p, { method = "GET", body, headers = {}, raw = false } = {}) {
    const h = new Headers({ origin: BASE, ...headers });
    if (jar.size) h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (body) h.set("content-type", "application/json");
    if (ip) h.set("x-forwarded-for", ip);
    if (userAgent) h.set("user-agent", userAgent);
    const res = await auth.handler(new Request(BASE + "/api/auth" + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }));
    for (const sc of res.headers.getSetCookie()) {
      const [kv, ...attrs] = sc.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === "";
      if (expired) jar.delete(k);
      else jar.set(k, v);
    }
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  }
  /** Headers carrying this client's cookies (for auth.api.* / resolver calls). */
  function headers() {
    return new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), origin: BASE });
  }
  return { req, jar, headers };
}

export async function totpNow(totpURI) {
  const secret = new URL(totpURI).searchParams.get("secret");
  return createOTP(base32Decode(secret)).totp();
}
function base32Decode(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  let out = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  for (let i = 0; i + 8 <= bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  return out;
}

/** RSA key used to sign fake Google id_tokens. */
export async function makeSigner() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const sign = (claims) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience(GOOGLE_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
  return { jwk, sign };
}

/** Intercept Google's endpoints in-process. Returns the list of token calls and a restore fn. */
export function interceptGoogle(signer, getClaims) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url ?? String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      calls.push({ url, body: String(init?.body ?? "") });
      return Response.json({ access_token: "ya29.fake", token_type: "Bearer", expires_in: 3600, scope: "openid email profile", id_token: await signer.sign(getClaims()) });
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) return Response.json({ keys: [signer.jwk] });
    if (/googleapis\.com|google\.com/.test(url)) throw new Error("BLOCKED outbound request to Google: " + url);
    return real(input, init);
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

/** OAuth round trip: /sign-in/social -> (fake Google) -> /callback/google. */
export async function googleSignIn(c, startBody = {}) {
  const s = await c.req("/sign-in/social", { method: "POST", body: { provider: "google", callbackURL: "/", ...startBody } });
  if (!s.json?.url) return { start: s, location: null };
  const authUrl = new URL(s.json.url);
  const state = authUrl.searchParams.get("state");
  const cb = await c.req(`/callback/google?code=fake-code&state=${encodeURIComponent(state)}`, { raw: true });
  return { start: s, authUrl, cb, location: cb.headers.get("location") };
}

/** Enrol TOTP on a fresh half session and verify it; returns the totpURI. */
export async function enrolTotp(c) {
  const en = await c.req("/two-factor/enable", { method: "POST", body: {} });
  if (en.status !== 200) throw new Error(`enable failed ${en.status} ${en.text}`);
  const v = await c.req("/two-factor/verify-totp", { method: "POST", body: { code: await totpNow(en.json.totpURI) } });
  if (v.status !== 200) throw new Error(`verify failed ${v.status} ${v.text}`);
  return { totpURI: en.json.totpURI, backupCodes: en.json.backupCodes };
}

/**
 * A TOTP code for the current step + `offset` (the verifier accepts -1..+1).
 * Lets a test make several successful verifications for one user without
 * waiting for new 30 s steps (each code is single-use).
 */
export async function totpAt(totpURI, offset = 0) {
  const secret = base32Decode(new URL(totpURI).searchParams.get("secret"));
  return createOTP(secret).hotp(Math.floor(Date.now() / 30000) + offset);
}
