#!/usr/bin/env bash
# Sample read test: start an isolated engine (temp state dir, port 8061), upload the
# bundled synthetic run sheet through the web app's local-mode proxy, and check the
# engine read it. Needs the web app running in local mode against that engine:
#   KALOS_LOCAL_MODE=1 HOSTNAME=127.0.0.1 PORT=3112 KALOS_LOCAL_TOKEN=$KALOS_LOCAL_TOKEN KALOS_ENGINE_URL=http://127.0.0.1:8061 npx next dev -H 127.0.0.1 -p 3112
# and KALOS_LOCAL_TOKEN set (16+ characters) here too: the app answers only requests that carry it.
set -euo pipefail
: "${KALOS_LOCAL_TOKEN:?set KALOS_LOCAL_TOKEN to the same secret the web app was started with}"
WEB=${WEB:-http://127.0.0.1:3112}
COOKIE="Cookie: kalos_local=$KALOS_LOCAL_TOKEN"
SHEET=${SHEET:-$HOME/GitHub/kalos/examples/synthetic_bioprocess/synthetic_bioprocess.csv}
code() { curl -s -o /tmp/read-test.json -w "%{http_code}" "$@"; }
[ "$(code -X POST "$WEB/api/engine/api/run" -H "$COOKIE" -H "Origin: $WEB" -F "file=@$SHEET")" = 403 ] && echo "ok  upload without the CSRF header is refused (403)"
[ "$(code -X POST "$WEB/api/engine/api/run" -H "$COOKIE" -H "Origin: $WEB" -H "x-kalos-csrf: 1" -F "file=@$SHEET" -F target=titer_g_L)" = 200 ] && echo "ok  sheet uploaded and analysed (200)"
python3 -c "import json;d=json.load(open('/tmp/read-test.json'));assert d['n']==160 and d['target']=='titer_g_L';print('ok  engine read',d['n'],'rows,',d['d'],'features, target',d['target'])"
curl -s -H "$COOKIE" "$WEB/api/engine/api/campaign" | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['has_campaign'] and d['n_base']==160;print('ok  campaign readable back: best',d['best'])"
