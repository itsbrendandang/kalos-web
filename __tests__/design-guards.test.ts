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

// Second redesign pass: the compatibility aliases are gone from app/globals.css,
// and the patterns the old pages leaned on (uppercase labels, arbitrary pixel
// sizes, opacity-dimmed text, alpha-tinted status borders) stay out.
const ALIAS_NAMES = ["card", "muted", "accent-text", "blue", "blue-hover", "blue-deep", "blue-soft", "blue-tint", "blue-border", "blue-hover-bg", "explore", "explore-deep", "explore-soft", "green", "green-soft", "amber", "amber-soft", "red", "grid", "chart-1-ink", "series-1", "series-2", "series-3", "series-4", "series-5", "series-6"];

function offenders(re: RegExp, exts = /\.(tsx?|css)$/, skip: (file: string) => boolean = () => false): string[] {
  return sources(exts)
    .filter(({ file }) => !skip(file))
    .flatMap(({ file, text }) => text.split("\n").map((line, i) => ({ file, line, i })))
    .filter(({ line }) => re.test(line))
    .map(({ file, i, line }) => `${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
}

describe("no compatibility aliases", () => {
  it("app/globals.css defines none of the old token names", () => {
    const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
    for (const name of ALIAS_NAMES) {
      expect(css, `--${name}`).not.toMatch(new RegExp(`^\\s*--${name}:`, "m"));
      expect(css, `--color-${name}`).not.toMatch(new RegExp(`^\\s*--color-${name}:`, "m"));
    }
    expect(css).not.toMatch(/--font-head|^\.tabular\b/m);
  });

  it("no page or component reads an old token name or the .tabular class", () => {
    const utility = new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|divide|from|to)-(?:${ALIAS_NAMES.join("|")})(?![\\w-])`);
    const variable = new RegExp(`var\\(--(?:${ALIAS_NAMES.join("|")}|font-head)\\)`);
    const tabular = /\btabular\b(?!-nums)/;
    const skipComments = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);
    const hits = sources(/\.(tsx?|css)$/)
      .filter(({ file }) => file !== path.join("app", "globals.css"))
      .flatMap(({ file, text }) => text.split("\n").map((line, i) => ({ file, line, i })))
      .filter(({ line }) => !skipComments(line) && (utility.test(line) || variable.test(line) || tabular.test(line)))
      .map(({ file, i, line }) => `${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    expect(hits).toEqual([]);
  });
});

describe("old patterns stay out", () => {
  it("no uppercase labels", () => {
    expect(offenders(/\buppercase\b/, /\.(tsx|css)$/)).toEqual([]);
  });

  it("no arbitrary pixel font sizes (use the type roles)", () => {
    expect(offenders(/\btext-\[\d+(?:\.\d+)?px\]/, /\.tsx$/)).toEqual([]);
  });

  it("no opacity-dimmed text or marks (use text-fg-muted; data-state transitions and hidden inputs are fine)", () => {
    const dim = /(?<![\w:-])opacity-(?:[1-9]\d?)(?![\w-])/;
    const hits = offenders(dim, /\.tsx$/).filter((h) => !/opacity-0\b/.test(h));
    expect(hits).toEqual([]);
  });

  it("no alpha-tinted status borders or fills (bg-black/NN backdrops are fine)", () => {
    const alpha = /\b(?:border|bg|text|fill|stroke)-(?:good|warn|bad|accent|fg|fg-muted|border|border-strong)\/\d+/;
    expect(offenders(alpha, /\.tsx$/)).toEqual([]);
  });
});
