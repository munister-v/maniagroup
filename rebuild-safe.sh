#!/usr/bin/env bash
# Memory-safe rebuild for the small VPS (1.7 GB RAM).
# Stops pm2 before building to free ~360 MB, builds with heap cap, then restarts.
# Run: nohup bash /opt/maniagroup/rebuild-safe.sh & tail -f /opt/maniagroup/deploy-safe.log
set -uo pipefail
cd /opt/maniagroup
exec > /opt/maniagroup/deploy-safe.log 2>&1
echo "START $(date)"

# ── Preflight: DATABASE_URL must exist in .env.local before we touch anything.
# It has bitten us twice (2026-06-25, 2026-07-01) — .next cache silently
# carried a stale copy until a cache wipe exposed the missing var and the
# site died with "SASL: client password must be a string".
if ! grep -q '^DATABASE_URL=postgresql://' .env.local 2>/dev/null; then
  echo "PREFLIGHT FAILED: DATABASE_URL missing or malformed in .env.local — aborting before any changes"
  echo "DONE-FAIL $(date)"
  exit 1
fi
echo "preflight OK: DATABASE_URL present"

echo "stopping pm2 maniagroup to free RAM"
pm2 stop maniagroup || true
sleep 2
free -m | awk "/Mem:/{print \"avail before build: \"\$7\"MB\"}"
echo "npm ci"
npm ci --prefer-offline >/dev/null 2>&1 || npm install >/dev/null 2>&1
echo "building into .next-build (heap cap 1100MB)"
rm -rf .next-build
NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=1100 npm run build
RC=$?
if [ $RC -ne 0 ]; then
  echo "BUILD FAILED rc=$RC — restarting old .next"
  pm2 restart maniagroup || pm2 start ecosystem.config.js
  echo "DONE-FAIL $(date)"
  exit $RC
fi
echo "swap build in"
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next
echo "restart pm2"
pm2 restart maniagroup || pm2 start ecosystem.config.js
pm2 save || true
# Flush pm2's log files right after restart so the smoke test below only ever
# sees errors from THIS run — otherwise stale crash lines from a previous,
# already-fixed incident get re-matched and trigger a false-positive rollback.
pm2 flush maniagroup || true

# ── Smoke test: hit the site and check pm2 error log for the DB/SASL crash
# signature. If it's broken, auto-rollback to the previous .next build rather
# than leaving the site down until someone notices.
echo "smoke test"
sleep 4
PORT=$(node -e "try{console.log(require('./ecosystem.config.js').apps[0].env.PORT||3010)}catch(e){console.log(3010)}" 2>/dev/null || echo 3010)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://localhost:${PORT}/" || echo "000")
RECENT_ERR=$(pm2 logs maniagroup --lines 20 --nostream 2>/dev/null | grep -c "SASL\|ECONNREFUSED\|client password must be a string" || true)

if [ "$HTTP_CODE" != "200" ] || [ "${RECENT_ERR:-0}" -gt 0 ]; then
  echo "SMOKE TEST FAILED (http=$HTTP_CODE errors=$RECENT_ERR) — rolling back to previous build"
  rm -rf .next-broken
  mv .next .next-broken
  if [ -d .next-old ]; then
    mv .next-old .next
    pm2 restart maniagroup || pm2 start ecosystem.config.js
    echo "ROLLED BACK to previous .next"
  else
    echo "NO PREVIOUS BUILD TO ROLL BACK TO — site may be down, manual intervention required"
  fi
  echo "DONE-FAIL $(date)"
  exit 1
fi

echo "smoke test OK (http=$HTTP_CODE)"
echo "OK DEPLOYED $(date)"
