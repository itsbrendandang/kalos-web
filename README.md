# Kalos web

[![CI](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml/badge.svg)](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml)

The production front end for [Kalos](https://github.com/itsbrendandang/kalos), a Bayesian-optimization platform for bioprocess development.
Next.js 16 + Tailwind v4, on a single unified blue design system, consuming the Kalos engine API.

![Results view: real model reliability, significant process drivers, and an honest gate verdict on a 160-run synthetic bioprocess sheet](docs/images/dashboard-results.jpg)

The Results view above is a real run against `examples/synthetic_bioprocess/synthetic_bioprocess.csv` in the engine repo, not a mock.
The "GATES FAILED" badge is the engine's fail-closed promotion gate (`kalos/core/gates.py`) refusing to promote a model that has not cleared its feasibility bar, exactly as it would for real data.

## Contents

- [Getting started](#getting-started)
  - [Run it](#run-it)
  - [How the app reaches the engine](#how-the-app-reaches-the-engine)
- [Pages](#pages)
  - [Optimizer](#optimizer)
  - [Projects](#projects)
- [Design system](#design-system)
- [Testing](#testing)
- [Deployment](#deployment)
- [Stack](#stack)

## Getting started

### Run it

The engine API must be running first (in the `kalos` repo):

```bash
python -m kalos.portal        # serves the API on http://127.0.0.1:8050
```

Then the web app:

```bash
npm install
npm run dev                    # http://localhost:3000
```

### How the app reaches the engine

By default, the app never talks to the engine directly from the browser.
It calls the same-origin proxy at `/api/engine/*` (`app/api/engine/[...path]/route.ts`), which forwards to `KALOS_ENGINE_URL` and attaches `Authorization: Bearer ${KALOS_ENGINE_TOKEN}` server-side.
That file's header comment explains why a bearer token can never live in client-visible code.
Set both in `.env.local` (see `env.example`); with neither set, the proxy forwards to `http://127.0.0.1:8050` with no auth header, matching the engine's own open-mode default.

Escape hatch for local dev: set `NEXT_PUBLIC_API_URL` in `.env.local` to point the browser straight at an engine, bypassing the proxy entirely.
Only use this against an engine with no auth configured; it is not the deployed posture.

## Pages

### Optimizer

| Page | Route | What it does |
| --- | --- | --- |
| Experiments | `/` | The hub for planning, running, and tracking every experiment |
| Results | `/results` | Your last analyzed dataset: reliability, drivers, and the next experiments |
| Decide | `/decide` | The decision cockpit and the closed optimization loop |
| Analyze | `/analyze` | Upload a run sheet for a full analysis |
| Validate | `/validate` | The data-quality verdict on a run sheet, without optimizing |
| Data | `/data` | The data catalog of every dataset and run |

- **Experiments** (`/`).
  A Live / Board switcher sits under the header, driven by the `?view=live|board` search param (default `live`), so each view is directly linkable and the back button moves between them.
  - **Live** (`?view=live`): summary tiles, in-flight run cards (attention-needed first), the next batch to run, and recently completed runs.
  - **Board** (`?view=board`): a Kanban board of experiment/planning tasks moving through To Do -> Draft -> In Progress -> Review Requested -> Completed, with a Table sub-view of the same tasks grouped by column.
    Cards drag between columns via native HTML5 drag-and-drop, and an inline input adds a card to a column without a modal.
    Task data is a static mock in `lib/mock/planning.ts`.
- **Results** (`/results`).
  Model reliability (honest held-out rank correlation + 95% CI), what drives the outcome, predicted-vs-measured, a run landscape (a low-dimensional projection of every run, positioned by recipe similarity and colored by target, shown when the engine returns an `embedding`), a histogram of measured target values with non-producers called out, and Recommended actions: the optimizer's next-best experiments, ranked by the acquisition function (`#next-experiments`).
  Reads `GET /api/latest` and shows an upload prompt until you analyze a dataset; it is not a demo.
- **Decide** (`/decide`).
  The recommended batch is the hero (each experiment's recipe, predicted value + uncertainty, and why), and the honest reliability verdict is a compact chip.
  Queue proposals and Start them, log each run's measured outcome, then Re-propose, which folds the results into the dataset and returns the next batch, with a best-so-far progress chart.
  Wired to the engine's `/api/campaign*` endpoints (`docs/CAMPAIGN_LOOP.md` in the engine repo); best-so-far and round come from the live campaign, never a prediction.
  Below the loop, a **scale-up timeline** projects the path from 96-well plate to production vessels across max-yield / min-cost / fastest paths, with confidence bands that widen with scale, clearly labeled "projected" (physics/literature priors, not measured; `lib/scaleup-projection.ts`).
  Diagnostics (drivers, reliability, run structure, predicted landscape) collapse behind lazy-mounted disclosures.
  Full design and honesty tiers: `docs/DECIDE_COCKPIT.md`.
- **Analyze** (`/analyze`).
  Drop a CSV/TSV/Excel run sheet; the engine fits, cross-validates honestly, ranks the drivers, and recommends the next batch.
  Reached via the "Run analysis" button on the Experiments hub and on Results.
- **Validate** (`/validate`).
  Renders the engine's `validation` block: a pass / pass-with-warnings / fail header, per-check findings with errors first, the affected columns and row indices (captioned "showing 20 of N" when the engine's row list is capped), and the unit conversions applied to the upload.
  Also shows external-provider credential status from `GET /api/providers`; an unconfigured provider is an optional upgrade, not an error.
  Severity is never conveyed by color alone.
- **Data** (`/data`).
  Every dataset and run under a stable, anonymized barcode, with a searchable/sortable registry table and a per-dataset drill-down (sample runs, output ranges, provenance).
  Registry data is a mock in `lib/mock/registry.ts` (`DATASETS` and `RUNS_BY_DATASET`).

The old `/planning`, `/experiments`, and `/optimize` routes redirect to `/?view=board`, `/`, and `/results#next-experiments`, so existing links and bookmarks still resolve.

### Projects

A customer-facing surface under `/projects`, inside the shared sidebar but with a denser layout than the rest of the app.
It uses the same blue tokens (aliased in `app/projects/projects.css` under `.projects-root`) and the same self-hosted Satoshi typeface.
`components/app-shell.tsx` skips the shell's content container for these routes, since `.projects-root` brings its own.

- **`/projects`**: customers and their projects, each tagged by workflow stage, with Add/Edit customer and project modals.
- **`/projects/[id]`**: the project workspace, in tabs.
  - **Phase 1**: the iterative DoE/Bayesian-opt loop as iteration cards (LHS then BO Explore/Exploit), batch-ticket upload, and unlock gating.
  - **Phase 2**: scale-up, either the setup state (config + 9-stage pipeline) or the run results with Promote/Hold candidate cards (drivers, scale-up projection, warnings).
  - **Phase 2 (live)**: the "Bioqore R&D" project (`live: true`) scores the real uploaded dataset through the engine via `GET /api/latest`: recommended next experiments with a conformal band, honest model reliability (grouped-CV Spearman + CI vs the 0.20 floor), global signed drivers, and an explicit "not modeled" callout.
    Falls back to a start-the-engine notice when the API is unreachable.
  - **Linkage tree**: an interactive SVG experiment lineage with a clickable per-node detail panel.
- **`/projects/[id]/report`**: the final report with stat cards, drivers and ideal ranges, the scale-up projection curve, candidate decisions, and export.

Apart from the live project, these screens render illustrative seed data from `app/projects/data.ts` and do not call the engine.
Phase 1, Phase 2, and the final report carry a persistent "Sample data - illustrative, not a real analysis" banner, so their numbers are never mistaken for real engine output.

## Design system

The whole app shares one unified blue design system.
Tokens (color, radius, type) are defined once in `app/globals.css` and consumed everywhere via Tailwind v4's `@theme inline`.
`DESIGN.md` has the full token reference, color roles, type scale, and fonts.

Primitives come from **shadcn/ui** on `@base-ui/react`, configured in `components.json` and living in `components/ui/`.
Every primitive is mapped onto the kalos tokens rather than shadcn's default neutral theme.
Two rules matter when adding one:

- **Two separate data-color families.**
  `--chart-1..5` is a single-hue blue sequential ramp for ORDERED MAGNITUDE (heatmaps, the plate grid) and reverses lightness in dark mode so "more" stays "more visible".
  `--series-1..6` is the Okabe-Ito colorblind-safe qualitative palette for UNORDERED CATEGORIES (per-vessel kinetics).
  Never use one for the other's job, and because `--series-*` alone cannot carry meaning in greyscale, categorical traces also need a dash pattern or a direct label.
- **Patch `bg-muted` out of anything fetched from the registry.**
  In this codebase `--muted` is a TEXT gray with 250+ call sites, not shadcn's subtle surface, so a stock primitive using `bg-muted` renders a near-invisible fill.
  Rewrite it to `bg-secondary` or `bg-blue-soft`.

`npx shadcn add` currently hangs with no output in this environment; `DESIGN.md` documents the direct-registry workaround.

## Testing

```bash
npm run lint    # eslint
npm run test    # vitest
npm run build   # next build; also the typecheck gate (see ci.yml for why there is no separate tsc step)
```

All three run in CI (`.github/workflows/ci.yml`) on every push and pull request.

## Deployment

The deploy pack (container images for the engine, this app, and a SQLite backup sidecar, behind one published front door with `docker compose`) lives in the engine repo at [`kalos/deploy/`](https://github.com/itsbrendandang/kalos/tree/main/deploy).
[`deploy/RUNBOOK.md`](https://github.com/itsbrendandang/kalos/blob/main/deploy/RUNBOOK.md) has the verified quickstart, the security checklist, and backup/restore drills.

## Stack

Next.js 16 (App Router, Turbopack), Tailwind v4, shadcn/ui on `@base-ui/react`, recharts, lucide-react.
