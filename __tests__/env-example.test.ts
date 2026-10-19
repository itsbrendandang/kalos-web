import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkEnv, REQUIRED_IN_PRODUCTION } from "@/lib/server/boot-check";

const text = readFileSync(new URL("../env.example", import.meta.url), "utf8");
const assignments = Object.fromEntries(
  text
    .split("\n")
    .map((l) => l.replace(/^#\s*/, "").trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

describe("env.example", () => {
  it("documents every auth variable", () => {
    for (const name of [
      ...REQUIRED_IN_PRODUCTION,
      "AUTH_DB_PATH",
      "KALOS_PUBLIC_URL",
      "KALOS_TENANT_MAP_FILE",
      "AUTH_TRUSTED_PROXIES",
      "AUTH_IP_ADDRESS_HEADERS",
      "AUTH_MIGRATE",
    ]) {
      expect(assignments, name).toHaveProperty(name);
    }
  });

  it("contains no real secrets", () => {
    expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(text).not.toMatch(/GOCSPX-[A-Za-z0-9_-]{10,}/); // Google client secret format
    expect(text).not.toMatch(/\b\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/); // real client id shape
    expect(text).not.toMatch(/ya29\.|AIza[0-9A-Za-z_-]{20,}/);
    for (const [name, value] of Object.entries(assignments)) {
      // long high-entropy literal = probably a pasted secret
      expect(/^[A-Za-z0-9+/=_-]{32,}$/.test(value), `${name} looks like a real secret`).toBe(false);
    }
  });

  it("its placeholder values cannot boot production", () => {
    const { errors } = checkEnv(assignments);
    for (const name of ["BETTER_AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "KALOS_ENGINE_JWT_KID"]) {
      expect(errors.join("\n"), name).toContain(name);
    }
  });
});
