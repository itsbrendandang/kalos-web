import "server-only";

// Engine forwarder for local (on-device) mode. Same route table, CSRF and
// size rules as the hosted proxy, but no session, tenant or token: the
// bundled engine only listens on this machine in open mode.
import { checkCsrf } from "@/lib/server/csrf";
import { engineTarget } from "@/lib/server/engine-proxy";
import { isSafeRawPath, matchEngineRoute } from "@/lib/server/engine-routes";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function forwardToLocalEngine(req: Request, segments: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!isSafeRawPath(new URL(req.url).pathname)) return json(404, "not_found");
  const m = matchEngineRoute(method, segments);
  if (m.kind === "not_found") return json(404, "not_found");
  if (m.kind === "method_not_allowed") return new Response(null, { status: 405, headers: { allow: m.allow.join(", ") } });

  const host = req.headers.get("host");
  if (!host || !checkCsrf(method, req.headers, `http://${host}`).ok) return json(403, "forbidden");

  const target = engineTarget(process.env.KALOS_ENGINE_URL ?? "http://127.0.0.1:8050");
  if (!target) return json(502, "engine_not_configured");
  const query = new URL(req.url).search;
  const url = `${target.origin}${target.basePath}/${segments.map(encodeURIComponent).join("/")}${query}`;

  const headers = new Headers();
  for (const h of ["accept", "content-type"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const hasBody = method !== "GET" && method !== "HEAD" && req.body;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: hasBody ? req.body : undefined,
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    } as RequestInit);
    const out = new Headers({ "cache-control": "no-store" });
    for (const h of ["content-type", "content-disposition", "retry-after"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(method === "HEAD" ? null : res.body, { status: res.status, headers: out });
  } catch {
    return json(502, "engine_unreachable");
  }
}
