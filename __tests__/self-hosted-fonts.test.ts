import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: `next/font/google` downloads its font files from
// fonts.gstatic.com during `next build`, so one flaky fetch fails the whole
// build (CI run 37693455188 on PR #40 did exactly that). Every typeface is
// self-hosted under app/fonts/ via `next/font/local` instead.
describe("self-hosted fonts", () => {
  it("no source file loads a font through next/font/google", () => {
    const root = path.resolve(__dirname, "..");
    const offenders = ["app", "components", "lib"].flatMap((dir) =>
      readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
        .filter((file) => /\.tsx?$/.test(file))
        .map((file) => path.join(dir, file))
        .filter((file) => readFileSync(path.join(root, file), "utf8").includes("next/font/google")),
    );
    expect(offenders).toEqual([]);
  });
});
