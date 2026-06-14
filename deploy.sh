#!/usr/bin/env bash
# Redeploy Mania Group staging → VPS (maniagroup.munister.com.ua)
# App: pm2 "maniagroup" on :3020, behind nginx. Source: this repo's main branch.
set -euo pipefail
HOST="${MANIA_HOST:-root@173.242.49.73}"
KEY="${MANIA_KEY:-$HOME/.ssh/ivengo_deploy}"

ssh -i "$KEY" "$HOST" 'set -e
  cd /opt/maniagroup
  git pull --ff-only
  npm ci
  npm run build
  pm2 restart maniagroup --update-env'

echo "✓ Deployed → https://maniagroup.munister.com.ua"
