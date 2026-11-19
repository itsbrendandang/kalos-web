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

// Burn-down guards (redesign brief, "Type roles" / "Visual system"): the design
// language forbids arbitrary px type sizes, uppercase labels, rounded-2xl, and
// the sm..xl shadow scale (only --shadow-popover is sanctioned). A large tail of
// pre-existing uses can't be fixed in one pass, so rather than fail on them we
// cap each at today's count: the number may only go DOWN. A new violation pushes
// the count over the ceiling and fails here. Lower the ceiling as uses are
// removed - never raise it. Counts measured 2026-11-06.
function countMatches(re: RegExp): number {
  return sources(/\.(tsx?|css)$/)
    .flatMap(({ text }) => text.split("\n"))
    .reduce((n, line) => n + (line.match(re)?.length ?? 0), 0);
}

describe("design-language burn-down (count may only decrease)", () => {
  const CEILINGS: Array<{ what: string; re: RegExp; ceiling: number }> = [
    { what: "arbitrary px type sizes (text-[Npx])", re: /text-\[[0-9.]+px\]/g, ceiling: 172 },
    { what: "uppercase labels", re: /\buppercase\b/g, ceiling: 19 },
    { what: "rounded-2xl", re: /\brounded-2xl\b/g, ceiling: 0 },
    { what: "shadow-{sm,md,lg,xl} (only --shadow-popover is sanctioned)", re: /\bshadow-(?:sm|md|lg|xl)\b/g, ceiling: 9 },
    // Compatibility aliases (globals.css "COMPATIBILITY ALIASES"): old token
    // names kept only so not-yet-rebuilt pages still resolve. New code uses the
    // canonical tokens (bg-surface not bg-card, text-fg-muted not text-muted,
    // --accent not --blue*, text-heading not font-head). Burn these down; when
    // the count hits 0 the alias block in globals.css can be deleted.
    { what: "compatibility alias reads (bg-card/text-muted/--blue*/font-head/...)", re: /\b(?:bg-card|text-muted|border-input|bg-background|text-foreground|font-head|--blue[a-z-]*|--primary-foreground|--card\b|--muted\b)\b/g, ceiling: 125 },
  ];
  for (const { what, re, ceiling } of CEILINGS) {
    it(`${what}: at most ${ceiling} (lower the ceiling when you remove some; never raise it)`, () => {
      expect(countMatches(new RegExp(re.source, re.flags))).toBeLessThanOrEqual(ceiling);
    });
  }
});

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
