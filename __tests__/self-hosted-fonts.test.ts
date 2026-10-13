import { createHash } from "node:crypto";
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

  // The shipped files must stay byte-identical to vercel/geist-font v1.7.2
  // (renamed only). These are git blob hashes, so `git hash-object` on the
  // upstream files prints the same values - see DESIGN.md "Fonts".
  it.each([
    ["Geist-Variable.woff2", "71dab8bedba3bfef5dccd7875ed05cac44c7345d"],
    ["GeistMono-Variable.woff2", "0e746fc18223dfcb107a85502a0abe1b1a02d51a"],
    ["GEIST-LICENSE.txt", "8d003fec6b8a0f9f866ab1038579b6ea20926ac4"],
  ])("app/fonts/%s matches the upstream blob", (file, blob) => {
    const bytes = readFileSync(path.resolve(__dirname, "../app/fonts", file));
    const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(hash).toBe(blob);
  });
});
