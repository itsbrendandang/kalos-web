import "server-only";

// Engine forwarder for local (on-device) mode. Same route table, body-type
// and size rules as the hosted proxy, and CSRF against this host, but no
// session, tenant or token: the bundled engine only listens on this machine in
// open mode. The request has already passed proxy.ts (loopback Host + launch secret).
import { proxyBodyCapBytes } from "@/lib/upload-limits";
import { checkCsrf } from "@/lib/server/csrf";
import { countedStream, DEFAULT_MAX_JSON_BYTES, engineTarget, MAX_QUERY_LENGTH, planBody, positiveInt } from "@/lib/server/engine-proxy";
import { isSafeRawPath, matchEngineRoute } from "@/lib/server/engine-routes";
import { hostAllowed } from "@/lib/server/local-guard";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function forwardToLocalEngine(req: Request, segments: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!isSafeRawPath(new URL(req.url).pathname)) return json(404, "not_found");
  const m = matchEngineRoute(method, segments);
  if (m.kind === "not_found") return json(404, "not_found");
  if (m.kind === "method_not_allowed") return new Response(null, { status: 405, headers: { allow: m.allow.join(", ") } });

  const host = req.headers.get("host");
  if (!host || !hostAllowed(host) || !checkCsrf(method, req.headers, `http://${host}`).ok) return json(403, "forbidden");
  const route = m.route;
  if (new URL(req.url).search.length > MAX_QUERY_LENGTH) return json(400, "invalid_query");
  const plan = planBody(route, method, req.headers);
  if ("error" in plan) return plan.error;

  const cap = route.body === "multipart" ? proxyBodyCapBytes(process.env.KALOS_MAX_UPLOAD_MB) : positiveInt(process.env.KALOS_PROXY_MAX_JSON_BYTES, DEFAULT_MAX_JSON_BYTES);
  const tooLarge = () => json(413, "payload_too_large");
  const declared = Number(req.headers.get("content-length"));
  if (plan.forward && Number.isFinite(declared) && declared > cap) return tooLarge();
  let overCap = false;

  const target = engineTarget(process.env.KALOS_ENGINE_URL ?? "http://127.0.0.1:8050");
  if (!target) return json(502, "engine_not_configured");
  const query = new URL(req.url).search;
  const url = `${target.origin}${target.basePath}/${segments.map(encodeURIComponent).join("/")}${query}`;

  const headers = new Headers();
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);
  if (plan.forward && plan.contentType) headers.set("content-type", plan.contentType);
  const hasBody = plan.forward && req.body;
  const body = hasBody ? countedStream(req.body!, cap, () => { overCap = true; }) : undefined;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
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
    if (overCap) return tooLarge();
    return json(502, "engine_unreachable");
  }
}
