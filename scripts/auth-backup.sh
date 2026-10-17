#!/usr/bin/env bash
# Online, encrypted backup of the auth SQLite DB while the app keeps running.
# sqlite3 + age run in a throwaway sidecar (deploy/Dockerfile.backup) as uid
# 10001 against the app's data volume, with no network.
#
#   AUTH_VOLUME=kalos-web-data OUT_DIR=/srv/backups AGE_RECIPIENT=age1... scripts/auth-backup.sh
#
# Encryption is age only (X25519 + ChaCha20-Poly1305: authenticated, so a
# tampered backup fails to decrypt). Keep the age IDENTITY off the host that
# holds the backups. A backup is useless without BETTER_AUTH_SECRET too (TOTP
# secrets are encrypted with it) - store that separately as well.
set -euo pipefail
AUTH_VOLUME=${AUTH_VOLUME:-kalos-web-data}
OUT_DIR=${OUT_DIR:?set OUT_DIR}
BACKUP_IMAGE=${BACKUP_IMAGE:-kalos-auth-backup:local}
AGE_RECIPIENT=${AGE_RECIPIENT:?set AGE_RECIPIENT (an age public key, age1...)}
# Validated, then passed to the container as an environment variable - never
# interpolated into a shell command string.
[[ "$AGE_RECIPIENT" =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || { echo "AGE_RECIPIENT is not an age X25519 public key" >&2; exit 2; }
TS=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$OUT_DIR"
# The sidecar runs as uid 10001: hand it the directory (0700), nobody else.
docker run --rm --user 0 --network none -v "$OUT_DIR:/out" "$BACKUP_IMAGE" sh -c 'chown 10001:10001 /out && chmod 700 /out'

docker run --rm --user 10001:10001 --network none \
  -e AGE_RECIPIENT -e TS="$TS" \
  -v "$AUTH_VOLUME:/data" -v "$OUT_DIR:/out" "$BACKUP_IMAGE" sh -euc '
    umask 077
    # online snapshot via the SQLite backup API (consistent with concurrent WAL writers)
    sqlite3 /data/auth.db ".timeout 5000" ".backup /tmp/snap.db"
    test -s /tmp/snap.db
    test "$(sqlite3 /tmp/snap.db "PRAGMA integrity_check")" = ok
    echo "users=$(sqlite3 /tmp/snap.db "select count(*) from user")"
    age -r "$AGE_RECIPIENT" -o "/out/auth-$TS.db.age" /tmp/snap.db
    rm -f /tmp/snap.db
    ls -l /out | tail -n +2
  '
echo "backup written to $OUT_DIR/auth-$TS.db.age"
