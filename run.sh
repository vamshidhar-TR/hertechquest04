#!/usr/bin/env bash
# Start the TaxLens demo (backend on :3001, frontend on :4200).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---- Preflight: required tools ----
missing=0
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js is not installed (or not on PATH). Install Node 18+ from https://nodejs.org/ and re-run." >&2
  missing=1
else
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "${NODE_MAJOR:-0}" -lt 18 ]; then
    echo "✗ Node.js $(node -v) is too old — this app needs Node 18+ (20 or 22 recommended)." >&2
    missing=1
  fi
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "✗ npm is not installed (or not on PATH). It ships with Node.js — install Node from https://nodejs.org/." >&2
  missing=1
fi
if [ "$missing" -eq 1 ]; then
  echo "Aborting: install the missing tool(s) above, then re-run ./run.sh" >&2
  exit 1
fi
echo "✓ node $(node -v) · npm $(npm -v)"

# Never let the Angular CLI's interactive analytics prompt block a non-interactive start.
export NG_CLI_ANALYTICS=false

echo "▸ Installing dependencies (first run only)…"
(cd "$ROOT/backend" && npm install --silent)
(cd "$ROOT/frontend" && npm install --silent)

# The Angular CLI (ng) is installed locally by the frontend install above.
if [ ! -x "$ROOT/frontend/node_modules/.bin/ng" ]; then
  echo "✗ Angular CLI (ng) was not found after install — check the npm output above for errors." >&2
  exit 1
fi

echo "▸ Starting backend  → http://localhost:3001"
(cd "$ROOT/backend" && npm start) &
BE=$!

echo "▸ Starting frontend → http://localhost:4200"
(cd "$ROOT/frontend" && npm start) &
FE=$!

trap "kill $BE $FE 2>/dev/null" EXIT
echo ""
echo "  Open http://localhost:4200  (Ctrl-C to stop)"
echo "  Optional AI: set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN (+ ANTHROPIC_MODEL),"
echo "  or ANTHROPIC_API_KEY, before running to enable AI explanations + NL parsing."
wait
