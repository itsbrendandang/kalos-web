import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal TS/node config for pure-function regression tests - no jsdom, no
// React plugin: nothing under test renders a component, so the plain esbuild
// TSX transform (JSX runtime resolved from the `react` dependency) is enough.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
  },
});
