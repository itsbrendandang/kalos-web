import "server-only";

// The app's Better Auth instance. Policy lives in lib/server/auth-config.mjs;
// this file only wires the database handle and environment.
import { nextCookies } from "better-auth/next-js";
import { authOptionsFromEnv, makeAuth } from "@/lib/server/auth-config.mjs";
import { authDb } from "@/lib/server/auth-db";

type Auth = ReturnType<typeof makeAuth>;
const g = globalThis as unknown as { __kalosAuth?: Auth };

const DEV_ONLY_SECRET = "dev-only-insecure-secret-change-me-0123456789";

/**
 * BETTER_AUTH_SECRET, or a fixed insecure placeholder ONLY when NODE_ENV is
 * "development" or "test". Anything else (production, unset, typos) gets no
 * fallback: Better Auth then refuses to start, and the production boot check
 * has already exited 1.
 */
export function resolveAuthSecret(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const s = env.BETTER_AUTH_SECRET?.trim();
  if (s) return s;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? DEV_ONLY_SECRET : undefined;
}

function build(): Auth {
  const opts = authOptionsFromEnv(process.env);
  return makeAuth({
    ...opts,
    database: authDb(),
    // Must stay last: applies Set-Cookie from auth.api.* calls made inside
    // server actions (sign-out, revoke) to the action's response.
    extraPlugins: [nextCookies()],
    secret: resolveAuthSecret(process.env),
  });
}

/** Lazily constructed so importing this module never opens the database. */
export function getAuth(): Auth {
  return (g.__kalosAuth ??= build());
}
