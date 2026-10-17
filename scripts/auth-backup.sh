#!/usr/bin/env bash
# Online, encrypted backup of the auth SQLite DB while the app keeps running.
# sqlite3/age/openssl run in a throwaway sidecar (deploy/Dockerfile.backup) as
# uid 10001 against the app's data volume, with no network.
#
#   AUTH_VOLUME=kalos-web-data OUT_DIR=/srv/backups AGE_RECIPIENT=age1... scripts/auth-backup.sh
#   AUTH_VOLUME=kalos-web-data OUT_DIR=/srv/backups OPENSSL_PASS_FILE=/root/.bk-pass scripts/auth-backup.sh
#
# age (AEAD) is preferred. Keep the age identity / pass file OFF the host that
# holds the backups. The backup is useless without BETTER_AUTH_SECRET too
# (TOTP secrets are encrypted with it) - store that separately, never in the
# same place as the backup.
set -euo pipefail
AUTH_VOLUME=${AUTH_VOLUME:-kalos-web-data}
OUT_DIR=${OUT_DIR:?set OUT_DIR}
BACKUP_IMAGE=${BACKUP_IMAGE:-kalos-auth-backup:local}
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$OUT_DIR"; chmod 0777 "$OUT_DIR" 2>/dev/null || true   # sidecar is uid 10001

enc_args=(); enc_cmd=""
if [[ -n "${AGE_RECIPIENT:-}" ]]; then
  enc_cmd="age -r '$AGE_RECIPIENT' -o /out/auth-$TS.db.age /tmp/snap.db"
elif [[ -n "${OPENSSL_PASS_FILE:-}" ]]; then
  enc_args=(-v "$OPENSSL_PASS_FILE:/run/pass:ro")
  # CBC is unauthenticated: the sha256 detects corruption, NOT tampering by someone who can rewrite both. Prefer age.
  enc_cmd="openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in /tmp/snap.db -out /out/auth-$TS.db.enc -pass file:/run/pass && (cd /out && sha256sum auth-$TS.db.enc > auth-$TS.db.enc.sha256)"
else
  echo "set AGE_RECIPIENT (preferred) or OPENSSL_PASS_FILE" >&2; exit 2
fi

docker run --rm --user 10001:10001 --network none \
  -v "$AUTH_VOLUME:/data" -v "$OUT_DIR:/out" ${enc_args[@]+"${enc_args[@]}"} "$BACKUP_IMAGE" sh -euc "
    umask 077
    # online snapshot via the SQLite backup API (consistent with concurrent WAL writers)
    sqlite3 /data/auth.db '.timeout 5000' '.backup /tmp/snap.db'
    test -s /tmp/snap.db
    test \"\$(sqlite3 /tmp/snap.db 'PRAGMA integrity_check')\" = ok
    sqlite3 /tmp/snap.db 'select \"users=\"||count(*) from user'
    $enc_cmd || exit 1
    rm -f /tmp/snap.db
    ls -l /out | tail -n +2
  "
echo "backup written to $OUT_DIR (ts=$TS)"
