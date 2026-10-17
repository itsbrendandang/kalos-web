// Route classification shared by proxy.ts (server, optimistic gate) and the
// client auth frame (components/auth/auth-frame.tsx). Pure: no I/O, no env.
//
// This is NOT the security boundary. proxy.ts can be bypassed (Next has had
// proxy/middleware bypass advisories); every route handler and server
// component re-checks the session with lib/server/session.ts.

export type RouteKind =
  /** Reachable without a session. */
  | "public"
  /** /api/* that needs a session: 401 JSON when there is none, never a redirect. */
  | "api"
  /** A page that needs a session (and MFA); unauthenticated -> /sign-in. */
  | "page";

const PUBLIC_PAGES = new Set(["/sign-in", "/signed-out"]);
const PUBLIC_API = new Set(["/api/health"]);
// Better Auth / invitation ids: opaque [A-Za-z0-9_-]. Anything else under
// /accept-invite is not public.
const ACCEPT_INVITE = /^\/accept-invite\/[A-Za-z0-9_-]{1,128}$/;
/**
 * Exactly the files in public/ (kept in sync by __tests__/auth-routes.test.ts)
 * plus Next's favicon. No pattern: "/api.svg" or "/x.txt" are NOT public.
 */
export const PUBLIC_FILES: ReadonlySet<string> = new Set(["/favicon.ico", "/file.svg", "/globe.svg", "/next.svg", "/vercel.svg", "/window.svg"]);
// Dot segments, encoded slashes/dots/backslashes, raw backslashes, doubled
// slashes: Next normalises real requests before the proxy runs, so a path
// that still carries any of these is never granted a public classification.
const SUSPICIOUS = /(?:^|\/)\.{1,2}(?:\/|$)|%2e|%2f|%5c|\\|\/\//i;

/** Pages that need a session but neither a selected org nor (for security) MFA. */
export const SESSION_FLOW_PAGES = Object.freeze(["/settings/security", "/select-org"]);

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function classifyRoute(pathname: string): RouteKind {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return "page";
  if (SUSPICIOUS.test(pathname)) return pathname.startsWith("/api/") || pathname === "/api" ? "api" : "page";
  const p = stripTrailingSlash(pathname);
  if (p === "/api" || p.startsWith("/api/")) {
    if (p === "/api/auth" || p.startsWith("/api/auth/")) return "public";
    if (PUBLIC_API.has(p)) return "public";
    return "api";
  }
  if (PUBLIC_PAGES.has(p) || ACCEPT_INVITE.test(p)) return "public";
  if (pathname.startsWith("/_next/static/") || p === "/_next/image") return "public";
  if (PUBLIC_FILES.has(p)) return "public";
  return "page";
}

export function isSessionFlowPage(pathname: string): boolean {
  return SESSION_FLOW_PAGES.includes(stripTrailingSlash(pathname));
}

/** True for a string that is safe to use as a same-origin redirect target as-is. */
export function isSafeRelativePath(p: unknown): p is string {
  return (
    typeof p === "string" &&
    p.startsWith("/") &&
    !p.startsWith("//") &&
    !p.startsWith("/\\") &&
    !p.includes("\\") &&
    !/[\u0000-\u001f\u007f\s]/.test(p)
  );
}

/**
 * A same-origin path safe to redirect to after sign-in, or `fallback`.
 * Validates the INPUT and the URL-normalised OUTPUT: normalisation turns
 * "/.//evil.com", "/a/..//evil.com" or "/%2e%2e//evil.com" into
 * "//evil.com" (protocol-relative = off-site), so the output must pass the
 * same checks and must not differ from the input except for harmless
 * normalisation of the query/hash.
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!isSafeRelativePath(raw)) return fallback;
  // No dot segments or encoded separators/dots at all in a redirect target.
  if (SUSPICIOUS.test(raw.split(/[?#]/)[0])) return fallback;
  let out: string;
  try {
    const u = new URL(raw, "http://kalos.invalid");
    if (u.origin !== "http://kalos.invalid") return fallback;
    if (classifyRoute(u.pathname) === "api") return fallback;
    out = u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
  if (!isSafeRelativePath(out)) return fallback;
  if (out.split(/[?#]/)[0] !== raw.split(/[?#]/)[0]) return fallback;
  return out;
}

export type ProxyDecision =
  | { action: "next" }
  | { action: "redirect"; location: string }
  | { action: "unauthorized" };

/**
 * What proxy.ts does for a request. `hasSessionCookie` is only "a cookie with
 * the session name exists" - its validity is checked server-side later.
 */
export function proxyDecision(pathname: string, search: string, hasSessionCookie: boolean): ProxyDecision {
  const kind = classifyRoute(pathname);
  if (kind === "public" || hasSessionCookie) return { action: "next" };
  if (kind === "api") return { action: "unauthorized" };
  const next = safeNextPath(pathname + (search || ""), "");
  return { action: "redirect", location: next && next !== "/" ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in" };
}
