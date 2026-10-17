import "server-only";

// The app's Better Auth instance. Policy lives in lib/server/auth-config.mjs;
// this file only wires the database handle and environment.
import { nextCookies } from "better-auth/next-js";
import { authOptionsFromEnv, makeAuth } from "@/lib/server/auth-config.mjs";
import { authDb } from "@/lib/server/auth-db";
import { DEV_ONLY_INSECURE_SECRET, devFallbackAllowed } from "@/lib/server/secret-policy.mjs";

type Auth = ReturnType<typeof makeAuth>;
const g = globalThis as unknown as { __kalosAuth?: Auth };

/**
 * BETTER_AUTH_SECRET, or the fixed insecure development secret ONLY when
 * devFallbackAllowed(env): NODE_ENV development/test AND BETTER_AUTH_URL
 * loopback (or unset in test). Anything else gets no fallback: Better Auth then
 * refuses to start, and the boot check has already exited 1.
 */
export function resolveAuthSecret(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const s = env.BETTER_AUTH_SECRET?.trim();
  if (s) return s;
  return devFallbackAllowed(env) ? DEV_ONLY_INSECURE_SECRET : undefined;
}

function build(): Auth {
  const opts = authOptionsFromEnv(process.env);
  const secret = resolveAuthSecret(process.env);
  if (!secret) {
    // Never let Better Auth fall back to its public default secret (B-4).
    throw new Error("BETTER_AUTH_SECRET is not set (no fallback outside NODE_ENV development/test)");
  }
  return makeAuth({
    ...opts,
    database: authDb(),
    // Must stay last: applies Set-Cookie from auth.api.* calls made inside
    // server actions (sign-out, revoke) to the action's response.
    extraPlugins: [nextCookies()],
    secret,
  });
}

/** Lazily constructed so importing this module never opens the database. */
export function getAuth(): Auth {
  return (g.__kalosAuth ??= build());
}
