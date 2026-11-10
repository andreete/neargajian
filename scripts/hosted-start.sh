#!/bin/sh
# Hosted demo entry point (Dockerfile CMD; Railway runs it as the service's start command).
# 1. prepares the database on the volume (migrations; first-boot or DEMO_RESET_TOKEN reset),
# 2. starts the web app and the release worker in this one service,
# 3. if EITHER process exits, stops the other and exits non-zero, so Railway's restart policy
#    restarts the whole service (the two never run without each other).
# SIGTERM/SIGINT (a redeploy or stop) are passed to both; the worker finishes its current step.
set -eu
cd "$(dirname "$0")/.."
: "${PORT:=8080}"
: "${HOST:=0.0.0.0}"
export DATABASE_URL="${DATABASE_URL:-file:/data/sentfund.sqlite}"
export NODE_ENV=production

node scripts/hosted-prepare.ts

node node_modules/next/dist/bin/next start -H "$HOST" -p "$PORT" &
web=$!
node src/worker/index.ts &
worker=$!
echo "{\"service\":\"hosted-start\",\"event\":\"started\",\"web\":$web,\"worker\":$worker,\"port\":$PORT}"

stop() {
  kill -TERM "$web" "$worker" 2>/dev/null || true
  wait "$web" 2>/dev/null || true
  wait "$worker" 2>/dev/null || true
}
trap 'echo "{\"service\":\"hosted-start\",\"event\":\"signal\"}"; stop; exit 0' TERM INT

while kill -0 "$web" 2>/dev/null && kill -0 "$worker" 2>/dev/null; do
  sleep 2
done
if kill -0 "$web" 2>/dev/null; then dead=worker; else dead=web; fi
echo "{\"service\":\"hosted-start\",\"event\":\"process_exited\",\"process\":\"$dead\",\"action\":\"stopping the service\"}" >&2
stop
exit 1
