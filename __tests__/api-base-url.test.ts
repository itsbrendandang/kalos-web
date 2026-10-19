import { afterEach, describe, expect, it, vi } from "vitest";

// `API` is computed once at module load from NODE_ENV + NEXT_PUBLIC_API_URL
// (lib/api.ts), so exercising each branch needs a fresh module instance per
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

  it("dev only: NEXT_PUBLIC_API_URL points straight at a local open-mode engine", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8050");
    vi.resetModules();

    const { API, mutationHeaders } = await import("@/lib/api");

    expect(API).toBe("http://127.0.0.1:8050");
    // no CSRF marker on the direct path (it would force a CORS preflight)
    expect(mutationHeaders()).toEqual({});
  });

  it("production builds ignore NEXT_PUBLIC_API_URL: the browser always goes through the authenticated proxy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://engine.internal:8050");
    vi.resetModules();

    const { API } = await import("@/lib/api");

    expect(API).toBe("/api/engine");
  });

  it("state-changing calls through the proxy carry the CSRF marker", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();

    const { mutationHeaders } = await import("@/lib/api");

    expect(mutationHeaders({ "Content-Type": "application/json" })).toEqual({ "Content-Type": "application/json", "x-kalos-csrf": "1" });
  });
});
