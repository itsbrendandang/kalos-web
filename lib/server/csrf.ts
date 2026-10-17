// CSRF / origin defence for the engine proxy. Pure: takes the request
// headers and the expected origin, returns a decision. See
// docs/ENGINE_PROXY.md ("CSRF") for the design.
//
// Layers, all of which a state-changing request (POST/PATCH/DELETE) must pass:
// 1. `Origin` must be present and exactly equal to the app's public origin
//    (KALOS_PUBLIC_URL, else BETTER_AUTH_URL). Browsers send Origin on every
//    non-GET fetch, same-origin included, so a missing Origin is refused
//    (403) rather than treated as "probably fine". `Origin: null` (sandboxed
//    frames, file://, some redirects) is refused.
// 2. Fallback signals are cross-checks, never a substitute for Origin: if
//    `Sec-Fetch-Site` is present it must be "same-origin"; if `Referer` is
//    present its origin must match too.
// 3. The custom header X-Kalos-CSRF: 1 (lib/engine-csrf.ts) must be present.
//    A cross-origin page can only send it after a CORS preflight, which this
//    app never grants; an HTML form cannot send it at all.
// 4. (Outside this module) the session cookie is SameSite=Lax + HttpOnly
//    (Better Auth config), so cross-site subresource/form POSTs do not carry
//    it in the first place, and the route only accepts application/json or
//    multipart/form-data bodies.
//
// Reads (GET/HEAD) need no token, but are refused when the browser says the
// request is cross-site (Sec-Fetch-Site: cross-site / same-site) or sends a
// foreign Origin, so a third-party page cannot even trigger engine work
// (some GETs, like the demo simulators, are CPU-heavy) with the user's
// cookie. Non-browser clients that send neither header still need a valid
// session cookie.
import { ENGINE_CSRF_HEADER, ENGINE_CSRF_VALUE } from "@/lib/engine-csrf";

export type CsrfDecision = { ok: true } | { ok: false; reason: CsrfFailure };
export type CsrfFailure =
  | "origin_not_configured"
  | "origin_missing"
  | "origin_mismatch"
  | "cross_site_fetch"
  | "referer_mismatch"
  | "csrf_header_missing";

/** Canonical origin of a configured URL, or null if it is not an http(s) URL. */
export function canonicalOrigin(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** The single origin the app is served from. KALOS_PUBLIC_URL wins; BETTER_AUTH_URL is the documented default. */
export function expectedOrigin(env: Readonly<Record<string, string | undefined>>): string | null {
  return canonicalOrigin(env.KALOS_PUBLIC_URL) ?? canonicalOrigin(env.BETTER_AUTH_URL);
}

function refererOrigin(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return "invalid";
  }
}

export function checkCsrf(method: string, headers: Headers, expected: string | null): CsrfDecision {
  const stateChanging = method !== "GET" && method !== "HEAD";
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site")?.trim().toLowerCase() ?? null;
  const referer = headers.get("referer");

  if (!stateChanging) {
    // Reads: refuse only on a positive cross-site signal.
    if (site && site !== "same-origin" && site !== "none") return { ok: false, reason: "cross_site_fetch" };
    if (origin !== null && (expected === null || origin !== expected)) return { ok: false, reason: "origin_mismatch" };
    return { ok: true };
  }

  if (expected === null) return { ok: false, reason: "origin_not_configured" };
  if (origin === null || origin.trim() === "") return { ok: false, reason: "origin_missing" };
  if (origin !== expected) return { ok: false, reason: "origin_mismatch" };
  if (site !== null && site !== "same-origin") return { ok: false, reason: "cross_site_fetch" };
  if (referer !== null && referer !== "" && refererOrigin(referer) !== expected) return { ok: false, reason: "referer_mismatch" };
  if (headers.get(ENGINE_CSRF_HEADER) !== ENGINE_CSRF_VALUE) return { ok: false, reason: "csrf_header_missing" };
  return { ok: true };
}
