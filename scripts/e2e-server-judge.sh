#!/bin/sh
# Judge mode for Playwright: the production build on 127.0.0.1:8092 with a FRESH database made
# by `npm run demo:reset` semantics (demo users + the vault's workflow) and NO signer keys, as on
# a judge's machine after `cp .env.example .env`. Empty key variables override any local .env.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e-judge
mkdir -p .tmp/e2e-judge
export DATABASE_URL="file:./.tmp/e2e-judge/gajian.sqlite"
export DEMO_MODE=true
export MAKER_SIGNER_PRIVATE_KEY= APPROVER1_SIGNER_PRIVATE_KEY= APPROVER2_SIGNER_PRIVATE_KEY= WORKER_SIGNER_PRIVATE_KEY= ADMIN_SIGNER_PRIVATE_KEY=
node --env-file-if-exists=.env scripts/demo-reset.ts >/dev/null
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
