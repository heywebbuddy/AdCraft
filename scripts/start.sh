#!/bin/sh
# Container entrypoint: hand the volume to the app user, drop privileges, migrate, then serve.
set -e
cd /app
STORE="${LOCAL_STORAGE_DIR:-/data/files}"
UID_APP="${APP_UID:-10001}"
GID_APP="${APP_GID:-10001}"

if [ "$(id -u)" = "0" ]; then
  # Railway mounts the volume as root. Give it to the app user once (the recursive pass only
  # happens the first time, when the ownership still differs), then re-run this script as them.
  mkdir -p "$STORE"
  if [ "$(stat -c %u "$STORE")" != "$UID_APP" ]; then
    echo "[start] handing $STORE to uid $UID_APP"
    chown -R "$UID_APP:$GID_APP" "$STORE" || echo "[start] could not chown $STORE; continuing"
  fi
  chown "$UID_APP:$GID_APP" "$(dirname "$STORE")" 2>/dev/null || true
  echo "[start] dropping privileges to uid $UID_APP"
  exec setpriv --reuid="$UID_APP" --regid="$GID_APP" --init-groups --inh-caps=-all "$0" "$@"
fi

if [ -n "$DATABASE_URL" ]; then
  echo "[start] running migrations"
  pnpm --filter @adcraft/db db:migrate
else
  echo "[start] DATABASE_URL is empty — using embedded PGlite (data does not survive a redeploy)"
fi
cd apps/app
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
