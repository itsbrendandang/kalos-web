/**
 * Local (on-device) mode: the desktop app runs this server on 127.0.0.1 next to
 * a bundled engine for ONE user, so there is no sign-in, organization or token.
 *
 * It is on only when KALOS_LOCAL_MODE=1 AND the server is bound to a loopback
 * address (HOSTNAME), so a mistaken flag on a networked deployment stays off.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLocalMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.KALOS_LOCAL_MODE === "1" && LOOPBACK.has((env.HOSTNAME ?? "").trim().toLowerCase());
}
