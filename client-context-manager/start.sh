#!/usr/bin/env bash
# Start the FlipHQ Client Context Manager in the background.
cd "$(dirname "$0")"
if curl -s http://localhost:4131/api/clients >/dev/null 2>&1; then
  echo "Already running at http://localhost:4131"
  exit 0
fi
nohup node server.js > server.log 2>&1 &
echo "Started. Dashboard at http://localhost:4131  (log: server.log)"
echo "Stop it with:  pkill -f 'node server.js'"
