// Authenticated, same-origin proxy from the browser to the kalos engine.
// All of the logic (and the order of checks) is in lib/server/engine-proxy.ts;
// the design and threat model are in docs/ENGINE_PROXY.md.
//
// Every request is authorized HERE, not in proxy.ts (which only checks that a
// session cookie exists): the session is looked up server-side, MFA and
// member-table membership are required, the organization is mapped to an
// internal tenant, and the engine gets a 60-second EdDSA token minted for
// this one request. The browser never sees that token, the engine URL or
// the tenant id. There is no bypass switch: tests replace the auth module
// with vi.mock.
import type { NextRequest } from "next/server";
import { resolveSession } from "@/lib/server/session";
import { resolveTenant } from "@/lib/server/tenants";
import { loadEngineSigner } from "@/lib/server/engine-token";
import { createEngineProxy, defaultRateLimiter } from "@/lib/server/engine-proxy";

// Request-scoped, never cached.
export const dynamic = "force-dynamic";

const handle = createEngineProxy({
  resolveSession: (h) => resolveSession(h),
  resolveTenant: (orgId) => resolveTenant(orgId),
  loadSigner: () => loadEngineSigner(),
  fetch: () => globalThis.fetch,
  env: () => process.env,
  rateLimiter: defaultRateLimiter,
  log: (line) => console.info(line),
});

type RouteParams = { params: Promise<{ path?: string[] }> };

async function serve(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { path } = await params;
  return handle(req, path ?? []);
}

export const GET = serve;
export const HEAD = serve;
export const POST = serve;
export const PATCH = serve;
export const DELETE = serve;
// Explicit so Next does not answer these itself (its automatic OPTIONS reply
// lists methods; CORS preflights must get nothing they can use): 405.
export const PUT = serve;
export const OPTIONS = serve;
