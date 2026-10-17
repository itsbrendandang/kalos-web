import "server-only";

// The app's Better Auth instance. Policy lives in lib/server/auth-config.mjs;
// this file only wires the database handle and environment.
import { nextCookies } from "better-auth/next-js";
import { authOptionsFromEnv, makeAuth } from "@/lib/server/auth-config.mjs";
import { authDb, BUILD_PHASE } from "@/lib/server/auth-db";

type Auth = ReturnType<typeof makeAuth>;
const g = globalThis as unknown as { __kalosAuth?: Auth };

function build(): Auth {
  const opts = authOptionsFromEnv(process.env);
  return makeAuth({
    ...opts,
    database: authDb(),
    // Must stay last: applies Set-Cookie from auth.api.* calls made inside
    // server actions (sign-out, revoke) to the action's response.
    extraPlugins: [nextCookies()],
    // Placeholder only while `next build` collects page data (no requests are
    // served then). At runtime instrumentation.ts refuses to boot in
    // production without a real BETTER_AUTH_SECRET.
    secret: opts.secret ?? (BUILD_PHASE || process.env.NODE_ENV !== "production" ? "dev-only-insecure-secret-change-me-0123456789" : undefined),
  });
}

/** Lazily constructed so importing this module never opens the database. */
export function getAuth(): Auth {
  return (g.__kalosAuth ??= build());
}
