// Request guard for local (on-device) mode. Pure so it is unit tested
// (__tests__/local-guard.test.ts).
//
// Why: in local mode there is no sign-in, so anything that can reach the port
// would otherwise be trusted. Two defences:
//  1. Host must be a loopback name (and our own port when PORT is set). A
//     DNS-rebinding page reaches 127.0.0.1 under ITS OWN hostname, so its Host
//     header is wrong. The same check refuses a tunnel or reverse proxy that
//     forwards a public hostname.
//  2. The per-launch secret (KALOS_LOCAL_TOKEN) must be present, as a cookie
//     the app sets after being opened once with ?k=<token>.
export const LOCAL_COOKIE = "kalos_local";
export const LOCAL_QUERY = "k";

const HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function hostAllowed(hostHeader: string | null, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (!hostHeader || hostHeader.length > 100) return false;
  const m = hostHeader.trim().toLowerCase().match(/^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!m || !HOSTS.has(m[1])) return false;
  const want = (env.PORT ?? "").trim();
  return !want || m[2] === want;
}

/** Same origin as this (already host-checked) request, parsed safely: `Origin: null` or junk is refused, not a crash. */
export function originAllowed(origin: string | null, hostHeader: string | null): boolean {
  if (origin === null) return true; // non-browser callers send none; the token cookie still gates them
  try {
    return new URL(origin).host.toLowerCase() === (hostHeader ?? "").trim().toLowerCase();
  } catch {
    return false;
  }
}

/** Constant-time string compare. */
export function tokenEquals(a: string | null | undefined, b: string): boolean {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type GateDecision = { action: "next" } | { action: "set-cookie-redirect" } | { action: "deny"; status: 403 | 421 };

export function localGate(input: { host: string | null; cookie: string | null; query: string | null; token: string; env?: Readonly<Record<string, string | undefined>> }): GateDecision {
  if (!hostAllowed(input.host, input.env)) return { action: "deny", status: 421 };
  if (tokenEquals(input.cookie, input.token)) return { action: "next" };
  if (tokenEquals(input.query, input.token)) return { action: "set-cookie-redirect" };
  return { action: "deny", status: 403 };
}

/** Read a request body as text, refusing more than `cap` bytes. Null when over the cap or unreadable. */
export async function readTextCapped(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      void reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.byteLength; }
  return new TextDecoder().decode(buf);
}
