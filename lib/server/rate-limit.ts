// Fixed-window, in-memory request counters for the engine proxy.
//
// SINGLE REPLICA ONLY. The counters live in this process's memory, which is
// correct because kalos-web runs as exactly one replica (docs/AUTH.md:
// SQLite on one volume, in-memory TOTP replay cache). A second replica would
// give every client twice the budget; move this to a shared store before
// scaling out. Restarting the process resets the counters.
//
// Memory is bounded: expired windows are swept when the map grows past
// `maxKeys`, and if every key is still live the oldest are dropped (which
// can only make the limiter more permissive for those keys, never block a
// caller who has not sent requests).

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window that refused the request resets (>= 1). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Count one hit against `key`; `limit` hits per `windowMs` are allowed. */
  hit(key: string, limit: number, windowMs: number, now?: number): RateLimitResult;
  reset(): void;
  size(): number;
}

export function createRateLimiter(maxKeys = 10_000): RateLimiter {
  const windows = new Map<string, { start: number; windowMs: number; count: number }>();

  function sweep(now: number) {
    for (const [k, w] of windows) if (now - w.start >= w.windowMs) windows.delete(k);
    if (windows.size <= maxKeys) return;
    const excess = windows.size - maxKeys;
    let i = 0;
    for (const k of windows.keys()) {
      if (i++ >= excess) break;
      windows.delete(k);
    }
  }

  return {
    hit(key, limit, windowMs, now = Date.now()) {
      let w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        if (!w && windows.size >= maxKeys) sweep(now);
        w = { start: now, windowMs, count: 0 };
        windows.set(key, w);
      }
      if (w.count >= limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) };
      }
      w.count += 1;
      return { ok: true, retryAfterSeconds: 0 };
    },
    reset() {
      windows.clear();
    },
    size() {
      return windows.size;
    },
  };
}
