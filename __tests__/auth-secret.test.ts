import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "@/lib/server/auth";

describe("resolveAuthSecret (m5)", () => {
  it("uses BETTER_AUTH_SECRET when set", () => expect(resolveAuthSecret({ BETTER_AUTH_SECRET: " s3cret-value " , NODE_ENV: "production" })).toBe("s3cret-value"));
  it("falls back to the insecure dev secret ONLY in development or test", () => {
    expect(resolveAuthSecret({ NODE_ENV: "development" })).toMatch(/dev-only-insecure/);
    expect(resolveAuthSecret({ NODE_ENV: "test" })).toMatch(/dev-only-insecure/);
    for (const NODE_ENV of ["production", undefined, "staging", "prod", ""]) expect(resolveAuthSecret({ NODE_ENV }), String(NODE_ENV)).toBeUndefined();
    expect(resolveAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBeUndefined();
  });
});
