# Kalos desktop (macOS)

A Tauri window around two local processes: the engine (`python -m kalos.portal`)
and this web app in **local mode** (`KALOS_LOCAL_MODE=1`: no sign-in, one user,
loopback only). Data stays in `~/.kalos`. Quitting stops both processes.
Logs: `~/Library/Logs/Kalos/`.

```sh
./desktop/prepare-web.sh                      # next build (local flag) + standalone assets
cd desktop && npm install && npx tauri build --bundles app
open src-tauri/target/release/bundle/macos/Kalos.app
```

Needs Rust (rustup) and Node. It finds the engine at `~/GitHub/kalos` (needs `.venv`)
and the web build at `~/GitHub/kalos-web`; override with `KALOS_ENGINE_DIR`,
`KALOS_WEB_DIR`, `KALOS_NODE`, `KALOS_STATE_DIR`.

Local mode is honoured only when `HOSTNAME` is a loopback address
(`lib/local-mode.ts`), so the flag cannot open a networked deployment.

Not done yet: bundling Python and Node inside the .app (it uses your installed
copies today), code signing/notarization, an updater.
