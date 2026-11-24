# Accessibility checks

## What runs in CI

`npm test` includes:

- `__tests__/app-shell.test.tsx` (jsdom + Testing Library): the app frame's landmarks
  (`banner` top bar with the `Sections` navigation, `complementary` sidebar, `Primary`
  navigation, `main`), the skip link to `#main`, `aria-current="page"` on the current
  section pill, Settings and the active campaign step, accessible names on the campaign
  switcher, and an unknown campaign rendered as "not found" (not as an outage).
- `__tests__/contrast.test.ts`: WCAG AA contrast for every text and UI token pair in both
  themes, parsed from `app/globals.css`.
- Page component tests (for example `__tests__/plan-page.test.tsx`) query by role and
  accessible name, so a control without a name fails them.

The editor tab strip and plate heatmap tests were removed with those surfaces in the
engine-aligned redesign (`docs/REDESIGN.md`).

## What is not in CI (and why)

A full axe run needs a browser. The signed-in pages cannot be reached in CI without a
sign-in fixture, so axe is run by hand, not in CI.

## Manual axe run (signed-in shell)

1. Run the app locally with the dev auth bypass (see `README.md`, local development).
2. Open a page in a browser, inject `node_modules/axe-core/axe.min.js` (or use a browser
   extension), and run `axe.run(document)`.
3. Check the campaign pages in both themes: Overview, Harmonize, Predict, Validate, Report,
   plus Campaigns (`/`) and Scale-up (`/scale-up`).
