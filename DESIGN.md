# Kalos design system

Notion-style: calm, flat white, hairline borders, the system font stack, one blue accent and small radii.
The sidebar is a quiet grey panel; the content is flat white.
Verdicts come first in plain words, and the method is one click down.
The desktop app (`desktop/`) runs the same UI in local mode, with no sign-in.

Every value below is quoted from `app/globals.css`, which is the single source of truth.
If this file and the CSS disagree, the CSS wins.

## Principles

- **Calm.** Whitespace and hairline rules first; a card only when a region needs a boundary.
- **Verdict first.** One plain sentence answers the page's question; the numbers and the method sit behind a `Disclosure`.
- **Honest by default.** A failed request, a confirmed-empty result and a loading state are three different things and are never shown as one (see the honesty rules below).

## Tokens

- Tokens live only in `app/globals.css`. Components never hard-code a color, never use an arbitrary `text-[Npx]`, and never read a token that is not defined there.
- `:root` holds the light values and `.dark` overrides them.
  Dark mode is a `dark` class on `<html>`, set before first paint by the inline script in `app/layout.tsx` and changed through `hooks/use-theme.ts`.
  It does not follow the OS media query directly, so every `dark:` utility follows the in-app choice (Light, Dark or System, in Settings or the workspace menu).
- `@theme inline` maps each token to a Tailwind utility (`bg-surface`, `text-fg-muted`, `border-border`, `bg-accent`, `text-good`, `bg-chart-3`, `bg-fill-hover`), and sets `--font-sans` and `--font-mono`.
- A second `@theme` block sets the type roles, the radii and the shadow scale.
- `__tests__/contrast.test.ts` parses `app/globals.css` and checks WCAG contrast for every text and UI pair in both themes.
  Keep values as `oklch()` literals or `var()` references, and keep braces out of comments inside the token blocks.

## Neutrals

Flat white surfaces, warm grey hairlines, warm near-black ink.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `oklch(1 0 0)` | `oklch(0.205 0.002 90)` | Page background (flat white) |
| `--surface` | `oklch(1 0 0)` | `oklch(0.235 0.003 90)` | Cards, panels, popovers, inputs |
| `--subtle` | `oklch(0.972 0.003 95)` | `oklch(0.26 0.003 90)` | The sidebar panel, quiet fills (code blocks, placeholders, table header on tinted pages) |
| `--border` | `oklch(0.93 0.004 90)` | `oklch(0.32 0.004 90)` | Hairline rules and card borders |
| `--border-strong` | `oklch(0.87 0.005 90)` | `oklch(0.4 0.005 90)` | Emphasized dividers, outline buttons, outline badges |
| `--border-input` | `oklch(0.6 0.008 90)` | `oklch(0.56 0.01 270)` | Control boundaries (input, select, checkbox), 3:1 on `--surface` (WCAG 1.4.11) |
| `--fill-hover` | `oklch(0.33 0.012 85 / 0.05)` | `oklch(0.92 0.004 90 / 0.06)` | Hover fill for rows and nav items on the grey sidebar. A fill, never text |
| `--fill-active` | `oklch(0.33 0.012 85 / 0.08)` | `oklch(0.92 0.004 90 / 0.1)` | Selected nav item, pressed or open fill |
| `--fg` | `oklch(0.33 0.012 85)` | `oklch(0.92 0.004 90)` | Primary text and ink |
| `--fg-muted` | `oklch(0.5 0.008 90)` | `oklch(0.72 0.006 90)` | Secondary text, captions, labels (4.5:1 on `--bg`, `--surface` and `--subtle`) |

`--fill-hover` and `--fill-active` are translucent on purpose: they tint the grey sidebar and rows on hover or selection.
Text never uses opacity; use `--fg-muted` instead.

## Accent

One blue (the Notion-style link blue), used for the primary action, links, focus and the model's proposal.
It is never used for status.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--accent` | `oklch(0.52 0.15 252)` | `oklch(0.72 0.11 245)` | Primary action, links, focus ring, the model's proposal, Exploit mode |
| `--accent-hover` | `oklch(0.47 0.13 252)` | `oklch(0.78 0.09 245)` | Primary action on hover |
| `--accent-soft` | `oklch(0.96 0.015 245)` | `oklch(0.3 0.05 245)` | Tinted surface for accent callouts and selected states |
| `--accent-fg` | `oklch(1 0 0)` | `oklch(0.17 0.02 245)` | Label on an accent fill |
| `--ring` | `var(--accent)` | same | Focus ring (`:focus-visible`), same token as `--accent` |

In dark mode the accent is a light fill on a dark page, so the label on it (`--accent-fg`) is dark ink.
There is one focus ring everywhere: `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`.

## Status

State only, never a chart series. Always paired with a word or an icon, never color alone.
Warn and bad surfaces are for things the user must act on.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--good` | `oklch(0.5 0.12 150)` | `oklch(0.76 0.13 150)` | Good state text and icon |
| `--good-soft` | `oklch(0.95 0.04 150)` | `oklch(0.28 0.05 150)` | Good tinted surface |
| `--warn` | `oklch(0.52 0.11 70)` | `oklch(0.8 0.12 75)` | Needs a look: text and icon |
| `--warn-soft` | `oklch(0.96 0.04 85)` | `oklch(0.29 0.045 75)` | Warn tinted surface |
| `--bad` | `oklch(0.52 0.17 25)` | `oklch(0.72 0.15 25)` | Act now: text and icon |
| `--bad-soft` | `oklch(0.955 0.02 25)` | `oklch(0.29 0.06 25)` | Bad tinted surface |

## Chart tokens

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--chart-1` | `oklch(0.53 0.13 245)` | `oklch(0.68 0.13 245)` | Category 1, blue (Okabe-Ito order) |
| `--chart-2` | `oklch(0.64 0.14 65)` | `oklch(0.78 0.14 75)` | Category 2, orange |
| `--chart-3` | `oklch(0.6 0.12 165)` | `oklch(0.72 0.12 165)` | Category 3, bluish green |
| `--chart-4` | `oklch(0.6 0.17 42)` | `oklch(0.7 0.15 42)` | Category 4, vermillion |
| `--chart-5` | `oklch(0.6 0.11 235)` | `oklch(0.8 0.1 235)` | Category 5, sky blue |
| `--chart-6` | `oklch(0.58 0.14 345)` | `oklch(0.75 0.12 345)` | Category 6, reddish purple |
| `--chart-seq-1` | `oklch(0.93 0.03 250)` | `oklch(0.3 0.05 250)` | Lowest magnitude step |
| `--chart-seq-2` | `oklch(0.82 0.07 250)` | `oklch(0.42 0.09 250)` |  |
| `--chart-seq-3` | `oklch(0.68 0.1 250)` | `oklch(0.56 0.12 250)` |  |
| `--chart-seq-4` | `oklch(0.53 0.12 250)` | `oklch(0.7 0.12 250)` |  |
| `--chart-seq-5` | `oklch(0.38 0.09 250)` | `oklch(0.86 0.07 250)` | Highest magnitude step, always the most visible |
| `--chart-band` | `oklch(0.52 0.15 252 / 0.14)` | `oklch(0.72 0.11 245 / 0.2)` | Uncertainty band fill |
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

## Typography

The UI uses the system font stack, with no font files shipped:
`ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`
(SF Pro on a Mac, Segoe UI on Windows). `app/layout.tsx` does not use `next/font`, and `__tests__/self-hosted-fonts.test.ts` keeps it that way.
Body text is 15px. Page titles are bold 40px.

Use the role utilities, not arbitrary sizes.
Numbers use `tabular-nums` in the sans font.
The system monospace (`font-mono text-code`) is for code-like values only: ids and column keys such as `temperature_C`.

| Role | Size / line height | Weight | Letter spacing |
| --- | --- | --- | --- |
| `text-display` | 40 / 48 | 700 | -0.02em |
| `text-title` | 24 / 32 | 600 | -0.01em |
| `text-heading` | 16 / 24 | 600 | none |
| `text-body` | 15 / 24 | 400 | none |
| `text-label` | 13 / 18 | 500 | none |
| `text-caption` | 12 / 16 | 400 | none |
| `text-metric` | 36 / 40 | 600 | -0.02em |
| `text-code` | 13 / 18 | 400 (monospace) | none |

Text hierarchy comes from the role and from `text-fg-muted`, never from opacity.

## Shape: radius, elevation, borders

- **Radius (small).** `rounded-lg` 5px for controls (buttons, inputs, selects), `rounded-xl` 6px for callouts and inline panels, `rounded-2xl` 8px for cards.
  Do not use anything larger than 8px. Pills are for status badges and small icon buttons only.
- **Elevation.** Cards use `shadow-card`, a hairline plus a 1px lift (the `glass` class). Overlays (popovers, menus, dialogs, tooltips, the command palette) use `shadow-popover`.
  The rest of the shadow scale is set to `none` in `@theme`, rather than banned with `!important`, which would also kill `ring-*` focus rings.
- **Borders.** A hairline (`border-border`) separates regions. Control boundaries use `border-border-input` (3:1).
  Prefer whitespace and hairline rules over cards.
- **No side-stripe borders.** Never `border-l-*` or `border-r-*` accents on callouts, verdicts, alerts or cards.
  Tone is a small status icon on a tinted or neutral surface with an even hairline border, or nothing.
  `__tests__/design-guards.test.ts` fails the build on `border-l-[2-9]`, `border-l-[Npx]` and the `border-r` equivalents in `app/` and `components/`, and on thick side borders in CSS.

## Layout

- 8px grid (4px for fine steps).
- The sidebar is 256px (`w-64`), a `bg-subtle` panel with a right hairline. On phones it becomes a sheet behind a 48px top bar.
- Content max width is 1080px (`components/workbench/app-shell.tsx`). Page padding is 20px on phones and 40px on desktop; the top is 32px and 48px.
  Full width is allowed for tables and charts.
- No horizontal page scroll at 390px. Tables scroll inside their own container, with a sticky 40px header and right-aligned `tabular-nums` numerics.

## Components

All shared components live in `components/kit/` (the redesign kit) or `components/ui/` (primitives). Use these before writing a new one.

| Component | File | Use it for |
| --- | --- | --- |
| `PageHeader` | `components/kit/page-header.tsx` | The top of a page: eyebrow, one title, one sentence, optional `meta` badge and one action. |
| `Section` | `components/kit/section.tsx` | A titled block separated by whitespace. `Panel` is the bordered version (a `Card`). |
| `Card`, `Kpi` | `components/ui/card.tsx` | The card surface (`glass`, 24px padding). `Kpi` is a headline number inside a card. The slot API (`CardHeader` and the rest) is kept for shadcn registry blocks. |
| `Callout` | `components/kit/callout.tsx` | The one callout a screen may carry. Tones: neutral, accent, good, warn, bad. |
| `Verdict` | `components/kit/verdict.tsx` | A plain-language verdict: one sentence with an icon, and a `Why` disclosure for the reasoning. No box. |
| `Disclosure` | `components/kit/disclosure.tsx` | Details one click down. Children mount on first open. Use it for method details and raw values. |
| `KpiCard`, `Metric` | `components/kit/kpi-card.tsx`, `components/kit/metric.tsx` | A headline number with its delta or qualifier (`KpiCard`), or an inline number with its label (`Metric`). Both go through `formatNumber`. |
| `StatTile` | `components/ui/stat-tile.tsx` | A dense 76px tile for a row of counts. |
| `ChartFrame`, `lazyChart` | `components/kit/chart-frame.tsx`, `components/kit/lazy-chart.tsx` | Every chart's frame: title, unit, `n`, a "how this is made" tooltip, and the four honest non-ready states. Load recharts through `lazyChart`. |
| `NextCard` | `components/kit/next-card.tsx` | The one next step from campaign state, with one button that names the action. |
| `Badge`, `ModeBadge`, `ExampleBadge` | `components/ui/badge.tsx` | Status labels (`tone` plus a word). `ModeBadge` is the one Explore/Exploit label. `ExampleBadge` marks demo data. |
| `Button`, `buttonVariants` | `components/ui/button.tsx` | One `default` (primary) button per view: the page's primary action. `buttonVariants` styles a link as a button. |
| `ErrorState`, `EmptyState`, `LoadingSkeleton` | `components/ui/honest-state.tsx` | The three honest states. Never substitute one for another (see below). |
| `Table` | `components/ui/table.tsx` | Tables, with sticky headers and tabular numerics. |
| `Alert` | `components/ui/alert.tsx` | A low-level banner shell. New code uses `Callout`. |

Tone is always an icon and a word, never color alone: `TONE_ICON` in `components/kit/tone.tsx` gives each tone its own icon shape.

## Honesty rules that are visual

- **One `Callout` per screen.** Merge stacked caveats into one verdict sentence, and put the rest behind a `Disclosure`.
- **Warn and bad surfaces are only for things the user must act on.** Information is a plain sentence, not a tinted slab.
- **No opacity-dimmed text.** Use `text-fg-muted`, which is contrast-checked. Translucent fills (`--fill-hover`, `--fill-active`) are for rows and nav, never for text.
- **No uppercase identifiers or units.** Column names and units appear exactly as in the sheet (`pH`, `osmolality_mOsm`, `temperature_C`). Do not style labels with uppercase text.
- **No raw engine strings in prose.** Say it in plain words and keep the raw values in a `Disclosure` with human labels next to them.
- **Three honest states.** `ErrorState` means the request to the analysis service failed (a fact about the connection). `EmptyState` means the service answered with nothing (a fact about the data). `LoadingSkeleton` means the request is in flight. Never show a dropped connection as "no data".
- **Demo or illustrative content carries a visible "Example data" badge** (`ExampleBadge`).
- **Never rely on color alone** for state. Pair it with a word or an icon.
- **Research use only.** Suggestions are hypotheses to test, not validated specifications. The sidebar footer says so.

## Dark mode

- Every token has a dark value in `.dark`. Some tokens are the same in both themes (`--ring`, the chart reference and measured marks).
- Surfaces step up in lightness from `--bg` to `--surface` to `--subtle`, with hairline borders doing the separation that shadows do elsewhere.
- Status colors are lightened and soft fills darkened, so each text and fill pair still passes contrast.
- Sequential ramps reverse lightness, as described above.

## Compatibility aliases (temporary)

`app/globals.css` keeps older token names so pages that are not rebuilt yet still render. Each maps onto a current token.
Do not use them in new code. A page engineer deletes an alias once nothing reads it (check with `rg`).

**Kalos aliases, CSS variables** (the `COMPATIBILITY ALIASES` block in `:root`):
`--card`, `--muted`, `--accent-text`, `--blue`, `--blue-hover`, `--blue-deep`, `--blue-soft`, `--blue-tint`, `--blue-border`, `--blue-hover-bg`, `--explore`, `--explore-deep`, `--explore-soft`, `--green`, `--green-soft`, `--amber`, `--amber-soft`, `--red`, `--grid`, `--series-1`, `--series-2`, `--series-3`, `--series-4`, `--series-5`, `--series-6`, `--chart-1-ink`

**Kalos aliases, utilities** (the `COMPATIBILITY utilities` block in `@theme inline`; use them as `bg-*`, `text-*`, `border-*` and so on):
`--color-card`, `--color-muted`, `--color-accent-text`, `--color-blue`, `--color-blue-hover`, `--color-blue-deep`, `--color-blue-soft`, `--color-blue-tint`, `--color-blue-border`, `--color-explore`, `--color-explore-deep`, `--color-explore-soft`, `--color-green`, `--color-green-soft`, `--color-amber`, `--color-amber-soft`, `--color-red`, `--color-grid`, `--color-chart-1-ink`, `--color-series-1`, `--color-series-2`, `--color-series-3`, `--color-series-4`, `--color-series-5`, `--color-series-6`

**Class:** `.tabular` (use `tabular-nums` in new code).

**Read by these files** (computed from the repo when this doc was written; the list shrinks as pages are rebuilt):
`app/data/page.tsx`, `app/error.tsx`, `app/library/plate/page.tsx`, `app/library/scale-up/page.tsx`, `app/library/simulator/page.tsx`, `app/library/vessels/page.tsx`, `app/projects/projects.css`, `components/charts.tsx`, `components/plate/control-summary.tsx`, `components/plate/flag-summary.tsx`, `components/plate/plate-heatmap.tsx`, `components/plate/qc-tiles.tsx`, `components/plate/status-chip.tsx`, `components/plate/well-detail.tsx`, `components/plate/well-status-legend.tsx`, `components/projects/phase1-view.tsx`, `components/projects/project-report.tsx`, `components/proposals.tsx`, `components/service-unavailable.tsx`, `components/ui/chart.tsx`, `components/upload-dropzone.tsx`, `components/vessels/correlation-scatter.tsx`, `components/vessels/kinetic-overlay.tsx`, `components/vessels/vessel-table.tsx`

**Kept on purpose, not aliases to delete:**
- The shadcn semantic names (`--primary-foreground`, `--secondary` and `--color-background`, `--color-foreground`, `--color-card-foreground`, `--color-popover`, `--color-popover-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-secondary`, `--color-secondary-foreground`, `--color-muted-foreground`, `--color-accent-foreground`, `--color-destructive`, `--color-input`) match `components.json`, so registry blocks keep resolving.
- `--font-head` is read by `app/library/scale-up/page.tsx`.
- `components/page-header.tsx` is a shim that maps the old `PageHeader` API onto `components/kit/page-header.tsx`; delete it once no page imports it.
- `.surface-cell` and `.greek-key` (in `app/globals.css`) are page-specific utilities for the plate and campaign views.
