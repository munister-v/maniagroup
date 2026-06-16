#!/usr/bin/env bash
# Zero-downtime deploy for Mania Group. Runs ON the VPS (cwd /opt/maniagroup).
# Trigger:  ssh -i ~/.ssh/ivengo_deploy root@173.242.49.73 'bash /opt/maniagroup/deploy.sh'
#
# Builds into a side directory so the running server keeps serving the intact
# .next, swaps it in atomically, then does a graceful PM2 cluster reload — the
# site never drops, even mid-deploy.
set -euo pipefail
cd /opt/maniagroup

echo "▸ Pulling latest…"
git checkout -- package-lock.json 2>/dev/null || true
git stash -u >/dev/null 2>&1 || true
git pull

echo "▸ Installing deps…"
npm install >/dev/null 2>&1

echo "▸ Building into .next-build (live site stays up)…"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo "▸ Swapping build in…"
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-build .next

echo "▸ Graceful reload…"
if pm2 describe maniagroup >/dev/null 2>&1 && pm2 describe maniagroup | grep -qi cluster; then
  pm2 reload ecosystem.config.js --update-env
else
  # One-time switch to cluster mode; afterwards every reload is zero-downtime.
  pm2 delete maniagroup >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js
  pm2 save >/dev/null 2>&1 || true
fi

echo "✓ Deployed → https://maniagroup.munister.com.ua"
