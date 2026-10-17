import "server-only";

// The authenticated engine proxy behind app/api/engine/[...path]/route.ts.
// Design and threat model: docs/ENGINE_PROXY.md.
//
// For EVERY request, in this order (each step fails closed, nothing reaches
// the engine until all of them pass):
//   1. method + exact route table (lib/server/engine-routes.ts): 405 / 404;
//      traversal, encoded slashes/backslashes/NUL/double encoding: 404.
//   2. CSRF / origin (lib/server/csrf.ts) and body content type: 403 / 415.
//   3. Session, resolved server-side from the HttpOnly cookie ONLY
//      (lib/server/session.ts: DB lookup, MFA, member-table authorization):
//      anonymous / invalid / expired / revoked 401, MFA missing 403
//      MFA_REQUIRED, no membership in an org 403.
//   4. Tenant from the operator's map (lib/server/tenants.ts): unmapped 403.
//      Never a default tenant, never anything the client sent.
//   5. Scopes: the role's scopes must cover what the route needs; the token
//      carries only the route's scopes. Archive/unarchive need org:admin and
//      a second factor within 300 s.
//   6. Per-session / per-tenant rate limit (in memory, single replica): 429.
//   7. Body size cap (declared and counted while streaming): 413.
//   8. Mint a 60 s EdDSA engine token (lib/server/engine-token.ts) and
//      forward to KALOS_ENGINE_URL with an allow-listed header set. The
//      response is passed back with an allow-listed header set (never
//      Set-Cookie) and without engine internals.
//
// The browser never sees the engine token, the engine URL or the tenant id.
import { randomUUID } from "node:crypto";
import { apiDecision, type SessionState } from "@/lib/server/session";
import { buildEngineClaims, signEngineClaims, type EngineTokenSigner } from "@/lib/server/engine-token";
import { scopesForClaims, type EngineScope } from "@/lib/server/scopes";
import { TENANT_ID_PATTERN } from "@/lib/server/tenants";
import { isRecentlyAuthenticated } from "@/lib/server/session-context";
import { checkCsrf, expectedOrigin } from "@/lib/server/csrf";
import { isProxyMethod, isSafeRawPath, isStateChanging, matchEngineRoute, PROXY_METHODS, type EngineRoute } from "@/lib/server/engine-routes";
import { createRateLimiter, type RateLimiter } from "@/lib/server/rate-limit";
import { MULTIPART_HEADROOM_BYTES, proxyBodyCapBytes } from "@/lib/upload-limits";

/** Engine token lifetime for proxied requests (the engine's default max is 120 s). */
export const PROXY_TOKEN_TTL_SECONDS = 60;
/** Default JSON body cap; matches the engine's KALOS_MAX_REQUEST_BYTES default (1 MiB). */
export const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;
export const DEFAULT_ENGINE_TIMEOUT_MS = 120_000;
export const DEFAULT_RATE_LIMITS = Object.freeze({ sessionPerMinute: 120, writesPerMinute: 30, tenantPerMinute: 600 });
const MAX_QUERY_LENGTH = 2048;
/** The tenant the engine reserves for anonymous open mode; never minted. */
const RESERVED_TENANT = "default";

export interface EngineProxyDeps {
  resolveSession(headers: Headers): Promise<SessionState>;
  resolveTenant(orgId: string): Promise<string | null>;
  loadSigner(): Promise<EngineTokenSigner>;
  /** Looked up per request so tests can stub the global. */
  fetch(): typeof fetch;
  env(): Readonly<Record<string, string | undefined>>;
  rateLimiter: RateLimiter;
  log(line: string): void;
  now?(): number;
}

type Env = Readonly<Record<string, string | undefined>>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** KALOS_ENGINE_URL as { origin, basePath }, or null when unset / not a plain http(s) URL. */
export function engineTarget(raw: string | undefined): { origin: string; basePath: string } | null {
  if (!raw?.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || u.search || u.hash) return null;
  return { origin: u.origin, basePath: u.pathname.replace(/\/+$/, "") };
}

// --- response helpers ------------------------------------------------------

/** Headers on every proxy response (errors included). */
export const PROXY_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-resource-policy": "same-origin",
  // A proxied response is data, never a document: if one is ever opened
  // directly (the scale readout is HTML), it runs no script and loads nothing.
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
});

/** Engine response headers that are passed back. Everything else (Set-Cookie, Server, framing, ...) is dropped. */
const RESPONSE_HEADER_ALLOWLIST = ["content-type", "retry-after", "content-disposition"] as const;

function withSecurityHeaders(headers: Headers, rid: string): Headers {
  for (const [k, v] of Object.entries(PROXY_SECURITY_HEADERS)) headers.set(k, v);
  headers.set("x-request-id", rid);
  return headers;
}

function jsonError(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });
}

// --- body handling ---------------------------------------------------------

function mediaType(contentType: string | null): string | null {
  if (!contentType) return null;
  return contentType.split(";")[0].trim().toLowerCase();
}

type BodyPlan = { forward: boolean; contentType: string | null } | { error: Response };

/** Decide what (if anything) of the request body is forwarded, by route body kind and content type. */
function planBody(route: EngineRoute, method: string, headers: Headers): BodyPlan {
  if (!isStateChanging(method) || route.body === "none") return { forward: false, contentType: null };
  const ct = headers.get("content-type");
  const mt = mediaType(ct);
  if (ct && ct.length > 512) return { error: jsonError(415, { error: "unsupported_media_type" }) };
  if (route.body === "multipart") {
    if (mt !== "multipart/form-data" || !/;\s*boundary=/i.test(ct ?? "")) {
      return { error: jsonError(415, { error: "unsupported_media_type", expected: "multipart/form-data" }) };
    }
    return { forward: true, contentType: ct };
  }
  // json: application/json, or no content type and then no body at all.
  if (mt === null) return { forward: false, contentType: null };
  if (mt !== "application/json") return { error: jsonError(415, { error: "unsupported_media_type", expected: "application/json" }) };
  return { forward: true, contentType: ct };
}

class BodyTooLarge extends Error {}

function countedStream(body: ReadableStream<Uint8Array>, cap: number, onOver: () => void): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        seen += chunk.byteLength;
        if (seen > cap) {
          onOver();
          ctl.error(new BodyTooLarge("body too large"));
          return;
        }
        ctl.enqueue(chunk);
      },
    }),
  );
}

async function readCapped(body: ReadableStream<Uint8Array> | null, cap: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      void reader.cancel();
      throw new BodyTooLarge("body too large");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

/** True when a PATCH /api/campaigns/{id} body archives or unarchives (engine rule: `archived` present and not null). */
export function isArchiveRequest(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return false;
  return Object.prototype.hasOwnProperty.call(doc, "archived") && (doc as { archived: unknown }).archived !== null;
}

// --- the handler -----------------------------------------------------------

export interface AuditRecord {
  rid: string;
  method: string;
  route: string;
  status: number;
  outcome: string;
  tenant: string | null;
  uid: string | null;
  sid: string | null;
  jti: string | null;
  ms: number;
}

export function createEngineProxy(deps: EngineProxyDeps) {
  const now = () => (deps.now ? deps.now() : Date.now());

  return async function handle(req: Request, segments: readonly string[]): Promise<Response> {
    const started = now();
    const rid = randomUUID();
    const method = req.method.toUpperCase();
    const env: Env = deps.env();
    const audit: Omit<AuditRecord, "status" | "outcome" | "ms"> = {
      rid,
      method,
      route: "-",
      tenant: null,
      uid: null,
      sid: null,
      jti: null,
    };

    const finish = (res: Response, outcome: string): Response => {
      // Audit line: identifiers only - no body, query, headers, email or IP.
      const rec: AuditRecord = { ...audit, status: res.status, outcome, ms: now() - started };
      try {
        deps.log(`[kalos-audit] ${JSON.stringify({ evt: "engine_proxy", ...rec })}`);
      } catch {
        // logging must never fail the request
      }
      const headers = withSecurityHeaders(new Headers(res.headers), rid);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    };
    const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
      finish(jsonError(status, { error, ...extra }, headers), error);

    // 1. Method and route.
    if (!isProxyMethod(method)) return fail(405, "method_not_allowed", {}, { allow: PROXY_METHODS.join(", ") });
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return fail(400, "bad_request");
    }
    if (!isSafeRawPath(url.pathname)) return fail(404, "no_such_engine_route", { message: "no such engine route" });
    const match = matchEngineRoute(method, segments);
    if (match.kind === "not_found") return fail(404, "no_such_engine_route", { message: "no such engine route" });
    if (match.kind === "method_not_allowed") return fail(405, "method_not_allowed", {}, { allow: match.allow.join(", ") });
    const route = match.route;
    audit.route = match.template;

    // Query string: re-serialised (never forwarded raw), bounded, no control characters.
    if (url.search.length > MAX_QUERY_LENGTH) return fail(400, "invalid_query");
    const params = new URLSearchParams(url.search);
    for (const [k, v] of params) if (/[\u0000-\u001f\u007f]/.test(k + v)) return fail(400, "invalid_query");
    const query = params.toString();

    // 2. CSRF / origin, then body content type.
    const expected = expectedOrigin(env) ?? (env.NODE_ENV !== "production" ? url.origin : null);
    const csrf = checkCsrf(method, req.headers, expected);
    if (!csrf.ok) {
      if (csrf.reason === "origin_not_configured") return fail(500, "origin_not_configured");
      return finish(jsonError(403, { error: "csrf_rejected", reason: csrf.reason }), `csrf_${csrf.reason}`);
    }
    const plan = planBody(route, method, req.headers);
    if ("error" in plan) return finish(plan.error, "unsupported_media_type");

    // 3. Session: only the cookie header is handed to the auth layer, so no
    //    client Authorization / X-* header can influence who the caller is.
    const sessionHeaders = new Headers();
    const cookie = req.headers.get("cookie");
    if (cookie) sessionHeaders.set("cookie", cookie);
    let state: SessionState;
    try {
      state = await deps.resolveSession(sessionHeaders);
    } catch {
      state = { status: "anonymous" };
    }
    const decision = apiDecision(state);
    if (!decision.ok) {
      if (decision.error === "mfa_required") return fail(403, "mfa_required", { code: "MFA_REQUIRED" });
      return fail(decision.status, decision.error);
    }
    const ctx = decision.context;
    audit.uid = ctx.userId;
    audit.sid = ctx.sessionId;

    // 4. Tenant (server-side map only).
    let tenant: string | null = null;
    try {
      tenant = await deps.resolveTenant(ctx.orgId);
    } catch {
      tenant = null;
    }
    if (!tenant || tenant === RESERVED_TENANT || !TENANT_ID_PATTERN.test(tenant)) return fail(403, "organization_not_provisioned");
    audit.tenant = tenant;

    // 5. Scopes from the member-table role.
    const granted = scopesForClaims(ctx);
    if (!route.scopes.every((s) => granted.includes(s))) return fail(403, "insufficient_scope");

    // 6. Rate limits (single replica, in memory).
    const minute = 60_000;
    const limits = {
      session: positiveInt(env.KALOS_PROXY_RATE_LIMIT_SESSION, DEFAULT_RATE_LIMITS.sessionPerMinute),
      writes: positiveInt(env.KALOS_PROXY_RATE_LIMIT_WRITES, DEFAULT_RATE_LIMITS.writesPerMinute),
      tenant: positiveInt(env.KALOS_PROXY_RATE_LIMIT_TENANT, DEFAULT_RATE_LIMITS.tenantPerMinute),
    };
    const t = now();
    const buckets: [string, number][] = [[`s:${ctx.sessionId}`, limits.session]];
    if (isStateChanging(method)) buckets.push([`w:${ctx.sessionId}`, limits.writes]);
    buckets.push([`t:${tenant}`, limits.tenant]);
    for (const [key, limit] of buckets) {
      const r = deps.rateLimiter.hit(key, limit, minute, t);
      if (!r.ok) return fail(429, "rate_limited", {}, { "retry-after": String(r.retryAfterSeconds) });
    }

    // 7. Body (size cap; archive detection needs the parsed PATCH body).
    const cap = route.body === "multipart" ? proxyBodyCapBytes(env.KALOS_MAX_UPLOAD_MB) : positiveInt(env.KALOS_PROXY_MAX_JSON_BYTES, DEFAULT_MAX_JSON_BYTES);
    const tooLarge = () =>
      fail(413, "payload_too_large", {
        limit_mb: route.body === "multipart" ? Math.floor((cap - MULTIPART_HEADROOM_BYTES) / 1024 / 1024) : Math.max(1, Math.floor(cap / 1024 / 1024)),
      });
    const declared = Number(req.headers.get("content-length"));
    if (plan.forward && Number.isFinite(declared) && declared > cap) return tooLarge();

    let scopes: EngineScope[] = [...route.scopes];
    let body: ReadableStream<Uint8Array> | Uint8Array | undefined;
    let overCap = false;
    if (plan.forward && route.admin === "archived-field") {
      let bytes: Uint8Array;
      try {
        bytes = await readCapped(req.body, cap);
      } catch (err) {
        if (err instanceof BodyTooLarge) return tooLarge();
        return fail(400, "bad_request");
      }
      let doc: unknown;
      try {
        doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        return fail(400, "invalid_json");
      }
      if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return fail(400, "invalid_json");
      if (isArchiveRequest(doc)) {
        if (!granted.includes("org:admin")) return fail(403, "insufficient_scope", { required: "org:admin" });
        if (!isRecentlyAuthenticated(ctx, undefined, Math.floor(now() / 1000))) return fail(403, "step_up_required", { code: "STEP_UP_REQUIRED" });
        scopes = [...scopes, "org:admin"];
      }
      body = bytes;
    } else if (plan.forward && req.body) {
      body = countedStream(req.body, cap, () => {
        overCap = true;
      });
    }

    // 8. Engine target, token, forward.
    const target = engineTarget(env.KALOS_ENGINE_URL);
    if (!target) return fail(502, "engine_not_configured");
    const engineUrl = `${target.origin}${target.basePath}/${segments.map(encodeURIComponent).join("/")}${query ? `?${query}` : ""}`;
    if (new URL(engineUrl).origin !== target.origin) return fail(502, "engine_not_configured");

    let token: string;
    try {
      const claims = buildEngineClaims({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        tenant,
        scopes,
        ttlSeconds: PROXY_TOKEN_TTL_SECONDS,
        now: Math.floor(now() / 1000),
      });
      audit.jti = claims.jti;
      token = await signEngineClaims(claims, await deps.loadSigner());
    } catch {
      // Key file missing/unreadable or an id the engine would refuse; no detail to the client.
      return fail(503, "engine_credentials_unavailable");
    }

    const out = new Headers();
    out.set("authorization", `Bearer ${token}`);
    out.set("x-request-id", rid);
    const accept = req.headers.get("accept");
    if (accept && accept.length <= 256 && /^[\w!#$%&'*+.^`|~ ,;=/-]+$/.test(accept)) out.set("accept", accept);
    if (body !== undefined && plan.forward && plan.contentType) out.set("content-type", plan.contentType);

    const timeoutMs = positiveInt(env.KALOS_ENGINE_TIMEOUT_MS, DEFAULT_ENGINE_TIMEOUT_MS);
    const timeout = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeout.abort();
    }, timeoutMs);
    const signal = AbortSignal.any([timeout.signal, req.signal]);

    let engineRes: Response;
    try {
      engineRes = await deps.fetch()(engineUrl, {
        method,
        headers: out,
        body,
        // Required by undici for a streamed body.
        duplex: body instanceof ReadableStream ? "half" : undefined,
        signal,
        // Never follow an engine redirect anywhere.
        redirect: "manual",
        cache: "no-store",
      } as RequestInit);
    } catch {
      clearTimeout(timer);
      if (overCap) return tooLarge();
      if (timedOut) return fail(504, "engine_timeout");
      if (req.signal.aborted) return fail(499, "client_closed_request");
      return fail(502, "engine_unreachable");
    }

    // Response: status passes through for the documented engine outcomes
    // (2xx, 4xx error envelopes such as constant_target or upload errors,
    // 503 busy with Retry-After); engine auth failures, redirects and other
    // 5xx are replaced by a generic body so no engine internals leak.
    const status = engineRes.status;
    const drop = (s: number, error: string) => {
      clearTimeout(timer);
      void engineRes.body?.cancel().catch(() => {});
      return fail(s, error, {}, {});
    };
    if (status === 401) return drop(502, "engine_auth_failed");
    if (status >= 300 && status < 400) return drop(502, "engine_error");
    if (status >= 500 && status !== 503) return drop(502, "engine_error");
    if (status === 503 && mediaType(engineRes.headers.get("content-type")) !== "application/json") {
      const ra = engineRes.headers.get("retry-after");
      const res = drop(503, "engine_busy");
      if (ra && /^\d{1,6}$/.test(ra)) res.headers.set("retry-after", ra);
      return res;
    }

    const headers = new Headers();
    for (const h of RESPONSE_HEADER_ALLOWLIST) {
      const v = engineRes.headers.get(h);
      if (v !== null) headers.set(h, v);
    }
    let resBody: ReadableStream<Uint8Array> | null = null;
    if (method !== "HEAD" && engineRes.body) {
      const reader = engineRes.body.getReader();
      resBody = new ReadableStream<Uint8Array>({
        async pull(ctl) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              clearTimeout(timer);
              ctl.close();
            } else ctl.enqueue(value);
          } catch (err) {
            clearTimeout(timer);
            ctl.error(err);
          }
        },
        cancel(reason) {
          // Client went away mid-response: stop the upstream read too.
          clearTimeout(timer);
          timeout.abort();
          return reader.cancel(reason);
        },
      });
    } else {
      clearTimeout(timer);
      void engineRes.body?.cancel().catch(() => {});
    }
    return finish(new Response(resBody, { status, headers }), status < 400 ? "ok" : `engine_${status}`);
  };
}

// --- default wiring --------------------------------------------------------

/** Process-wide limiter (single replica). Exported so tests can reset it. */
export const defaultRateLimiter = createRateLimiter();
