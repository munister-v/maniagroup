#!/usr/bin/env bash
# Mirror the files that exist ONLY on disk into /opt/backups/files.
# Run via cron: 30 3 * * 0 /opt/maniagroup/backup-files.sh >> /opt/backups/backup.log 2>&1
#
# backup-db.sh dumps Postgres, which covers everything except the bytes: product
# photos migrated off WordPress and admin-uploaded images. Once the catalog
# points at local files, WordPress is no longer a fallback copy — losing this
# directory means losing the photos.
#
# ⚠️ Медіа живуть НЕ в public/. Раніше скрипт дивився в $APP_DIR/public/catalog
# і public/uploads — а фото давно переїхали в /var/lib/maniagroup/media (1.4 ГБ).
# Він чесно писав «skip (absent)», одразу за цим «files backup OK», і в логах
# усе виглядало здоровим, поки копіювалось НІЧОГО. Тому тепер: шлях беремо з
# MEDIA_ROOT (той самий, що в backup-offsite.sh), а відсутнє або порожнє
# джерело — це ПОМИЛКА, а не «skip». Бекап, який мовчки нічого не робить,
# гірший за відсутній: на нього розраховують.
#
# This is a same-disk mirror. It protects against the realistic accidents (a
# stray rm, an rsync --delete, a bad deploy) but NOT against losing the volume.
# backup-offsite.sh covers that.
set -uo pipefail

MEDIA_ROOT="${MEDIA_ROOT:-/var/lib/maniagroup/media}"
DEST=/opt/backups/files

mkdir -p "$DEST"
echo "[$(date)] mirroring product files: $MEDIA_ROOT -> $DEST"

if [ ! -d "$MEDIA_ROOT" ]; then
  echo "[$(date)] FILES BACKUP FAILED: немає каталогу $MEDIA_ROOT"
  echo "  Якщо медіа переїхали — виправ MEDIA_ROOT тут і в backup-offsite.sh."
  exit 1
fi

RC=0
COPIED=0
for dir in catalog uploads; do
  SRC="$MEDIA_ROOT/$dir"
  if [ ! -d "$SRC" ]; then
    echo "  ВІДСУТНЄ: $SRC"
    RC=1
    continue
  fi
  # --delete keeps the mirror honest, but only inside $DEST, which holds
  # nothing else. Trailing slashes matter: copy contents, not the dir itself.
  if rsync -a --delete "$SRC/" "$DEST/$dir/"; then
    N=$(find "$DEST/$dir" -type f | wc -l)
    echo "  $dir -> $(du -sh "$DEST/$dir" | cut -f1), файлів: $N"
    # Порожня копія — теж провал: значить джерело вимели, і ми щойно
    # відзеркалили порожнечу поверх єдиної локальної копії.
    [ "$N" -gt 0 ] || { echo "  ПОРОЖНЬО після синхронізації: $dir"; RC=1; }
    COPIED=$((COPIED + N))
  else
    echo "  FAILED: $dir"
    RC=1
  fi
done

if [ $RC -eq 0 ] && [ $COPIED -gt 0 ]; then
  echo "[$(date)] files backup OK ($(du -sh "$DEST" | cut -f1), файлів: $COPIED)"
else
  echo "[$(date)] FILES BACKUP FAILED (скопійовано файлів: $COPIED)"
fi
exit $RC
