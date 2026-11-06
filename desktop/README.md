# Kalos for Mac

The Mac app is the main way to run Kalos. It is a window around two programs
that run on your Mac only:

- the **engine** (`python -m kalos.portal` from a kalos-engine checkout), which
  checks run sheets, fits the model and proposes recipes;
- the **web app** (this repo, built for one person on one machine, no sign-in),
  which draws the pages: Overview, Setup, Plan, Run, Record, Learn and the rest.

The window opens on the campaign Overview once both have started. Quitting the
app stops both.

## Build it

You need: macOS on Apple silicon, Xcode command line tools, Rust (`rustup`),
Node 22, this repo with `npm install` done, and a kalos-engine checkout with its
`.venv` set up (in that checkout: `python -m venv .venv && .venv/bin/pip install -e ".[ml,portal]"`).

```sh
cd desktop
npm ci                 # the Tauri command line tool
npm run build          # = ./prepare-web.sh && tauri build --bundles app
open src-tauri/target/release/bundle/macos/Kalos.app
```

`prepare-web.sh` builds the web app from the last commit (not from unsaved or
uncommitted edits) and puts it inside the app. Commit first, then build. The
commit it packed is written to `Kalos.app/Contents/Resources/resources/web/KALOS_WEB_COMMIT`.

To check that the engine refuses callers without the app's secret:

```sh
./desktop/check-engine-auth.sh     # starts its own engine on a spare folder, prints ok/FAIL per check
```

## Where things live

| What | Where |
| --- | --- |
| Your campaigns, uploaded sheets, fits, the activity log | `~/Library/Application Support/Kalos` (set `KALOS_STATE_DIR` to use another folder) |
| Logs from the engine and the web app | `~/Library/Logs/Kalos/` (`engine.log`, `engine-err.log`, `web.log`, `web-err.log`) |
| The engine program | `~/GitHub/kalos-engine`, else `~/GitHub/kalos` (set `KALOS_ENGINE_DIR`) |
| The web app | inside `Kalos.app` (set `KALOS_WEB_DIR` to run another build) |
| Node | `/opt/homebrew/bin/node`, `/usr/local/bin/node`, else your login shell's `node` (set `KALOS_NODE`) |

To back up your work, quit the app and copy the data folder. To start fresh,
quit the app and move that folder aside.

## Your data stays on this Mac

- Both programs listen on `127.0.0.1` only, on ports picked at each launch.
  Nothing is reachable from the network.
- The engine is started with no language-model provider
  (`KALOS_LLM_PROVIDER=none`, and any `ANTHROPIC_API_KEY` is removed), so it
  does not send anything to an outside service. The optional review chat talks
  only to a model running on this Mac (Ollama on `127.0.0.1`), if you run one.
- There is no sign-in, no account and no usage tracking.

## How the app keeps other programs and web pages out

Each launch makes two new random secrets.

1. The web app answers only the app's own window: requests must carry the first
   secret (kept as a cookie after the first page) and use a `127.0.0.1` or
   `localhost` address. A web page in your browser, a page that points its own
   domain name at `127.0.0.1` (DNS rebinding), or a tunnel gets refused.
2. The engine answers only the web app: every call must carry the second secret
   as `Authorization: Bearer`. The engine is given only the secret's SHA-256
   (`KALOS_AUTH_TOKENS`), the web app the secret itself (`KALOS_ENGINE_TOKEN`).
   A caller without it gets 401, including a cross-site form post from a web
   page and a DNS-rebinding page. The engine also accepts browser reads only
   from the app's own address (`KALOS_CORS_ORIGINS`).

This does not protect against programs already running under your own user
account: they can read the app's memory and files, as they can for any app.

## Known gaps

- Python and Node are not inside the app yet: it uses the engine checkout and
  the Node on your Mac. A single-file engine is being built on the
  `desktop-engine` branch of kalos-engine.
- The app is not signed or notarised, so macOS will warn on first open on
  another Mac (right-click, Open). There is no automatic update.
- Mac only. Windows and Linux builds have not been tried.
- Records made by an older version of the app in `~/.kalos` with no secret are
  stored under the engine's open-mode workspace and do not show up in this
  version. Moving them needs an engine command that does not exist yet.
