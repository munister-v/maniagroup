#!/usr/bin/env bash
# Mirror the files that exist ONLY on disk into /opt/backups/files.
# Run via cron: 30 3 * * 0 /opt/maniagroup/backup-files.sh >> /opt/backups/backup.log 2>&1
#
# backup-db.sh dumps Postgres, which covers everything except the bytes: product
# photos migrated off WordPress (public/catalog) and admin-uploaded images
# (public/uploads). Once the catalog points at local files, WordPress is no
# longer a fallback copy — losing this directory means losing the photos.
#
# This is a same-disk mirror. It protects against the realistic accidents (a
# stray rm, an rsync --delete, a bad deploy) but NOT against losing the volume.
# Offsite copies of /opt/backups are still needed for that.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/backups/files

mkdir -p "$DEST"
echo "[$(date)] mirroring product files -> $DEST"

RC=0
for dir in public/catalog public/uploads; do
  [ -d "$APP_DIR/$dir" ] || { echo "  skip $dir (absent)"; continue; }
  # --delete keeps the mirror honest, but only inside $DEST, which holds
  # nothing else. Trailing slashes matter: copy contents, not the dir itself.
  if rsync -a --delete "$APP_DIR/$dir/" "$DEST/${dir##*/}/"; then
    echo "  $dir -> $(du -sh "$DEST/${dir##*/}" | cut -f1)"
  else
    echo "  FAILED: $dir"
    RC=1
  fi
done

if [ $RC -eq 0 ]; then
  echo "[$(date)] files backup OK ($(du -sh "$DEST" | cut -f1) total)"
else
  echo "[$(date)] FILES BACKUP FAILED"
fi
exit $RC
