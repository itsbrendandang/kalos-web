import { defineConfig } from "vitest/config";
import path from "node:path";

// `npm run test:auth-integration`: real Better Auth (1.7.10) against a temp
// SQLite file with an in-process fake Google (no network, no ports). Kept out
// of the default `npm test` because it is slower (key generation, migrations,
// child processes for the shared rate-limit check). Re-run on EVERY
// better-auth upgrade (docs/AUTH.md "Upgrade checklist").
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/auth-integration/**/*.int.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
