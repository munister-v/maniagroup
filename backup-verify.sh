#!/usr/bin/env bash
# Перевірка, що свіжий дамп справді відновлюється.
# Cron: 45 3 * * * /opt/maniagroup/backup-verify.sh >> /opt/backups/backup.log 2>&1
#
# Досі про бекапи було відомо рівно одне: pg_dump завершився нулем і файл
# ненульового розміру. Це не те саме, що «з нього можна підняти магазин» —
# обрізаний gzip, дамп напівпорожньої бази чи дамп, зроблений під час міграції,
# усі виглядають як успіх. Єдиний спосіб дізнатись — відновити й подивитись.
#
# Тому: беремо НАЙСВІЖІШИЙ дамп, ллємо у тимчасову базу, рахуємо рядки в
# ключових таблицях і порівнюємо з бойовою. Тимчасову базу прибираємо завжди,
# навіть якщо впали посередині.
set -uo pipefail

BACKUP_DIR=/opt/backups
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRATCH_DB="maniagroup_verify_$$"
# Скільки відсотків рядків дозволено втратити відносно бойової бази. Дамп
# знімається о 03:00, перевірка о 03:45 — за цей час каталог може трохи
# змінитись імпортом залишків, тож нуль тут був би хибною тривогою.
TOLERANCE_PCT=5

DATABASE_URL=$(grep -m1 '^DATABASE_URL=' "$APP_DIR/.env.local" 2>/dev/null | cut -d= -f2-)
[ -n "${DATABASE_URL:-}" ] || { echo "[$(date)] VERIFY FAILED: немає DATABASE_URL"; exit 1; }

# Тимчасову базу створюємо від суперкористувача через локальний сокет:
# застосунковий роль maniagroup навмисно БЕЗ права CREATEDB, і видавати їй це
# право заради перевірки — гірше, ніж зайти збоку. Скрипт і так виконується
# від root за cron.
su - postgres -c 'psql -qAtc "select 1"' >/dev/null 2>&1 || {
  echo "[$(date)] VERIFY FAILED: немає доступу до postgres через локальний сокет"
  exit 1
}

LATEST=$(find "$BACKUP_DIR" -maxdepth 1 -name 'maniagroup-2*.sql.gz' -printf '%T@ %p\n' \
         | sort -rn | head -1 | cut -d' ' -f2-)
[ -n "$LATEST" ] || { echo "[$(date)] VERIFY FAILED: у $BACKUP_DIR немає жодного дампу"; exit 1; }

AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
echo "[$(date)] перевіряю $LATEST (вік ${AGE_H} год)"

# Дамп старший за добу означає, що cron мовчки не відпрацював.
if [ "$AGE_H" -gt 26 ]; then
  echo "[$(date)] VERIFY FAILED: найсвіжішому дампу ${AGE_H} год — бекап не робиться"
  exit 1
fi

# 1. Цілісність архіву. Обрізаний gzip далі однаково не розпакується, але так
#    ми відрізняємо «побився файл» від «побилось відновлення».
if ! gzip -t "$LATEST"; then
  echo "[$(date)] VERIFY FAILED: архів побитий (gzip -t)"
  exit 1
fi

cleanup() {
  su - postgres -c "psql -qAtc \"DROP DATABASE IF EXISTS $SCRATCH_DB\"" >/dev/null 2>&1
  rm -f "${DUMP_TMP:-}" "${ERRLOG:-}"
}
trap cleanup EXIT

if ! su - postgres -c "psql -qAtc \"CREATE DATABASE $SCRATCH_DB\"" >/dev/null; then
  echo "[$(date)] VERIFY FAILED: не вдалося створити $SCRATCH_DB"
  exit 1
fi

# 2. Власне відновлення. stderr зберігаємо: psql на дампі з --clean шумить
#    «does not exist, skipping» — це нормально, а от решта помилок цікава.
#    Дамп кладемо у файл, доступний postgres: пайпнути в su не вийде, а
#    /opt/backups для нього закритий.
ERRLOG=$(mktemp)
DUMP_TMP=$(mktemp /tmp/verify-XXXXXX.sql)
gzip -dc "$LATEST" > "$DUMP_TMP"
chmod 644 "$DUMP_TMP"
su - postgres -c "psql -d $SCRATCH_DB -v ON_ERROR_STOP=0 -q -f $DUMP_TMP" > /dev/null 2> "$ERRLOG"
REAL_ERRORS=$(grep -c '^ERROR' "$ERRLOG" 2>/dev/null | tr -d ' ')
REAL_ERRORS=${REAL_ERRORS:-0}
# «not exist, skipping» від DROP ... IF EXISTS до помилок не рахуємо.
BENIGN=$(grep -c 'does not exist, skipping' "$ERRLOG" 2>/dev/null | tr -d ' ')
BENIGN=${BENIGN:-0}

echo "  відновлено; повідомлень ERROR: $REAL_ERRORS (з них нешкідливих skip: $BENIGN)"

# 3. Головне: чи є в базі дані. Порівнюємо з бойовою по ключових таблицях.
STATUS=0
for tbl in products product_variants orders; do
  LIVE=$(psql "$DATABASE_URL" -qAtc "SELECT count(*) FROM $tbl" 2>/dev/null || echo "x")
  REST=$(su - postgres -c "psql -d $SCRATCH_DB -qAtc 'SELECT count(*) FROM $tbl'" 2>/dev/null || echo "x")
  REST=$(echo "$REST" | tr -d '[:space:]')
  [ -n "$REST" ] || REST="x"
  if [ "$REST" = "x" ]; then
    echo "  $tbl: ТАБЛИЦІ НЕМАЄ у відновленій базі"
    STATUS=1
    continue
  fi
  if [ "$LIVE" = "x" ]; then
    echo "  $tbl: відновлено $REST (бойову прочитати не вдалося — порівняння пропущено)"
    continue
  fi
  # Поріг рахуємо від бойової кількості; порожня бойова таблиця (orders на
  # старті) не має валити перевірку.
  MIN=$(( LIVE - (LIVE * TOLERANCE_PCT / 100) ))
  if [ "$REST" -ge "$MIN" ]; then
    echo "  $tbl: $REST / $LIVE — ок"
  else
    echo "  $tbl: $REST / $LIVE — ЗАМАЛО (поріг $MIN)"
    STATUS=1
  fi
done


if [ $STATUS -eq 0 ] && [ "$REAL_ERRORS" -le "$BENIGN" ]; then
  echo "[$(date)] VERIFY OK: дамп відновлюється, дані на місці"
else
  echo "[$(date)] VERIFY FAILED: дамп відновився не повністю — розібратись ДО того, як він знадобиться"
  exit 1
fi
