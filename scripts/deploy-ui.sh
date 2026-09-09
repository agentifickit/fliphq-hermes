#!/usr/bin/env bash
# FlipHQ UI Deploy Script
# Called by GitHub Actions CI/CD after QA passes.
# Handles: npm install, kill old process, start new process, verify health.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$SCRIPT_DIR/client-onboarding-ui"
PORT=4133
LOG_FILE="/tmp/flippy-ui.log"

echo "=== FlipHQ UI Deploy ==="

# Step 1: Install dependencies
echo "→ Installing dependencies..."
cd "$UI_DIR"
if [ -f package-lock.json ]; then
  npm ci --production 2>/dev/null || npm install
else
  npm install
fi

# Step 2: Kill existing process
echo "→ Stopping existing server (if any)..."
if command -v lsof &>/dev/null; then
  lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
elif command -v fuser &>/dev/null; then
  fuser -k ${PORT}/tcp 2>/dev/null || true
fi
sleep 1

# Step 3: Start server
echo "→ Starting server on port $PORT..."
nohup node server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "  PID: $NEW_PID"

# Step 4: Verify health
echo "→ Verifying health..."
sleep 2

HEALTH_URL="http://localhost:$PORT/api/health"
MAX_RETRIES=5
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
  if curl -s "$HEALTH_URL" 2>/dev/null | grep -q '"ok"'; then
    echo "✓ Server healthy at $HEALTH_URL"
    exit 0
  fi
  RETRY=$((RETRY + 1))
  echo "  Retry $RETRY/$MAX_RETRIES..."
  sleep 2
done

echo "✗ Server failed to start. Last 10 lines of log:"
tail -10 "$LOG_FILE"
exit 1
