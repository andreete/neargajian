#!/bin/sh
# Phase 04 testnet setup: recreate the vault account, deploy the Phase 04 vault, register
# the demo recipients, fund the vault with 1 tUSDC and give each signer role a restricted
# function-call access key for the vault (saved in ~/.near-credentials, never printed).
# Run after `npm run contracts:build` and after phase04-retire-p02-vault.sh.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH='' cd -- "$here/../.." && pwd)
NEAR="$here/near.sh"
M=gajian-payroll.testnet
TOKEN=tusdc.$M VAULT=vault.$M ADMIN=admin.$M
WASM="$root/contracts/target/near/gajian_vault/gajian_vault.wasm"
txid() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|rror|created successfully|^\s*(true|false|\")" || true; }
call() { # signer contract method json deposit gas
  "$NEAR" contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas "${6:-30 Tgas}" attached-deposit "${5:-0 NEAR}" \
    sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}
step() { printf '\n== %s\n' "$*"; }

step "recreate $VAULT (2.6 NEAR from $M)"
"$NEAR" account create-account fund-myself "$VAULT" '2.6 NEAR' autogenerate-new-keypair \
  save-to-legacy-keychain sign-as "$M" network-config testnet sign-with-legacy-keychain send 2>&1 | txid

step "deploy Phase 04 vault: two approvers in sequence, automatic release, caps 1 / 100 tUSDC"
init="{\"admin\":\"$ADMIN\",\"token\":\"$TOKEN\",\"maker\":\"maker.$M\",\"worker\":\"worker.$M\",\"kind\":\"TwoSequential\",\"approvers\":[\"approver1.$M\",\"approver2.$M\"],\"release_mode\":\"Automatic\",\"max_row_amount\":\"1000000\",\"max_run_total\":\"100000000\"}"
"$NEAR" contract deploy "$VAULT" use-file "$WASM" with-init-call new json-args "$init" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | txid

for a in "$VAULT" recipient2.$M recipient3.$M; do
  step "register $a with tUSDC"
  call "$ADMIN" "$TOKEN" storage_deposit "{\"account_id\":\"$a\",\"registration_only\":true}" '0.00125 NEAR'
done

step "mint 0.05 tUSDC to $ADMIN (it holds 0.95 from the retired vault) and fund the vault with 1 tUSDC"
call "$ADMIN" "$TOKEN" mint "{\"account_id\":\"$ADMIN\",\"amount\":\"50000\"}"
call "$ADMIN" "$TOKEN" ft_transfer_call "{\"receiver_id\":\"$VAULT\",\"amount\":\"1000000\",\"msg\":\"\"}" '1 yoctoNEAR' '100 Tgas'

# Restricted signer keys: each can only call these vault methods, without deposits.
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
