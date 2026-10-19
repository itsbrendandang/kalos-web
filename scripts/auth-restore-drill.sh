#!/usr/bin/env bash
# Restore drill: decrypt a backup into a NEW volume, verify integrity, boot the
# app on it (no migration: it must start on the restored schema as-is), probe.
#
#   BACKUP=/srv/backups/auth-...db.age AGE_KEY_FILE=/secure/age.key \
#   ENV_FILE=/srv/kalos/web.env RUN_ARGS="-v /srv/kalos/secrets:/run/secrets:ro" \
#   scripts/auth-restore-drill.sh
#
# ENV_FILE is the production env file (same BETTER_AUTH_SECRET, or sessions
# and TOTP secrets are unreadable); the drill overrides BETTER_AUTH_URL and
# AUTH_DB_PATH. RUN_ARGS carries the mounts the env file refers to (engine key,
# tenant map). The production boot check applies to the drill too.
set -euo pipefail
BACKUP=${BACKUP:?}
ENV_FILE=${ENV_FILE:?production env file (docker --env-file format)}
RESTORE_VOLUME=${RESTORE_VOLUME:-kalos-web-restore}
APP_IMAGE=${APP_IMAGE:-kalos-web:local}
BACKUP_IMAGE=${BACKUP_IMAGE:-kalos-auth-backup:local}
PORT=${PORT:-3599}
RUN_ARGS=${RUN_ARGS:-}
dir=$(cd "$(dirname "$BACKUP")" && pwd); file=$(basename "$BACKUP")

docker volume create "$RESTORE_VOLUME" >/dev/null
docker run --rm --user 0 -v "$RESTORE_VOLUME:/data" "$BACKUP_IMAGE" sh -c 'chown 10001:10001 /data && chmod 700 /data'

[[ "$file" == *.age ]] || { echo "BACKUP must be an age file (*.db.age)" >&2; exit 2; }
AGE_KEY_FILE=${AGE_KEY_FILE:?age identity file}
docker run --rm --user 10001:10001 --network none -v "$RESTORE_VOLUME:/data" -v "$dir:/in:ro" \
  -v "$AGE_KEY_FILE:/run/key:ro" -e FILE="$file" -e MIN_USERS="${MIN_USERS:-1}" "$BACKUP_IMAGE" sh -euc '
  umask 077; test ! -e /data/auth.db
  age -d -i /run/key -o /data/auth.db "/in/$FILE"   # authenticated: fails on any tampering
  test -s /data/auth.db   # sqlite3 would silently CREATE an empty db otherwise
  test "$(sqlite3 /data/auth.db "PRAGMA integrity_check")" = ok
  n=$(sqlite3 /data/auth.db "select count(*) from user"); echo "restored users=$n"; test "$n" -ge "$MIN_USERS"
  sqlite3 /data/auth.db "PRAGMA journal_mode=WAL" >/dev/null
  ls -ln /data'


docker rm -f kalos-web-restore-app >/dev/null 2>&1 || true
# shellcheck disable=SC2086
docker run -d --name kalos-web-restore-app -p "127.0.0.1:$PORT:3000" -v "$RESTORE_VOLUME:/data" \
  --env-file "$ENV_FILE" -e BETTER_AUTH_URL="http://localhost:$PORT" -e AUTH_DB_PATH=/data/auth.db $RUN_ARGS "$APP_IMAGE" >/dev/null
for _ in $(seq 1 30); do curl -fsS "localhost:$PORT/api/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -fsS "localhost:$PORT/api/health" || { echo "RESTORE DRILL FAILED: app not healthy"; docker logs kalos-web-restore-app 2>&1 | tail -20; exit 1; }
echo
echo "restore drill OK (app booted on $RESTORE_VOLUME)."
echo "Tear down: docker rm -f kalos-web-restore-app && docker volume rm $RESTORE_VOLUME"
