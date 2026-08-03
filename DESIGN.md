# Kalos design system

Kalos is a scientific optimization workspace for bioprocess development teams.
It helps scientists move through one closed loop: prepare data, understand the
model, choose the next experiments, run them, and learn from the results.

## Memorable thing

**Serious scientific intelligence that feels calm, trustworthy, and easy to act on.**

Kalos should feel like a well-run lab: warm, precise, legible, and quietly
confident. It must never feel like a generic SaaS dashboard or a dark terminal.

## Product principles

1. **Evidence before recommendation.** Reliability, uncertainty, and provenance
   appear before the next-action control.
2. **One next step.** Each screen has one visually dominant action.
3. **The experiment loop is the navigation.** Prepare → analyze → decide →
   run → learn is more important than implementation modules.
4. **Honesty is visible.** Demo, simulated, projected, and live data are labeled.
5. **Density without anxiety.** Scientific detail stays available, but hierarchy
   makes the page understandable before a user reads every value.

## Visual thesis

**Botanical precision.** Warm mineral surfaces and deep evergreen structure make
the product feel grounded in physical science. Emerald marks progress and action.
Clay marks exploration and uncertainty. Color is semantic, never decorative.

## Typography

- **Product and body:** Satoshi variable, 400–700. Human, modern, and compact.
- **Scientific values:** JetBrains Mono, 500–600, with tabular numerals.
- **Rules:** body text is at least 14px on desktop and 16px in focused reading
  flows. Mono is only for values, identifiers, timestamps, and code.

## Color

### Light

- Canvas: `#F1F2EB`
- Surface: `#FCFDF9`
- Raised surface: `#FFFFFF`
- Primary ink: `#14231C`
- Secondary ink: `#59685F`
- Border: `#DDE3DA`
- Deep evergreen: `#13271F`
- Emerald: `#159A6E`
- Emerald hover: `#0E7653`
- Emerald soft: `#DFF1E9`
- Clay: `#B96F2B`
- Clay soft: `#F7E9D7`

### Dark

- Canvas: `#0E1713`
- Surface: `#14211B`
- Raised surface: `#192921`
- Primary ink: `#EEF5F0`
- Secondary ink: `#A9B9AF`
- Border: `#2A3D33`
- Emerald: `#4CC79A`
- Emerald soft: `#17382B`
- Clay: `#E2A15E`
- Clay soft: `#402B18`

Success uses emerald. Warning uses clay. Failure uses brick red. Charts may use
additional accessible hues only when the data requires them.

## Shape and depth

- Canvas radius: 20px
- Card radius: 16px
- Control radius: 10px
- Small radius: 7px
- Cards use a quiet border and low, broad elevation. Do not put every section
  in a card; cards are reserved for interactive or independently meaningful
  objects.

## Spacing

Base unit: 4px. Preferred scale: 4, 8, 12, 16, 20, 24, 32, 48, 64.
The desktop workspace is comfortably dense. Touch targets are at least 44px.

## Layout

- Desktop: 248px evergreen navigation rail plus a max-width 1240px workspace.
- Tablet: compact rail or top bar depending on available width.
- Mobile: top identity/status bar and a five-item bottom workflow navigation.
- Screen order: orientation → evidence/status → primary work → supporting
  detail.

## Motion

Motion is minimal-functional. Use 120–220ms transitions for hover, selection,
loading completion, and state change. Animate opacity and transform only. Respect
`prefers-reduced-motion`.

## Content

- Use sentence case.
- Prefer lab language: run sheet, experiment, recipe, target, reliability,
  uncertainty, next batch.
- Buttons describe the result: “Analyze run sheet,” “Start selected runs,”
  “Review recommendation.”
- Empty states explain what is absent and provide the next action.

## Anti-patterns

- No generic card mosaics, purple gradients, decorative blobs, or icon circles.
- No tiny gray instructional copy.
- No color-only status communication.
- No fabricated operational data unless persistently labeled as example data.
- No separate visual identity for Voyager, the engine portal, or client views.

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-03 | Unified the engine and web workspace under Botanical Precision | The prior emerald engine and grayscale web app felt like different products. One semantic system makes the full experiment loop coherent. |
