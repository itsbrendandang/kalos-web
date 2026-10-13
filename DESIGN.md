# Kalos web design system

Calm, editorial, light first, with full dark mode.
Generous whitespace, few boxes, hairline rules, big clear numbers, plain-language verdicts first, method details one click down.
Every value below is quoted from `app/globals.css`, which is the single source of truth.
If this file and the CSS disagree, the CSS wins.

## Token architecture

- Tokens live only in `app/globals.css`.
  Components never hard-code a color, and never read a token that is not defined there.
- `:root` holds the light values and `.dark` overrides them.
  Dark mode is a `dark` class on `<html>`, set before first paint by the inline script in `app/layout.tsx` and changed through `hooks/use-theme.ts`.
  It does not follow the OS media query directly, so every `dark:` utility follows the in-app choice (Light, Dark or System, set in Settings or the workspace menu).
- `@theme inline` maps each token to a Tailwind color utility (`bg-surface`, `text-fg-muted`, `border-border`, `bg-accent`, `text-good`, `bg-chart-3`).
  The same block sets `--font-sans` and `--font-mono`.
- A second `@theme` block defines the type roles and zeroes the shadow scale.
- `__tests__/contrast.test.ts` parses `app/globals.css` and checks WCAG contrast for every text and UI pair in both themes.
  Keep values as `oklch()` literals or `var()` references, and keep braces out of comments inside the token blocks.
- Fonts are Geist (UI and text) and Geist Mono (code-like values only), self-hosted from `app/fonts/` with `next/font/local`.
  Both are SIL OFL 1.1, see `app/fonts/GEIST-LICENSE.txt`.
  `__tests__/self-hosted-fonts.test.ts` fails the build on any `next/font/google` use.

## Neutrals

Warm paper, ink text.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `oklch(0.985 0.003 90)` | `oklch(0.17 0.006 270)` | Page background |
| `--surface` | `oklch(1 0 0)` | `oklch(0.2 0.006 270)` | Panels, popovers, inputs |
| `--subtle` | `oklch(0.965 0.004 90)` | `oklch(0.235 0.007 270)` | Quiet fills: hover, table header, explorer |
| `--border` | `oklch(0.91 0.005 90)` | `oklch(0.3 0.008 270)` | Hairline rules and panel borders |
| `--border-strong` | `oklch(0.84 0.006 90)` | `oklch(0.38 0.01 270)` | Input borders, emphasized dividers |
| `--fg` | `oklch(0.22 0.01 270)` | `oklch(0.95 0.005 90)` | Primary text |
| `--fg-muted` | `oklch(0.46 0.01 270)` | `oklch(0.72 0.01 270)` | Secondary text (passes 4.5:1 on `--bg`) |

## Accent

An indigo-violet, used for the primary action, links, focus, and the model's proposal.
It is never used for status.

| Token | Light | Dark |
| --- | --- | --- |
| `--accent` | `oklch(0.48 0.16 285)` | `oklch(0.72 0.13 285)` |
| `--accent-hover` | `oklch(0.43 0.16 285)` | `oklch(0.78 0.11 285)` |
| `--accent-soft` | `oklch(0.95 0.024 285)` | `oklch(0.29 0.06 285)` |
| `--accent-fg` | `oklch(1 0 0)` | `oklch(0.17 0.02 285)` |
| `--ring` | `var(--accent)` | `var(--accent)` |

In dark mode the accent is a light fill on a dark page, so the label on it (`--accent-fg`) is dark ink.
There is one focus ring everywhere: `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`.

## Status

State only, never a chart series, and always paired with a word or an icon, never color alone.
Warn and bad surfaces are for things the user must act on.

| Token | Light | Dark |
| --- | --- | --- |
| `--good` / `--good-soft` | `oklch(0.5 0.12 150)` / `oklch(0.95 0.04 150)` | `oklch(0.76 0.13 150)` / `oklch(0.28 0.05 150)` |
| `--warn` / `--warn-soft` | `oklch(0.52 0.11 70)` / `oklch(0.96 0.04 85)` | `oklch(0.8 0.12 75)` / `oklch(0.29 0.045 75)` |
| `--bad` / `--bad-soft` | `oklch(0.52 0.17 25)` / `oklch(0.955 0.02 25)` | `oklch(0.72 0.15 25)` / `oklch(0.29 0.06 25)` |

## Chart tokens

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--chart-1` | `oklch(0.53 0.13 245)` | `oklch(0.68 0.13 245)` | Category 1 (blue) |
| `--chart-2` | `oklch(0.64 0.14 65)` | `oklch(0.78 0.14 75)` | Category 2 (orange) |
| `--chart-3` | `oklch(0.6 0.12 165)` | `oklch(0.72 0.12 165)` | Category 3 (bluish green) |
| `--chart-4` | `oklch(0.6 0.17 42)` | `oklch(0.7 0.15 42)` | Category 4 (vermillion) |
| `--chart-5` | `oklch(0.6 0.11 235)` | `oklch(0.8 0.1 235)` | Category 5 (sky blue) |
| `--chart-6` | `oklch(0.58 0.14 345)` | `oklch(0.75 0.12 345)` | Category 6 (reddish purple) |
| `--chart-seq-1` | `oklch(0.93 0.03 285)` | `oklch(0.3 0.05 285)` | Lowest magnitude step |
| `--chart-seq-2` | `oklch(0.82 0.07 285)` | `oklch(0.42 0.09 285)` | |
| `--chart-seq-3` | `oklch(0.68 0.12 285)` | `oklch(0.56 0.12 285)` | |
| `--chart-seq-4` | `oklch(0.53 0.15 285)` | `oklch(0.7 0.12 285)` | |
| `--chart-seq-5` | `oklch(0.38 0.14 285)` | `oklch(0.86 0.07 285)` | Highest magnitude step |
| `--chart-band` | `oklch(0.48 0.16 285 / 0.14)` | `oklch(0.72 0.13 285 / 0.2)` | Uncertainty band fill |
| `--chart-reference` | `var(--fg-muted)` | same | Best-so-far and baseline lines, dashed |
| `--chart-predicted` | `var(--accent)` | same | Predicted values |
| `--chart-measured` | `var(--fg)` | same | Measured values |
| `--chart-grid` | `var(--border)` | same | Grid lines, kept muted |

### The data-color rule

Two families, two jobs, never swapped.

- **Sequential (`--chart-seq-1..5`)** is for ordered magnitude: heatmaps, the plate grid, any value that runs from less to more.
  Lightness reverses in dark mode so the highest value is always the most visible step against the page.
  `__tests__/contrast.test.ts` checks that the ramp gets more visible as values rise.
- **Categorical (`--chart-1..6`)** is for unordered series, in Okabe-Ito order, darkened until each mark clears 3:1 on the plot surface.
  Color alone cannot carry meaning in greyscale, so categorical series also need a direct label or a dash pattern.

Single-series charts use one accent color.
Predicted is `--chart-predicted`, measured is `--chart-measured`, and the two are never drawn as the same mark.

## Type roles

Geist for text and numbers.
Numbers use `tabular-nums` (Geist has true tabular figures), not mono.
Geist Mono, through `font-mono text-code`, is for code-like values only: ids and column keys.

| Role | Size / line height | Weight | Letter spacing |
| --- | --- | --- | --- |
| `text-display` | 32 / 38 | 600 | -0.015em |
| `text-title` | 22 / 28 | 600 | -0.01em |
| `text-heading` | 16 / 24 | 600 | none |
| `text-body` | 14 / 22 | 400 | none |
| `text-label` | 13 / 18 | 500 | none |
| `text-caption` | 12 / 16 | 400 | none |
| `text-metric` | 36 / 40 | 600 | -0.02em |
| `text-code` | 13 / 18 | regular | none |

Use these roles, not arbitrary `text-[Npx]` values.
Text hierarchy comes from the role and from `--fg-muted`, never from opacity.

## Layout

- 8px grid.
- Content max width is 1120px (`max-w-[1120px]` in `components/workbench/app-shell.tsx`), with full width allowed for tables and charts.
  Page padding is 24px on desktop and 16px on mobile.
- Radius: `rounded-lg` (8px) for controls and `rounded-xl` (12px) for panels.
  Tailwind's defaults are not overridden.
  No `rounded-2xl` boxes, and no pill badges unless they show status.
- No shadows, except overlays (popovers, menus, dialogs, the command palette), which use `shadow-popover`.
  The rest of the shadow scale is set to `none` in `@theme`, rather than banned with `!important`, which would also kill `ring-*` focus rings.
- Prefer whitespace and hairline rules over cards.
- Tables use right-aligned numerics with `tabular-nums`, 40px rows and a sticky header.
- No horizontal page scroll at 390px.
  Tables scroll inside their own container.
- No colored side-stripe borders: never `border-l-*` or `border-r-*` accents on callouts, verdicts, alerts or cards.
  Tone is a small status icon on a tinted or neutral surface with an even hairline border, or none.
  `__tests__/design-guards.test.ts` fails the build on `border-l-[2-9]`, `border-l-[Npx]` and the `border-r` equivalents in `app/` and `components/`.

## Honesty rules that are visual

- One `Callout` per screen (`components/kit/callout.tsx`).
  Merge stacked caveats into one verdict sentence and put the rest behind a `Disclosure`.
- Warn and bad surfaces are only for things the user must act on.
  Information is a plain sentence, not a tinted slab.
- No opacity-dimmed text.
  Use `--fg-muted`, which is contrast-checked.
- No uppercase identifiers or units.
  Column names and units such as `pH` or `osmolality_mOsm` appear exactly as in the sheet.
- Never show raw engine strings in prose.
  Say it in plain words and keep the raw values in a disclosure.
- Demo or illustrative content carries a visible "Example data" badge (`ExampleBadge` in `components/ui/badge.tsx`).
- Never rely on color alone for state: pair it with a word or an icon.

## Dark mode

- Every token has a dark value in `.dark`.
- Surfaces step up in lightness from `--bg` to `--surface` to `--subtle`, with hairline borders doing the separation that shadows do elsewhere.
- Status colors are lightened, and soft fills darkened, so each text and fill pair still passes contrast.
- Sequential ramps reverse lightness, as described above.

## Temporary compatibility aliases

`app/globals.css` keeps a block of older token names (`--card`, `--muted`, `--blue*`, `--green*`, `--amber*`, `--red`, `--series-*` and similar), each mapped onto a current token.
They exist only because some pages (Data, the Library tools, the campaign stage pages, Projects) have not been rebuilt on the new kit yet.
Do not use them in new code, and delete an alias once nothing reads it.

Replaced the earlier blue and Satoshi system in October 2026.
