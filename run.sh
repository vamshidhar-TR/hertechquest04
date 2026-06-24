#!/usr/bin/env bash
# Start the CoCounsel Variance Alerts demo (backend on :3001, frontend on :4200).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▸ Installing dependencies (first run only)…"
(cd "$ROOT/backend" && npm install --silent)
(cd "$ROOT/frontend" && npm install --silent)

echo "▸ Starting backend  → http://localhost:3001"
(cd "$ROOT/backend" && npm start) &
BE=$!

echo "▸ Starting frontend → http://localhost:4200"
(cd "$ROOT/frontend" && npm start) &
FE=$!

trap "kill $BE $FE 2>/dev/null" EXIT
echo ""
echo "  Open http://localhost:4200  (Ctrl-C to stop)"
echo "  Optional: export ANTHROPIC_API_KEY=… before running to enable Claude explanations + NL parsing."
wait
