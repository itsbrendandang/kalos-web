# Kalos design system

Kalos-web has a single, unified design system: the Voyager blue product look,
applied across every surface. This replaces the earlier split between a
black-and-white "optimizer" surface and a blue "Voyager" surface. There is
now one visual language for the whole app - light and dark.

## Token architecture

All color, radius, and type tokens are defined once in `app/globals.css`,
under `:root` (light) with a `.dark` override block, and re-exported to
Tailwind v4 utilities via `@theme inline`. That makes `bg-accent`,
`text-muted`, `border-border`, `bg-blue-tint`, and so on available as
Tailwind classes everywhere in the app, and means every one of those classes
already flips correctly when `.dark` is applied to `<html>` - no component
needs to know dark mode exists.

`app/globals.css` also carries a second, additive token layer using the
shadcn-standard semantic names (`--background`, `--primary`, `--secondary`,
`--popover`, `--destructive`, `--input`, `--ring`, `--chart-1`...`--chart-5`,
`--radius`). Existing components do not use these names; they exist so any
future shadcn-convention component (the CLI, a pasted snippet, a library
built on the same convention) drops in against tokens that already carry the
kalos brand, instead of shadcn's default neutral-gray theme. See
"shadcn semantic tokens" and "Dark mode" below for the details and one
deliberate naming exception.

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

> Superseded in part (2026-07-24, confirmed by owner): the app chrome is
> **achromatic neutral**, not brand blue. The `--blue*` / `--accent*` / `--sidebar`
> hex values and the entire **Dark** column in the table below are historical
> (pre-`main #15` "neutral theme" migration) and do NOT match the shipped code,
> where `--blue`/`--accent` resolve to `oklch(0.205 0 0)` gray. Trust the
> "2026-07-24 consolidation" section below and `app/globals.css` `:root` for the
> live values. The `--bg` / `--card` / `--fg` / `--muted` / `--border` /
> `--blue-soft` light rows ARE current. Neutral is the intended baseline; the
> blue rows are kept only as history until this table is rewritten.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#f6f8fc` | `#10141e` | Page background |
| `--card` | `#ffffff` | `#161b29` | Card / surface background |
| `--fg` | `#101828` | `#eef1f7` | Primary text |
| `--muted` | `#667085` | `#9aa5ba` | Secondary text |
| `--border` | `#d9e2f2` | `#262d40` | Default border |
| `--blue` | `#204af4` | `#3259f5` | Primary brand color. Buttons, active nav, links, chart series, focus rings. Nudged lighter in dark mode (white button text stays 5.4:1 AA on it); the light-mode blue becomes the dark-mode hover/pressed shade |
| `--blue-hover` | `#1434b5` | `#204af4` | Hover/pressed state for `--blue` |
| `--blue-deep` | `#061c72` | `#8fb0ff` | Emphasis blue text (e.g. "done" step numbers). Inverts from "very dark on light bg" to "bright on dark bg" so it keeps doing the same job - 7-9:1 AA either way |
| `--blue-soft` | `#f8faff` | `#141a2c` | Very light/dark blue wash, large surfaces |
| `--blue-tint` | `#eef1fe` | `#1b2340` | Blue fill for badges/chips/active tab backgrounds |
| `--blue-border` | `#c8d0fa` | `#33406e` | Border color paired with `--blue-tint` |
| `--blue-hover-bg` | `#f4f6ff` | `#1a2036` | Hover background for ghost/dashed controls |
| `--accent` / `--accent-hover` / `--accent-soft` | alias `--blue` / `--blue-hover` / `--blue-tint` | (follows) | Semantic accent fills. `bg-accent` (buttons), `hover:bg-accent-hover` (interactive hover/pressed - carries white text), `bg-accent-soft` (active-nav/badge tint) |
| `--accent-text` | `#1434b5` (alias `--blue-hover`) | `#6f93ff` | Accent-colored **text/icons** on page/card/tint surfaces (`text-accent-text`): active nav, links, eyebrows, badges, chip labels. Split from `--accent-hover` because a hover fill dark enough to hold white text (dark `#204af4`) reads only 2.5-2.9:1 as text on the dark surfaces (fails AA); this decoupled value clears >=5.36:1. Light mode equals the old accent-hover text value, so the light theme is unchanged |
| `--explore` / `--explore-deep` / `--explore-soft` | `#9ca3af` / `#52525b` / `#ededed` | `#9ca3af` (unchanged, still 6.8-7.3:1 on the dark surfaces) / `#b6bcc9` / `#232733` | Neutral "exploratory" or secondary tone, kept distinct from the blue brand color so explore/exploit contrast stays legible on charts and tags |
| `--green` / `--green-soft` | `#1f7a34` / `#e8f5e9` | `#34c77a` / `#10301f` | Success / "promote" / "complete" states. AA-checked both modes (light ~5.4:1 on white; dark 7.9-8.4:1 on card/bg) |
| `--amber` / `--amber-soft` | `#9a5b00` / `#fff3e0` | `#e0a530` / `#362408` | Warning / "hold" states. AA-checked both modes (light ~5.4:1; dark 7.9-8.4:1) |
| `--red` | `#c0392b` | `#f16354` | Fail / error status. AA-checked both modes (light ~4.6:1; dark 5.4-5.8:1) |
| `--sidebar` | `#0a1233` | `#0a1233` | Dark sidebar background (optimizer nav) - already dark, unchanged in dark mode |
| `--grid` | `#e5e9f7` | `#232a3d` | Chart gridlines |
| `--v-muted` / `--v-faint` | `#5b6470` / `#6b7280` | - | Secondary / tertiary caption text on the Voyager surface. Both clear WCAG AA (>= 4.5:1) on white. They replaced low-opacity ink (`rgba(17,17,17,.3-.4)`), which read 2.3-2.6:1 and failed AA at caption sizes. Use these for muted text under `.voyager-root`, never a raw low-opacity ink. Not yet re-tuned for dark mode - see "Dark mode" below |

Status colors beyond this table (warn/bad banner tones, decision-card
promote/hold/retire colors) live as additional `--v-*` tokens inside
`.voyager-root` in `app/voyager/voyager.css`, since they are only used by the
Voyager product screens.

All contrast ratios above were computed against both `--bg` and `--card` in
each mode using the standard WCAG relative-luminance formula, not eyeballed.

### 2026-07-24 consolidation: the softened-neutral baseline

`redesign/consolidation` merged in the `feat/satoshi-font` direction and
formalized it as the documented baseline (REDESIGN.md 4.1), rather than
leaving it an uncommitted WIP diff. Five base-surface tokens moved off pure
achromatic gray to a hair of blue tint: `--bg` (`#f6f8fc`), `--fg`
(`#101828`), `--muted` (`#667085`), `--border` (`#d9e2f2`), and `--blue-soft`
(`#f8faff`) - the values already recorded in the table above. Recomputed
against the standard WCAG relative-luminance formula (not eyeballed):

| Pair | Ratio | AA minimum (normal/caption text) | Result |
| --- | --- | --- | --- |
| `--fg` (`#101828`) on `--bg` (`#f6f8fc`) | 16.69:1 | 4.5:1 | Clears with wide margin |
| `--muted` (`#667085`) on `--bg` (`#f6f8fc`) | 4.68:1 | 4.5:1 | Clears at 10-11px caption sizes |
| `--fg` on `--card` (`#ffffff`) | 17.75:1 | 4.5:1 | Clears with wide margin |
| `--muted` on `--card` | 4.97:1 | 4.5:1 | Clears at 10-11px caption sizes |

`--muted` on `--bg` is the tighter pair - caption-size body copy at 4.68:1
still clears the 4.5:1 AA floor for normal text (not just the relaxed 3:1
large-text floor), so no caption anywhere in the app drops below AA under the
softened background.

The brand blue/accent scale (`--blue`, `--blue-hover`, `--blue-deep`,
`--blue-tint`, `--blue-border`, `--accent-text`), `--chart-1`...`--chart-5`,
and `--sidebar` are unchanged by this merge, per REDESIGN.md 4.1 ("the brand
blue scale ... are unchanged. No new hue is introduced."): `app/globals.css`
still carries the 2026-07-16 neutral-chrome migration (main #15, "Design
overhaul: neutral theme, Experiments hub, Kanban, data catalog") - CHROME
(buttons, active nav, `--accent*`) stays achromatic gray, while
`--chart-1`...`--chart-5` and `components/dashboard/heat-scale.ts` keep the
colored data-viz ramp. The rows above for `--blue`/`--blue-hover`/
`--blue-deep`/`--accent-text`/`--sidebar` and their dark-mode values predate
that migration and do not match the current chrome; reconciling that
documentation gap (blue-hex rows vs. the achromatic code, and the dark-mode
column throughout this table) is out of scope for this merge and is flagged
here as follow-up rather than silently left inconsistent.

`components/voyager/illustrative-banner.tsx` reuses the `--v-warn-*` tokens for
the "Sample data - illustrative, not a real analysis" disclaimer shown on every
non-live Voyager screen (Phase 1, Phase 2 setup/results, and the final report -
anywhere `project.live` is not true). The live, engine-backed Phase 2 view
keeps its own "Live · engine" badge instead.

## Campaign-workspace foundation tokens

Added ahead of the campaign-workspace/Map redesign (`feat/campaign-workspace-redesign`), before any product UI is built on top of them. Same rule as every token above: light value and an independently-picked dark value, no literal hex in components.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--canvas` | `#eaeef5` | `#030306` | Workspace backdrop behind white/card planes. Deliberately distinct from `--bg` - not a merge, not an alias. |
| `--node-stroke` | `#8690a2` | `#98a2b3` (the mock's original value, kept) | Graph node strokes and SOP node strokes (Map tab). Close to but NOT the same value as `--explore` (`#9ca3af`) - a separate token, not a retune of `--explore`. |
| `--action` | `#343434` | `#65666c` | Filled-button/badge fill for the campaign workspace (buttons, round-hub discs, active pills). |
| `--activity-0` .. `--activity-4` | `#eef1f5`, `#dbe7dd`, `#b3d1ba`, `#6da77f`, `#1f7a34` | `#232327`, `#16351f`, `#1b5c33`, `#24894a`, `#34c77a` | The Log tab's activity-strip ramp, quiet (0) to busy (4). Five discrete buckets, not an interpolated gradient. Level 4 is exactly `--green` in each mode so the busiest day speaks the same language the rest of the surface uses for "good"; levels 0-3 walk down from it. Deliberately NOT aliases of `--blue-tint` / `--green`: a heatmap bucket is its own role, and folding it into a chrome token would silently retune the ramp the next time that chrome token moves. |
| `--activity-future` | `#d9e2f2` | `#2e2e33` | Dashed outline of a day that has not happened yet (the trailing partial week). Its own token rather than `--border`: identical in light, but `--border` is tuned to recede against a dark card, which makes a 15px dashed square vanish there. |

Real WCAG contrast ratios (computed, not eyeballed - script and full output kept alongside this branch's handoff notes, not committed to the repo):

- `--canvas`: light is `1.09:1` against `--bg` and `1.164:1` against `--card` - a small, deliberate step, not a duplicate. The first dark value (`#101012`) only reached `1.073:1` against dark `--card` (`#18181b`), so the planes barely read as floating and the workspace looked flat. Retuned to `#030306`, which restores the light relationship numerically: `1.163:1` against dark `--card` and `1.04:1` against dark `--bg` (`#0a0a0a`), i.e. `--canvas` is the darkest of the three surfaces in dark mode exactly as it is the darkest of the three in light mode. Text that sits directly on the canvas (the Log tab's round-divider row) only gains from the change: `--fg` `19.7:1`, `--muted` `8.0:1`, `--green` `9.4:1`, `--amber` `9.4:1`.
- `--activity-0` .. `--activity-4`: light steps sit at `1.13`, `1.27`, `1.65`, `2.81`, `5.40` against `--card` (white), stepping `1.12 / 1.29 / 1.70 / 1.92` from each level to the next. The dark ramp was re-picked against dark `--card` rather than inverted: `1.13`, `1.32`, `2.22`, `4.01`, `8.10` against the card, stepping `1.17 / 1.68 / 1.81 / 2.02`. Same shape of progression, so a busy week reads as busy in both themes.
- `--activity-future`: `1.303:1` against white in light, `1.312:1` against dark `--card` in dark. Dark `--border` would have reached only `1.10:1` there, and the dashed not-yet-happened cells would have read as absent rather than pending.
- `--node-stroke`: **light retuned.** The mock's literal value `#98a2b3` measured `2.575:1` against `--card`, `2.422:1` against `--bg` and `2.213:1` against `--canvas` - below the WCAG 1.4.11 non-text 3:1 guideline on every light surface. It was carried unchanged for a while on the grounds that the mock's hex is adopted as-is, but this token is the entire outline of a `measured-run` node and of every SOP node: failing 3:1 means those marks have no reliable edge, which is a legibility bug rather than a stylistic preference. Light is now `#8690a2`, which measures `3.219:1` against `--card` (the graph canvas's own surface, and the only one node line-art is drawn on) and `3.027:1` against `--bg`, clearing the floor on both. Against `--canvas` it reaches `2.766:1` and still would not clear; recorded rather than papered over, since nothing draws node line-art on `--canvas` and going dark enough to clear it (`#7e8899` or below) starts making a 1.2px hairline read with the weight of body text. Dark is deliberately **unchanged** at `#98a2b3` - same reasoning already documented above for `--explore` ("already legible on dark surfaces, unchanged"), measuring `6.879:1` against dark `--card` and `7.69:1` against dark `--bg`. The two modes now hold different values because they had different problems, not because one was mechanically inverted.
- `--action`: light `#343434` holds white text at `12.45:1` (AA). Dark cannot mechanically invert toward white the way `--blue` does, because this token must carry white button/badge text at AA in **both** modes - a near-white dark value could never do that. `#65666c` was picked instead: white text on it measures `5.72:1` (AA), and the fill itself clears the WCAG 1.4.11 3:1 non-text guideline against dark `--bg` (`3.46:1`), dark `--card` (`3.10:1`), and dark `--canvas` (`3.32:1`), so the button still visibly separates from the dark chrome instead of nearly vanishing the way the literal light-mode `#343434` would on a near-black page.

A dev-only `/_tokens` route (`app/%5Ftokens/page.tsx` - the URL-encoded form of `app/_tokens`, since Next.js treats a literal `_tokens` folder as private/non-routable) renders every token above, light and dark side by side via a locally-scoped `.dark` wrapper, plus the type specimen below. It is unlinked from `NAV_SECTIONS` (same "real route, not in the nav" pattern as `/decide`) and carries an explicit "not a product surface" banner.

### `#343434` vs `--blue`/`--accent`/`--primary`: two tokens, not one, for now

The redesign's primary action color (`#343434`) was adopted as its own new token, `--action`, rather than changing the value of `--blue`/`--accent`/`--primary` (which stays `oklch(0.205 0 0)` = `#171717`). Retuning `--blue` would have visibly lightened every primary button and active-nav state on every page still on the old IA, mid-migration. `--action` and `--blue` are two names for "the app's dark neutral action color" that happen to disagree slightly right now by design; once the old IA is fully retired onto the new workspace, they should converge onto one value - tracked as follow-up, not done in this pass.

### `#b45309` rejected; `--amber` unchanged

The redesign mock's warning color (`#b45309`, Tailwind's `amber-700`) was **not** adopted. The repo's existing `--amber` (`#9a5b00`) is kept as-is - it is already AA-verified (5.4:1 light, 7.9:1 dark, see the color-roles table above) and introducing a second, unverified warning hue would fragment the status-color system for no real gain. Every warning surface in the campaign workspace (the "Needs your call" banner, failed-run graph strokes, etc.) routes through the existing `--amber`/`--amber-soft`, not a new token.

### `#3b5b8c` rejected as a hue; SOP stays achromatic

The redesign mock colors SOP governance edges and citations with `#3b5b8c`, a genuine blue hue. That conflicts with the achromatic-chrome rule from the 2026-07-16 neutral migration (see "Color roles" above): chrome stays achromatic, only `--chart-1`...`--chart-5` and the heat-scale ramp are allowed to carry color. `#3b5b8c` was rejected as a hue rather than added as an exception. SOP elements (SOP nodes, SOP governance edges, SOP citation cards) are distinguished from ordinary chrome by **shape and weight, not color**: the achromatic `--node-stroke` value plus a dashed stroke (`stroke-dasharray`) and a heavier stroke weight where the mock used a distinct color. This keeps the "only data-viz keeps color" rule intact instead of quietly amending it for one feature.

## Fonts: Newsreader and IBM Plex Mono

Two fonts were added for the campaign-workspace redesign, both self-hosted via `next/font/google` in `app/layout.tsx`:

- **Newsreader** (weights 400/500/600, `opsz` axis requested to match the design's own Google Fonts import `opsz,wght@6..72`) - reading copy: verdict headlines, answers, graph captions, "what this taught" prose. Exposed as `--font-serif` (Tailwind utility `font-serif`).
- **IBM Plex Mono** (weights 400/500/600) - data, IDs, filenames, axis and node labels. Exposed as `--font-plex-mono` (Tailwind utility `font-plex-mono`).

Both are loaded via `next/font/google`, not `next/font/local`, even though the "Fonts, one more time" rule below says "do not download font files from unverified sources" and Satoshi/JetBrains Mono otherwise set the precedent of self-hosting. This is not an exception to that rule: `next/font/google` already downloads the font files and CSS **at build time** and self-hosts them from the app's own origin - the browser makes zero requests to Google, exactly like the existing JetBrains Mono line in `app/layout.tsx`. It satisfies "self-host" without needing anyone to go source `.woff2` files from a third party and vendor them (plus a license file) into `app/fonts/` by hand, which is what would otherwise be required to add two more typefaces from scratch. See the comment above the `newsreader`/`ibmPlexMono` declarations in `app/layout.tsx` for the same explanation in-line, so a future reader does not "fix" this back to a local-font download.

**`--font-mono` stays JetBrains Mono, not IBM Plex Mono.** There are 100+ existing `font-mono` call sites across the app (tables, KPI values, chart axes). Repointing `--font-mono` at IBM Plex Mono would have silently reflowed every one of those pages mid-migration. IBM Plex Mono instead lands as its own token, `--font-plex-mono`, so new campaign-workspace surfaces opt into it explicitly while the rest of the app keeps rendering JetBrains Mono unchanged. Once the old IA is retired and every surface has migrated to the new design, `--font-mono` can be repointed at IBM Plex Mono and `--font-plex-mono` retired - not done here.

## Dark mode

Dark mode is a `.dark` class on `<html>`, not a `prefers-color-scheme` media
query - so it can be toggled independently of the OS setting and persisted.

- **Toggle**: `components/theme-toggle.tsx`, mounted in
  `components/app-shell.tsx` (sidebar header on desktop, top bar on mobile).
  Reads/writes the `dark` class via `useSyncExternalStore` (a `MutationObserver`
  on `<html>`'s `class` attribute is the subscription), and persists the
  choice to `localStorage` under the `theme` key.
- **No flash of the wrong theme**: `app/layout.tsx` renders an inline
  `<script>` in `<head>` that runs synchronously while the browser parses the
  page, before hydration - it reads `localStorage.theme`, falls back to
  `prefers-color-scheme` if unset, and adds the `dark` class immediately if
  needed. `<html>` carries `suppressHydrationWarning` since this script
  intentionally changes its class before React hydrates (the documented
  pattern in
  `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`).
- **Every existing token flips**: `--bg`, `--card`, `--fg`, `--muted`,
  `--border`, the whole `--blue-*` family, `--explore-deep`/`--explore-soft`,
  `--green`/`--amber`/`--red` (+ their `-soft` variants), and `--grid` all get
  a `.dark` override in `app/globals.css` with a genuinely different value
  (not just inverted lightness) - dark-mode status colors and `--blue-deep`
  in particular were re-picked, not mechanically darkened/lightened, because
  a color designed to read as "a dark accent on a light surface" does not
  automatically read as anything on a dark surface. `--accent`/`--primary`
  and the rest of the pure aliases are not re-declared in `.dark` at all -
  since CSS custom properties resolve `var()` against the cascade at the
  point of use, an alias defined once in `:root` (e.g. `--primary: var(--blue)`)
  automatically follows `--blue`'s `.dark` value with no duplicate rule
  needed.
- **Voyager blue-accent AA tuning pass** (`app/voyager/voyager.css`): the
  Voyager surface aliased its accent *text* onto `--v-blue-7` (`= --blue-hover`),
  which flips to `#204af4` in dark mode and read only 2.46-2.93:1 as text on the
  tint/card/bg surfaces - failing AA - everywhere it was used for text (phase
  labels, chip/badge/pill labels, advisory text, the "Live · engine" pill).
  Mirroring the main app's `--accent-text` split, `--v-blue-7` is now a FILL
  alias only (the `.v-btn-primary:hover` background, which must hold white text)
  and a separate `--v-blue-7-text: var(--accent-text)` carries every text usage.
  In light mode both still resolve to `--blue-hover`, so the light theme is
  unchanged; in dark mode the text alias is `#6f93ff` and clears 5.36-6.39:1 on
  every surface it lands on (verified against the live rendered cascade, not
  eyeballed).
- **Explore badge** (`.dcb--explore`): its ink (`--v-explore-badge-ink`) was
  `--blue-hover` on a `--blue-border` (`#33406e`) background, only 1.59:1 in dark
  mode; even swapping to `--accent-text` reached just 3.47:1. The ink is now
  `--blue-deep` (dark `#8fb0ff`, the system's designated "emphasis blue text on
  dark"), which clears 4.68:1 while keeping the `--blue-border` badge visibly
  distinct (1.73:1) from its `--blue-soft` explore row - a darker `--blue-tint`
  badge would have hit 5.36:1 text but nearly vanished into that row (1.12:1).
  Light mode improves to 9.78:1 (from 6.33:1), no regression.
- **Not yet covered**: the remaining Voyager-only status tones defined directly
  in `app/voyager/voyager.css` (`--v-warn-*`/`--v-bad-*` banner tones, the
  green exploit badge and the amber/orange decision-card promote/hold/retire
  colors) and `--v-muted`/`--v-faint` do not have `.dark` overrides yet - they
  still render their light-mode values on dark surfaces (all currently
  >= 4.5:1, so legible, just visually untuned). They live in a separate
  stylesheet outside this pass's AA scope; flagged here as follow-up rather than
  silently left inconsistent.

## shadcn semantic tokens

`app/globals.css` defines the full shadcn-standard token set - `--background`,
`--foreground`, `--card-foreground`, `--popover`, `--popover-foreground`,
`--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`,
`--muted-foreground`, `--destructive`, `--destructive-foreground`, `--input`,
`--ring`, `--radius`, `--chart-1`...`--chart-5` - each wired into
`@theme inline` as `--color-*` so the matching Tailwind utilities exist
(`bg-primary`, `text-muted-foreground`, `bg-chart-3`, ...). Nothing in the app
uses these yet; they exist for future shadcn-convention components to land on
a kalos-branded theme instead of shadcn's neutral default. `--primary`,
`--ring`, `--destructive`, `--input`, `--popover`, `--foreground`, etc. are
aliases onto the existing kalos tokens above (blue, red, border, card, fg),
so there is exactly one source of truth per color and dark mode only has to
be taught once.

`--chart-1`...`--chart-5` are a CVD-safe single-hue blue ramp, anchored on the
same three colors as the dashboard heat scale
(`components/dashboard/heat-scale.ts`: `--blue-tint` -> `--blue` ->
`--blue-deep`) so any chart built against the shadcn convention reads as part
of the same visual system as the existing heatmaps. The dark-mode ramp is a
separate, independently-verified set of 5 values (not a CSS filter on the
light set), shifted overall lighter so it still reads against dark surfaces.

**One deliberate naming exception**: stock shadcn defines `--accent` as a
neutral hover-gray and `--muted` as a neutral surface color, with
`--muted-foreground` as the (separate) muted text color. This app already
uses `--accent` for the brand blue and `--muted` for gray text
(`bg-accent`/`text-accent`/`bg-muted`/`text-muted` are used across dozens of
existing components: primary buttons, active nav state, KPI heroes, status
chip dots). Because CSS custom properties are single-valued per scope, there
is no way to have `--accent` mean both "blue" and "neutral gray" at once - one
identifier, one value. Redefining `--accent`/`--muted` to stock shadcn
semantics would silently turn every primary button and active nav item gray,
which contradicts "keep the kalos identity." So this app keeps `--accent` =
blue and `--muted` = gray text (unchanged), adds `--muted-foreground` as an
alias of the existing `--muted` value (so `text-muted-foreground` behaves
identically to today's `text-muted`), and does not introduce a second,
differently-valued `--accent` surface color. A future shadcn-generated
component that wants the stock neutral hover-gray should reach for
`--secondary`/`--secondary-foreground` instead, which are wired with no
naming collision.

## Shadows

The kalos UI has no shadows anywhere - flat surfaces, separated by borders
and background contrast, not elevation. `app/globals.css` has a
belt-and-suspenders rule enforcing this at the very bottom of the cascade:

```css
*, *::before, *::after {
  box-shadow: none !important;
}
```

No component uses a `shadow-*`/`drop-shadow-*` utility class. The one
prior instance (`components/vessels/vessel-table.tsx`, a `shadow-[inset_...]`
hack used to draw a colored left-accent bar on the selected vessel row) was
replaced with a real `border-l-[3px]` (transparent when unselected, blue
when selected) so there is no `box-shadow` anywhere left to `!important` over.

## Gradients

Decorative background gradients are not used in this app. The two
`linear-gradient(...)`/`repeating-linear-gradient(...)` values that do exist
are intentionally kept - they are data encodings, not chrome:

- `components/dashboard/heat-scale.ts`'s `SEQ_GRADIENT_CSS` - the colorbar
  background for the blue sequential heat ramp (run landscape, response
  surface, correlation heatmap legends). This gradient *is* the visualization
  of the `--blue-tint -> --blue -> --blue-deep` scale, not decoration on top
  of it.
- `components/plate/well-status-legend.tsx`'s repeating hatch pattern - the
  legend swatch for the "no data" well category (a real category in the
  plate data model, just not present in the current simulated run per its
  own caption). It is a standard cartographic convention for "missing data,"
  not decorative chrome.

## Text alignment

All text centers by default (`body { text-align: center; }` in
`app/globals.css`), including table cells, headings, KPI values, and button
labels. The `text-left`/`text-right` utility overrides that used to pin
specific labels (table headers, right-aligned numeric columns, tornado-chart
category labels, key/value stat rows) were removed so nothing fights the
default. Flex/grid layouts that position an item on one side of its
container via `justify-end`/`grid-cols-[...]` (e.g. the correlation heatmap's
row labels, the driver tornado's category column) keep that positioning -
only the `text-align` of the label itself changed, not where the container
places it. This is a broad, deliberately-applied visual change; some data
columns (long right-aligned number stacks, in particular) may read worse
centered than they did right-aligned, and may get selectively reverted after
a visual pass.

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

Do not download font files from unverified sources. Satoshi is self-hosted
app-wide as of the 2026-07-24 consolidation: both `app/layout.tsx` (optimizer
surface, `--font-satoshi`) and `app/voyager/layout.tsx` (`--font-voyager`)
load the same licensed variable font
(`app/fonts/Satoshi-Variable.woff2`, Fontshare Font License) via
`next/font/local`, so there is exactly one font file and one license on disk
for both surfaces.

Newsreader and IBM Plex Mono (added for the campaign-workspace redesign) are
self-hosted a different way: via `next/font/google` rather than
`next/font/local`. This is not an exception to "do not download font files
from unverified sources" - `next/font/google` performs that download itself,
at build time, from Google's own hosting, and serves the result from the
app's own origin with zero runtime requests to Google. It reaches the same
self-hosted end state as the Satoshi/JetBrains Mono `.woff2` files without
requiring anyone to manually source and vendor two more font files (and their
licenses) into `app/fonts/`. See "Campaign-workspace foundation tokens"
above for the full reasoning, and the comment above the `newsreader` /
`ibmPlexMono` declarations in `app/layout.tsx`.
