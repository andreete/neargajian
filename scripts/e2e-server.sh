#!/bin/sh
# Starts the production build for Playwright on 127.0.0.1:8092 with a FRESH, isolated
# database (.tmp/e2e) seeded with the demo data. Playwright stops it after the run.
# Requires a prior `npm run build`.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e
mkdir -p .tmp/e2e
export DATABASE_URL="file:./.tmp/e2e/sentfund.sqlite"
export DEMO_MODE=true
# Browser tests use the labelled test stub for the payroll assistant, never the real Claude API.
export ASSISTANT_STUB=browser-tests
# ... and the labelled test stub KTP reader for identity checks (the face engine is the real one).
export IDENTITY_STUB=browser-tests
node --env-file-if-exists=.env scripts/db.ts seed >/dev/null
# Test-only runs in every lifecycle state (stand-in vault, no testnet); IDs for the specs.
node --env-file-if-exists=.env scripts/e2e-fixture.ts > .tmp/e2e/fixture.json
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
