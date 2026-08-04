#!/usr/bin/env bash
# =============================================================================
# dev.sh — one-command local startup for Finné (FND-05).
#
# Starts MongoDB (via Docker), the backend (API + indexer + scheduler), and
# the web app. Everything runs against local services — no AWS/Circle/Arc
# credentials needed for the core product loop.
#
# Usage:  ./scripts/dev.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Finné local dev startup (FND-05)"
echo ""

# ── 1. MongoDB ─────────────────────────────────────────────────────────────
if ! docker ps --filter "name=finne-mongo" --filter "status=running" | grep -q finne-mongo; then
  echo "==> 1/3  Starting MongoDB (Docker)..."
  docker run -d --name finne-mongo -p 27017:27017 mongo:7 2>/dev/null || {
    echo "    MongoDB container already exists; starting it..."
    docker start finne-mongo 2>/dev/null || true
  }
else
  echo "==> 1/3  MongoDB already running."
fi

# ── 2. Backend ─────────────────────────────────────────────────────────────
echo "==> 2/3  Starting backend (API on :4000)..."
# The backend runs via tsx (no compile step). It boots the v1 API alongside
# the existing legacy routes. Set DEMO_MODE=true for the demo gates.
(
  cd "$ROOT/backend"
  MONGO_URL=mongodb://127.0.0.1:27017/finne \
  DEMO_MODE=true \
  NODE_ENV=local \
  npm run dev 2>&1 | sed 's/^/    [backend] /'
) &
BACKEND_PID=$!

# ── 3. Web ─────────────────────────────────────────────────────────────────
echo "==> 3/3  Starting web app (Vite on :5173)..."
(
  cd "$ROOT/web"
  npm run dev 2>&1 | sed 's/^/    [web] /'
) &
WEB_PID=$!

echo ""
echo "==> All services starting."
echo "    Backend API:  http://localhost:4000"
echo "    Web app:      http://localhost:5173"
echo "    Health:       http://localhost:4000/health/live"
echo "    API docs:     http://localhost:4000/api-docs"
echo ""
echo "    Press Ctrl+C to stop all services."

# Cleanup on exit
trap 'kill $BACKEND_PID $WEB_PID 2>/dev/null; echo "Stopped."; exit 0' INT TERM
wait
