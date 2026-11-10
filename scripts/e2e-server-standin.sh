#!/bin/sh
# TEST-ONLY browser tests of whole flows (Phase 23: Payroll Advance request → maker submit → both
# approvals → paid → next payroll with the instalment): the production build on 127.0.0.1:8092 with
# a FRESH database in .tmp/e2e-standin and the in-memory STAND-IN vault (VAULT_STANDIN=browser-tests,
# src/server/chain/standin.ts) + the worker tick inside the server. Nothing is sent to NEAR testnet:
# every signer key is blanked, and the pages show a "Stand-in vault" banner.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e-standin
mkdir -p .tmp/e2e-standin
export DATABASE_URL="file:./.tmp/e2e-standin/sentfund.sqlite"
export DEMO_MODE=true VAULT_STANDIN=browser-tests HOSTED_DEMO=false
export MAKER_SIGNER_PRIVATE_KEY= APPROVER1_SIGNER_PRIVATE_KEY= APPROVER2_SIGNER_PRIVATE_KEY= WORKER_SIGNER_PRIVATE_KEY= ADMIN_SIGNER_PRIVATE_KEY=
export ANTHROPIC_API_KEY= ASSISTANT_STUB=browser-tests IDENTITY_STUB=browser-tests
node --env-file-if-exists=.env scripts/db.ts seed >/dev/null
# The seed does not check testnet: mark the three live recipients "Ready" (the stand-in vault pays them).
node --env-file-if-exists=.env -e "
const D = require('better-sqlite3'); const db = new D('.tmp/e2e-standin/sentfund.sqlite');
db.prepare(\"update recipients set readiness = 'ready', readiness_checked_at = ? where sample = 0\").run(Date.now());"
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
