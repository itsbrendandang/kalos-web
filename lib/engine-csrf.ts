// Shared by the browser client (lib/api.ts, lib/scale-readout.ts) and the
// engine proxy route (lib/server/engine-proxy.ts).
//
// Every state-changing request to /api/engine/* must carry this header with
// exactly this value. It is not a secret: its job is that a cross-site page
// cannot send it. A custom request header makes any cross-origin fetch a
// "non-simple" CORS request, which the browser preflights - and the proxy
// never answers a preflight with CORS headers - while plain HTML forms cannot
// set headers at all. It is one of three independent layers (Origin check,
// this header, SameSite=Lax session cookie); see docs/ENGINE_PROXY.md.
export const ENGINE_CSRF_HEADER = "x-kalos-csrf";
export const ENGINE_CSRF_VALUE = "1";
