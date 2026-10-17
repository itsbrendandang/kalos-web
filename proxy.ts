// Next 16 proxy (formerly middleware). Node runtime by default; no `runtime`
// export (Next throws on it in proxy files).
//
// OPTIMISTIC GATE ONLY: it checks that a session cookie is present, not that
// it is valid. Page requests without one are redirected to /sign-in, /api/*
// requests get 401 JSON. The real checks (session lookup, MFA, membership
// from the member table) happen in route handlers and server components via
// lib/server/session.ts, because a proxy can be bypassed.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { proxyDecision } from "@/lib/auth-routes";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const d = proxyDecision(pathname, search, getSessionCookie(request) !== null);
  if (d.action === "next") return NextResponse.next();
  if (d.action === "unauthorized") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.redirect(new URL(d.location, request.url));
}

export const config = {
  // Everything except Next's own static output. Do NOT exclude "paths with a
  // dot" - /api/engine/x.json must still be gated.
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$).*)"],
};
