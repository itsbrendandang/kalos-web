/**
 * Local (on-device) mode: the desktop app runs this server on 127.0.0.1 next to
 * a bundled engine for ONE user, so there is no sign-in, organization or token.
 *
 * It is on only when ALL of these hold, so a mistaken flag on a networked
 * deployment stays off:
 *  - KALOS_LOCAL_MODE=1
 *  - the server is bound to a loopback address (HOSTNAME)
 *  - KALOS_LOCAL_TOKEN is set to a secret of at least 16 characters. The desktop
 *    shell makes a fresh one each launch and every request must carry it
 *    (lib/server/local-guard.ts), so another page or local forwarder cannot
 *    reach the app just by finding the port.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
export const MIN_LOCAL_TOKEN = 16;

export function localToken(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const t = (env.KALOS_LOCAL_TOKEN ?? "").trim();
  return t.length >= MIN_LOCAL_TOKEN ? t : null;
}

export function isLocalMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.KALOS_LOCAL_MODE === "1" && LOOPBACK.has((env.HOSTNAME ?? "").trim().toLowerCase()) && localToken(env) !== null;
}
