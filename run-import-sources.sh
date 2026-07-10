#!/usr/bin/env bash
# Intertop 2.8 guide: "Оновлення залишків буде відбуватись автоматично раз
# на три години" — runs every registered URL-feed import source.
# Run via cron: 0 */3 * * * /opt/maniagroup/run-import-sources.sh >> /opt/maniagroup/import-sources.log 2>&1
set -uo pipefail

cd /opt/maniagroup || exit 1
SECRET=$(grep -m1 '^ADMIN_SECRET=' .env.local | sed 's/^ADMIN_SECRET=//')
if [ -z "$SECRET" ]; then
  echo "[$(date)] ADMIN_SECRET not set in .env.local — aborting"
  exit 1
fi

echo "[$(date)] running due import sources"
curl -s -X POST -H "x-cron-secret: $SECRET" http://127.0.0.1:3010/api/admin/import-sources/run-due
echo
