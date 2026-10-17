# Kalos web

[![CI](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml/badge.svg)](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml)

The scientist-facing front end for the [Kalos engine](https://github.com/itsbrendandang/kalos-engine) API, built with Next.js 16 and Tailwind v4.
Status: one live campaign is wired end to end to the engine; the Data, Library and Projects surfaces are partly or fully example data and say so on screen.

## What you can do

The app is a workbench.
It has an activity rail, an explorer, a route-per-tab editor, a status bar and a command palette (Cmd+K).

- **Activity rail.** Campaign, Data, Library and Projects, with Settings pinned at the foot.
- **Explorer.** A tree specific to each section, with keyboard navigation.
- **Editor tabs.** Every tab is a route, so deep links, reload and Back all work.
  The open-tab list is a per-viewer convenience kept in `sessionStorage`.
- **Status bar.** Engine connection, round, runs in flight, best so far, and one text action for the next step.
- **Command palette.** Jump to any page or stage, or run an action such as "Upload a run sheet".

The engine runs one live campaign, and the home page is that campaign's workspace.
It moves through five stages, each with one primary action:

| Stage | Route | Primary action |
| --- | --- | --- |
| Setup | `/campaign/setup` | Upload a run sheet, check data quality, choose the target |
| Plan | `/campaign/plan` | Start the proposed batch (for example "Start 5 runs") |
| Run | `/campaign/run` | Record results |
| Record | `/campaign/record` | Save the measured results |
| Learn | `/campaign/learn` | Plan the next round |

The rest of the app:

- **Data** (`/data`): a registry of datasets and runs.
- **Library** (`/library`): Vessels, Plate analysis, Scale-up readout and Simulator, plus a link to Projects.
- **Projects** (`/projects`): client-facing project workspaces on illustrative seed data.
- **Settings** (`/settings`): theme, engine connection, and optional integrations.

Earlier routes redirect permanently (`next.config.ts`), so old links and bookmarks still resolve.

| Old route | Now |
| --- | --- |
| `/decide`, `/optimize` | `/campaign/plan` |
| `/results` | `/campaign/learn` |
| `/analyze`, `/validate` | `/campaign/setup` |
| `/experiments`, `/planning` | `/` |
| `/scale-readout` | `/library/scale-up` |
| `/vessels` | `/library/vessels` |
| `/plate` | `/library/plate` |
| `/simulate` | `/library/simulator` |

## Screenshots

Screenshots of the redesigned workbench will follow the merge of the redesign branch.
The only image committed today, [`docs/images/dashboard-results.jpg`](docs/images/dashboard-results.jpg), shows the previous Results view and does not match the current UI.

## Quickstart

Start the engine first, from the [kalos-engine](https://github.com/itsbrendandang/kalos-engine) repo, which serves the API on `http://127.0.0.1:8050`:

```bash
python -m kalos.portal
```

Then, in this repo:

```bash
npm install
cp env.example .env.local        # then edit
npm run dev
```

Open `http://localhost:3000`, not `http://127.0.0.1:3000`.

`npm run dev` listens on the loopback interface only. The proxy attaches the engine token to every request it receives and the app has no login, so do not expose the dev server (or a production deployment) to a network you do not fully trust; put an authenticating reverse proxy in front of any shared deployment.
Next 16 dev mode does not treat `127.0.0.1` as the same origin as `localhost`, which can break hot reload and client hydration.

The browser never calls the engine directly.
It calls the same-origin proxy at `/api/engine/*` (`app/api/engine/[...path]/route.ts`), which forwards to the engine and attaches the bearer token on the server.
Configure it in `.env.local` (placeholders in [`env.example`](env.example)):

| Variable | Where | What it does |
| --- | --- | --- |
| `KALOS_ENGINE_URL` | server only | Engine base URL, for example `http://127.0.0.1:8050`. If unset, the proxy answers 502 "engine unreachable". |
| `KALOS_ENGINE_TOKEN` | server only | Bearer token sent to the engine. Leave unset while the engine runs open. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_DEMO_MODE` | build time | Set to `true` to render example data where the engine has none (see below). Default off. |
| `NEXT_PUBLIC_API_URL` | build time | Local-dev escape hatch that points the browser straight at an engine and bypasses the proxy. Do not use it with an engine that requires a token. |

To try the app with data, upload the synthetic example sheet from the engine repo on the Setup stage, or with `curl -F file=@examples/synthetic_bioprocess/synthetic_bioprocess.csv http://127.0.0.1:8050/api/run`.
That sheet is generated, not measured.

## Honest by design in the UI

Each rule names the file that carries it.

- One reliability verdict app-wide ("Reliable", "Not yet reliable", "Not enough data"), computed in one place: `reliabilityVerdict` in `lib/api.ts`, tested in `__tests__/reliability-verdict.test.ts`.
- One uncertainty band per recipe, shown with its coverage: `formatBand` in `lib/format.ts`.
- Measured and predicted values are never mixed.
  Best so far comes from the campaign's measured results, never a prediction: `lib/workbench.ts`, `__tests__/workbench.test.ts`.
- Demo data wears a visible "Example data" badge, and demo content renders only when `NEXT_PUBLIC_DEMO_MODE=true`: `ExampleBadge` in `components/ui/badge.tsx`, `lib/demo.ts`.
- State is never carried by color alone.
  Status colors pair with a word or icon, and text and UI color pairs are checked for WCAG contrast in both themes: `__tests__/contrast.test.ts`.
- No side-stripe borders on callouts or cards: `__tests__/design-guards.test.ts`.
- No engine vocabulary in copy.
  This is a design rule (see `DESIGN.md`), not a test, and a few older pages still show internal names.

## Live vs demo data

| Route | Source |
| --- | --- |
| `/`, `/campaign/*` | Engine (`/api/latest`, `/api/campaign*`). With demo mode on and no campaign yet, `/` and `/campaign/run` show a badged example campaign from `lib/mock/campaign.ts`. |
| `/library/scale-up` | Engine (`POST /api/scale/readout`). Disabled in demo mode. |
| `/library/simulator` | Engine (`/api/single`, `/api/multi`), which runs a synthetic benchmark surface. |
| `/settings` | Engine (`/api/providers`, and the connection check). |
| `/data` | Fixtures in `lib/mock/registry.ts`, synthetic, shown only in demo mode. |
| `/library/vessels` | Fixtures in `lib/vessel-data.ts`, a seeded simulation, shown only in demo mode. |
| `/library/plate` | Fixtures in `lib/plate-data.ts`, a seeded simulation, always shown with a demo badge. |
| `/projects/*` | Illustrative seed data in `app/projects/data.ts`, saved per viewer in the browser. One project scores the live engine analysis. |

## Design system

- Geist and Geist Mono, self-hosted with `next/font/local` (no Google Fonts requests, enforced by `__tests__/self-hosted-fonts.test.ts`).
- Light first, with full dark mode.
- OKLCH tokens defined once in `app/globals.css`, exposed through Tailwind v4 `@theme inline`.
- shadcn/ui primitives on Base UI in `components/ui/`, shared pieces in `components/kit/`.
- Charts and KPI visuals adapted from [Tremor](https://github.com/tremorlabs/tremor) (Apache-2.0) in `components/tremor/`.

[`DESIGN.md`](DESIGN.md) has the token reference, type scale and layout rules.

## Development and CI

CI (`.github/workflows/ci.yml`, Node 22.16.0) runs these on every push and pull request:

```bash
npm ci
npm run lint
npm run test
npm run build
```

`npm run build` is also the type-check gate; there is no separate `tsc` step (the workflow explains why).

## Deploy

This repo has its own [`Dockerfile`](Dockerfile): a multi-stage build on `node:22-alpine` that runs the Next.js standalone output as a non-root user, with a health check.
The compose stack that runs the engine, this app and a backup sidecar together lives in the engine repo, and its [`deploy/RUNBOOK.md`](https://github.com/itsbrendandang/kalos-engine/blob/main/deploy/RUNBOOK.md) has the quickstart, the security checklist and the backup drills.

## Contributing

Run the CI commands above before opening a pull request, and make sure all three are green.
Use conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`) and open one pull request per change.
Next.js 16 differs from older versions, so read the relevant guide in `node_modules/next/dist/docs/` before changing framework-level code.

## Third-party

- Geist and Geist Mono are licensed under the SIL Open Font License 1.1: [`app/fonts/GEIST-LICENSE.txt`](app/fonts/GEIST-LICENSE.txt).
- The files in `components/tremor/` are adapted from Tremor under Apache-2.0: [`components/tremor/NOTICE`](components/tremor/NOTICE).

## License

Apache-2.0.
See [`LICENSE`](LICENSE).

## About the author

Brendan Dang.
Founder-operator in biotech process optimization, now an ML engineer.
[github.com/itsbrendandang](https://github.com/itsbrendandang)
