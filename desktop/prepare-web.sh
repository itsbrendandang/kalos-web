#!/usr/bin/env bash
# Build the web app for the desktop shell: local mode on, standalone output with
# its static assets and public files beside it (Next does not copy them).
set -euo pipefail
cd "$(dirname "$0")/.."
NEXT_PUBLIC_KALOS_LOCAL=1 npm run build
cp -R .next/static .next/standalone/.next/static
[ -d public ] && cp -R public .next/standalone/public
echo "ready: .next/standalone/server.js"
