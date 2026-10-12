import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x contrast for every text and UI token pair in app/globals.css, in
// both themes, computed from the OKLCH source values (no browser needed).
// Rule 7 of the redesign brief: 4.5:1 for text, 3:1 for large text and UI.

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

/** Every `--name: value;` declared in `:root { }` (light) or `.dark { }` blocks. */
function declarations(selector: ":root" | ".dark"): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
  for (const [, body] of css.matchAll(blocks)) {
    const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, name, value] of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(name, value.trim());
  }
  return out;
}

const light = declarations(":root");
const dark = new Map([...light, ...declarations(".dark")]);

function resolve(tokens: Map<string, string>, name: string, seen: string[] = []): string {
  const value = tokens.get(name);
  if (value == null) throw new Error(`${name} is not defined`);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return value;
  if (seen.includes(ref[1])) throw new Error(`cycle: ${[...seen, ref[1]].join(" -> ")}`);
  return resolve(tokens, ref[1], [...seen, name]);
}

type Rgb = [number, number, number];

/** OKLCH -> linear sRGB (Ottosson's OKLab matrices). Alpha is not allowed here. */
function oklchToLinearSrgb(value: string): Rgb {
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!m) throw new Error(`not an opaque oklch() color: ${value}`);
  const [L, C, H] = m.slice(1).map(Number);
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(tokens: Map<string, string>, fg: string, bg: string): number {
  const [y1, y2] = [fg, bg].map((t) => luminance(oklchToLinearSrgb(resolve(tokens, t))));
  return (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
}

const SURFACES = ["--bg", "--surface", "--subtle"];
const TEXT = ["--fg", "--fg-muted", "--accent", "--good", "--warn", "--bad"];
const TONES = [
  ["--accent", "--accent-soft"],
  ["--good", "--good-soft"],
  ["--warn", "--warn-soft"],
  ["--bad", "--bad-soft"],
];
const CHART = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
const SEQ = ["--chart-seq-1", "--chart-seq-2", "--chart-seq-3", "--chart-seq-4", "--chart-seq-5"];

type Pair = [fg: string, bg: string, min: number];

const pairs: Pair[] = [
  // Body text tokens on every page surface.
  ...TEXT.flatMap((fg) => SURFACES.map((bg): Pair => [fg, bg, 4.5])),
  // Tone text (badges, callout titles) and body text on the tone's soft fill.
  ...TONES.flatMap(([tone, soft]): Pair[] => [
    [tone, soft, 4.5],
    ["--fg", soft, 4.5],
    ["--fg-muted", soft, 4.5],
  ]),
  // Labels on the primary action fill, at rest and hovered.
  ["--accent-fg", "--accent", 4.5],
  ["--accent-fg", "--accent-hover", 4.5],
  // Focus ring and the primary fill against the page (UI, 3:1).
  ...["--bg", "--surface"].flatMap((bg): Pair[] => [
    ["--ring", bg, 3],
    ["--accent", bg, 3],
  ]),
  // Chart marks (lines, points, bars) against the plot surface (graphics, 3:1).
  ...[...CHART, "--chart-predicted", "--chart-measured", "--chart-reference", "--chart-seq-5"].flatMap((c) =>
    ["--bg", "--surface"].map((bg): Pair => [c, bg, 3]),
  ),
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_theme, tokens) => {
  it.each(pairs)("%s on %s clears %s:1", (fg, bg, min) => {
    expect(contrast(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("sequential ramp gets more visible against the page as values rise", () => {
    const ratios = SEQ.map((c) => contrast(tokens, c, "--bg"));
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
  });

  it("every tested color is inside the sRGB gamut, so no browser clipping changes it", () => {
    const names = new Set(pairs.flatMap(([fg, bg]) => [fg, bg]).concat(SEQ));
    for (const name of names) {
      for (const v of oklchToLinearSrgb(resolve(tokens, name))) {
        expect(v, name).toBeGreaterThanOrEqual(-0.002);
        expect(v, name).toBeLessThanOrEqual(1.002);
      }
    }
  });
});
