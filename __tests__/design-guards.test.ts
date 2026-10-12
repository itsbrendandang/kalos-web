import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Owner rule (redesign brief, "Visual system"): no coloured side-stripe
// borders on callouts, verdicts, alerts or cards. Tone is a small status icon
// on a tinted or neutral surface with an even hairline border, or none.
const root = path.resolve(__dirname, "..");

function sources(exts: RegExp): { file: string; text: string }[] {
  return ["app", "components"].flatMap((dir) =>
    readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
      .filter((file) => exts.test(file))
      .map((file) => path.join(dir, file))
      .map((file) => ({ file, text: readFileSync(path.join(root, file), "utf8") })),
  );
}

describe("no side-stripe borders", () => {
  it("no border-l-N / border-r-N (N >= 2) or border-l-[Npx] / border-r-[Npx] utilities", () => {
    const stripe = /\bborder-[lr]-(?:[2-9]\d*|\[\d+(?:\.\d+)?px\])(?![\w-])/;
    const offenders = sources(/\.(tsx?|css)$/)
      .flatMap(({ file, text }) => text.split("\n").map((line, i) => ({ file, line, i })))
      .filter(({ line }) => stripe.test(line))
      .map(({ file, i, line }) => `${file}:${i + 1}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });

  it("no thick border-left / border-right in stylesheets", () => {
    const stripe = /border-(?:left|right)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px/;
    const offenders = sources(/\.css$/).filter(({ text }) => stripe.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("the guard itself catches the patterns it is meant to", () => {
    const stripe = /\bborder-[lr]-(?:[2-9]\d*|\[\d+(?:\.\d+)?px\])(?![\w-])/;
    for (const bad of ["border-l-4", "border-r-2", "border-l-[3px]", "md:border-l-8"]) expect(stripe.test(bad), bad).toBe(true);
    for (const ok of ["border-l", "border-l-0", "border-l-1", "border-l-border", "border-l-transparent", "border-r-[color:red]"]) {
      expect(stripe.test(ok), ok).toBe(false);
    }
  });
});
