#!/usr/bin/env bash
# Run from backend root: bash scripts/start-production.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "[fatal] Missing $ROOT/.env — copy .env.example and fill JWT_SECRET, MONGODB_URI, etc."
  exit 1
fi

if ! grep -q '^JWT_SECRET=.\{16,\}' .env 2>/dev/null; then
  echo "[fatal] JWT_SECRET missing or too short in .env (min 16 chars)"
  exit 1
fi

if [[ ! -f ecosystem.config.cjs ]]; then
  echo "[fatal] ecosystem.config.cjs not found in $ROOT"
  exit 1
fi

npm install --omit=dev

pm2 delete safex-api safex-worker api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo
echo "Expected PM2 layout:"
echo "  safex-api    — HTTP + WebSocket (API_INSTANCES from .env, default 1)"
echo "  safex-worker — background monitors (order fill, futures, staking)"
echo
pm2 status
echo
echo "Health check:"
curl -sf "http://127.0.0.1:${PORT:-5001}/api/health" || curl -sf "http://127.0.0.1:5001/api/health" || true
echo
