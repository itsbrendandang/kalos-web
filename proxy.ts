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
import { isLocalMode, localToken } from "@/lib/local-mode";
import { LOCAL_COOKIE, LOCAL_QUERY, localGate } from "@/lib/server/local-guard";
import { proxyDecision } from "@/lib/auth-routes";

export function proxy(request: NextRequest) {
  if (isLocalMode()) {
    const d = localGate({
      host: request.headers.get("host"),
      cookie: request.cookies.get(LOCAL_COOKIE)?.value ?? null,
      query: request.nextUrl.searchParams.get(LOCAL_QUERY),
      token: localToken()!,
    });
    if (d.action === "next") return NextResponse.next();
    if (d.action === "deny") {
      return new NextResponse(d.status === 421 ? "Wrong host." : "Open Kalos from the desktop app.", { status: d.status, headers: { "cache-control": "no-store" } });
    }
    // First visit with the launch secret: keep it as a cookie and drop it from the address.
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(LOCAL_QUERY);
    const res = NextResponse.redirect(clean);
    res.cookies.set(LOCAL_COOKIE, localToken()!, { httpOnly: true, sameSite: "strict", path: "/" });
    res.headers.set("cache-control", "no-store");
    return res;
  }
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
