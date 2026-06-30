# Kalos web

The production front end for [Kalos](https://github.com/itsbrendandang/kalos) — a
Bayesian-optimization platform for bioprocess development. Next.js 16 + Tailwind v4,
in the "Calm Growth" design language, consuming the Kalos engine API.

## Views

- **Optimize** — the live engine: single- and multi-objective optimization, the
  convergence curve, the titer-vs-purity Pareto front, and proposed next
  experiments (each with a predicted value, an uncertainty, and an
  explore/exploit reason).
- **Analyze** — drop a CSV/TSV/Excel run sheet; the engine fits, cross-validates
  honestly, ranks the drivers, and recommends the next batch.
- **Data** — the barcode registry: every dataset and run under a stable,
  anonymized barcode.

## Run it

The engine API must be running first (in the `kalos` repo):

```bash
python -m kalos.portal        # serves the API on http://127.0.0.1:8050 (CORS-enabled)
```

Then the web app:

```bash
npm install
npm run dev                    # http://localhost:3001
```

Point at a different engine with `NEXT_PUBLIC_API_URL` in `.env.local`
(defaults to `http://127.0.0.1:8050`).

## Stack

Next.js 16 (App Router, Turbopack), Tailwind v4, recharts, lucide-react.
Design tokens and rules live in `app/globals.css` and the engine's `DESIGN.md`.
