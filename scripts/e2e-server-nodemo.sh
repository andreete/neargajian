#!/bin/sh
# Phase 25: the production build on 127.0.0.1:8092 with DEMO_MODE OFF (a fresh database in
# .tmp/e2e-nodemo). The demo seed needs DEMO_MODE=true, so the users are seeded first and the
# server then starts with DEMO_MODE=false: the sign-in dialog must show no "Demo accounts" box
# and no Fill buttons. No signer keys, no Claude key; nothing is sent to NEAR testnet.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e-nodemo
mkdir -p .tmp/e2e-nodemo
export DATABASE_URL="file:./.tmp/e2e-nodemo/sentfund.sqlite"
export HOSTED_DEMO=false FACE_TEMPLATE_KEY= APP_BASE_URL=http://127.0.0.1:8092
export MAKER_SIGNER_PRIVATE_KEY= APPROVER1_SIGNER_PRIVATE_KEY= APPROVER2_SIGNER_PRIVATE_KEY= WORKER_SIGNER_PRIVATE_KEY= ADMIN_SIGNER_PRIVATE_KEY=
export ANTHROPIC_API_KEY= ASSISTANT_STUB=browser-tests IDENTITY_STUB=browser-tests
DEMO_MODE=true node --env-file-if-exists=.env scripts/db.ts seed >/dev/null
export DEMO_MODE=false
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
