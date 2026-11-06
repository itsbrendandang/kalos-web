#!/usr/bin/env bash
# Check that the engine, started the way the desktop shell starts it, refuses
# callers that do not carry the per-launch secret.
#
#   ./desktop/check-engine-auth.sh            # uses KALOS_ENGINE_DIR or ~/GitHub/kalos-engine
#
# It starts its own engine on a free loopback port with a throwaway state folder
# (never ~/.kalos), runs the checks, and stops only that engine. Exit 0 = all pass.
set -euo pipefail

ENGINE_DIR="${KALOS_ENGINE_DIR:-$HOME/GitHub/kalos-engine}"
PY="$ENGINE_DIR/.venv/bin/python"
[ -x "$PY" ] || { echo "no engine at $ENGINE_DIR (needs .venv); set KALOS_ENGINE_DIR"; exit 2; }

STATE="$(mktemp -d /tmp/kalos-engine-auth.XXXXXX)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
SECRET="$(openssl rand -hex 24)"
HASH="$(printf %s "$SECRET" | shasum -a 256 | cut -d' ' -f1)"
# Same record the shell writes (desktop/src-tauri/src/main.rs engine_auth_config).
TOKENS="[{\"token_sha256\":\"$HASH\",\"subject\":\"desktop-app\",\"tenant\":\"local\",\"scopes\":[\"read\",\"write\"]}]"

(cd "$ENGINE_DIR" && exec env -u KALOS_AUTH_TOKENS_FILE -u KALOS_ALLOW_OPEN_ACCESS \
  KALOS_HOST=127.0.0.1 KALOS_PORT="$PORT" KALOS_STATE_DIR="$STATE" \
  KALOS_AUTH_TOKENS="$TOKENS" KALOS_CORS_ORIGINS="http://127.0.0.1:1" \
  "$PY" -m kalos.portal >"$STATE/engine.log" 2>&1) &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true; rm -rf "$STATE"; }
trap cleanup EXIT

URL="http://127.0.0.1:$PORT"
for _ in $(seq 1 240); do
  curl -fsS -o /dev/null "$URL/healthz" 2>/dev/null && break
  kill -0 "$PID" 2>/dev/null || { echo "engine exited:"; cat "$STATE/engine.log"; exit 1; }
  sleep 0.5
done

fail=0
check() { # name, expected status, curl args...
  local name="$1" want="$2"; shift 2
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  if [ "$got" = "$want" ]; then echo "ok   $name -> $got"; else echo "FAIL $name -> $got (want $want)"; fail=1; fi
}

check "GET /api/campaign, no token"                401 "$URL/api/campaign"
check "GET /api/latest, no token"                  401 "$URL/api/latest"
check "GET /api/campaign, wrong token"             401 -H "Authorization: Bearer not-the-secret-0123456789" "$URL/api/campaign"
check "cross-site form POST /api/run, no token"    401 -X POST -H "Origin: http://evil.example" -F "file=@/dev/null" "$URL/api/run"
check "DNS-rebinding GET (foreign Host), no token" 401 -H "Host: evil.example:$PORT" "$URL/api/campaign"
check "GET /api/campaign, with the secret"         200 -H "Authorization: Bearer $SECRET" "$URL/api/campaign"

exit "$fail"
