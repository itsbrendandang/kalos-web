import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Moved here with the Dockerfile from kalos-engine's tests/test_deploy_config.py.
const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

describe("Dockerfile", () => {
  it("ends as a non-root USER", () => {
    const users = dockerfile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("USER "));
    expect(users.length).toBeGreaterThan(0);
    expect(users.at(-1)).not.toBe("USER root");
  });

  it("declares a HEALTHCHECK", () => {
    expect(dockerfile).toContain("HEALTHCHECK");
  });
});
