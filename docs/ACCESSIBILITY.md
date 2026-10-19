# Accessibility checks

## What runs in CI

`npm test` includes `__tests__/a11y-structure.test.tsx`. It renders the editor tab
strip and the plate heatmap to static markup and asserts the structure that axe
flags: no `tablist` with non-tab children, every well button has a full accessible
name, and the value text on every heatmap fill meets WCAG AA (4.5:1).

## What is not in CI (and why)

A full axe run needs a DOM and a browser. Neither is a dependency of this repo, and
the signed-in pages cannot be reached in CI without a sign-in fixture. So axe is run
by hand, not in CI. Adding `jsdom` plus `axe-core` as dev dependencies would cover the
component-level cases in CI; it was not added to keep the dev dependency tree small.

## Manual axe run (signed-in shell)

1. Render the shell and the page under test to static HTML (the same
   `renderToStaticMarkup` approach as `a11y-structure.test.tsx`, with
   `next/navigation` and `next/link` mocked), and link the built CSS from
   `.next/static/chunks/*.css` so colour contrast is measured with real tokens.
2. Load the file in the gstack browser (`/browse`) and inject `node_modules/axe-core/axe.min.js`.
3. Run `axe.run(document)` and read the violations.

Last run on the fixed shell: `/data` (shell + placeholder) and `/library/plate`
(shell + heatmap) both report zero violations. The original code reported
`aria-required-children` (critical) on the tab strip, `region` on the tab strip,
and 25 `color-contrast` failures on the plate heatmap.
