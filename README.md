# Kalos web

The production front end for [Kalos](https://github.com/itsbrendandang/kalos) — a
Bayesian-optimization platform for bioprocess development. Next.js 16 + Tailwind v4,
in a minimal black-and-white design system, consuming the Kalos engine API.

## Views

- **Overview**: your last analyzed dataset at a glance - model reliability (honest
  held-out rank correlation + 95% CI), what drives the outcome, predicted-vs-measured,
  and the ranked next experiments. Reads `GET /api/latest`; shows an upload prompt
  until you analyze a dataset (it is not a demo).
- **Optimize** — the live engine: single- and multi-objective optimization, the
  convergence curve, the titer-vs-purity Pareto front, and proposed next
  experiments (each with a predicted value, an uncertainty, and an
  explore/exploit reason).
- **Analyze** — drop a CSV/TSV/Excel run sheet; the engine fits, cross-validates
  honestly, ranks the drivers, and recommends the next batch.
- **Data** — the barcode registry: every dataset and run under a stable,
  anonymized barcode.

## Voyager surface (preview)

A separate customer-facing product surface lives under `/voyager`, in its own
blue/Satoshi design (scoped tokens in `app/voyager/voyager.css`, Manrope stands
in for Satoshi) with its own top-nav chrome. The optimizer sidebar is bypassed
for these routes in `components/app-shell.tsx`.

- **`/voyager`** — Projects home: customers and their projects, each tagged by
  workflow stage. Add/Edit customer and project modals open here.
- **`/voyager/projects/[id]`** — project workspace with three tabs:
  - **Phase 1** — the iterative DoE/Bayesian-opt loop as iteration cards
    (LHS then BO Explore/Exploit), batch-ticket upload, and unlock gating.
  - **Phase 2** — scale-up: either the setup state (config + 9-stage pipeline) or
    the run results with Promote/Hold candidate cards (drivers, scale-up
    projection, warnings) alongside the completed pipeline.
  - **Linkage tree** — an interactive SVG experiment lineage (Phase 1 and
    Phase 1+2) with a clickable per-node detail panel.
- **`/voyager/projects/[id]/report`** — the final report: stat cards, drivers and
  ideal ranges, scale-up projection curve, candidate decisions, and export.

Seed data lives in `app/voyager/data.ts`. The engine does not yet expose a
customers/projects API, so these screens are illustrative and do not call it;
the types are shaped so a real API can drop in without touching the views.
The completed-projects home variant is not yet wired.

## Run it

The engine API must be running first (in the `kalos` repo):

```bash
python -m kalos.portal        # serves the API on http://127.0.0.1:8050 (CORS-enabled)
```

Then the web app:

```bash
npm install
npm run dev                    # http://localhost:3001
```

Point at a different engine with `NEXT_PUBLIC_API_URL` in `.env.local`
(defaults to `http://127.0.0.1:8050`).

## Stack

Next.js 16 (App Router, Turbopack), Tailwind v4, recharts, lucide-react.
Design tokens and rules live in `app/globals.css` and the engine's `DESIGN.md`.
