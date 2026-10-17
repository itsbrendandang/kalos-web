import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const instructions = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("Dockerfile (auth)", () => {
  it("installs with --ignore-scripts", () => expect(instructions).toMatch(/npm ci [^\n]*--ignore-scripts/));
  it("keeps the auth DB on a /data volume owned by uid 10001 (0700)", () => {
    expect(instructions).toContain("AUTH_DB_PATH=/data/auth.db");
    expect(instructions).toMatch(/chown 10001:10001 \/data && chmod 700 \/data/);
    expect(instructions).toContain('VOLUME ["/data"]');
    expect(instructions).toMatch(/adduser[^\n]*--uid 10001/);
  });
  it("fails the build when the musl better-sqlite3 prebuild is not in the standalone trace", () => {
    expect(instructions).toMatch(/prebuilds\/linuxmusl-/);
  });
  it("health-checks the public /api/health endpoint, not the (now redirecting) root", () => {
    expect(instructions).toMatch(/HEALTHCHECK[\s\S]*\/api\/health/);
  });
  it("bakes no auth secrets into the image", () => {
    expect(instructions).not.toMatch(/BETTER_AUTH_SECRET|GOOGLE_CLIENT_SECRET|KALOS_ENGINE_JWT_PRIVATE_KEY_FILE=/);
  });
});
