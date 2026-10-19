// The engine routes the /api/engine proxy will forward, and what each needs.
// Pure: no I/O, no env. Used by lib/server/engine-proxy.ts.
//
// This is an EXACT route table (method + segment pattern), not a prefix
// list: anything not listed is 404 (unknown path) or 405 (known path, other
// method), so the proxy can never become a relay to an engine route the web
// app does not use - including /healthz and /readyz, which are deliberately
// absent (they are the engine's own unauthenticated probes).
//
// Each entry declares:
// - `scopes`: the engine-token scopes the request needs (and the ONLY scopes
//   the minted token will carry - least privilege per request). GET/HEAD are
//   read, POST/PATCH/DELETE are write.
// - `body`: what the request body may be. "none" = never forwarded;
//   "json" = application/json (or no body at all); "multipart" =
//   multipart/form-data upload. Everything else is 415, which also shuts out
//   the content types an HTML form can post cross-site
//   (application/x-www-form-urlencoded, text/plain).
// - `admin`: an admin action (needs org:admin and a recent second factor).
//   "archived-field" = PATCH /api/campaigns/{id} whose JSON body sets
//   `archived` (archive / unarchive), the same condition the engine uses
//   (kalos/portal/campaigns_api.py: `body.archived is not None`).
import type { EngineScope } from "@/lib/server/scopes";

export const PROXY_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE"] as const;
export type ProxyMethod = (typeof PROXY_METHODS)[number];

export type BodyKind = "none" | "json" | "multipart";

export interface EngineRoute {
  method: Exclude<ProxyMethod, "HEAD">;
  /** Literal segments, or ":id" for an opaque id segment. */
  pattern: readonly string[];
  scopes: readonly EngineScope[];
  body: BodyKind;
  admin?: "archived-field";
}

const R: readonly EngineScope[] = ["campaigns:read"];
const W: readonly EngineScope[] = ["campaigns:write"];

const route = (method: EngineRoute["method"], path: string, body: BodyKind, extra: Partial<EngineRoute> = {}): EngineRoute =>
  Object.freeze({
    method,
    pattern: Object.freeze(path.split("/")),
    scopes: method === "GET" ? R : W,
    body,
    ...extra,
  });

/** Every engine route the web client (lib/api.ts, lib/scale-readout.ts) uses or may use. */
export const ENGINE_ROUTES: readonly EngineRoute[] = Object.freeze([
  // Legacy single-campaign routes (act on the tenant's default campaign).
  route("GET", "api/latest", "none"),
  route("GET", "api/providers", "none"),
  route("POST", "api/run", "multipart"),
  route("GET", "api/campaign", "none"),
  route("POST", "api/campaign/start", "json"),
  route("POST", "api/campaign/result", "json"),
  route("POST", "api/campaign/reanalyze", "json"),
  route("POST", "api/scale/readout", "multipart"),
  // Demo simulators (the engine registers these only outside production).
  route("GET", "api/single", "none"),
  route("GET", "api/multi", "none"),
  // Multi-campaign API (kalos-engine docs/CAMPAIGNS_API.md).
  route("GET", "api/campaigns", "none"),
  route("POST", "api/campaigns", "json"),
  route("GET", "api/campaigns/:id", "none"),
  route("PATCH", "api/campaigns/:id", "json", { admin: "archived-field" }),
  route("POST", "api/campaigns/:id/upload", "multipart"),
  route("GET", "api/campaigns/:id/analysis", "none"),
  route("POST", "api/campaigns/:id/runs", "json"),
  route("POST", "api/campaigns/:id/runs/:id/result", "json"),
  route("POST", "api/campaigns/:id/reanalyze", "json"),
]);

/** Opaque id segments (campaign ids `cmp_<hex>`, run ids `<hex>`). The engine validates the exact format. */
const ID_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_SEGMENTS = 8;

/**
 * A decoded catch-all segment that could change the path the engine sees
 * once the URL is parsed: empty, "." / "..", or a separator / query /
 * fragment / escape / control character (adopted from PR #64). Next decodes
 * each segment once, so "%2e%2e" and "%2f" arrive here as ".." and "/", and a
 * double-encoded "%252f" arrives as "%2f" - all rejected.
 */
export function isSafeSegment(seg: string): boolean {
  return typeof seg === "string" && seg !== "" && seg !== "." && seg !== ".." && !/[\\/?#%\u0000-\u001f\u007f]/.test(seg);
}

/**
 * The raw (still percent-encoded) request path must not carry an encoded
 * slash, backslash, dot, percent (double encoding) or NUL, nor a literal
 * backslash or dot-segment. Checked on the raw URL as well as on the decoded
 * segments so a framework that normalises differently can't open a gap.
 */
export function isSafeRawPath(rawPathname: string): boolean {
  if (typeof rawPathname !== "string") return false;
  if (/%(?:2f|5c|2e|25|00)/i.test(rawPathname)) return false;
  if (rawPathname.includes("\\")) return false;
  return !rawPathname.split("/").some((s) => s === "." || s === "..");
}

function matches(pattern: readonly string[], segments: readonly string[]): boolean {
  if (pattern.length !== segments.length) return false;
  return pattern.every((p, i) => (p === ":id" ? ID_SEGMENT.test(segments[i]) : p === segments[i]));
}

export type RouteMatch =
  | { kind: "ok"; route: EngineRoute; template: string }
  | { kind: "not_found" }
  | { kind: "method_not_allowed"; allow: string[] };

/** Match method + decoded segments against the table. HEAD is allowed wherever GET is. */
export function matchEngineRoute(method: string, segments: readonly string[]): RouteMatch {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > MAX_SEGMENTS) return { kind: "not_found" };
  if (!segments.every(isSafeSegment)) return { kind: "not_found" };
  const candidates = ENGINE_ROUTES.filter((r) => matches(r.pattern, segments));
  if (candidates.length === 0) return { kind: "not_found" };
  const m = method.toUpperCase();
  const lookup = m === "HEAD" ? "GET" : m;
  const hit = candidates.find((r) => r.method === lookup);
  if (!hit) {
    const allow = new Set<string>();
    for (const r of candidates) {
      allow.add(r.method);
      if (r.method === "GET") allow.add("HEAD");
    }
    return { kind: "method_not_allowed", allow: [...allow] };
  }
  return { kind: "ok", route: hit, template: hit.pattern.join("/") };
}

/** True for a method the proxy handles at all; anything else is 405 before routing. */
export function isProxyMethod(method: string): method is ProxyMethod {
  return (PROXY_METHODS as readonly string[]).includes(method);
}

export function isStateChanging(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}
