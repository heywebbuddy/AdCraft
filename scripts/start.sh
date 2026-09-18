#!/bin/sh
# Container entrypoint: apply pending migrations, then serve the app.
set -e
cd /app
if [ -n "$DATABASE_URL" ]; then
  echo "[start] running migrations"
  pnpm --filter @adcraft/db db:migrate
else
  echo "[start] DATABASE_URL is empty — using embedded PGlite (data does not survive a redeploy)"
fi
mkdir -p "${LOCAL_STORAGE_DIR:-/data/files}"
cd apps/app
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
