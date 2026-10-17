import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";

describe("createRateLimiter (in-memory, single replica)", () => {
  it("allows `limit` hits per window, then refuses with Retry-After until the window resets", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 3; i++) expect(rl.hit("k", 3, 60_000, 1_000).ok).toBe(true);
    expect(rl.hit("k", 3, 60_000, 31_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(rl.hit("k", 3, 60_000, 61_000).ok).toBe(true);
  });

  it("keys are independent", () => {
    const rl = createRateLimiter();
    expect(rl.hit("a", 1, 60_000, 0).ok).toBe(true);
    expect(rl.hit("a", 1, 60_000, 0).ok).toBe(false);
    expect(rl.hit("b", 1, 60_000, 0).ok).toBe(true);
  });

  it("memory stays bounded", () => {
    const rl = createRateLimiter(100);
    for (let i = 0; i < 1_000; i++) rl.hit(`k${i}`, 5, 60_000, i);
    expect(rl.size()).toBeLessThanOrEqual(101);
    rl.reset();
    expect(rl.size()).toBe(0);
  });
});
