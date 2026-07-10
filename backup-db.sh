#!/usr/bin/env bash
# Daily Postgres backup for maniagroup, with 14-day rotation.
# Run via cron: 0 3 * * * /opt/maniagroup/backup-db.sh >> /opt/backups/backup.log 2>&1
set -uo pipefail

BACKUP_DIR=/opt/backups
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/maniagroup-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[$(date)] starting backup -> $OUT"

if PGPASSWORD='6dddebe3b59cdf73539bb9afab8357aa4cfa0cca1b91f536' pg_dump -U maniagroup -h 127.0.0.1 -d maniagroup | gzip > "$OUT.tmp"; then
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
