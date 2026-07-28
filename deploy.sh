#!/usr/bin/env bash
# Deploy from git, then rebuild. Runs ON the VPS:
#   bash /opt/maniagroup/deploy.sh [branch]
#
# Replaces the old rsync-from-laptop flow. That flow had no way to notice the
# server was AHEAD of the local tree: on 2026-07-28 it silently reverted 30
# files of ERP work written directly on the server and never committed, and the
# two "deploys" after it did nothing at all — the build was failing and
# rebuild-safe.sh kept rolling back to the previous .next, with no output on the
# terminal to say so.
#
# Hence two rules here: refuse to run on a dirty tree (never stash someone's
# uncommitted server work), and always report the build verdict explicitly.
#
# .env.local lives ONLY on the VPS (DATABASE_URL, Nova Poshta key) and is
# gitignored — a pull can never clobber it.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
echo "== deploy: branch $BRANCH =="

DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  echo "ABORT: uncommitted changes in the server working tree:"
  echo "$DIRTY" | sed 's/^/    /'
  echo
  echo "That is real work someone did on the server. Commit and push it, or"
  echo "discard it deliberately (git checkout -- <file>), then re-run."
  exit 1
fi

echo "-- fetching origin/$BRANCH"
git fetch --quiet origin "$BRANCH" || { echo "ABORT: fetch failed"; exit 1; }

BEFORE=$(git rev-parse HEAD)
AFTER=$(git rev-parse FETCH_HEAD)
if [ "$BEFORE" = "$AFTER" ]; then
  echo "-- already at ${BEFORE:0:8}, rebuilding anyway"
else
  echo "-- ${BEFORE:0:8} -> ${AFTER:0:8}"
  git log --oneline "$BEFORE..$AFTER" | sed 's/^/    /'
  git merge --ff-only FETCH_HEAD || { echo "ABORT: not a fast-forward"; exit 1; }
fi

# rebuild-safe.sh does npm install, the heap-capped build (this box has 1.7 GB
# and a plain build OOMs it), the .next swap, the pm2 restart and a smoke test
# that rolls back on failure. It redirects everything to deploy-safe.log and
# prints nothing, so read the verdict back out.
echo "-- rebuilding (detail in deploy-safe.log)"
bash ./rebuild-safe.sh
tail -n 3 ./deploy-safe.log | sed 's/^/    /'

if tail -n 5 ./deploy-safe.log | grep -q "OK DEPLOYED"; then
  echo "== deploy OK -> https://maniagroup.munister.com.ua =="
else
  echo "== DEPLOY FAILED: site left on the previous build, see deploy-safe.log =="
  exit 1
fi
