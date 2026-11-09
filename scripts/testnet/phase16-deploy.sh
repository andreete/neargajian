#!/bin/sh
# Phase 16a: deploy the FINAL vault from the release commit under a new sub-account, lock it.
#   1. checks the Wasm's sha256 against the expected hash (from two clean, independent builds)
#   2. creates vault2 (2.4 NEAR from the master account) and deploys + initialises it
#      (two approvers in sequence, automatic release, caps 1 / 100 tUSDC, same as Phase 04)
#   3. registers vault2 with tUSDC
#   4. DELETES vault2's only full-access key: its code can never change again
#   5. gives each signer role a restricted function-call key for vault2 (keys stay in
#      ~/.near-credentials, never printed)
# Usage: scripts/testnet/phase16-deploy.sh <path/to/gajian_vault.wasm> <expected-sha256-hex>
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
NEAR="$here/near.sh"
M=gajian-payroll.testnet
TOKEN=tusdc.$M VAULT=vault2.$M ADMIN=admin.$M
WASM=$1 EXPECTED=$2
txid() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|rror|created successfully|deleted|^\s*(true|false|\")" || true; }
step() { printf '\n== %s\n' "$*"; }

actual=$(sha256sum "$WASM" | cut -d' ' -f1)
[ "$actual" = "$EXPECTED" ] || { echo "refused: $WASM sha256 $actual != expected $EXPECTED" >&2; exit 2; }
step "Wasm sha256 $actual matches the reproducible builds"

step "create $VAULT (2.4 NEAR from $M)"
"$NEAR" account create-account fund-myself "$VAULT" '2.4 NEAR' autogenerate-new-keypair \
  save-to-legacy-keychain sign-as "$M" network-config testnet sign-with-legacy-keychain send 2>&1 | txid

step "deploy + init: two approvers in sequence, automatic release, caps 1 / 100 tUSDC"
init="{\"admin\":\"$ADMIN\",\"token\":\"$TOKEN\",\"maker\":\"maker.$M\",\"worker\":\"worker.$M\",\"kind\":\"TwoSequential\",\"approvers\":[\"approver1.$M\",\"approver2.$M\"],\"release_mode\":\"Automatic\",\"max_row_amount\":\"1000000\",\"max_run_total\":\"100000000\"}"
"$NEAR" contract deploy "$VAULT" use-file "$WASM" with-init-call new json-args "$init" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | txid

step "register $VAULT with tUSDC"
"$NEAR" contract call-function as-transaction "$TOKEN" storage_deposit json-args "{\"account_id\":\"$VAULT\",\"registration_only\":true}" \
  prepaid-gas '30 Tgas' attached-deposit '0.00125 NEAR' sign-as "$ADMIN" network-config testnet sign-with-legacy-keychain send 2>&1 | txid

step "delete the full-access key of $VAULT (locks the code)"
pk=$(node --input-type=module -e "
  const r = await fetch('https://rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_access_key_list', finality: 'final', account_id: '$VAULT' } }) });
  const keys = (await r.json()).result.keys.filter((k) => k.access_key.permission === 'FullAccess');
  if (keys.length !== 1) { console.error('expected exactly one full-access key, found ' + keys.length); process.exit(1); }
  console.log(keys[0].public_key);")
"$NEAR" account delete-keys "$VAULT" public-keys "$pk" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
rm -f "$HOME/.near-credentials/testnet/$VAULT.json"   # the deleted key's local copy is useless now

addkey() { # account allowance methods
  step "function-call key for $1 on $VAULT: $3 (allowance $2)"
  "$NEAR" account add-key "$1" grant-function-call-access --allowance "$2" \
    --contract-account-id "$VAULT" --function-names "$3" autogenerate-new-keypair \
    save-to-legacy-keychain network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}
addkey maker.$M '0.25 NEAR' 'create_run, cancel_run, close_partial, start_release, pay_row'
addkey approver1.$M '0.25 NEAR' 'approve, reject'
addkey approver2.$M '0.25 NEAR' 'approve, reject'
addkey worker.$M '0.5 NEAR' 'start_release, pay_row'
addkey "$ADMIN" '0.25 NEAR' 'update_workflow, resolve_in_flight'
step "done: verify with node scripts/judge/verify-deployment.mjs <wasm>"
