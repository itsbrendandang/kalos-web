// (B-2) Client-IP trust and rate limiting. Without a trusted reverse proxy a
// client must NOT be able to pick its own rate-limit bucket by rotating
// X-Forwarded-For. Child processes run with NODE_ENV=production because
// Better Auth treats test/development as "localhost" for every request.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freshAuth, tempDir } from "./helpers.mjs";
import { ipAddressOptions } from "@/lib/server/auth-config.mjs";

const worker = (args: string[], extraEnv: Record<string, string | undefined>) => {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", ...extraEnv };
  delete childEnv.TEST;
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  return execFileSync(process.execPath, args, { env: childEnv, stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim()
    .split("\n")
    .pop()!;
};

describe("B-2: rotating X-Forwarded-For must not evade the rate limit", () => {
  const rotate = (env: Record<string, string | undefined>) => {
    const dir = tempDir("kalos-xff-");
    try {
      const out = JSON.parse(worker([path.join(__dirname, "_xff-worker.mjs"), path.join(dir, "rl.db"), "10"], env));
      return out as number[];
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("no AUTH_TRUSTED_PROXIES: 10 rotated addresses share the 3-request limit", () => {
    const statuses = rotate({ AUTH_TRUSTED_PROXIES: undefined });
    expect(statuses.filter((s) => s === 429).length, JSON.stringify(statuses)).toBe(7);
  });

  it("AUTH_TRUSTED_PROXIES=none (with the override): still no per-header bucket", () => {
    const statuses = rotate({ AUTH_TRUSTED_PROXIES: "none", AUTH_ACCEPT_NO_PROXY: "1" });
    expect(statuses.filter((s) => s === 429).length, JSON.stringify(statuses)).toBe(7);
  });

  it("the ipAddress config for 'no proxy' ignores headers and uses ipv6Subnet 64", async () => {
    const { auth, cleanup } = await freshAuth({ rateLimit: undefined });
    try {
      expect(ipAddressOptions({ trustedProxies: [] })).toEqual({ ipAddressHeaders: [], ipv6Subnet: 64 });
      expect(auth.options.advanced.ipAddress.ipAddressHeaders).toEqual([]);
      expect(auth.options.advanced.ipAddress.trustedProxies).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("with a trusted proxy the forwarded client is used, and IPv6 is bucketed per /64", () => {
    const r = JSON.parse(worker([path.join(__dirname, "_ip-worker.mjs")], { AUTH_TRUSTED_PROXIES: undefined }));
    expect(r.single).toBeNull(); // spoofable single header: ignored
    expect(r.singleNone).toBeNull();
    expect(r.realIpNoProxy).toBeNull();
    expect(r.v6a).toBe(r.v6b);
    expect(r.v6a).toMatch(/^2001:0db8:0000:0001:/);
  });
});

describe("AUTH_TRUSTED_PROXIES=none needs the explicit override in production (boot check)", () => {
  it("is refused without AUTH_ACCEPT_NO_PROXY, accepted with it", async () => {
    const { checkEnv } = await import("@/lib/server/boot-check");
    const base = { BETTER_AUTH_SECRET: "q7Zr1x9P0aVt3mKc8sLw2YbN5eHj6uFd4gTo", BETTER_AUTH_URL: "https://kalos.example.com", GOOGLE_CLIENT_ID: "123456-abc.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only-google-secret", KALOS_ENGINE_JWT_PRIVATE_KEY_FILE: "/x", KALOS_ENGINE_JWT_KID: "web-prod-1" };
    expect(checkEnv({ ...base, AUTH_TRUSTED_PROXIES: "none" }).errors.join()).toMatch(/AUTH_TRUSTED_PROXIES=none is refused/);
    expect(checkEnv({ ...base, AUTH_TRUSTED_PROXIES: "none", AUTH_ACCEPT_NO_PROXY: "yes please" }).errors.length).toBe(1);
    const ok = checkEnv({ ...base, AUTH_TRUSTED_PROXIES: "none", AUTH_ACCEPT_NO_PROXY: "1" });
    expect(ok.errors).toEqual([]);
    expect(ok.warnings.join()).toMatch(/AUTH_ACCEPT_NO_PROXY=1/);
  });
});
