# Kalos web

The production front end for [Kalos](https://github.com/itsbrendandang/kalos) - a
Bayesian-optimization platform for bioprocess development. Next.js 16 + Tailwind v4,
on a single unified blue design system, consuming the Kalos engine API.

## Views

- **Scale-up readout** (`/scale-readout`, also the home route: `/` redirects
  here) - upload your own multi-scale run data and a target scale, and the
  engine returns a data-backed readout for that scale, or refuses when the
  data cannot support a prediction.
- **Results** (`/results`) - your last analyzed dataset at a glance: model
  reliability (honest held-out rank correlation + 95% CI), what drives the
  outcome, predicted-vs-measured, a run landscape (a low-dimensional
  projection of every run, positioned by recipe similarity and colored by
  target - only shown when the engine returns an `embedding`), a histogram of
  measured target values with non-producers called out, and Recommended
  actions - the optimizer's next-best experiments, ranked by the acquisition
  function (`#next-experiments`; this is where the old standalone Optimize
  page folded in). A transposed or ambiguous sheet (the engine's orientation
  pre-pass) is disclosed at the top, and on the upload result in `/analyze`.
  Reads `GET /api/latest`; shows an upload prompt until you
  analyze a dataset (it is not a demo).
- **Decide** (`/decide`) - the decision cockpit and the closed optimization loop.
  The recommended batch is the hero (each experiment's recipe, predicted value +
  uncertainty, and why); the trust verdict is a compact chip that turns green
  only when the ranking is reliable AND the engine's fail-closed promotion gate
  passed, and otherwise names the first reason it is not trusted. Queue
  proposals and Start them, log each run's measured outcome, then Re-propose -
  which folds the results into the dataset and returns the next batch, with a
  best-so-far progress chart. Wired to the engine's `/api/campaign*` endpoints
  (see `docs/CAMPAIGN_LOOP.md` in the engine repo); best-so-far and round come
  from the live campaign, never a prediction. When the sheet has replicates, the
  reproducible (replicate-averaged) best and ICC sit beside "Best so far" and
  proposal deltas are measured against the reproducible best, labeled as such;
  when the engine reports `analysis_in_sync: false`, a warning says the analysis
  and the campaign may describe different run sheets. Below the loop, a small card
  points scale-up questions to the Scale-up readout, which predicts from your
  own multi-scale data and refuses when that data cannot support a prediction
  (the old priors-based scale-up timeline was retired so there is one scale-up
  story). Diagnostics
  (drivers, reliability, run structure, predicted landscape) collapse behind
  lazy-mounted disclosures, and a "Coming next" section names what unlocks with
  live process data. Full design + honesty tiers in `docs/DECIDE_COCKPIT.md`.
- **Analyze** (`/analyze`) - drop a CSV/TSV/Excel run sheet; the engine fits,
  cross-validates honestly, ranks the drivers, and recommends the next batch.
  Reached via the "Run analysis" action button on Decide and Results, not a
  standalone nav entry.
- **Validate** (`/validate`) - drop a run sheet and see only the data-quality
  verdict, before committing to a full optimization run. Renders the engine's
  `validation` block: a pass / pass-with-warnings / fail header, per-check
  findings with errors first, the affected columns and row indices (honestly
  captioned "showing 20 of N" when the engine's row list is capped), and a
  unit-conversions section naming exactly what was changed about the upload and
  what it was converted to. Also shows external-provider credential status from
  `GET /api/providers`, framed neutrally - an unconfigured provider is a
  documented optional upgrade, not an error. Severity is never conveyed by color
  alone.
- **Data** (`/data`) - the data catalog: every dataset and run under a stable,
  anonymized barcode, with a searchable/sortable registry table and a
  per-dataset drill-down (sample runs, output ranges, provenance). There is no
  live registry yet: the page shows an honest empty state unless
  `NEXT_PUBLIC_DEMO_MODE=true`, in which case it renders the mock registry in
  `lib/mock/registry.ts` (`DATASETS` and `RUNS_BY_DATASET`) behind a demo badge.

The old `/optimize` route redirects to `/results#next-experiments`, so existing
links and bookmarks still resolve.

The lab-operations surfaces (the Experiments hub with its Live / Board / Table
views, `/vessels`, `/plate`, the planning board, and the `/voyager` client
portal) were removed on 2026-09-24 because the engine does not back them.
They are recoverable from the git tag `pre-lab-removal`.

## Design system

The whole app shares one unified blue design system. Tokens (color, radius, type) are defined once in
`app/globals.css` and consumed everywhere via Tailwind v4's `@theme inline`.
See `DESIGN.md` at the repo root for the full token reference, color roles,
and type scale.

Primitives come from **shadcn/ui** on `@base-ui/react`, configured in
`components.json` and living in `components/ui/`. They are the mechanism, not
the design: every primitive is mapped onto the kalos tokens above rather than
shadcn's default neutral theme, so the app does not read as a stock admin
template. Two rules matter when adding one:

- **Two separate data-color families.** `--chart-1..5` is a single-hue blue
  sequential ramp for ORDERED MAGNITUDE (heatmaps) and reverses
  lightness in dark mode so "more" stays "more visible". `--series-1..6` is the
  Okabe-Ito colorblind-safe qualitative palette for UNORDERED CATEGORIES
  (multi-series overlays). Never use one for the other's job. Because
  `--series-*` alone cannot carry meaning in greyscale, categorical traces also
  need a dash pattern or a direct label.
- **Patch `bg-muted` out of anything fetched from the registry.** In this
  codebase `--muted` is a TEXT gray with 250+ call sites, not shadcn's subtle
  surface, so a stock primitive using `bg-muted` renders a near-invisible fill.
  Rewrite it to `bg-secondary` or `bg-blue-soft`. `DESIGN.md` records this as a
  required step.

Note that `npx shadcn add` currently hangs with no output in this environment;
`DESIGN.md` documents the direct-registry workaround.

## Run it

The engine API must be running first (in the `kalos` repo):

```bash
python -m kalos.portal        # serves the API on http://127.0.0.1:8050 (CORS-enabled)
```

Then the web app:

```bash
npm install
npm run dev                    # http://localhost:3000
```

By default, the app never talks to the engine directly from the browser. It
calls the same-origin proxy at `/api/engine/*`
(`app/api/engine/[...path]/route.ts`), which forwards to `KALOS_ENGINE_URL`
and attaches `Authorization: Bearer ${KALOS_ENGINE_TOKEN}` server-side - see
that file's header comment for why a bearer token can never live in
client-visible code. Set both in `.env.local` (see `env.example`); with
neither set the proxy forwards to `http://127.0.0.1:8050` with no auth
header, matching the engine's own open-mode default.

Escape hatch for local dev: set `NEXT_PUBLIC_API_URL` in `.env.local` to
point the browser straight at an engine, bypassing the proxy entirely. Only
use this against an engine with no auth configured - it is not the deployed
posture.

## Stack

Next.js 16 (App Router, Turbopack), Tailwind v4, recharts, lucide-react.
Design tokens and rules live in `app/globals.css`; see `DESIGN.md` for the
full reference.
