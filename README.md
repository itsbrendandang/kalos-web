# Kalos web

The production front end for [Kalos](https://github.com/itsbrendandang/kalos) - a
Bayesian-optimization platform for bioprocess development. Next.js 16 + Tailwind v4,
on a single unified blue design system, consuming the Kalos engine API.

## Views

- **Overview**: your last analyzed dataset at a glance - model reliability (honest
  held-out rank correlation + 95% CI), what drives the outcome, predicted-vs-measured,
  and the ranked next experiments. Reads `GET /api/latest`; shows an upload prompt
  until you analyze a dataset (it is not a demo).
- **Optimize** - the live engine: single- and multi-objective optimization, the
  convergence curve, the titer-vs-purity Pareto front, and proposed next
  experiments (each with a predicted value, an uncertainty, and an
  explore/exploit reason).
- **Analyze** - drop a CSV/TSV/Excel run sheet; the engine fits, cross-validates
  honestly, ranks the drivers, and recommends the next batch.
- **Data** - the barcode registry: every dataset and run under a stable,
  anonymized barcode.

## Design system

The whole app, optimizer surface and Voyager product surface alike, shares one
unified blue design system. Tokens (color, radius, type) are defined once in
`app/globals.css` and consumed everywhere via Tailwind v4's `@theme inline`.
See `DESIGN.md` at the repo root for the full token reference, color roles,
and type scale.

## Voyager surface

A customer-facing product surface lives under `/voyager`, with its own
top-nav chrome and a denser layout than the rest of the app. It shares the
same blue tokens as the optimizer surface (aliased in `app/voyager/voyager.css`
under `.voyager-root`) and currently stands in Satoshi (the original
prototype's typeface) with Manrope, self-hosted via `next/font/google`; see
`DESIGN.md` for the font swap plan. The optimizer sidebar is bypassed for
these routes in `components/app-shell.tsx`.

- **`/voyager`** - Projects home: customers and their projects, each tagged by
  workflow stage. Add/Edit customer and project modals open here.
- **`/voyager/projects/[id]`** - project workspace with three tabs:
  - **Phase 1** - the iterative DoE/Bayesian-opt loop as iteration cards
    (LHS then BO Explore/Exploit), batch-ticket upload, and unlock gating.
  - **Phase 2** - scale-up: either the setup state (config + 9-stage pipeline) or
    the run results with Promote/Hold candidate cards (drivers, scale-up
    projection, warnings) alongside the completed pipeline. These are illustrative
    and carry a persistent "Sample data - illustrative, not a real analysis"
    banner (same on Phase 1 and the final report) so fabricated numbers are never
    mistaken for real engine output.
  - **Phase 2 (live)** - the "Bioqore R&D" project (`live: true`) scores the real
    uploaded dataset through the engine via `GET /api/latest`: recommended next
    experiments (recipe + predicted target with a distribution-free conformal
    band), honest model reliability (grouped-CV Spearman + CI vs the 0.20 floor),
    global signed drivers, and an explicit "not modeled" callout (success
    probability, calibration, scale-up transfer). Falls back to a start-the-engine
    notice when the API is unreachable.
  - **Linkage tree** - an interactive SVG experiment lineage (Phase 1 and
    Phase 1+2) with a clickable per-node detail panel.
- **`/voyager/projects/[id]/report`** - the final report: stat cards, drivers and
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
npm run dev                    # http://localhost:3000
```

Point at a different engine with `NEXT_PUBLIC_API_URL` in `.env.local`
(defaults to `http://127.0.0.1:8050`).

## Stack

Next.js 16 (App Router, Turbopack), Tailwind v4, recharts, lucide-react.
Design tokens and rules live in `app/globals.css`; see `DESIGN.md` for the
full reference.
