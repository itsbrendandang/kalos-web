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

Local mode turns on only when ALL of these hold (`lib/local-mode.ts`): the flag is set,
`HOSTNAME` is a loopback address, and `KALOS_LOCAL_TOKEN` is a secret of 16+ characters.
The app makes a new secret on every launch and the server answers only requests that
carry it (as a cookie it sets on first load) and whose `Host` is loopback
(`lib/server/local-guard.ts`). That blocks another web page, a DNS-rebinding page, or a
tunnel from reaching the app just by finding the port. It is not a defence against other
programs running as you: the engine itself listens open on a random loopback port.

Not done yet: bundling Python and Node inside the .app (it uses your installed
copies today), code signing/notarization, an updater.
