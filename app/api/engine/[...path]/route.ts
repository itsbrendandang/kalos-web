// Server-side proxy to the kalos engine (the FastAPI portal). See
// lib/api.ts for the client side of this: with no NEXT_PUBLIC_API_URL set,
// every browser fetch hits this same-origin route instead of the engine
// directly.
//
// Why this exists: the engine can require `Authorization: Bearer <token>`
// (kalos/kalos/portal/auth.py). A token embedded in ANY client-visible code -
// a NEXT_PUBLIC_* env var, a bundled constant, even one only referenced from
// a server component but shipped in the client bundle - is public the moment
// it ships, no matter how it's obfuscated. So KALOS_ENGINE_TOKEN below is
// read from a server-only env var (no NEXT_PUBLIC_ prefix) and only ever
// touched in this route handler, which runs on the server and never sends
// the token to the browser. That boundary - server env var vs. NEXT_PUBLIC_*
// - is the entire point of this file.
import { NextResponse, type NextRequest } from "next/server";

// Route Handlers are dynamic (request-scoped) by default when they read
// request data or hit the network, which this always does - stated
// explicitly so a future cache-config change can't silently make this stale.
export const dynamic = "force-dynamic";

// Every engine path prefix kalos-web's own client code (lib/api.ts)
// actually calls. Anything outside this list 404s, so
// the proxy can't be turned into an open relay to arbitrary engine routes -
// or, worse, arbitrary URLs (KALOS_ENGINE_URL is never taken from the
// request). Checked as whole path segments (`joined === prefix ||
// joined.startsWith(prefix + "/")`), not a raw string prefix, so
// "api/campaign" can't accidentally admit "api/campaignish".
const ALLOWED_PATH_PREFIXES = [
  "api/single",
  "api/multi",
  "api/run",
  "api/latest",
  "api/campaign",
  "api/providers",
] as const;

// Long enough for a COLD containerized GP fit, short enough that a dead
// engine still fails the request instead of hanging it. The original 30s
// guess was measured wrong on the first real docker-compose run: a cold
// engine container (first torch import + full analyze on a 160-run sheet)
// legitimately needs more, and the proxy 502'd mid-fit while the engine kept
// working. Env-tunable (server-side, like the rest of this route's config)
// because the right number depends on the deployment's CPU, not on this code.
const ENGINE_TIMEOUT_MS = (() => {
  const raw = process.env.KALOS_ENGINE_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
})();

function isAllowedPath(segments: string[]): boolean {
  const joined = segments.join("/");
  return ALLOWED_PATH_PREFIXES.some((prefix) => joined === prefix || joined.startsWith(`${prefix}/`));
}

/** `KALOS_ENGINE_URL` with any trailing slash trimmed, or null if unset. */
function engineBaseUrl(): string | null {
  const raw = process.env.KALOS_ENGINE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

async function forward(req: NextRequest, segments: string[]): Promise<Response> {
  if (!isAllowedPath(segments)) {
    return NextResponse.json({ error: `no such engine route: /${segments.join("/")}` }, { status: 404 });
  }

  const base = engineBaseUrl();
  if (!base) {
    return NextResponse.json({ error: "engine unreachable: KALOS_ENGINE_URL is not configured" }, { status: 502 });
  }

  const url = `${base}/${segments.join("/")}${req.nextUrl.search}`;

  // Forward only what the engine needs to interpret the body correctly
  // (content-type, including a multipart boundary) plus the server-only
  // bearer token - not an indiscriminate copy of every incoming header.
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const token = process.env.KALOS_ENGINE_TOKEN;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);

  try {
    const engineRes = await fetch(url, {
      method: req.method,
      headers,
      // Streamed straight through (not buffered/re-parsed) so a multipart
      // file upload (POST /api/run, POST /api/experiments) survives the
      // proxy without loading the whole file into memory.
      body: hasBody ? req.body : undefined,
      // Node's fetch (undici) requires this whenever a streamed body is
      // sent; TypeScript's RequestInit doesn't know about it yet.
      duplex: hasBody ? "half" : undefined,
      signal: controller.signal,
    } as RequestInit);

    // Status code and body are passed through untouched - the proxy adds
    // auth, it never rewrites what the engine said. Headers are an explicit
    // allowlist, not a blanket copy - most of a fetch Response's headers
    // (content-encoding, transfer-encoding, connection) describe framing
    // undici already resolved and would be wrong to replay verbatim.
    // Retry-After was missing from that allowlist (found live in the
    // 2026-09-16 production test cycle's concurrency check: a 503 from
    // kalos/portal/busy.py's single analysis slot carries a real
    // Retry-After, but any caller going through this proxy - including
    // kalos-web's own client code - saw it silently dropped).
    const outHeaders = new Headers();
    const outContentType = engineRes.headers.get("content-type");
    if (outContentType) outHeaders.set("content-type", outContentType);
    const retryAfter = engineRes.headers.get("retry-after");
    if (retryAfter) outHeaders.set("retry-after", retryAfter);

    return new Response(engineRes.body, { status: engineRes.status, headers: outHeaders });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "engine request timed out" : "engine unreachable" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  return forward(req, path ?? []);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  return forward(req, path ?? []);
}
