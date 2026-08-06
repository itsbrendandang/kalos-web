# Kalos web

The production front end for [Kalos](https://github.com/itsbrendandang/kalos) - a
Bayesian-optimization platform for bioprocess development. Next.js 16 + Tailwind v4,
on a single unified blue design system, consuming the Kalos engine API.

## Views

The nav carries four destinations, flat - there are no lifecycle sections.
The campaign workspace is the product; the other three are genuine peers, not stages feeding it.

- **Campaign workspace** (`/c`, resolving to `/c/[campaignId]`) - the round-to-round surface, and where `/` lands.
  A campaign rail lists campaigns and opens the New campaign dialog (upload a run sheet, `POST /api/run`, and the engine seeds a campaign from it).
  Three tabs sit under a workspace header:
  - **Log** - the decision surface, and only that: the round's verdict and reliability, the batch awaiting approval (approve, log a result, fold in - the closed loop over `/api/campaign*`, see `docs/CAMPAIGN_LOOP.md` in the engine repo), and beneath it the standing numbers with a compact campaign timeline.
    The compact timeline shows the rail, the per-round best, and the round labels; the read-out dates, method, runs per round and pace to target it drops are on Brief, and it says so.
  - **Map** - the run graph, with a lineage lens and a local-neighborhood lens, plus replay.
    Real lineage is not served by the engine yet; the adapter seam is typed for it and the view says so rather than drawing an invented tree.
  - **Brief** - the retrospective: the full-detail campaign timeline and the activity strip in one campaign-history card, then what the last round taught (measured drivers beside GP-estimated importance, never merged into one ranking).
  The Ask panel is present and explicitly disabled: the engine has no answering endpoint and no SOP corpus, so the composer says that instead of quietly swallowing what you type.
  It defaults closed for that reason; the header's Ask pill opens it and the choice persists.
- **Experiments** (`/experiments`, detail at `/experiments/[id]`) - the experiment registry wired to the portal's `/api/experiments/*` routes (the M2 contract).
  Upload a run sheet as a named experiment, flag it READY, run one or every ready experiment at once, and read back the persisted analysis and its provenance (seed, engine version, noise floor).
  This is deliberately not folded into the workspace: the New campaign dialog analyses one file immediately, which is a different thing from staging a named experiment for deferred batch execution.
- **In-silico benchmark** (`/simulate`) - a synthetic Bayesian-optimization surface (`/api/single`, `/api/multi`), not campaign-scoped and not a real process.
  It carries its own banner saying so.
- **Client portal** (`/voyager`) - the customer-facing product surface; see below.

`/` redirects to `/c`.
The retired routes (`/analyze`, `/decide`, `/results`, `/optimize`, `/vessels`, `/plate`, `/planning`, `/data`) are gone rather than redirected: the surfaces they pointed at no longer exist, and a redirect to a page that cannot answer is worse than a 404.

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
under `.voyager-root`) and renders in Satoshi, the original prototype's
typeface, self-hosted via `next/font/local`; see `DESIGN.md` for the token
reference. The optimizer sidebar is bypassed for these routes in
`components/app-shell.tsx`.

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
