#!/bin/sh
# Starts the production build for Playwright on 127.0.0.1:8092 with a FRESH, isolated
# database (.tmp/e2e) seeded with the demo data. Playwright stops it after the run.
# Requires a prior `npm run build`.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e
mkdir -p .tmp/e2e
export DATABASE_URL="file:./.tmp/e2e/gajian.sqlite"
export DEMO_MODE=true
node --env-file-if-exists=.env scripts/db.ts seed >/dev/null
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
