#!/usr/bin/env bash
# Build the web app for the desktop shell and put it where the .app bundle picks
# it up (desktop/src-tauri/resources/web, git-ignored).
#
#   ./desktop/prepare-web.sh            # packs the committed HEAD of this repo
#   KALOS_WEB_REF=<commit> ./desktop/prepare-web.sh
#
# It builds from a clean export of a commit (git archive), not from the working
# tree, so half-finished edits never end up in the app. node_modules is cloned
# from this repo's install (copy-on-write on APFS, so it is quick and small). Local mode is switched on at build time
# (NEXT_PUBLIC_KALOS_LOCAL=1); the shell turns it on at run time with a secret.
set -euo pipefail
DESKTOP="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DESKTOP/.." && pwd)"
REF="${KALOS_WEB_REF:-HEAD}"
OUT="$DESKTOP/src-tauri/resources/web"

MODULES="$(cd "$REPO/node_modules" && pwd -P)" || { echo "run npm install in $REPO first"; exit 2; }
SHA="$(git -C "$REPO" rev-parse --short "$REF")"

# Outside the repo, so Next does not take the repo (with its lockfiles) as the workspace root.
STAGE="$(mktemp -d /tmp/kalos-web-build.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
git -C "$REPO" archive "$REF" | tar -x -C "$STAGE"
rm -rf "$STAGE/desktop"
# A real folder, not a symlink: the standalone trace must copy the files it needs.
cp -Rc "$MODULES" "$STAGE/node_modules" 2>/dev/null || cp -R "$MODULES" "$STAGE/node_modules"

(cd "$STAGE" && NEXT_PUBLIC_KALOS_LOCAL=1 NEXT_TELEMETRY_DISABLED=1 npx next build)

ROOT="$STAGE/.next/standalone"
[ -f "$ROOT/server.js" ] || { echo "no server.js in the standalone output"; exit 1; }
[ -L "$ROOT/node_modules" ] && { echo "standalone node_modules is a symlink; the app would not be self-contained"; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"
cp -R "$ROOT/." "$OUT/"
# Next does not copy static assets or public/ into the standalone folder.
mkdir -p "$OUT/.next" && cp -R "$STAGE/.next/static" "$OUT/.next/static"
[ -d "$STAGE/public" ] && cp -R "$STAGE/public" "$OUT/public"
echo "$SHA" > "$OUT/KALOS_WEB_COMMIT"
echo "ready: $OUT (web commit $SHA, $(du -sh "$OUT" | cut -f1))"
