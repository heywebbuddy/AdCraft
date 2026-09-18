#!/usr/bin/env bash
# Nightly Postgres backup: plain SQL, gzip, kept 14 days locally, optionally pushed to R2.
#   DATABASE_URL=postgres://… ./scripts/backup-db.sh
#   R2 upload when R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BACKUP_BUCKET are set (uses `aws` CLI).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
OUT_DIR="${BACKUP_DIR:-./.data/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/adcraft-$STAMP.sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE"
echo "wrote $FILE ($(du -h "$FILE" | cut -f1))"
find "$OUT_DIR" -name 'adcraft-*.sql.gz' -mtime +14 -delete
if [[ -n "${R2_BACKUP_BUCKET:-}" && -n "${R2_ACCOUNT_ID:-}" ]]; then
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 cp "$FILE" "s3://$R2_BACKUP_BUCKET/db/$(basename "$FILE")" --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
  echo "uploaded to r2://$R2_BACKUP_BUCKET/db/"
fi
