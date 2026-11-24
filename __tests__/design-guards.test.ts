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
// removed - never raise it. Counts measured 2026-11-06; lowered 2026-11-18 by
// the engine-aligned redesign (docs/REDESIGN.md), which rebuilt or deleted
// every page that carried them: px 172 -> 0, uppercase 19 -> 0, aliases
// 125 -> 0 (the alias block in globals.css is gone). The 9 remaining shadow
// matches are globals.css's own `--shadow-sm: none` style zeroing lines.
function countMatches(re: RegExp): number {
  return sources(/\.(tsx?|css)$/)
    .flatMap(({ text }) => text.split("\n"))
    .reduce((n, line) => n + (line.match(re)?.length ?? 0), 0);
}

describe("design-language burn-down (count may only decrease)", () => {
  const CEILINGS: Array<{ what: string; re: RegExp; ceiling: number }> = [
    { what: "arbitrary px type sizes (text-[Npx])", re: /text-\[[0-9.]+px\]/g, ceiling: 0 },
    { what: "uppercase labels", re: /\buppercase\b/g, ceiling: 0 },
    // Raised 0 -> 1 on purpose (2026-11, demo-influenced look): DESIGN.md
    // "Layout" > Radius allows rounded-2xl for a card on the canvas only. The one
    // sanctioned use is CANVAS_CARD in components/ui/card.tsx, which every such
    // card reuses; a second spelling is a new recipe and fails here. The pairing
    // test below keeps rounded-2xl and shadow-card on the same line.
    { what: "rounded-2xl (CANVAS_CARD only, DESIGN.md Radius)", re: /\brounded-2xl\b/g, ceiling: 1 },
    { what: "shadow-{sm,md,lg,xl} (only --shadow-popover is sanctioned)", re: /\bshadow-(?:sm|md|lg|xl)\b/g, ceiling: 9 },
    // Compatibility aliases (globals.css "COMPATIBILITY ALIASES"): old token
    // names kept only so not-yet-rebuilt pages still resolve. New code uses the
    // canonical tokens (bg-surface not bg-card, text-fg-muted not text-muted,
    // --accent not --blue*, text-heading not font-head). Burn these down; when
    // the count hits 0 the alias block in globals.css can be deleted.
    // (?<![\w-]) so the real `--border-input` token (`border-border-input`) is not counted as the old `border-input` alias.
    { what: "compatibility alias reads (bg-card/text-muted/--blue*/font-head/...)", re: /(?<![\w-])(?:bg-card|text-muted|border-input|bg-background|text-foreground|font-head|--blue[a-z-]*|--primary-foreground|--card\b|--muted\b)\b/g, ceiling: 0 },
  ];
  for (const { what, re, ceiling } of CEILINGS) {
    it(`${what}: at most ${ceiling} (lower the ceiling when you remove some; never raise it)`, () => {
      expect(countMatches(new RegExp(re.source, re.flags))).toBeLessThanOrEqual(ceiling);
    });
  }
});

// DESIGN.md "Layout" > Radius / Elevation: rounded-2xl and shadow-card are one
// recipe, the card on the canvas. Neither appears without the other.
describe("cards on the canvas", () => {
  const lines = sources(/\.tsx?$/).flatMap(({ file, text }) => text.split("\n").map((line, i) => ({ file, line, i })));
  it("every rounded-2xl sits with shadow-card, and every shadow-card with rounded-2xl", () => {
    const offenders = lines
      .filter(({ line }) => /\brounded-2xl\b/.test(line) !== /\bshadow-card\b/.test(line))
      .map(({ file, i, line }) => `${file}:${i + 1}: ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
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

// Numbers and charts (VIZ_SPEC section 4 "Design guards" and section 8).
// Every number goes through lib/num.ts (precision from the engine's
// uncertainty, U+2212 minus, designed n/a states), charts are visx SVG with
// CSS-variable colors, and a coverage percentage is never typed by hand: it
// comes from an engine field (conformal_coverage, a ci95 field) so it can
// never silently disagree with what the engine computed.
describe("numbers and charts (VIZ_SPEC)", () => {
  const code = sources(/\.(tsx?)$/);
  const offenders = (re: RegExp, files = code) =>
    files.flatMap(({ file, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ file, line, i }))
        .filter(({ line }) => re.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        .map(({ file, i, line }) => `${file}:${i + 1}: ${line.trim()}`),
    );

  it("no recharts, Tremor chart copies or the old lazy chart loader", () => {
    expect(offenders(/from\s+["'](recharts|@\/components\/tremor\/[^"']+|@\/components\/kit\/lazy-chart)["']/)).toEqual([]);
  });

  it("no toFixed / toLocaleString in components or pages (format through lib/num.ts)", () => {
    expect(offenders(/\.(toFixed|toLocaleString)\(/)).toEqual([]);
  });

  it("no lib/format.ts (retired for lib/num.ts)", () => {
    expect(offenders(/from\s+["']@\/lib\/format["']/)).toEqual([]);
  });

  it("no hex colors in chart components (CSS variables only, so dark mode needs no re-render)", () => {
    const viz = code.filter(({ file }) => file.startsWith(path.join("components", "viz")));
    expect(offenders(/#[0-9a-fA-F]{3,8}\b(?![\w-]*\))/, viz).filter((l) => !/href=|url\(#|id=|`#/.test(l))).toEqual([]);
  });

  it("no hand-typed 90% / 95% coverage in components or pages (take it from the engine field)", () => {
    expect(offenders(/["'`>][^"'`<]*\b(90|95)%/)).toEqual([]);
  });
});
