# Kalos web

[![CI](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml/badge.svg)](https://github.com/itsbrendandang/kalos-web/actions/workflows/ci.yml)

Kalos reads a sheet of past runs from your lab and proposes the next recipes to try. It says how far to trust each suggestion, and it refuses when your runs cannot support an answer.

This repository is the pages people use: the campaign workspace, the Mac app that wraps it, and the server that stands between the browser and the [Kalos engine](https://github.com/itsbrendandang/kalos-engine). The engine does the checking and the modelling; this app shows it, in plain words, and keeps predicted and measured values apart.

> This README describes branch `redesign-notion` ([PR #82](https://github.com/itsbrendandang/kalos-web/pull/82)), which is not yet merged. `main` has sign-in and the authenticated proxy; the redesigned pages, the plain-words pass, the desktop app and Ask Kalos are on this branch. See [Branches and pull requests](#branches-and-pull-requests).

## Who it is for

- A process-development scientist with a spreadsheet of runs who wants a suggested next round and an honest read on whether the data supports it. The words on every page are written for that reader; the exact numbers are one click down ([`docs/PLAIN-WORDS.md`](docs/PLAIN-WORDS.md)).
- One person on one Mac, with the desktop app. Nothing leaves the machine.
- A team that needs sign-in and separate workspaces, with the hosted mode.

Kalos is under development and is not sold or hosted for anyone today.

## One round

The app is one sidebar and a page. The campaign Overview is the front door; the five stages sit under it, each with one button that says what happens next.

| Stage | Page | What you do | What you see |
| --- | --- | --- | --- |
| **Setup** | `/campaign/setup` | Upload a run sheet (CSV, TSV or Excel). Pick the target and whether higher or lower is better. Keep or change the columns Kalos chose as inputs. | The sheet check, one finding at a time, each with a *Why this matters* line. How each column was read and why any was left out. Then "Learning from your runs" while the model is built and tested on runs it has not seen. |
| **Plan** | `/campaign/plan` | Read the proposed recipes. Press **Start these N runs**. | Each recipe is **Best bet** (the model expects a high value) or **New ground** (a recipe the model is unsure about, to learn). A predicted value with its likely range ("9 of 10 past runs landed this close to their prediction"). A warning when a recipe is outside what you have tried so far. *What these runs were built from*, one click down. |
| **Run** | `/campaign/run` | Run them in the lab. | Runs in the lab, waiting for a result. |
| **Record** | `/campaign/record` | Enter the measured results. Press **Save these results**. | Measured values, always labelled measured. |
| **Learn** | `/campaign/learn` | Read what the round taught the model. Plan the next round. | **Reliable**, **Not yet reliable** or **Not enough runs to tell**, with why it matters. Whether measured results landed inside their likely range. What went with higher values of your target, marked **Clear signal** or **Could be chance**. |

- **Sidebar.** Overview (the campaign's front door) with the five stages listed under it and a mark for each (done, current, upcoming), then Tools (Agent, Review, Process, Graph), then Workspace (Data, Library, Projects, Documents), with Settings pinned at the foot. A Simple view shortens the rail to Overview, Ask Kalos, Data, Documents and Settings; the full pages stay one link away. On phones the sidebar is a sheet behind the top bar.

The rest of the sidebar:

- **Ask Kalos** (`/agent`): the one next step, and questions answered only from your own sheets, rounds and results, each answer with its sources. Needs the engine's assistant routes (engine branch `assistant`, not yet merged); without them the page says "This version of Kalos has no assistant" and shows the next step worked out from the campaign.
- **Review** (`/review`): bring a plate or culture time course, see where a run went differently, and ask what happened. The file is read on this device. The chat answers only from a model running on this Mac (desktop mode only).
- **Process** (`/process`): lay out every step of your process, with each step's procedure and the run sheets from whoever ran it.
- **Graph** (`/graph`): your result in the middle, the inputs around it, the proposed recipes outside.
- **Data** (`/data`): every run sheet this browser has loaded, each on its own page with its rows and how each column was read; and every round recorded in the campaign.
- **Library** (`/library`): the scale-up readout, and a benchmark where you watch Kalos search a made-up problem with one known best recipe.
- **Projects** (`/projects`): client projects and where each stands. Illustrative example data, badged; changes last until the app is closed.
- **Documents** (`/documents`): procedure drafts written from your records, every version kept, none an approved procedure until your lab reviews it (needs the engine's assistant routes, as above).
- **Settings** (`/settings`): appearance, the connection to Kalos, the activity record, and in hosted mode your organization and security.

Cmd+K opens a command palette with every page and action. Old routes (`/decide`, `/optimize`, `/results`, `/analyze`, `/validate`, `/planning`, `/scale-readout`, `/simulate`) redirect to their new homes (`next.config.ts`).

## The desktop app

`desktop/` is a Mac app (a Tauri window) that starts the engine and this web server on your Mac and opens the campaign Overview. Quitting it stops both. Full notes: [`desktop/README.md`](desktop/README.md).

**Build it** (Apple silicon, Xcode command line tools, Rust, Node 22, a kalos-engine checkout with its `.venv`):

```sh
npm install
cd desktop
npm ci                 # the Tauri command line tool
npm run build          # = ./prepare-web.sh && tauri build --bundles app
open src-tauri/target/release/bundle/macos/Kalos.app
./check-engine-auth.sh # starts a spare engine and checks that it refuses callers without the app's secret
```

`prepare-web.sh` builds the web app from the last commit, not from unsaved edits; commit first. The packed commit is written to `Kalos.app/Contents/Resources/resources/web/KALOS_WEB_COMMIT`.

**Where data lives.** `~/Library/Application Support/Kalos` (set `KALOS_STATE_DIR` to use another folder), readable by your user only: campaigns, uploaded sheets, fits and the activity record (`audit-log.jsonl`, one line per change, each chained to the one before; the app only appends). Logs are in `~/Library/Logs/Kalos/`. To back up, quit and copy the data folder.

**Nothing leaves the Mac.** Both programs listen on `127.0.0.1` only, on ports picked at each launch. Each launch makes two new secrets: the web server answers only requests that carry the first (kept as a cookie after the first page) from a `127.0.0.1` or `localhost` address, so a page in your browser, a site that points its name at `127.0.0.1`, or a tunnel is refused; the engine answers only calls that carry the second as a bearer secret, which the engine holds as a hash and this server holds in `KALOS_ENGINE_TOKEN`. The engine is started with `KALOS_LLM_PROVIDER` unset and any `ANTHROPIC_API_KEY` removed, so it calls no outside service: its desktop default is Ollama when one answers at `127.0.0.1:11434` and otherwise no assistant at all. The Review chat talks only to that same local Ollama, if you run one. There is no sign-in, no account and no usage tracking. Data would go to a cloud model provider only if you changed that setting on the engine yourself.

**Known gaps.** The app still uses the engine checkout and the Node on your Mac (a single-file engine is built on engine branch `desktop-engine`, not yet merged, and not yet wired in). It is not signed or notarised. Campaigns from an earlier build that kept data in `~/.kalos` do not show; nothing was deleted, and a copy command is planned. Mac only.

## The hosted mode, in short

On a server you control, this app signs people in with a Google account plus a code from an authenticator app, invite only. An operator creates organizations with `scripts/create-org.mjs`; organization admins invite people. Every request from the browser to the engine goes through this server's `/api/engine/*` route, which looks the session up in its own database, requires the second factor, maps the organization to an engine workspace (`KALOS_TENANT_MAP_FILE`), checks the person's access level, applies rate limits and size caps, and signs a token for that one request that lives at most 120 s. The browser never sees the engine's address, a token or a workspace id. Design and setup: [`docs/AUTH.md`](docs/AUTH.md), [`docs/ENGINE_AUTH.md`](docs/ENGINE_AUTH.md).

One web replica, one SQLite file for accounts. The compose stack in the engine repository (`deploy/`) has not been updated for sign-in yet and still hands this server a service token, which this server uses only in desktop mode; its runbook says so.

## Evidence

This app shows the engine's output; it does not test it. **Kalos has not been tested on independent lab data.** The engine README has the numbers in full; the short version:

- **Replay on 15 open datasets** (engine branch `bench-open-replay`, [engine PR #123](https://github.com/itsbrendandang/kalos-engine/pull/123), not yet merged). Each dataset is a table of measured recipes from a published study; the replay counts how many picks each strategy needs to reach 90% of the best value in the table. 20 seeds, 4 picks per round. Kalos's search (BO) beats picking at random clearly on **1 of 15** datasets (Pichia RBDJ: 16.5 picks vs 40.0, 17 of 17 non-tied seeds, Holm p < 0.001). On HeLa time-saving it beats random (Holm p = 0.014) but an evenly spread design is clearly best (20.4 vs 35.9). On the other 13 there is no detectable difference from random, and on HeLa regular and the CHO set Kalos is behind the evenly spread design. In the replay's own words: nothing here supports "BO beats random" as a general claim. It is a replay of old data, not a test in a lab.
- **Made-up surfaces with a known best point** (engine `BENCHMARK.md`): with clean measurements Kalos's search ends much closer to the best point than an evenly spread design; with 15% noise the gap mostly closes. Made-up problems say nothing about a real process.
- **Scale-up readout** (engine `docs/SCALE_EVIDENCE.md`): one made-up dataset, five batches at 2000 L, a lower mean error than two naive guesses (0.53 vs 1.51 and 1.38) with no interval and a ranking consistent with chance. Scale claims are on hold until real batch data exists.

What this app adds is that every verdict on screen is a fixed rule over the engine's own measurements on your sheet, with the number one click down, and that measured and predicted values are never mixed (`lib/workbench.ts`, `__tests__/workbench.test.ts`).

## What Kalos does not do

- **It does not approve anything.** "Start these runs" and "Save these results" record a decision you made and the account that made it. A procedure draft on Documents is not an approved procedure until your lab reviews it.
- **It makes no biosafety decisions.** It knows nothing about the organism, the containment level or the hazards of a recipe.
- **It makes no claims about fitness for regulated work.** No independent review, no certification. The activity record on this Mac is a chained file that anyone with access to the folder can rewrite.
- **It does not mix measured and simulated data.** Simulated runs (engine branch `twin-virtual-runs`, [engine PR #122](https://github.com/itsbrendandang/kalos-engine/pull/122), not yet merged) will get their own tab, dashed lines, text labels and a separate export; the charts of measured runs will never include them. Example data on this branch wears a visible "Example data" badge and appears only with `NEXT_PUBLIC_DEMO_MODE=true`.
- **It does not sell or host anything today.** No public service exists.

## Configuration

Every setting is an environment variable read by the server, never shipped to the browser unless its name starts with `NEXT_PUBLIC_`. Placeholders are in [`env.example`](env.example) (copy what you need into `.env.local`). In production the server refuses to start when a required value is missing or still a placeholder (`lib/server/boot-check.ts`).

`__tests__/readme-env.test.ts` fails when these tables and the code disagree: a name the code reads must be in a table, and a name in a table must be read by the code.

### Web server

| Variable | Default | Accepted values | What it does |
| --- | --- | --- | --- |
| `KALOS_ENGINE_URL` | `http://127.0.0.1:8050` in desktop mode; unset in hosted mode (the proxy answers 502 `engine_not_configured`) | a plain http(s) URL | Where the engine listens. Only this server reads it. |
| `KALOS_ENGINE_TOKEN` | unset | 16 to 512 printable characters | Desktop mode only: the per-launch secret sent to the engine as a bearer. The Mac app makes a new one each launch. Hosted mode never uses it. |
| `KALOS_LOCAL_MODE` | unset | `1` | Desktop (local) mode. On only when this is `1`, `HOSTNAME` is a loopback address, and `KALOS_LOCAL_TOKEN` is set; a mistaken flag on a networked server stays off. |
| `KALOS_LOCAL_TOKEN` | unset | at least 16 characters | The per-launch secret every request to this server must carry in desktop mode. |
| `HOSTNAME`, `PORT` | set by `next start` | an address, a port | Where this server listens. Desktop mode requires a loopback `HOSTNAME`; `PORT`, when set, must match the request's `Host`. |
| `KALOS_STATE_DIR` | `~/.kalos` | a folder | Where the activity record `audit-log.jsonl` is written in desktop mode. The Mac app sets it to `~/Library/Application Support/Kalos`. |
| `KALOS_LLM_URL` | `http://127.0.0.1:11434` | a loopback URL | Where the Review chat finds a local model. A non-loopback address is refused, not used. |
| `KALOS_LLM_MODEL` | `qwen2.5:7b` | a model name Ollama has pulled | The local model for the Review chat. |
| `KALOS_MAX_UPLOAD_MB` | `25` | a number above 0 | Largest run sheet the proxy forwards (plus 1 MiB of form overhead). Same name and default as the engine. |
| `KALOS_PROXY_MAX_JSON_BYTES` | `1048576` (1 MiB) | a whole number above 0 | Largest JSON body the proxy forwards. |
| `KALOS_ENGINE_TIMEOUT_MS` | `120000` | a whole number above 0 | How long the hosted proxy waits for the engine before 504. Desktop mode uses a fixed 120 s. |
| `KALOS_PROXY_RATE_LIMIT_SESSION` | `120` | a whole number above 0 | Hosted mode: requests per minute per session. |
| `KALOS_PROXY_RATE_LIMIT_WRITES` | `30` | a whole number above 0 | Hosted mode: state-changing requests per minute per session. |
| `KALOS_PROXY_RATE_LIMIT_TENANT` | `600` | a whole number above 0 | Hosted mode: requests per minute per workspace. Counters are in memory, so they hold for one replica. |
| `KALOS_TENANT_MAP_FILE` | unset | a path to a JSON object `{ "<organization id>": "<engine tenant id>" }` | Hosted mode: which engine workspace each organization uses. Written by `scripts/create-org.mjs`; entries are never renamed. |
| `KALOS_ENGINE_JWT_PRIVATE_KEY_FILE` | unset; required in production | a path to an Ed25519 private key (PKCS#8 PEM) | Hosted mode: signs the per-request engine token. Never the key itself in the environment. The engine gets the public half (`scripts/engine-jwks.mjs`). |
| `KALOS_ENGINE_JWT_KID` | unset; required in production | a key id | Names the key in each token's header, so keys can rotate. |
| `KALOS_ENGINE_JWT_MAX_TTL_S` | `120` | `1` to `120`; larger or invalid falls back to `120` | Lowers the longest life of a per-request engine token. |
| `KALOS_PUBLIC_URL` | `BETTER_AUTH_URL`, else `http://localhost:3000` | an origin | The origin printed in invitation links. |
| `BETTER_AUTH_SECRET` | unset; required in production | at least 32 random characters | Signs sessions and encrypts stored authenticator secrets. Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | unset; required in production | the public origin of this app | The sign-in callback is `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset; required in production | a Google OAuth web client | Sign-in. Scopes are fixed to `openid email profile`. |
| `AUTH_DB_PATH` | `./data/auth.db` (`/data/auth.db` in the image) | a path | The SQLite file for accounts, sessions, organizations and authenticator secrets. One replica. |
| `AUTH_MIGRATE` | unset | `1`, `only`, `sql` | Run the account-database migrations at start: `1` migrates then serves, `only` migrates and exits, `sql` prints the SQL and exits. |
| `AUTH_TRUSTED_PROXIES` | unset; required in production | comma-separated IPs or CIDRs of your reverse proxy, or `none` | Which forwarded headers to believe for rate limits and session addresses. `none` is refused in production unless `AUTH_ACCEPT_NO_PROXY=1`. |
| `AUTH_ACCEPT_NO_PROXY` | unset | `1`, `true` | Accept, in production, that without a proxy every client shares one rate-limit bucket. |
| `AUTH_IP_ADDRESS_HEADERS` | unset | comma-separated header names | The header your proxy overwrites with the client address. |
| `NEXT_PUBLIC_DEMO_MODE` | unset | `true` | Build time: show badged example data where the engine has none. |
| `NEXT_PUBLIC_API_URL` | unset | an engine URL | Build time, development only: point the browser straight at an open engine and bypass the proxy. Ignored in production builds. |
| `NEXT_PUBLIC_KALOS_LOCAL` | unset | `1` | Build time: build the pages for the desktop app (no sign-in or organization menus). `desktop/prepare-web.sh` sets it. |

### Desktop shell (`desktop/`)

| Variable | Default | What it does |
| --- | --- | --- |
| `KALOS_STATE_DIR` | `~/Library/Application Support/Kalos` | The data folder, passed to both programs. |
| `KALOS_ENGINE_DIR` | `~/GitHub/kalos-engine`, else `~/GitHub/kalos` | A kalos-engine checkout with `.venv`. |
| `KALOS_WEB_DIR` | inside `Kalos.app` | A folder with `server.js`, or a repo with `.next/standalone`, to run another build. |
| `KALOS_NODE` | `/opt/homebrew/bin/node`, `/usr/local/bin/node`, else your shell's `node` | The Node binary. |
| `KALOS_START_PATH` | `/` | The page the window opens on. |
| `KALOS_WEB_REF` | `HEAD` | Which commit `prepare-web.sh` packs. |

The shell passes the engine its own settings (`KALOS_DESKTOP`, `KALOS_HOST`, `KALOS_PORT`, `KALOS_AUTH_TOKENS`, `KALOS_CORS_ORIGINS`; `KALOS_LLM_PROVIDER` is deliberately left unset); those are documented in the engine README.

## Development

Start the engine first, from the engine repository (`python -m kalos.portal`, on `http://127.0.0.1:8050`). Then:

```bash
npm install
cp env.example .env.local        # then edit
npm run dev                      # open http://localhost:3000, not 127.0.0.1 (Next treats them as different origins in dev)
```

Checks, the same as CI (`.github/workflows/ci.yml`, Node 22.16.0):

```bash
npm run lint
npm run test                     # vitest: 96 files, 1,406 tests at the last plain-words pass
npm run build                    # also the type-check gate
npm run test:auth-integration    # a real account database, a real key file, a faked engine
```

Tests that guard the words and the honesty rules: `__tests__/plain-words.test.ts` bans the glossary's technical words from every string outside a disclosure; `__tests__/why-lines.test.ts` requires a *Why this matters* line for every verdict, warning and finding code; `__tests__/reliability-verdict.test.ts`, `__tests__/workbench.test.ts` (measured never mixed with predicted), `__tests__/contrast.test.ts` (state never carried by colour alone), `__tests__/engine-proxy.test.ts`, `__tests__/local-guard.test.ts`. Design rules: [`DESIGN.md`](DESIGN.md).

**Worktrees.** This branch is checked out at `kalos-web-redesign-v2`; `main` at `kalos-web`. Several agents commit on this branch, so commit with explicit paths and never `git add -A`. Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before changing framework code.

**Rules.** Conventional commits, one focused pull request per change. Synthetic data in tests and screenshots. Never commit secrets, tokens or customer data. Never make a claim on screen stronger than the engine's own text ([`docs/PLAIN-WORDS.md`](docs/PLAIN-WORDS.md), rule 7).

## Branches and pull requests

`main` (last merged: [#81](https://github.com/itsbrendandang/kalos-web/pull/81)) has: the five-stage campaign workspace, sign-in with a second factor and organizations ([#75](https://github.com/itsbrendandang/kalos-web/pull/75)), the authenticated engine proxy that signs a token per request ([#79](https://github.com/itsbrendandang/kalos-web/pull/79)), security headers, the Plan page redesign. Not yet merged:

| PR / branch | One line |
| --- | --- |
| [#82](https://github.com/itsbrendandang/kalos-web/pull/82) `redesign-notion` (this branch) | The redesigned workspace in plain words (every verdict with a why-line), the desktop app and its local mode, Data pages per sheet and per round, Ask Kalos, Review, Process, Documents; the honesty items from phase 0. |
| [#73](https://github.com/itsbrendandang/kalos-web/pull/73) `fix/a11y-p0` | Accessibility and consistency fixes. |
| [#70](https://github.com/itsbrendandang/kalos-web/pull/70) `chore/dev-loopback-bind` | The dev server listens on loopback only. |

Engine work this branch depends on, all not yet merged: `desktop-engine` (desktop mode, `/api/health`, `columns[]` with reasons, `direction`, applicability flags), `assistant` (Ask Kalos and Documents), [engine #120](https://github.com/itsbrendandang/kalos-engine/pull/120) (append-only results and activity log), [engine #122](https://github.com/itsbrendandang/kalos-engine/pull/122) (simulated runs), [engine #123](https://github.com/itsbrendandang/kalos-engine/pull/123) (the replay). The engine README has the full map (#120 to #125).

## Docs index

| File | What it covers |
| --- | --- |
| [`docs/PLAIN-WORDS.md`](docs/PLAIN-WORDS.md) | Every word a person sees: the rules, one name per thing, term-by-term replacements, the why-lines by code. |
| [`DESIGN.md`](DESIGN.md) | Tokens, type, layout, the Words section, the honesty rules. |
| [`desktop/README.md`](desktop/README.md) | The Mac app: build, where things live, how it keeps other programs out, upgrading. |
| [`docs/AUTH.md`](docs/AUTH.md) | Sign-in, the second factor, organizations, invitations, the account database, backups. |
| [`docs/ENGINE_AUTH.md`](docs/ENGINE_AUTH.md) | The proxy's checks in order, the per-request token, setup and rotation. |
| [`docs/AUTH_PROVIDER_INTERFACE.md`](docs/AUTH_PROVIDER_INTERFACE.md) | The session contract the pages rely on. |
| [`docs/PLAN_ENGINE_REQUIREMENTS.md`](docs/PLAN_ENGINE_REQUIREMENTS.md) | What the Plan page needs from the engine. |
| [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) | The accessibility checks. |
| [`docs/DECIDE_COCKPIT.md`](docs/DECIDE_COCKPIT.md), [`docs/research-process-map.md`](docs/research-process-map.md) | Earlier design notes, kept for context. |
| [`env.example`](env.example) | Every setting with a placeholder. |

## Stack and third-party

Next.js 16, React 19, Tailwind 4, Base UI, Recharts, Better Auth 1.7.10 with better-sqlite3, Vitest, Tauri. Everything is free and open source; local development needs no paid service or key. Geist and Geist Mono are self-hosted under the SIL Open Font License 1.1 ([`app/fonts/GEIST-LICENSE.txt`](app/fonts/GEIST-LICENSE.txt)). `components/tremor/` is adapted from Tremor under Apache-2.0 ([`components/tremor/NOTICE`](components/tremor/NOTICE)).

## License

Apache-2.0. See [`LICENSE`](LICENSE).

## About the author

Brendan Dang. Founder-operator in biotech process optimization, now an ML engineer. [github.com/itsbrendandang](https://github.com/itsbrendandang)
