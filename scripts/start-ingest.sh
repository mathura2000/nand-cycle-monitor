#!/usr/bin/env bash
set -e

PORT=3001
URL="http://localhost:$PORT/ingest"

# Kill any existing dev server on this port
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null || true

echo "Starting dev server on port $PORT..."
npm run dev -- --port $PORT &
DEV_PID=$!

# Trap Ctrl-C to kill the dev server cleanly
trap "kill $DEV_PID 2>/dev/null; echo; echo 'Dev server stopped.'; exit 0" INT TERM

# Poll until ready (max 30s)
TRIES=0
until curl -s -o /dev/null "http://localhost:$PORT" 2>/dev/null; do
  sleep 1
  TRIES=$((TRIES + 1))
  if [ $TRIES -ge 30 ]; then
    echo "Error: dev server did not start within 30s"
    kill $DEV_PID 2>/dev/null
    exit 1
  fi
done

echo "Ready at $URL"

# Open browser (macOS / Linux)
if command -v open &>/dev/null; then
  open "$URL"
elif command -v xdg-open &>/dev/null; then
  xdg-open "$URL"
else
  echo "Open $URL in your browser"
fi

echo ""
echo "Ready — close this terminal when done ingesting"
echo ""

# Keep running so dev server stays alive
wait $DEV_PID
