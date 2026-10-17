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
// Root-level static files from public/ (not under /api, single segment).
const PUBLIC_ASSET = /^\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:svg|png|ico|txt|webmanifest|xml)$/;

/** Pages that need a session but neither a selected org nor (for security) MFA. */
export const SESSION_FLOW_PAGES = Object.freeze(["/settings/security", "/select-org"]);

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function classifyRoute(pathname: string): RouteKind {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return "page";
  const p = stripTrailingSlash(pathname);
  if (p === "/api" || p.startsWith("/api/")) {
    if (p === "/api/auth" || p.startsWith("/api/auth/")) return "public";
    if (PUBLIC_API.has(p)) return "public";
    return "api";
  }
  if (PUBLIC_PAGES.has(p) || ACCEPT_INVITE.test(p)) return "public";
  if (p.startsWith("/_next/static/") || p.startsWith("/_next/image") || p === "/favicon.ico") return "public";
  if (PUBLIC_ASSET.test(p)) return "public";
  return "page";
}

export function isSessionFlowPage(pathname: string): boolean {
  return SESSION_FLOW_PAGES.includes(stripTrailingSlash(pathname));
}

/**
 * A same-origin path safe to redirect to after sign-in, or "/".
 * Rejects absolute URLs, protocol-relative ("//x"), backslashes, control
 * characters and anything that resolves off-origin.
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, "http://kalos.invalid");
    if (u.origin !== "http://kalos.invalid") return fallback;
    const out = u.pathname + u.search + u.hash;
    if (classifyRoute(u.pathname) === "api") return fallback;
    return out;
  } catch {
    return fallback;
  }
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
