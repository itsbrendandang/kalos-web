# Kalos design system

Kalos-web has a single, unified design system: the Voyager blue product look,
applied across every surface. This replaces the earlier split between a
black-and-white "optimizer" surface and a blue "Voyager" surface. There is
now one visual language for the whole app.

## Token architecture

All color, radius, and type tokens are defined once in `app/globals.css`,
under `:root`, and re-exported to Tailwind v4 utilities via `@theme inline`.
That makes `bg-accent`, `text-muted`, `border-border`, `bg-blue-tint`, and so
on available as Tailwind classes everywhere in the app.

`app/voyager/voyager.css` (scoped under `.voyager-root`) does not define its
own palette anymore. It aliases the shared root tokens to the short
`--v-*` / `--b5` / `--b7` / `--b9` names that the original Voyager prototype
markup and CSS classes expect, then layers Voyager-specific component classes
(cards, pipeline stages, linkage tree, modals) on top. If you change a color
in `app/globals.css`, both surfaces update together.

```
app/globals.css        <- single source of truth: :root tokens + @theme inline
app/voyager/voyager.css <- .voyager-root aliases root tokens to --v-* names,
                            then Voyager-only component classes
```

## Color roles

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#fafbff` | Page background |
| `--card` | `#ffffff` | Card / surface background |
| `--fg` | `#111111` | Primary text |
| `--muted` | `#6b7280` | Secondary text |
| `--border` | `#e1e6f5` | Default border |
| `--blue` | `#204af4` | Primary brand color. Buttons, active nav, links, chart series, focus rings |
| `--blue-hover` | `#1434b5` | Hover/pressed state for `--blue` |
| `--blue-deep` | `#061c72` | Deepest blue, used sparingly (e.g. "done" step numbers) |
| `--blue-soft` | `#f9faff` | Very light blue wash, large surfaces |
| `--blue-tint` | `#eef1fe` | Light blue fill for badges/chips/active tab backgrounds |
| `--blue-border` | `#c8d0fa` | Border color paired with `--blue-tint` |
| `--blue-hover-bg` | `#f4f6ff` | Hover background for ghost/ dashed controls |
| `--accent` / `--accent-hover` / `--accent-soft` | alias `--blue` / `--blue-hover` / `--blue-tint` | Semantic accent, used throughout the optimizer surface (`bg-accent`, `text-accent-hover`, `bg-accent-soft`) |
| `--explore` / `--explore-deep` / `--explore-soft` | `#9ca3af` / `#52525b` / `#ededed` | Neutral "exploratory" or secondary tone, kept distinct from the blue brand color so explore/exploit contrast stays legible on charts and tags |
| `--green` / `--green-soft` | `#1f7a34` / `#e8f5e9` | Success / "promote" / "complete" states. AA-checked, ~5.4:1 on white |
| `--amber` / `--amber-soft` | `#9a5b00` / `#fff3e0` | Warning / "hold" states. AA-checked, ~5.4:1 on white |
| `--red` | `#c0392b` | Fail / error status. AA-checked, ~4.6:1 on white |
| `--sidebar` | `#0a1233` | Dark sidebar background (optimizer nav) |
| `--grid` | `#e5e9f7` | Chart gridlines |
| `--v-muted` / `--v-faint` | `#5b6470` / `#6b7280` | Secondary / tertiary caption text on the Voyager surface. Both clear WCAG AA (>= 4.5:1) on white. They replaced low-opacity ink (`rgba(17,17,17,.3-.4)`), which read 2.3-2.6:1 and failed AA at caption sizes. Use these for muted text under `.voyager-root`, never a raw low-opacity ink. |

Status colors beyond this table (warn/bad banner tones, decision-card
promote/hold/retire colors) live as additional `--v-*` tokens inside
`.voyager-root` in `app/voyager/voyager.css`, since they are only used by the
Voyager product screens.

`components/voyager/illustrative-banner.tsx` reuses the `--v-warn-*` tokens for
the "Sample data - illustrative, not a real analysis" disclaimer shown on every
non-live Voyager screen (Phase 1, Phase 2 setup/results, and the final report -
anywhere `project.live` is not true). The live, engine-backed Phase 2 view
keeps its own "Live · engine" badge instead.

## Radius and type

- Card radius: `16px` (`--radius-card`, `rounded-2xl` in Tailwind).
- Control radius (buttons, inputs, chips): `10px` (`--radius-control`,
  `rounded-[10px]`).
- The global `:focus-visible` rule in `app/globals.css` only sets `outline` +
  `outline-offset`, no `border-radius`. It used to hardcode `10px`, which drew
  a mismatched rounded-rectangle ring over pill-shaped and circular elements
  (phase tabs, round badges). Leaving radius unset lets the ring follow each
  element's own `border-radius` instead.
- Voyager component-level radii (pills, small chips, pipeline stage rows) are
  set directly in `voyager.css` class rules and range `6px`-`12px`
  depending on element size; they intentionally stay slightly tighter than
  the app-wide `16px` card radius to match the denser Voyager product
  layouts.

Type:

- Satoshi is the single app-wide typeface, matching the Voyager v3 prototype.
  It is self-hosted via `next/font/local` from the variable font under
  `app/fonts/Satoshi-Variable.woff2` (Fontshare Font License, `SATOSHI-LICENSE.txt`
  alongside it).
- Optimizer surface: Satoshi drives both `--font-head` (headings) and
  `--font-sans` (body) via `--font-satoshi` in `app/layout.tsx`; JetBrains Mono
  (`--font-jbmono`, tabular/mono data) via `next/font/google`.
- Voyager surface: Satoshi is exported as `--font-voyager` in
  `app/voyager/layout.tsx`, so `voyager.css` needs no change.
- Base sizes stay small and dense (11px-19px) across both surfaces, matching
  the original Voyager product screens: `10px` eyebrow/uppercase labels,
  `11px`-`13px` body and controls, `14px`-`19px` headings/titles, `26px`+
  reserved for hero KPI numbers.

## Charts

`components/charts.tsx` exports a single `CHART_THEME` object (series color,
down/secondary series color, grid, axis, tooltip border/background/text, hover
cursor tint) built from the shared CSS variables above. Every chart
(`ConvergenceChart`, `ParetoChart`, `DriversBar`, `PredScatter`) reads from
this object instead of hardcoded hex, so chart styling updates automatically
when the root tokens change.

## Inline styles in Voyager components

Voyager components (`components/voyager/*`) were audited for hardcoded hex in
`style={{...}}` props. Loose one-off colors were moved into `voyager.css`
classes (e.g. `.v-tone-ok` / `.v-tone-warn` / `.v-tone-bad` for reliability
banners, `.dc-row--exploit` / `.dc-row--explore` for candidate rows,
`.v-pipeline-badge--*` for pipeline status badges) or onto shared tokens.

One exception: `components/voyager/linkage-tree.tsx` keeps a `STYLE` node-color
dictionary (`Record<NodeType, {...}>`) as a plain TypeScript constant rather
than CSS classes. Each node type in the experiment lineage SVG maps to a fixed
fill/stroke/text/badge combination that is only read in that one file and
rendered imperatively into SVG attributes; a CSS-class version would just be
the same mapping expressed less directly. Remaining `style={{ width: ... }}`
props across the app are legitimate data-driven values (progress bar widths,
bar-chart fills) and are not colors.

## Fonts, one more time

Do not download font files from unverified sources. If self-hosting Satoshi
becomes a priority, source the licensed files first, add them under
`public/fonts/` (or similar, checked into the repo), then switch
`app/voyager/layout.tsx` from `next/font/google` (Manrope) to
`next/font/local`, keeping the `--font-voyager` CSS variable name.
