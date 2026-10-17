import { describe, expect, it } from "vitest";
import { canonicalOrigin, checkCsrf, expectedOrigin } from "@/lib/server/csrf";

const APP = "https://kalos.example.com";
const h = (o: Record<string, string>) => new Headers(o);
const good = { origin: APP, "sec-fetch-site": "same-origin", "x-kalos-csrf": "1" };

describe("expectedOrigin", () => {
  it("KALOS_PUBLIC_URL wins, BETTER_AUTH_URL is the fallback, both canonicalised", () => {
    expect(expectedOrigin({ KALOS_PUBLIC_URL: "https://kalos.example.com/", BETTER_AUTH_URL: "https://other.example" })).toBe(APP);
    expect(expectedOrigin({ BETTER_AUTH_URL: "https://Kalos.Example.com:443/path" })).toBe(APP);
    expect(expectedOrigin({})).toBeNull();
    expect(canonicalOrigin("javascript:alert(1)")).toBeNull();
    expect(canonicalOrigin("not a url")).toBeNull();
  });
});

describe("checkCsrf (state-changing)", () => {
  it.each(["POST", "PATCH", "DELETE"])("%s with same Origin + Sec-Fetch-Site + marker passes", (m) => {
    expect(checkCsrf(m, h(good), APP)).toEqual({ ok: true });
  });

  it("passes without Sec-Fetch-Site / Referer (older browsers) as long as Origin + marker are right", () => {
    expect(checkCsrf("POST", h({ origin: APP, "x-kalos-csrf": "1" }), APP)).toEqual({ ok: true });
  });

  it.each([
    ["missing Origin", { "sec-fetch-site": "same-origin", "x-kalos-csrf": "1" }, "origin_missing"],
    ["Origin: null", { ...good, origin: "null" }, "origin_mismatch"],
    ["cross-origin", { ...good, origin: "https://evil.example" }, "origin_mismatch"],
    ["sibling subdomain", { ...good, origin: "https://evil.kalos.example.com" }, "origin_mismatch"],
    ["scheme downgrade", { ...good, origin: "http://kalos.example.com" }, "origin_mismatch"],
    ["Sec-Fetch-Site cross-site", { ...good, "sec-fetch-site": "cross-site" }, "cross_site_fetch"],
    ["Sec-Fetch-Site same-site", { ...good, "sec-fetch-site": "same-site" }, "cross_site_fetch"],
    ["Sec-Fetch-Site none", { ...good, "sec-fetch-site": "none" }, "cross_site_fetch"],
    ["foreign Referer", { ...good, referer: "https://evil.example/page" }, "referer_mismatch"],
    ["garbage Referer", { ...good, referer: "::::" }, "referer_mismatch"],
    ["no marker", { origin: APP, "sec-fetch-site": "same-origin" }, "csrf_header_missing"],
    ["wrong marker", { ...good, "x-kalos-csrf": "true" }, "csrf_header_missing"],
  ])("rejects %s", (_n, headers, reason) => {
    expect(checkCsrf("POST", h(headers as Record<string, string>), APP)).toEqual({ ok: false, reason });
  });

  it("refuses everything when no public origin is configured", () => {
    expect(checkCsrf("POST", h(good), null)).toEqual({ ok: false, reason: "origin_not_configured" });
  });
});

describe("checkCsrf (reads)", () => {
  it("allows same-origin, direct navigation and header-less clients", () => {
    expect(checkCsrf("GET", h({}), APP).ok).toBe(true);
    expect(checkCsrf("GET", h({ "sec-fetch-site": "same-origin" }), APP).ok).toBe(true);
    expect(checkCsrf("GET", h({ "sec-fetch-site": "none" }), APP).ok).toBe(true);
    expect(checkCsrf("HEAD", h({ origin: APP }), APP).ok).toBe(true);
  });

  it("refuses positive cross-site signals", () => {
    expect(checkCsrf("GET", h({ "sec-fetch-site": "cross-site" }), APP)).toEqual({ ok: false, reason: "cross_site_fetch" });
    expect(checkCsrf("GET", h({ origin: "https://evil.example" }), APP)).toEqual({ ok: false, reason: "origin_mismatch" });
  });
});
