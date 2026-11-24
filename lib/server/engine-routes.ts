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
//   the minted token will carry - least privilege per request). Declared per
//   route from the engine's published manifest (kalos-engine
//   docs/route-scopes.json, vendored as __tests__/fixtures/engine-route-scopes.json
//   and checked by __tests__/engine-routes.test.ts), not derived from the HTTP
//   method: an engine route may need `read` on a POST.
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

export const PROXY_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
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

const R: readonly EngineScope[] = Object.freeze(["campaigns:read"]);
const W: readonly EngineScope[] = Object.freeze(["campaigns:write"]);

const route = (method: EngineRoute["method"], path: string, scopes: readonly EngineScope[], body: BodyKind, extra: Partial<EngineRoute> = {}): EngineRoute =>
  Object.freeze({
    method,
    pattern: Object.freeze(path.split("/")),
    scopes,
    body,
    ...extra,
  });

/**
 * Every engine route the web client (lib/api.ts, lib/scale-readout.ts) calls.
 * The legacy single-campaign routes (/api/latest, /api/run, /api/campaign/*),
 * the demo simulators (/api/single, /api/multi), the HTML scale readout and
 * the synchronous upload/re-analysis routes were removed once nothing called
 * them: the pages use the multi-campaign API and background jobs only.
 */
export const ENGINE_ROUTES: readonly EngineRoute[] = Object.freeze([
  // Optional AI providers (Settings).
  route("GET", "api/providers", R, "none"),
  // Scale-up readout, JSON variant (stateless; write per the engine manifest).
  route("POST", "api/scale/readout.json", W, "multipart"),
  // Multi-campaign API (kalos-engine docs/CAMPAIGNS_API.md). The list takes ?summary=true.
  route("GET", "api/campaigns", R, "none"),
  route("POST", "api/campaigns", W, "json"),
  route("GET", "api/campaigns/:id", R, "none"),
  route("PATCH", "api/campaigns/:id", W, "json", { admin: "archived-field" }),
  route("GET", "api/campaigns/:id/analysis", R, "none"),
  route("POST", "api/campaigns/:id/runs", W, "json"),
  route("POST", "api/campaigns/:id/runs/:id/result", W, "json"),
  // Setup (goal, bounds, linear constraints, target unit), stage track and go/no-go gates.
  route("GET", "api/campaigns/:id/setup", R, "none"),
  route("PUT", "api/campaigns/:id/setup", W, "json"),
  route("GET", "api/campaigns/:id/stages", R, "none"),
  route("PUT", "api/campaigns/:id/stages", W, "json"),
  route("GET", "api/campaigns/:id/gates", R, "none"),
  route("PUT", "api/campaigns/:id/gates/:id", W, "json"),
  route("GET", "api/campaigns/:id/gates/:id/history", R, "none"),
  // Report: raw rows, result history + audit log, operating ranges. Both engine forms refit the GP and need
  // write; only POST is proxied, so no GET ever mints write (GET operating-ranges stays unreachable).
  route("GET", "api/campaigns/:id/export/rows", R, "none"),
  route("GET", "api/campaigns/:id/results/history", R, "none"),
  // Prospective track record (kalos/portal/history_api.py): per round and per run, the prediction recorded
  // at start vs the result measured. Query: coverage, band, limit, offset (rounds) / round, after_id (runs).
  route("GET", "api/campaigns/:id/track-record", R, "none"),
  route("GET", "api/campaigns/:id/track-record/runs", R, "none"),
  // Assistant reads (kalos/assist/routes.py): records-only campaign search (?q=&k=), the guide's next step
  // (?campaign_id=, the tenant default without one) and the index status. POST /api/assist/ask (a model
  // answer) and the index rebuild are deliberately not proxied.
  route("GET", "api/campaigns/:id/search", R, "none"),
  route("GET", "api/assist/next", R, "none"),
  route("GET", "api/assist/index/status", R, "none"),
  route("POST", "api/campaigns/:id/operating-ranges", W, "json"),
  // Background jobs (kalos-engine docs/JOBS.md): an upload or a re-analysis
  // is submitted (202), then polled for its engine-reported stage and
  // progress, and can be cancelled.
  route("POST", "api/campaigns/:id/jobs", W, "multipart"),
  route("GET", "api/campaigns/:id/jobs", R, "none"),
  route("POST", "api/campaigns/:id/reanalyze/jobs", W, "json"),
  route("GET", "api/jobs/:id", R, "none"),
  route("POST", "api/jobs/:id/cancel", W, "json"),
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
