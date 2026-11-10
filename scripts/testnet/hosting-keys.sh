#!/bin/sh
# Restricted function-call keys for the HOSTED demo (Railway), separate from this server's keys.
#   scripts/testnet/hosting-keys.sh status              read-only: list the vault keys of the hosted roles
#   scripts/testnet/hosting-keys.sh add --yes           create 4 new keypairs and add them on testnet
#   scripts/testnet/hosting-keys.sh delete --yes        delete exactly those keys on testnet (after the event)
# Roles: maker (create_run, cancel_run), approver1 and approver2 (approve, reject), worker
# (start_release, pay_row), all on vault.sentfund-payroll.testnet (the current vault) with a small NEAR allowance.
# NEVER the admin, the master or any full-access key: the public demo cannot change the workflow.
# Private keys are written only to the git-ignored .hosting/host-keys.env (mode 600) and never
# printed (near.sh also redacts anything key-like). Each add/delete is signed by the role account's
# own full-access key from this server's legacy keychain. Only with Andre's explicit yes.
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
NEAR="$root/scripts/testnet/near.sh"
export TMPDIR="$root/.tmp"
mkdir -p .tmp
cmd=${1:-}
confirm=${2:-}

case "$cmd" in
  status)
    node scripts/testnet/hosting-keys.mjs status
    ;;
  add)
    [ "$confirm" = "--yes" ] || { echo "refused: sends 4 testnet transactions. Run with --yes only after Andre's explicit yes." >&2; exit 2; }
    node scripts/testnet/hosting-keys.mjs gen
    node scripts/testnet/hosting-keys.mjs plan | while IFS="$(printf '\t')" read -r account allowance methods pk; do
      echo "== add host key for $account on vault.sentfund-payroll.testnet: $methods (allowance $allowance)"
      "$NEAR" account add-key "$account" grant-function-call-access --allowance "$allowance" \
        --contract-account-id vault.sentfund-payroll.testnet --function-names "$methods" \
        use-manually-provided-public-key "$pk" network-config testnet sign-with-legacy-keychain send 2>&1 \
        | grep -E "Transaction ID|Error|error" || true
    done
    node scripts/testnet/hosting-keys.mjs status
    echo "next: paste the four values from .hosting/host-keys.env into Railway Variables (never into chat), then record the PUBLIC keys and tx IDs in docs/TESTNET.md"
    ;;
  delete)
    [ "$confirm" = "--yes" ] || { echo "refused: sends 4 testnet transactions. Run with --yes only after Andre's explicit yes." >&2; exit 2; }
    [ -f .hosting/host-keys.public.json ] || { echo "refused: .hosting/host-keys.public.json not found (nothing to delete)" >&2; exit 2; }
    node scripts/testnet/hosting-keys.mjs plan | while IFS="$(printf '\t')" read -r account allowance methods pk; do
      echo "== delete host key $pk from $account"
      "$NEAR" account delete-keys "$account" public-keys "$pk" network-config testnet sign-with-legacy-keychain send 2>&1 \
        | grep -E "Transaction ID|Error|error" || true
    done
    node scripts/testnet/hosting-keys.mjs status
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    mv .hosting/host-keys.public.json ".hosting/deleted-$stamp.public.json"
    rm -f .hosting/host-keys.env
    echo "host keys deleted on-chain; private file removed; public list kept as .hosting/deleted-$stamp.public.json"
    ;;
  *)
    echo "usage: scripts/testnet/hosting-keys.sh status | add --yes | delete --yes" >&2
    exit 2
    ;;
esac
