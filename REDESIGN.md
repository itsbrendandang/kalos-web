# Kalos web redesign plan

Status: draft for review.
Owner: Brendan.
Branch context: builds on the in-flight work in `feat/satoshi-font`, which already moved the app off the dark optimizer sidebar onto a light, unified blue surface.
Companion doc: `DESIGN.md` holds the current token reference; this plan proposes the changes to it.

This is a plan, not code.
Nothing here has been implemented beyond what already exists on `feat/satoshi-font`.
Open decisions that need Brendan's call are collected in the "Decisions needed" section and must be resolved before the page work starts.

## 1. Why redesign

The app already works and reads honestly.
The redesign is not a rescue; it is a consolidation.
Three problems justify the work.

**The information architecture repeats itself.**
Dashboard (`/`), the Analyze results state (`/analyze`), and Optimize (`/optimize`) all render the same trio: model reliability, process drivers, and recommended next experiments.
Analyze re-renders almost the entire dashboard inline after an upload.
A first-time user cannot tell why "recommended next experiments" appears on three different screens, or which one is authoritative.

**Two visual languages were only half-merged.**
The optimizer surface and the Voyager product surface now share tokens, but they still feel like two apps: different chrome (sidebar vs top-nav), different density, and Voyager screens that carry a permanent "illustrative, not real" banner.
The redesign should make the shared system feel deliberate rather than transitional.

**The visual system is mid-migration.**
`feat/satoshi-font` softened the neutral palette (`--fg`, `--muted`, `--border`), swapped the dark sidebar for a light one, added guided-workflow affordances, and added small polish like `::selection`.
That direction is good but only partly applied, and it is uncommitted.
The plan locks the direction so the rest of the app can be brought into line consistently.

## 2. Goals and non-goals

### Goals

1. One clear home for reading results, one clear place to act, and no duplicated result panels across pages.
2. A single visual system that reads as intentional across both the optimizer and Voyager surfaces.
3. Formalize the `feat/satoshi-font` token and chrome direction into `DESIGN.md` so it is the documented baseline, not a WIP diff.
4. Preserve the honesty of the product: held-out reliability, uncertainty bands, and the illustrative-data disclaimers stay first-class and never get styled away.
5. Keep the surface small. No new page unless it removes duplication elsewhere.

### Non-goals

1. No new engine capability. This is a front-end plan against the existing `GET /api/latest` and optimize endpoints.
2. No new state-management or styling library. Tailwind v4 tokens plus the existing component set only, per the repo standards.
3. No change to the honest-analysis semantics (grouped CV, conformal bands, "not modeled" callouts). Presentation only.
4. No Voyager data fabrication cleanup beyond styling. If Voyager screens are illustrative, they stay clearly labeled.

## 3. Design principles

These are the tie-breakers when a specific screen decision is ambiguous.

- Read before act. The default landing surface answers "what did the last analysis tell me" before it asks the user to do anything.
- One fact, one place. Reliability, drivers, and proposals each have a single authoritative home; other screens link to it rather than re-rendering it.
- Honest by default. Uncertainty, held-out scores, and illustrative-data banners are part of the design, not decoration to be minimized.
- Dense but calm. Small type and tight spacing are correct for a scientist audience, but whitespace and hierarchy carry the eye. Density is not clutter.
- The engine is the product. Charts and numbers are the hero; chrome recedes.

## 4. Design system

The `feat/satoshi-font` direction is adopted as the baseline. This section makes it explicit and fills the gaps.

### 4.1 Color tokens

Adopt the softened neutrals already in the WIP diff, and document them in `DESIGN.md`.

| Token | Current on `main` | Adopt | Role |
| --- | --- | --- | --- |
| `--bg` | `#fafbff` | `#f6f8fc` | Page background, slightly warmer and less blue-white |
| `--fg` | `#111111` | `#101828` | Primary text, softened off pure black |
| `--muted` | `#6b7280` | `#667085` | Secondary text |
| `--border` | `#e1e6f5` | `#d9e2f2` | Default border, marginally stronger for light-sidebar separation |
| `--blue-soft` | `#f9faff` | `#f8faff` | Large blue wash |

The brand blue scale (`--blue`, `--blue-hover`, `--blue-deep`, `--blue-tint`, `--blue-border`), the explore neutrals, and the green/amber status tokens are unchanged.
No new hue is introduced.
The single source of truth stays `app/globals.css` `:root`, re-exported via `@theme inline`, with `voyager.css` aliasing to `--v-*`.

Add to the system, since the light sidebar needs it:

- `::selection` uses `--blue-tint` on `--blue-deep` (already in WIP). Keep.
- Confirm every WCAG AA note in `DESIGN.md` still holds against the new `--muted` and `--fg` on the new `--bg`. `#667085` on `#f6f8fc` is roughly 4.7:1, which passes AA for body text; verify at the 10 to 11px caption sizes and record the numbers in `DESIGN.md`.

### 4.2 Chrome

- Sidebar: light (`bg-card`, `border-border`), 60 units wide, blue `accent-soft` active state with a `blue-border` outline. Adopted from WIP.
- Nav labels and helper subtitles: adopt the WIP naming below (see 5.1). Lock the terminology so it stops drifting between "Overview" and "Dashboard".
- Replace the old `powered by BoTorch + ESM-2` footer with the "Typical workflow" panel (WIP). Keep the engine credit, but move it to the Data room or an About affordance rather than the primary nav.
- Mobile: keep the top bar plus 4-up grid nav. Re-check it against the renamed items so the `short` labels still fit.

### 4.3 Type

No change to the type decisions in `DESIGN.md`.
Satoshi app-wide via `next/font/local`, JetBrains Mono for tabular data, base sizes 10 to 19px with 26px+ reserved for hero KPI numbers.
The redesign inherits this as-is.
One addition: document a single canonical page-title size and eyebrow style in `DESIGN.md` so `PageHeader` is identical on every route (today the hero KPI and page-title sizes are set ad hoc per page).

### 4.4 Components

The redesign should not add components; it should make the existing ones do more consistent work.

- `Card`, `StatCard`, `Kpi`, `SectionLabel`, `Tag`, `Button`, `PageHeader`, `Proposals`, and the four charts stay the component vocabulary.
- Promote the repeated "reliability + drivers + predicted-vs-measured + proposals" block into one shared composed component (working name `AnalysisReadout`) so Dashboard renders it and no other page reimplements it. This is the mechanism that fixes the IA duplication in section 5.
- `charts.tsx` `CHART_THEME` already centralizes chart color. Keep. The new tokens flow through automatically.
- Retire the ad hoc `BTN_ACCENT` string literal in `app/page.tsx` in favor of a `Button` variant, so the accent call-to-action is defined once.

## 5. Information architecture

This is the substance of the redesign.

### 5.1 Navigation

Four primary items, renamed and reordered to match the read-then-act flow (matches WIP):

1. Dashboard (`/`) — helper "Results summary". The authoritative read surface.
2. Run analysis (`/analyze`) — helper "Upload run sheet". The action that produces a result.
3. Optimize (`/optimize`) — helper "Next experiments". The interactive engine.
4. Data room (`/data`) — helper "Registry". The dataset and barcode registry.

Voyager (`/voyager`) stays a separate product surface with its own top-nav chrome, reached outside this sidebar (see 5.4).

### 5.2 Resolve the Dashboard vs Analyze duplication

Today Analyze uploads a file and then renders a full results dashboard inline, duplicating `/`.
Redesign:

- Analyze is the input surface. It owns the upload dropzone, the run-sheet checklist, target selection, and validation feedback. It does the job of getting a clean dataset into the engine and nothing more.
- On a successful analysis, Analyze shows a compact confirmation (dataset name, n runs, d inputs, target, reliability headline) and a single primary action: "View results" linking to `/`.
- The full readout (reliability, drivers, predicted-vs-measured, proposals) renders only on the Dashboard, via the shared `AnalysisReadout` component.
- Result: one authoritative results page. Analyze stops being a second dashboard.

Alternative if Brendan prefers inline results on Analyze: keep the readout on Analyze but have `/` become a lighter "latest + history" landing that links into it. This is the inverse of the recommendation and is listed as a decision below. The recommended direction is Dashboard-as-home because it matches the "read before act" principle and the existing `GET /api/latest` model.

### 5.3 Clarify Dashboard vs Optimize

Both surface "recommended next experiments," which is the second source of confusion.
Distinguish them by verb, not by data:

- Dashboard proposals are the standing recommendation from the last analysis. Read-only. Labeled "Recommended from your last analysis."
- Optimize is the interactive tool: choose one or two objectives, run the acquisition function live, watch convergence, inspect the Pareto front, and export a proposed batch. Labeled as an active workspace, not a report.
- Copy and section labels change so the two never both say a bare "recommended next experiments." Dashboard reads "from your last analysis"; Optimize reads "proposed this run".
- The Dashboard "Run this next" card links into Optimize as the deep-dive, which is the correct handoff and already exists.

### 5.4 Voyager surface relationship

Decide and document the relationship rather than leaving it implicit.

- Recommended: treat Voyager as a distinct customer-facing product surface that shares the design system but not the optimizer chrome. It keeps its top-nav, its denser layout, and its illustrative-data banners. The redesign's only job here is to make the shared tokens feel intentional and to confirm the live Phase 2 view is visually distinct from the illustrative ones (it already uses a "Live · engine" badge instead of the disclaimer).
- The plan does not merge Voyager into the sidebar app. They are two products on one design system, and that should be stated in `DESIGN.md` so future work stops trying to reconcile them.

## 6. Page-by-page spec

### 6.1 Dashboard (`/`)

The home and the single authoritative readout.

- Keep the three empty/error states: `ServiceUnavailable` (engine down), `Loading`, and `StartAnalysisCard` (no data yet). These are good and stay.
- When data exists, render: the dataset summary strip, the four stat cards (best, reliability with CI, runs/inputs, top driver), then the shared `AnalysisReadout` (predicted-vs-measured, "run this next", drivers, recommended-from-last-analysis).
- Reliability stays honest: the CI-crosses-zero case still drives the "Reliability needs review" pill and the explore-toned stat card.
- Copy change: section label for proposals becomes "Recommended from your last analysis" to disambiguate from Optimize.
- Replace the `BTN_ACCENT` literal with a `Button` accent variant.

### 6.2 Run analysis (`/analyze`)

Becomes purely the input surface (see 5.2).

- Keep the dropzone, the run-sheet checklist card, target selection, and inline validation errors.
- Replace the inline full-results render with a compact success confirmation plus a primary "View results" link to `/`.
- Preserve the amber validation-error card styling.

### 6.3 Optimize (`/optimize`)

Reframed as the interactive workspace, not a second report.

- Keep the two panels: single-objective and two-objective optimization, with convergence curve, Pareto front, and proposed batch.
- Section labels change to make it read as an active run ("proposed this run"), distinct from the Dashboard's standing recommendation.
- Keep the illustrative/demo badge where the data is not from the live engine.
- Eyebrow "Experiment planning", title "Design next experiments" stay; they already read as a workspace.

### 6.4 Data room (`/data`)

Smallest change.

- Keep the registry table and the barcode/dataset cards.
- Move the "powered by BoTorch + ESM-2" engine credit here (or into an About affordance) since it leaves the sidebar.
- Confirm the demo badge logic matches the real registry state.

### 6.5 Voyager (`/voyager` and children)

Styling-consistency pass only (see 5.4).

- Confirm every non-live screen carries the illustrative banner and every live screen carries the "Live · engine" badge. No fabricated number should read as real.
- Verify the `--v-*` aliases still resolve correctly against the new root tokens after the palette softening.
- No IA change and no data change.

## 7. Phasing

Small, reviewable commits per the repo workflow. Suggested order:

1. Land the design-system baseline. Commit the `feat/satoshi-font` token and chrome direction, and update `DESIGN.md` to match, with the AA contrast numbers recorded. This unblocks everything else and is mostly already written.
2. Extract `AnalysisReadout`. Pull the shared readout out of `/` into one component, with no behavior change. Pure refactor, verifiable by the Dashboard rendering identically.
3. Rework Analyze into the input-only surface. This is the one behavior change and deserves its own commit and QA pass.
4. Copy and label disambiguation across Dashboard and Optimize. Cheap, high-clarity.
5. Data room and Voyager consistency pass. Move the engine credit, verify banners and aliases.

Each step leaves the app building and passing, per the standing instruction never to leave a half-broken tree.

## 8. Verification

- Run the engine (`python -m kalos.portal`) and the web app, then walk the full flow: no data, upload, results, optimize, data room, Voyager.
- Confirm the three Dashboard states render (engine down, loading, empty, populated).
- Re-check WCAG AA on `--muted` and `--fg` against `--bg` at caption sizes and record the ratios in `DESIGN.md`.
- Responsive check at mobile width, including the renamed 4-up nav.
- Per the repo's `AGENTS.md`, any Next.js 16 code work must consult `node_modules/next/dist/docs/` first, since this is not the Next.js in the model's training data.

## 9. Decisions needed

These change what gets built and should be resolved before section 6 work starts.

1. **Analyze results home.** Recommended: Dashboard is the single readout and Analyze becomes input-only (5.2). Confirm, or choose the inverse (results live on Analyze, Dashboard becomes a lighter landing).
2. **Voyager scope.** Recommended: Voyager stays a separate product surface, styling-consistency pass only (5.4). Confirm it is in scope for this redesign at all, or defer it.
3. **Motivation and audience.** OPINIONS.md is empty and no explicit brief exists. The goals in section 2 are inferred from the code and the WIP direction. Confirm they match the intent, especially whether this redesign is for internal scientists, prospective enterprise-pharma customers, or both, since that changes how much the illustrative Voyager surface should be foregrounded.
4. **Engine credit placement.** Move "powered by BoTorch + ESM-2" to the Data room, an About affordance, or drop it. Minor, but it leaves the sidebar either way.
