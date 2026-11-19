# Kalos web redesign: engine-aligned (2026-11)

Branch `redesign/engine-aligned`. The goal is a product that feels finished because every screen is
backed by something the Kalos engine (`kalos-engine`, FastAPI) actually computes, and nothing else.

## Principles

1. **Engine-backed or cut.** A screen exists only if an engine route feeds it. Pages built on seed or mock
   data are deleted, not restyled. Demo data stays behind `NEXT_PUBLIC_DEMO_MODE` and is labelled "Example".
2. **Measured outranks predicted.** Measured values are filled ink dots, say "measured" and come first. Predicted
   values are hollow accent rings, say "predicted" and always carry their interval with its real coverage
   (`conformal_coverage`, 90% today, never relabelled as 95%).
3. **Every number traces to a source or reads n/a.** Campaign pages carry a source line (dataset, analysis time,
   engine version, provenance hash). A value the engine did not send reads "n/a", never 0.
4. **Verdicts only where the engine gives one.** Reliability, promotion, validation status, driver
   significance and scale-up refusals are shown as the engine reports them (promotion is "reported, not
   enforced"). Where the engine has no verdict (scale-track gates, operating ranges) the UI says so.
5. **Refusals are normal outcomes.** A refused sheet, a model below its trust floor, a scale-up refusal are
   first-class states with the engine's reason and what data would fix it.
6. **Long work is visible.** Uploads and re-analyses run as engine background jobs (`/api/campaigns/{id}/jobs`,
   `/api/campaigns/{id}/reanalyze/jobs`) with the engine's own stage and progress, survive navigation, and can be
   cancelled. A failed job's error comes back from the engine's job list until the user dismisses it.

## Information architecture

The product is organised around **campaigns** (multi-campaign API) and the repeating
**Harmonize -> Predict -> Validate** cycle. The engine's own 5-step stage (`setup | plan | run | record | learn`)
maps onto the cycle: Harmonize = setup, Predict = plan, Validate = run + record + learn.

| Page | Route | Backed by |
| --- | --- | --- |
| Campaigns (home, first run) | `/` | `GET /api/campaigns?summary=true` (one request: best measured, reliability, goal, stage, latest gate, active job), `POST /api/campaigns`, `PATCH /api/campaigns/{id}` (rename; archive/unarchive need an org admin with a second factor in the last 5 minutes) |
| Campaign overview | `/campaigns/[id]` | `GET /api/campaigns/{id}` (summary), `GET /api/campaigns/{id}/analysis` (reliability, top-k), `GET /api/campaigns/{id}/stages` (current stage, latest gate) |
| 1 Harmonize | `/campaigns/[id]/harmonize` | first-run setup `PUT /api/campaigns/{id}/setup` (goal, target unit, bounds, linear constraints) then the upload job (`POST /api/campaigns/{id}/jobs`, `GET /api/jobs/{id}`, cancel); `GET/PUT .../setup` to edit later; analysis `setup`, `validation`, `provenance`, `data_drops`, `feature_ranges`, `correlation`, `embedding` |
| 2 Predict | `/campaigns/[id]/predict` | analysis `reliability`, `promotion`, `cv_*` (incl. `cv_topk`), `drivers`, `proposals[]` (`intervals` per `interval_levels`, `gp_intervals`, `quantiles`, `expected_improvement`, `p_improve`, `nearest_training_distance`), `training_nn_distance_median`, `slices`, `response_surface` (mean and `std`), `target_unit`, `goal`; `POST /api/campaigns/{id}/runs` |
| 3 Validate | `/campaigns/[id]/validate` | summary `pending` with `prediction_at_start` (band recorded at start), `residual`, `inside_band`; `POST .../runs/{run}/result` (versioned, reason on correction); `POST .../reanalyze/jobs` + job poll/cancel |
| Report | `/campaigns/[id]/report` | summary + analysis, `GET .../export/rows` (JSON/CSV), `GET .../results/history` (result versions + audit log), `POST .../operating-ranges` (or its `not_computed` reason), `GET .../gates`; JSON package v2 and CSVs |
| Scale-up track | `/campaigns/[id]/scale-up` | `GET/PUT .../stages` (current stage set by a person), `GET .../gates`, `PUT .../gates/{gate}` (decision + note + evidence links), `GET .../gates/{gate}/history`, and the readout below to attach as evidence |
| Scale-up readout | `/scale-up` | `POST /api/scale/readout.json` (stateless predict-or-refuse readout, drawn as the scale ladder chart) |
| Settings | `/settings`, `/settings/organization`, `/settings/security` | `GET /api/providers`, auth |

Navigation: one left sidebar. Top: wordmark and a campaign switcher. Inside a campaign: Overview, then the three
numbered cycle steps with their engine state (done / current / upcoming), then Report. Below: Scale-up and
Settings. Mobile: the sidebar becomes a sheet. The VS Code-style workbench (activity rail, explorer, editor tabs,
status bar, command palette) is removed: it duplicated navigation three ways.

Proxy allowlist (`lib/server/engine-routes.ts`): an exact route table with the scope each route needs declared per
route and checked against the engine's `docs/route-scopes.json` (vendored in `__tests__/fixtures/`); PUT is
proxied with the same CSRF, body and rate rules as POST. The legacy single-campaign routes, the demo simulators, the
HTML scale readout and the synchronous upload/re-analysis routes were removed once nothing called them.

## Visual direction

Kalos's own system (`app/globals.css`, `DESIGN.md`), no new palette: warm paper, ink text, indigo accent for
action and prediction, good/warn/bad for status only. Calm and scientific: generous whitespace, hairline rules,
one bordered-box recipe, big tabular numbers for measured results, a numbered H/P/V stepper as the recurring
motif, a quiet source line under every engine number. One verdict and one primary action per screen; method
detail sits in disclosures.

## What is cut, and why

| Cut | Why |
| --- | --- |
| `/library/vessels`, `/library/plate` | Seeded random data; no engine route produces vessel kinetics or plate QC |
| `/data` registry | Fabricated registry; the live sheet's columns move to Harmonize, built from engine `provenance` |
| `/projects/*` (customers, phases, linkage tree, "final report") | Hard-coded seed data with its own token scope; superseded by real campaigns |
| `/library/simulator` | Synthetic benchmark surface unrelated to the user's data; the engine does not register it in production |
| `/library` index, workbench shell, command palette, status bar | Replaced by the sidebar |
| Dead export buttons | Replaced by the Report page's real exports |

Old URLs redirect (`/campaign/*`, `/data`, `/projects*`, `/library*` -> `/`, `/library/scale-up` -> `/scale-up`).

## Engine v2 wiring (third pass) and what is still not supported

Wired from kalos-engine `feat/web-redesign-apis` (ENGINE_API_V2): per-proposal conformal intervals with a coverage
choice from `interval_levels` (a refused level shows its reason, never a silent GP fallback), model-based EI /
chance to beat / quantiles, distance to the nearest measured run, 1D slices and the sigma grid, stored run bands,
the target unit, setup goals/bounds/constraints, re-analysis jobs, the JSON scale readout (scale ladder chart),
stages and go/no-go gates (evidence computed, decisions recorded by people), raw-row export, result history and
audit log, operating ranges, and the summary campaign list.

Still not supported or shown as a limit:
- **Scale backtest** is nested leave-last-scale-out (what the engine computes), labelled so.
- **Home cards' unit**: the summary list has no `target_unit`, so home parses the header.
- **Setup changes** apply at the next re-analysis (needs a measured result) or a re-upload; bounds never widen
  the search beyond the observed data.
- **Gate evidence ids** are references the person chose; the engine does not check them.
- **Merging several prior datasets:** one sheet per campaign; a new upload replaces it (confirmed in a dialog).

## Numbers and charts (second pass)

All numbers and charts follow VIZ_SPEC (summarized in `DESIGN.md`, "Numbers and charts"): one formatter
(`lib/num.ts`) with precision from the engine's uncertainty, a source behind every number, and visx charts
(`components/viz/charts/*`): reliability scorecard, parity and calibration plots (Predict evidence), batch interval
strip and setpoint matrix (the batch), driver forest and surface pair (mean and sigma), correlation heatmap and run
map (Harmonize), validation dumbbells (Validate), progress by round (Overview), and in the third pass the slice
profiler (Predict), the scale ladder chart C9 (Scale-up) and the stage gate track C11 (Scale-up track).
