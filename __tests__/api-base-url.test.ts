import { afterEach, describe, expect, it, vi } from "vitest";

// `API` is computed once at module load from `process.env.NEXT_PUBLIC_API_URL`
// (lib/api.ts), so exercising both branches needs a fresh module instance per
// case - vi.resetModules() + a dynamic import, not the static top-of-file
// import every other test file uses.

describe("lib/api.ts base URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to the same-origin proxy when NEXT_PUBLIC_API_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();

    const { API } = await import("@/lib/api");

    expect(API).toBe("/api/engine");
  });

  it("uses NEXT_PUBLIC_API_URL directly when explicitly set - the documented escape hatch", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8050");
    vi.resetModules();

    const { API } = await import("@/lib/api");

    expect(API).toBe("http://127.0.0.1:8050");
  });
});
