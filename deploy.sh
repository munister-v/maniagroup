#!/usr/bin/env bash
# Deploy Mania Group → VPS via rsync
# Usage: ./deploy.sh
set -euo pipefail

HOST="${MANIA_HOST:-root@173.242.49.73}"
KEY="${MANIA_KEY:-$HOME/.ssh/teached_vps}"
REMOTE_DIR="/opt/maniagroup"

echo "→ Syncing files…"
rsync -az -e "ssh -i $KEY" \
  --delete \
  --exclude='.git' \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='data/*.db' \
  --exclude='data/*.db-shm' \
  --exclude='data/*.db-wal' \
  ./ "$HOST:$REMOTE_DIR/"

echo "→ Installing & building…"
ssh -i "$KEY" "$HOST" "
  set -e
  cd $REMOTE_DIR
  npm install --silent
  npm run build
  pm2 restart maniagroup --update-env
"

echo "✓ Deployed → https://maniagroup.munister.com.ua"
