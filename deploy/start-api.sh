#!/usr/bin/env bash
# Start / restart SafeXchange API on the production server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"

cd "$BACKEND"

if [[ ! -f .env ]]; then
  echo "Missing backend/.env — copy .env.example and set MONGODB_URI, JWT_SECRET, CORS_ORIGIN"
  exit 1
fi

npm install --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --update-env || pm2 restart safex-api --update-env
  pm2 save
  echo "PM2 status:"
  pm2 status safex-api
else
  echo "PM2 not found — starting with node (use pm2 for production)"
  NODE_ENV=production node src/server.js
fi

echo ""
echo "Verify:"
echo "  curl -s https://api.safexchange.io/api/health"
echo "Expected JSON with success:true — not 503 HTML"
