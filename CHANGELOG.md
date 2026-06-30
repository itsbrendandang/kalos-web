# Changelog

## Unreleased

### Added
- **Dashboard home (`/`)** — a multi-panel overview replacing the redirect to
  `/optimize`. Optimization-landscape hero (convergence in single-objective mode,
  titer-vs-purity Pareto front in multi), Single/Multi toggle, live engine status,
  stat tiles (experiments run, active proposals), best-titer headline metric with a
  sparkline, and a next-experiments timeline. Reads the live engine and falls back
  to example data when it is offline.
- `Sparkline` chart and a soft periwinkle secondary accent (`--accent2*` tokens) to
  the design system.

### Changed
- Sidebar nav: rounded pill items, a new **Dashboard** entry, and an Objectives
  legend (titer / purity). Content container widened to `max-w-6xl` for the
  dashboard grid.

### Fixed
- Removed the synchronous `setState`-in-effect pattern on the Dashboard and Optimize
  pages (React 19 `react-hooks/set-state-in-effect`); initial fetches now set state
  only after the `await`. Repo-wide `tsc`, `eslint`, and `next build` are clean.
- Accessibility + robustness (from an independent code review): the icon-only
  optimizer link now has an `aria-label`; the Single/Multi toggle exposes
  `aria-pressed`; the headline metric reads consistently from the single-objective
  run (label, value, and sparkline no longer diverge in multi mode); the proposals
  list discriminates the `Proposal`/`MultiProposal` union on the active objective
  instead of a fragile `"pred" in p` check.
