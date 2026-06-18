#!/usr/bin/env bash
# Zero-downtime deploy for Mania Group. Runs ON the VPS (cwd /opt/maniagroup).
# Source is synced via rsync from local (NOT git). Full workflow:
#
#   rsync -az --delete \
#     --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='.next-old' \
#     --exclude='.env.local' --exclude='public/uploads/brands' \
#     /Users/vyacheslawmunister/maniagroup/ root@173.242.49.73:/opt/maniagroup/
#   ssh -i ~/.ssh/ivengo_deploy root@173.242.49.73 'bash /opt/maniagroup/deploy.sh'
#
# ⚠️  .env.local lives ONLY on VPS (contains DATABASE_URL, secrets) — never rsync it.
# ⚠️  public/uploads/brands — logo cache, exclude from rsync too.
# Build goes into .next-build so the live .next stays up the entire time.
# PM2 cluster reload is graceful — one worker restarts while the other serves.
# Do NOT use --update-env with pm2 reload — it would clear DATABASE_URL from env.
set -euo pipefail
cd /opt/maniagroup

echo "▸ Installing deps…"
npm ci --prefer-offline >/dev/null 2>&1 || npm install >/dev/null 2>&1

echo "▸ Building into .next-build (live site stays up)…"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo "▸ Swapping build in…"
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next

echo "▸ Graceful reload…"
if pm2 describe maniagroup >/dev/null 2>&1 && pm2 describe maniagroup | grep -qi cluster; then
  pm2 reload ecosystem.config.js
else
  pm2 delete maniagroup >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js
  pm2 save >/dev/null 2>&1 || true
fi

echo "✓ Deployed → https://maniagroup.munister.com.ua"
