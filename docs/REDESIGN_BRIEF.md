# kalos-web redesign brief

This is the single source of truth for every agent working on the kalos-web redesign.
Read it fully before writing code.
Owner decisions are final; do not relitigate them.

## Owner decisions

- Rebuild the whole UI: design system, app shell, navigation, every page.
  Keep the product logic: `lib/api.ts` (engine client, honesty helpers), the engine proxy `app/api/engine/[...path]/route.ts`, `lib/workbench.ts`, `lib/scaleup-projection.ts`, `lib/scale-readout.ts`, `lib/validation.ts`, `lib/projects-store.ts`, the mocks in `lib/mock/*`, demo data modules, and every logic test in `__tests__/`.
  You may extend these, never weaken them.
- Fully new visual identity: the old blue + Satoshi brand rule is retired.
- Feel: calm, editorial, light-first (dark mode still fully supported).
  Generous whitespace, few boxes, hairline rules, big clear numbers, plain-language verdicts first, method details one click down.
- Typeface: Geist (UI and text) + Geist Mono (code-like values only), self-hosted via `next/font/local`.
  Verified files (SIL OFL 1.1, byte-identical to vercel/geist-font tag v1.7.2) are in `/private/tmp/claude-501/-Users-brendandang-GitHub-kalos-lab-removal/c00a4900-dc65-48eb-8dd4-50901a460935/scratchpad/dl-geist-v1.7.2/`: `Geist[wght].woff2` (blob 71dab8be), `GeistMono[wght].woff2` (blob 0e746fc1), `LICENSE.txt`.
  Ship them as `app/fonts/Geist-Variable.woff2`, `app/fonts/GeistMono-Variable.woff2`, `app/fonts/GEIST-LICENSE.txt` (rename only, do not modify bytes).
  Weight range `100 900`. Geist has true tabular figures (`tnum`): use Geist + `tabular-nums` for numbers, not mono.
  Remove Satoshi and JetBrains Mono files, licenses, and their `next/font` calls. Keep `__tests__/self-hosted-fonts.test.ts` passing (no `next/font/google`, ever).
- The Live workbench (from PR #42, already merged into this branch: `components/workbench/*`, `lib/workbench.ts`, `lib/mock/campaign.ts`) is folded into the redesign: reuse its campaign logic and tests for run tracking.
  Its format (explorer, tabs, status bar) becomes the app-wide shell (owner decision, see Information architecture).
  Restyle it with the new tokens and the no-tells rules: drop the mono-everything text, the uppercase micro-labels and the saturated accent-filled status bar.
- Goal: reduce decision fatigue.
- No new runtime dependencies. Base UI 1.7 (`@base-ui/react`) already has Dialog, Autocomplete, Combobox, Tabs, Tooltip, Popover, Menu: use them. Ask (via your final report) before proposing any dependency.

## Information architecture

App shell: the workbench format everywhere (owner decision; it supersedes the sidebar + top-header spec).
- **Activity rail** (about 48px, full height): the Kalos mark at the top, then 4 section icons: `Campaign` (/), `Data` (/data), `Library` (/library), `Projects` (/projects). `Settings` (/settings) and the workspace menu are pinned at the bottom. Labels show as tooltips and accessible names. Mark the active section with more than color (a filled background plus `aria-current`).
- **Explorer** (about 240px, collapsible): a tree specific to each section, with the section title and a ⌘K search trigger in its header row.
  - Campaign: Stages (Setup, Plan, Run, Record, Learn, each with done / current / upcoming state; this replaces the separate StageStepper), then In flight, Measured and Rounds from `lib/workbench.ts`.
  - Data: datasets.
  - Library: Vessels, Plate analysis, Scale-up readout, Simulator.
  - Projects: the project list.
  - Settings has no explorer.
  The collapsed state is a per-viewer convenience in localStorage, wrapped in try/catch so the shell renders fine without it.
  Keyboard: the tree follows the ARIA tree pattern (arrows, Home/End, Enter), as the current Explorer already does.
- **Editor area**: a tab strip, then a breadcrumb row, then the page.
  - Every tab is a route, so deep links, reload and Back all work.
  - Opening a route from the explorer or ⌘K focuses its tab or adds one.
  - Tabs are closable, except that Campaign Overview is pinned and the active route always has a tab.
  - The open-tab list is a per-viewer convenience in sessionStorage (try/catch), capped at about 8 by dropping the least recently used.
  - Page padding is 24px on desktop and 16px on mobile, with the max-width rules below.
- **Status bar** (about 28px, full width at the bottom), always present. Left side: engine connection, target, round, in flight, measured, best so far. Use a calm neutral surface with a hairline top border. Staleness ("batch out of date") is a small warn badge. Right side: one text action for the next step (for example "Record results").
- The workspace menu shows no fake identity: no names, emails or avatars. It holds Theme (light / dark / system), Settings and Keyboard shortcuts.
- Mobile (<768px):
  - The rail becomes a top bar with a menu button, and the explorer opens as an off-canvas sheet.
  - The tab strip scrolls horizontally inside itself.
  - The status bar shows the 3 most important items.
  - No horizontal page scroll at 390px.

The engine runs ONE live campaign. The home page is that campaign's workspace, not a list of campaigns.

| Route | What it is |
| --- | --- |
| `/` | Campaign overview: header (target, direction, round), one **Next** card, then the owner's Overview spec: 4 KPI cards, one line chart, one bar chart (see "Overview" below). |
| `/settings` | Appearance (theme), engine connection (reachable or not, checked through the proxy), and Optional integrations (the provider status that used to sit on Validate), in user language. |
| `/campaign/setup` | Setup: upload a run sheet, data-quality check, choose the target. Replaces `/analyze` and `/validate`. |
| `/campaign/plan` | Plan (round N): review and start the proposed batch. Replaces `/decide`'s batch. |
| `/campaign/run` | Run: runs in flight (from the workbench logic). |
| `/campaign/record` | Record: log measured results, correct them before re-analysis. |
| `/campaign/learn` | Learn: verdict, best-so-far, did results land in predicted bands, drivers, model detail. Replaces `/results` and `/decide`'s diagnostics; the re-propose action lives here ("Plan round N+1"). |
| `/data` | Data registry (datasets and runs, demo data). |
| `/library` | Index of tools: Vessels, Plate analysis, Scale-up readout, Simulator, Client projects. |
| `/library/vessels`, `/library/plate`, `/library/scale-up`, `/library/simulator` | The existing tools, restyled. |
| `/projects/*` | Client-facing projects surface (illustrative seed data), rebuilt on the shared components, reachable from Library and ⌘K. |

Redirects (permanent, in `next.config.ts`; keep the existing `/voyager` ones): `/decide`→`/campaign/plan`, `/results`→`/campaign/learn`, `/analyze`→`/campaign/setup`, `/validate`→`/campaign/setup`, `/optimize`→`/campaign/plan`, `/experiments`→`/`, `/planning`→`/`, `/scale-readout`→`/library/scale-up`, `/vessels`→`/library/vessels`, `/plate`→`/library/plate`, `/simulate`→`/library/simulator`.

Removed (mock-only, not backed by the engine): the Kanban planning Board, its Table sub-view and Gantt stub (`components/planning/*`, `lib/planning-board.ts`, `lib/mock/planning.ts` and their tests only if nothing else uses them). Delete dead code your change orphans; mention anything else you find dead.

## Stage rules (decision budget)

Each stage page: one primary action (a verb + object, e.g. "Start 5 runs", "Record 2 results", "Plan round 2"), at most 3 items needing attention, everything else a visible default.
Per round the scientist should make about three judgement calls: approve the batch (with exceptions), enter results, continue.

- **Overview (owner spec, adapted)**: below the Next card, exactly 4 KPI cards, each a single metric + a delta: Best titer (measured best-so-far; delta vs the previous round's best from `campaign.history`), Model reliability (held-out rank correlation with its plain verdict; delta only if a previous value is actually available, otherwise show the CI as the qualifier, never invent a delta), Runs in flight (count; qualifier "N measured this round"), Round (number; qualifier "N runs in the dataset"). Then one line chart: best-so-far by round (the engine has rounds, not a 30-day time series; do not fabricate dates). Then one bar chart: top process drivers (signed correlation, CI shown, significant vs not marked with text, not color alone). Charts: muted grid lines, ONE accent color for single-series marks, no 3D, no gradients beyond a light area fill, axis titles with units.
- **Runs table (owner's table spec, adapted from "users table")**: on `/campaign/run` (and the same pattern for the Data registry): columns Run (short id), Recipe (top drivers inline, full recipe on expand or in a row detail), Predicted (± band), Measured, Status (badge with word: Awaiting / Measured), Actions (e.g. "Record result" link to Record). Sortable headers (aria-sort), row hover, pagination footer (page size 10, "1-10 of N", prev/next), built with the shadcn Table in `components/ui/table.tsx`. No avatars or initials needed (runs have no people). Mobile: the table scrolls horizontally inside its container; never stack columns into cards.
- **Home**: the Next card is computed from campaign state (no analysis → "Upload a run sheet"; analysis but no runs started → "Review and start round N"; runs awaiting results → "Record N results"; all measured → "Learn from round N"). It must name the one action and link to its stage.
  The Explorer's Stages group shows Setup / Plan / Run / Record / Learn for the current round with state done / current / upcoming, derived from the same state. Never mark a stage done silently.
  "Since you left" is NOT available (the engine has no activity log): do not fake it.
- **Setup**: drop zone + target picker (the engine re-fits on target change, existing `runFile(file, target)`), then the validation verdict (pass / warnings / fail) with at most 3 findings shown and the rest behind "Show all N findings". Unit conversions listed plainly. Provider credential status moves to a small "Optional integrations" disclosure written in user language (no env var names in visible copy; they may appear in a details panel labelled for administrators).
- **Plan**: the batch starts accepted. Show recipes as rows (all setpoints via `proposalRecipe`, drivers first, others in a secondary line or expandable row), each with predicted value ± the conformal band and an Explore/Exploit label.
  Order: recipes predicted to beat the current best first (by predicted value), then exploration recipes. Do not reorder silently: say "sorted by predicted value".
  Flag at most 3 exceptions, computed honestly from fields we have (predicted below 0 for a non-negative target, band wider than the predicted gain, a recipe the engine marks low feasibility via `p_feasible`). The scientist can untick any recipe; primary action "Start N runs".
  The engine cannot re-score an edited recipe: do NOT offer setpoint editing.
- **Run**: runs in flight from `getCampaign()` (workbench logic), each with its full recipe and predicted value. Read-only. Primary action: "Record results" (go to Record).
- **Record**: one input per awaiting run, with the target's unit, a sanity check that asks to confirm values that are negative or more than 5x the current best, and the ability to correct a logged value until re-analysis (the engine overwrites on re-log). Partial recording is fine. Primary action "Save N results"; then "Learn from round N" once at least one result is in.
- **Learn**: verdict first (one sentence), then: best-so-far (measured, from the campaign, never predicted) with the trajectory chart; a calibration line "k of n measured runs landed inside their predicted band (90%)" computed from campaign runs (`result` vs `pred` ± the analysis conformal band) with a unit test; drivers as a ranked bar list with CIs ("higher X went with higher titer in these runs", association not cause); predicted-vs-measured; the run landscape and correlation heatmap behind disclosures. Primary action "Plan round N+1" (calls `reanalyze()`).
  Scale-up readout is linked from here ("Predict at a larger scale").

## Consistency and honesty rules (from the UX audit; all must hold)

1. One reliability verdict app-wide, from one function. Plain states: "Reliable", "Not yet reliable", "Not enough data". If the CI lower bound is below the floor, never say "clears". Promotion gates are a separate line: "Not cleared to promote: <plain reason>. <one fix>." `ReliabilityVerdict`'s incumbent must match `/campaign/plan` (use `proposalIncumbent`).
2. One uncertainty number per recipe: the conformal band, with its coverage (e.g. "± 0.31 (90% band)"). Never show two ± values for the same recipe. The GP std may appear only inside a method-details disclosure, labelled as such.
3. No developer or engine vocabulary in visible copy: no env var names, function names, `feasibility_auc`, `benjamini_hochberg`, `abs_rho`, `ece`, `brier`, "SLOT", "isReliable()". Translate; raw names may appear only in a "Method details" disclosure with human labels next to them.
4. Never CSS-uppercase identifiers or units (`pH`, `titer_g_L`, `osmolality_mOsm`). Show column names exactly as in the sheet.
5. One number format per quantity across pages (target values: 2 decimals; correlations: 2; percentages: integer). Put it in one helper.
6. Charts: no clipped axis labels or ticks, axis titles with units, readable in dark mode (sequential ramps must keep the highest values the most visible on both backgrounds), heatmap cells never spill text (hide numbers below a cell size, show them in the tooltip).
7. AA contrast (4.5:1 small text, 3:1 large text and UI) in both themes for every text token, verified by a script. No opacity dimming of text. Never color alone: pair with an icon or word.
8. Demo/illustrative content keeps a visible "Example data" label. Never present projections as measurements.
9. Mobile 390px: no horizontal scroll anywhere; tables scroll inside their container or reflow.

## Visual system

Tokens live only in `app/globals.css` (`:root` + `.dark`, exposed via Tailwind v4 `@theme inline`). Use OKLCH. Starting values below; adjust lightness until the contrast script passes, keep hues.

- Neutrals (warm paper, ink text): `--bg` oklch(0.985 0.003 90) · `--surface` oklch(1 0 0) · `--subtle` oklch(0.965 0.004 90) · `--border` oklch(0.91 0.005 90) · `--border-strong` oklch(0.84 0.006 90) · `--fg` oklch(0.22 0.01 270) · `--fg-muted` oklch(0.46 0.01 270) (must pass 4.5:1 on `--bg`).
- Accent (new identity, indigo-violet; used for the primary action, links, focus, the model's proposal): `--accent` oklch(0.48 0.16 285) · `--accent-hover` oklch(0.43 0.16 285) · `--accent-soft` oklch(0.95 0.03 285) · `--accent-fg` white.
- Status (state only, never chart series): good oklch(0.50 0.12 150) / soft oklch(0.95 0.04 150); warn oklch(0.52 0.12 70) / soft oklch(0.96 0.05 85); bad oklch(0.52 0.17 25) / soft oklch(0.96 0.03 25).
- Dark: `--bg` oklch(0.17 0.006 270), `--surface` oklch(0.20 0.006 270), `--border` oklch(0.30 0.008 270), `--fg` oklch(0.95 0.005 90), `--fg-muted` oklch(0.72 0.01 270), accent oklch(0.72 0.13 285), statuses lightened to pass.
- Data viz: `--chart-1..6` categorical (Okabe-Ito order, adjusted for both themes), a sequential ramp from the accent hue that reverses lightness in dark, plus `--chart-band` (uncertainty fill), `--chart-reference` (best-so-far / baseline lines, dashed), `--chart-predicted` (accent), `--chart-measured` (ink).
- Type scale (role tokens in `@theme`, no more arbitrary `text-[Npx]`): display 32/38 600 · title 22/28 600 · heading 16/24 600 · body 14/22 400 · label 13/18 500 · caption 12/16 400 · metric 36/40 600 tabular. Geist Mono 13 for code-like values only.
- Layout: 8px grid; content max width 1120px by default, full width allowed for tables and charts; radius 8px controls, 12px panels; no shadows except popovers/dialogs; prefer whitespace and hairline rules over cards.
- No coloured side-stripe borders (owner rule): never `border-l-*`/`border-r-*` accents on callouts, verdicts, alerts or cards. Callout and Verdict carry tone with a small status icon and a tinted or neutral surface with an even hairline border or none. A guard test fails the build on `border-l-[2-9]`, `border-l-[Npx]` and the `border-r` equivalents in `app/` and `components/`.
- No "vibe-coded" tells (owner: the current amber boxes "look sloppy"):
  - No full-width tinted warning slabs for information that is not a problem; "this batch is exploration" is a plain sentence with a small status badge, not a warning box. Warn and bad surfaces are only for things the user must act on.
  - At most one callout per screen; merge stacked caveats into one Verdict sentence, with the rest behind a Disclosure.
  - Text hierarchy comes from the type role tokens and `--fg-muted`, never from `opacity-*` on text.
  - Never show raw engine strings in prose (`GATES FAILED: ...`, `passed=false means ...`, `auc=0.625 < 0.65`); say it in plain words and keep the raw values in a Disclosure.
  - Don't uppercase identifiers (`TEMPERATURE_C`); show feature names as the engine gives them, in sentence-case labels.
  - Mono only for code-like values, not for sentences such as "predicts -0.10 ± 0.31".
  - Radius 8px controls, 12px panels; no `rounded-2xl` boxes, and no pill badges unless they are status.

## Shared components (foundation owns these; page agents use, not edit)

Stack decision (owner): shadcn/ui on Base UI stays for the shell, table, dialogs, menus, tabs and tooltips. **Tremor** is used for charts and KPI visuals only: copy the needed components from github.com/tremorlabs/tremor (Apache-2.0) into `components/tremor/` (e.g. AreaChart/LineChart, BarChart, BarList, SparkChart, CategoryBar, ProgressCircle, Tracker), adapted to the recharts v3 already installed, to our tokens (no Tremor color names hard-coded; map to `--chart-*` / accent), and to Base UI Tooltip where Tremor uses Radix. Keep each file's attribution header ("Adapted from Tremor, https://github.com/tremorlabs/tremor, Apache-2.0") and add `components/tremor/NOTICE` with the Apache-2.0 notice. No new dependencies: if a Tremor component needs one (Radix, tailwind-variants, @remixicon/react), rewrite that part with what we have (Base UI, cva/tailwind-merge, lucide-react).

In `components/ui/` (restyle the existing shadcn/Base UI primitives), `components/kit/` (new) and `components/tremor/` (charts/KPI visuals):
AppShell (ActivityRail + Explorer + EditorTabs with breadcrumb + padded page + StatusBar, built from `components/workbench/*`) + mobile top bar and Explorer sheet, CommandPalette (Base UI Autocomplete in Dialog; navigate to every page/stage + actions like "Upload a run sheet", "Record results", "Toggle theme"), PageHeader (title, one-sentence description, one primary action slot), NextCard, Verdict (tone + sentence + optional detail disclosure), KpiCard (single metric, unit, label, delta with direction word and sign, or a qualifier when no honest delta exists; built on Tremor's card/metric look), Metric (inline value, unit, label, qualifier e.g. CI), Badge with tones (neutral, accent, good, warn, bad) and one ModeBadge (Exploit = accent, Explore = neutral outline, same everywhere), Callout (tone, icon, title, body, action), Section (title, description, actions, body), Panel (bordered region when needed), ChartFrame (title, unit, n, method tooltip, states: loading, empty, error, insufficient evidence), IntervalBar (pred ± band against a reference line, labelled), table styles (right-aligned numerics with tabular-nums, 40px rows, sticky header), Disclosure (lazy-mounted details), EmptyState / ErrorState / LoadingSkeleton (restyle `components/ui/honest-state.tsx`, resolve loading before empty), one `useLatest()` and one `useCampaign()` hook replacing the 5 copies of fetch + refresh + cancel logic, and a single number formatting helper.

## Engine contract (do not invent capabilities)

Use only what `lib/api.ts` already calls: `GET /api/latest`, `POST /api/run`, `GET /api/campaign`, `POST /api/campaign/start`, `POST /api/campaign/result` (re-logging overwrites until re-analysis), `POST /api/campaign/reanalyze`, `POST /api/scale/readout`, `GET /api/single`, `GET /api/multi`, `GET /api/providers`.
Not available, so no UI for it: multiple campaigns, campaign goal/factor ranges/constraints, editing or re-scoring a recipe, P(beat best), failure reasons for runs, activity history, users/roles.

## Engineering rules

- Next.js 16: read `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before writing code. Server Components where they fit; client components where state or browser APIs need them.
- TypeScript strict, no `any`. Match the repo's comment density: comment only the why.
- Never use the em dash character anywhere (code, copy, docs). Use a plain hyphen.
- Tests: logic tests in `__tests__/` (vitest, node env). New non-trivial logic (state derivation, sorting, flags, calibration, formatting) gets a small test.
- Gates before you report done: `npm run lint`, `npm run test`, `npm run build` all green.
- Visual check before you report done: run a real engine and the app (instructions below), screenshot your pages at 1440x900 and 390x844 in light and dark with gstack's headless browser `~/.claude/skills/gstack/browse/dist/browse` (`$B goto`, `$B viewport`, `$B screenshot`, `$B js`; theme via `localStorage.setItem('theme','dark')` + reload). Look at every screenshot; fix what looks off. Do not use claude-in-chrome tools.
- Running the stack (use only YOUR assigned ports; other sessions use others):
  engine: `cd /private/tmp/claude-501/-Users-brendandang-GitHub-kalos-lab-removal/c00a4900-dc65-48eb-8dd4-50901a460935/scratchpad/engine-main && KALOS_STATE_DIR=<your scratch>/engine-state KALOS_PORT=<engine port> PYTHONPATH=. /Users/brendandang/GitHub/kalos/.venv/bin/python -m kalos.portal` (background). Seed: `curl -F file=@examples/synthetic_bioprocess/synthetic_bioprocess.csv http://127.0.0.1:<engine port>/api/run`. Drive a round with `/api/campaign/start`, `/api/campaign/result`, `/api/campaign/reanalyze` (see `docs/CAMPAIGN_LOOP.md` in that repo).
  web: `NEXT_PUBLIC_DEMO_MODE=true npm run build` then `KALOS_ENGINE_URL=http://127.0.0.1:<engine port> npx next start -p <web port>` (background).
  Kill only the processes you started when done. Never name a shell variable `path` (zsh). Do not run `rm -rf` on anything outside your own scratch folder.
- Git: commit on your branch with small conventional commits, no co-author lines, no pushes. Do not touch other branches or the main checkout at `/Users/brendandang/GitHub/kalos-web`.
