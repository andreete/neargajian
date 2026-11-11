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
# Phase 24: a fresh face template key for this run (never printed); the seed stores the demo
# employees' templates from the synthetic specimen face photos with it.
FACE_TEMPLATE_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")
export FACE_TEMPLATE_KEY APP_BASE_URL=http://127.0.0.1:8092
node --env-file-if-exists=.env scripts/db.ts seed >/dev/null
# The seed does not check testnet: mark the three live recipients "Ready" so the employees see the
# Payroll Advance offer (Phase 24 camera tests); nothing is sent anywhere.
node --env-file-if-exists=.env -e "
const D = require('better-sqlite3'); const db = new D('.tmp/e2e/sentfund.sqlite');
db.prepare(\"update recipients set readiness = 'ready', readiness_checked_at = ? where sample = 0\").run(Date.now());"
# Test-only runs in every lifecycle state (stand-in vault, no testnet); IDs for the specs.
node --env-file-if-exists=.env scripts/e2e-fixture.ts > .tmp/e2e/fixture.json
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
