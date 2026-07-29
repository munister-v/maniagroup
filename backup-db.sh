#!/usr/bin/env bash
# Daily Postgres backup for maniagroup, with 14-day rotation.
# Run via cron: 0 3 * * * /opt/maniagroup/backup-db.sh >> /opt/backups/backup.log 2>&1
set -uo pipefail

BACKUP_DIR=/opt/backups
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/maniagroup-$STAMP.sql.gz"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Credentials come from .env.local, the same file `next start` reads. They used
# to be hardcoded right here — which put the live Postgres password into this
# public repo, so never inline them again.
DATABASE_URL=$(grep -m1 '^DATABASE_URL=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2-)
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[$(date)] BACKUP FAILED: no DATABASE_URL in $APP_DIR/.env.local"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
echo "[$(date)] starting backup -> $OUT"

if pg_dump --no-owner --no-privileges --clean --if-exists "$DATABASE_URL" | gzip > "$OUT.tmp"; then
  mv "$OUT.tmp" "$OUT"
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "[$(date)] backup OK: $OUT ($SIZE)"
else
  rm -f "$OUT.tmp"
  echo "[$(date)] BACKUP FAILED"
  exit 1
fi

# Rotate: delete dumps older than KEEP_DAYS (skip the manual prewipe snapshot).
find "$BACKUP_DIR" -maxdepth 1 -name 'maniagroup-2*.sql.gz' -mtime +$KEEP_DAYS -delete
echo "[$(date)] rotation done, kept last $KEEP_DAYS days"
