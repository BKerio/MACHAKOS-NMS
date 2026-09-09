#!/usr/bin/env bash
# Deploys the current master branch to this server: pulls latest code
# (preserving the untracked .env files), installs deps, runs pending Prisma
# migrations, rebuilds both apps, and reloads the running services.
#
# Invoked by .github/workflows/deploy.yml over SSH on every push to master.
# Safe to run by hand too - just `bash scripts/deploy.sh` from anywhere.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Pull latest, preserving the gitignored .env files ───────────────────────
cp backend/.env /tmp/nms-eoc-backend.env.bak
test -f frontend/.env && cp frontend/.env /tmp/nms-eoc-frontend.env.bak

git fetch origin
git reset --hard origin/master

cp /tmp/nms-eoc-backend.env.bak backend/.env
test -f /tmp/nms-eoc-frontend.env.bak && cp /tmp/nms-eoc-frontend.env.bak frontend/.env

# ── Backend ──────────────────────────────────────────────────────────────
cd "$REPO_ROOT/backend"
npm ci
npx prisma migrate deploy
npm run build
pm2 reload nms-backend --update-env

# ── Frontend ─────────────────────────────────────────────────────────────
cd "$REPO_ROOT/frontend"
npm ci
npm run build

# ── Web server ───────────────────────────────────────────────────────────
sudo systemctl reload nginx

pm2 status nms-backend
