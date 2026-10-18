import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  const prod = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));

  it("sets the baseline headers", () => {
    expect(prod["X-Frame-Options"]).toBe("DENY");
    expect(prod["X-Content-Type-Options"]).toBe("nosniff");
    expect(prod["Referrer-Policy"]).toBeTruthy();
    expect(prod["Permissions-Policy"]).toContain("camera=()");
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });

  it("CSP forbids framing/objects and never mixes a hash/nonce with unsafe-inline", () => {
    const csp = buildCsp(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // A hash/nonce makes browsers ignore 'unsafe-inline' and blocks Next's inline flight scripts.
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'/);
    expect(csp).not.toMatch(/sha256-|nonce-/);
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp(true)).toContain("'unsafe-eval'");
  });

  it("next.config wires headers()", () => {
    expect(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8")).toContain("securityHeaders(");
  });
});
