#!/bin/sh
# Hosted demo mode for Playwright (tests/hosted): the production build on 127.0.0.1:8092 with a
# FRESH database made like the hosted service makes it (demo:reset --with-testnet-history),
# HOSTED_DEMO=true, no admin key (the public demo never holds it), no Anthropic key.
# HOSTED_READONLY is passed through from the Playwright config (kill-switch run).
# Payroll signer keys come from .env when present (blank in CI); no test sends a transaction.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
rm -rf .tmp/e2e-hosted
mkdir -p .tmp/e2e-hosted
export DATABASE_URL="file:./.tmp/e2e-hosted/sentfund.sqlite"
export DEMO_MODE=true HOSTED_DEMO=true HOSTED_READONLY="${HOSTED_READONLY:-false}"
export ADMIN_SIGNER_PRIVATE_KEY= ANTHROPIC_API_KEY= ASSISTANT_STUB=
# Identity checks on the synthetic specimens: real face engine, labelled test stub KTP reader.
export IDENTITY_STUB=browser-tests
# Phase 24: a fresh face template key for this run (never printed); the seed stores the demo
# employees' templates from the synthetic specimen face photos with it.
FACE_TEMPLATE_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")
export FACE_TEMPLATE_KEY APP_BASE_URL=http://127.0.0.1:8092
# TEST-ONLY camera stand-in (this server has no camera): the employee page sends SYNTHETIC
# specimen frames (public/specimens/turn/) instead of camera frames; the face check itself is real.
export FACE_CAMERA_STANDIN=browser-tests
node --env-file-if-exists=.env scripts/demo-reset.ts --with-testnet-history >/dev/null
exec ./scripts/with-tmp.sh node_modules/.bin/next start -H 127.0.0.1 -p 8092
