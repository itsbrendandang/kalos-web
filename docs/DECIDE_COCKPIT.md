# /decide — the AI decision cockpit (design spec)

Status: draft for Sonnet review, then implementation.
Surface: `app/decide/page.tsx` in kalos-web, grown from the current decision-first loop into the full cockpit.

## Principle (non-negotiable)

The cockpit answers three scientist questions, in this priority: **what should I do next**, **why**, **what's happening**.
AI recommendations are the focal point; every chart supports a conclusion rather than competing with it (Linear/Vercel/Cursor, not SCADA).
Honesty is load-bearing: real engine data is shown as real, simulation is labeled "simulated/projected", and anything needing data we don't have is a clearly-labeled placeholder — never faked.

## The honesty tiers (what each section is made of)

- **REAL** — comes straight from the engine (`/api/latest`, `/api/campaign`, `/api/multi`). Never fabricated.
- **PROJECTED** — a physics/literature-prior projection (e.g. scale-up), labeled "projected, not yet validated on your data" (ScaleBridge staging).
- **PLACEHOLDER** — a labeled empty state ("awaiting live process data / integration") so the full IA is visible without theater.

## Layout (top to bottom) — RECONCILED post-review, BUILD THIS

Two Sonnet reviews (design + eng) reshaped the order and cut the honesty risks. The reconciled layout:

1. **KPI strip (REAL only)** — best-so-far (measured), model confidence (reliability ρ + floor verdict), active runs (campaign pending), optimization round. NO "est." placeholder tiles at the top — fabricated-feeling content must not be the first thing seen (that was the rejected "everything logged" smell).
2. **AI Recommendations (HERO, REAL)** — the recommended batch, the focal point, keeps the strongest accent treatment: recipe, predicted ± conformal band, confidence chip, reason. Unchanged.
3. **Experiment queue / "In progress this round" (REAL)** — directly under the hero (loop-closing is still "what do I do next"): pending runs, log result, re-propose. This is the current page's adjacency — keep it.
4. **Trust line (REAL)** — the honest reliability verdict, subordinate.
5. **Optimization Progress (REAL only)** — the best-so-far trajectory (existing ProgressChart). The multi-objective Yield/Purity deltas are CUT: `/api/multi` runs on a FIXED SYNTHETIC surface (`default_rng(0)`, hardcoded optima in `kalos/portal/app.py`), decoupled from the user's campaign — showing it as "this campaign's yield/purity" is misleading. Do not wire it.
6. **Scale-up timeline (MARQUEE, PROJECTED)** — the headline new view, demoted below the loop, given a quieter palette than the hero; see below.
7. **Supporting analysis (collapsed `<details>`, REAL-when-present)** — feature importance (DriversTornado), parameter correlation (CorrelationHeatmap), DOE parameter space (RunLandscape), reliability detail (ReliabilityPanel/ModelCoverage), target distribution. These reuse existing components verbatim; `correlation`/`embedding`/`response_surface` are ABSENT on some payloads and the components already `return null`, so this section self-thins — that is fine. LAZY-MOUNT on first open (recharts ResponsiveContainers are expensive; don't mount hidden). CUT for v1: multi-objective Pareto (synthetic, see above) and similar-batch nearest-neighbor (no such computation exists; proposals aren't embedded).
8. **"Coming next" (single collapsed disclosure, PLACEHOLDER)** — ONE `<details>` with a plain one-line list of 3-4 roadmap items (live batch curves, digital twin, alerts, cost) each with what unlocks it. NOT seven padded cards — that is a wall of promises, the same failure mode. No skeleton loaders (they imply "loading", a lie).

## Honesty UX — one border system (from the design review)

- **REAL** — solid border, no badge (real is the unmarked default; only deviations get marked).
- **PROJECTED** — dashed border + a small outline "projected" pill in a neutral slate/violet tone (a `--chart-*` token, NOT amber — amber already means "exploring" on the TrustChip). Applies to the whole scale-up timeline.
- **PLACEHOLDER** — the "Coming next" disclosure only; text, no numbers or chart shapes.

## The scale-up timeline (the marquee — spec in detail)

The distinctive Bioqore wedge: the optimization does not end at a good 96-well recipe — it has to survive scale-up to production vessels.
This view shows the projected scale-up **path** for the current best recipe as a multi-objective, **branching** timeline.

**Stages (x-axis, left → right, increasing scale):**
`96-well plate (~0.2 mL)` → `shake flask (~50 mL)` → `benchtop bioreactor / ambr250 (~250 mL)` → `pilot (~5–50 L)` → `production (~200–2000 L)`.

**Per-stage, per-objective:** each stage node carries projected Yield, Purity, Cost/L, and Time, each with a confidence band that WIDENS as scale increases (uncertainty compounds) — this widening is itself the honest signal.

**Branching possibilities:** from the current best recipe, show 2–3 candidate scale-up **trajectories** (paths) with different multi-objective tradeoffs, e.g. `Max yield`, `Min cost`, `Fastest to production`.
Each path is a line through the stages; selecting a path updates the per-stage objective readout.
The paths diverge at the vessel-transition stages (where process decisions — feed strategy, DO control — actually branch).

**Honesty:** the whole view is labeled "Projected scale-up — physics/literature priors, not yet validated on your process data." No projected number is presented as measured.
Where the engine has no scale-up model yet, the projection is a transparent prior (e.g. a titer-retention factor per scale step), stated in a tooltip, not a black box.

**Visual — SIMPLIFIED per the design review (avoid the SCADA panel):**
- **One number per node by default:** each stage shows only its primary objective (projected Yield) as the headline, with its widening confidence band as the node's own bar. Purity / Cost / Time move to a hover/click popover on the node — progressive disclosure INSIDE the marquee.
- **One path at a time:** render the selected path in full color (a `--chart-*` token) with its band; render the other 1-2 paths as thin low-opacity ghost lines, no labels. A segmented control re-highlights. Never three simultaneous gradient bands (spaghetti).
- **Tradeoff as TEXT, not traced lines:** a compact 3-row comparison above the stepper — `Max yield` / `Min cost` / `Fastest` — each with a one-line delta ("+40% cost, 8 mo, 94% purity retained"), styled in the hero's proposal-card vocabulary (rank chip + reason line), so the tradeoff reads in under two seconds and ties visually back to the hero.
- Horizontal stepper; on narrow viewports use `overflow-x-auto` + a `min-w-[...]` (mirror `correlation-heatmap.tsx`), never squeeze/wrap. Quieter palette than the hero. Dashed border + "projected" pill. Light/dark via `--chart-1/2/3` only.

## Projection module (`lib/scaleup-projection.ts`) — pure, deterministic, honest

- Pure typed functions, NO `Math.random` (unavailable in some contexts anyway); output is a deterministic function of the input recipe + documented priors.
- Stages: `plate_96w | shake_flask | benchtop_bioreactor | pilot | production`.
- `const SCALEUP_PRIORS` checked in with a source comment (published scale-up titer-retention / cost / cycle-time ranges). Use `satisfies Record<ScaleStage, number>` or an exhaustive stage array so a missed stage is a compile error, not silent `undefined`.
- `projectScaleUp(bestRecipe, bestObjectives, priors) -> ScaleUpPath[]` returning 2-3 named paths (`max_yield | min_cost | fastest`), each a per-stage `{ stage, yield:{value,band}, purity, costPerL, timeDays }`. Paths differ ONLY by which prior weight table they apply (e.g. min_cost uses a cheaper/slower feed prior), never by sampling. `band` grows monotonically per stage (compounding uncertainty), documented.
- **Input gap:** the campaign has no `best_recipe` field (only a `best` scalar). Derive the input recipe from the best proposal's `recipe` (or the top proposal on `/decide`); note this in a comment. Objectives: seed `yield` from the real measured `best`; `purity` may be unavailable → project from a prior, clearly part of the PROJECTED tier.
- Every projected node value carries a tooltip citing the prior that produced it (e.g. "72% titer retention — shake-flask industry prior"). No black-box numbers.
- Unit-test the module (pure, fast): determinism, monotonic band widening, path ordering (max_yield ≥ others on yield, etc.).

## Data sources (be precise)

- REAL now: `getLatest()` (proposals, drivers, reliability, correlation, response_surface, embedding, oof, target_distribution), `getCampaign()` (best, round, history, pending), `runMulti()` (Pareto titer/purity, trajectory).
- PROJECTED (scale-up, cost, time deltas): a small typed projection module in `lib/` with explicit, documented priors — NOT random, NOT presented as measured. Deterministic given the input recipe/best.
- PLACEHOLDER: static labeled cards; no data calls.

## Constraints

- Strict TS, no `any`; match the achromatic-chrome + purple-data design system and existing token classes; light + dark; 0 console errors.
- Reuse existing components; add no new dependency beyond recharts (already present).
- The recommended-batch loop stays the hero — the cockpit must not bury it under charts.
- Every non-REAL element carries a visible honesty label.
