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
6. **Long work is visible.** Uploads run as engine background jobs (`/api/campaigns/{id}/jobs`) with the
   engine's own stage and progress, survive navigation, and can be cancelled. Re-analysis has no job route,
   so it shows an elapsed timer and says the engine reports no stages for it.

## Information architecture

The product is organised around **campaigns** (multi-campaign API) and the repeating
**Harmonize -> Predict -> Validate** cycle. The engine's own 5-step stage (`setup | plan | run | record | learn`)
maps onto the cycle: Harmonize = setup, Predict = plan, Validate = run + record + learn.

| Page | Route | Backed by |
| --- | --- | --- |
| Campaigns (home, first run) | `/` | `GET/POST /api/campaigns`, `PATCH /api/campaigns/{id}` (rename; archive needs admin) |
| Campaign overview | `/campaigns/[id]` | `GET /api/campaigns/{id}` (summary: stage, next_action, best, history, pending), `GET /api/campaigns/{id}/analysis` (reliability) |
| 1 Harmonize | `/campaigns/[id]/harmonize` | `POST /api/campaigns/{id}/jobs` + `GET /api/jobs/{id}` + cancel (upload, progress), analysis fields `validation`, `provenance`, `data_drops`, `feature_ranges`, `design_box_exclusions`, `correlation`, `embedding` |
| 2 Predict | `/campaigns/[id]/predict` | analysis `reliability`, `promotion`, `cv_*`, `drivers`, `proposals` (pred, std, mode, reason), `conformal_q/coverage`, `response_surface`; `POST /api/campaigns/{id}/runs` (start) |
| 3 Validate | `/campaigns/[id]/validate` | summary `pending` (awaiting vs measured), `POST /api/campaigns/{id}/runs/{run}/result` (versioned, reason on correction), `POST /api/campaigns/{id}/reanalyze` (sync) |
| Report | `/campaigns/[id]/report` | assembled in the browser from the summary + analysis only: JSON package and runs CSV with provenance hashes |
| Scale-up | `/scale-up` | `POST /api/scale/readout` (stateless predict-or-refuse readout). The 6-stage track is shown as a manual path: the engine stores no stages or gate decisions |
| Settings | `/settings`, `/settings/organization`, `/settings/security` | `GET /api/providers`, auth |

Navigation: one left sidebar. Top: wordmark and a campaign switcher. Inside a campaign: Overview, then the three
numbered cycle steps with their engine state (done / current / upcoming), then Report. Below: Scale-up and
Settings. Mobile: the sidebar becomes a sheet. The VS Code-style workbench (activity rail, explorer, editor tabs,
status bar, command palette) is removed: it duplicated navigation three ways.

Proxy allowlist (`lib/server/engine-routes.ts`) gains only the four job routes; scopes (read for GET, write for
POST), body kinds, CSRF and admin checks are unchanged.

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

## Not supported by the engine (shown honestly, not faked)

- **95% prediction intervals:** the conformal band is 90%. Shown as 90% with the model's 1-sigma SD in details.
- **Goals and bounds at setup:** the target is always maximized and the search box is the observed data range.
  Setup asks for the target column only and shows the observed box; no bounds form is offered.
- **Scale-track gates and go/no-go decisions:** no stage registry. Gates show as "not recorded"; the only computed
  scale evidence is the scale-up readout.
- **Robust operating ranges, base-row export, result history, audit log:** no engine route. The Report says
  "not computed by the engine" / "not exported by the engine" for each.
- **Merging several prior datasets:** one sheet per campaign; a new upload replaces it (confirmed in a dialog).
- **Re-analysis progress and cancel:** no job route; a timer only.
