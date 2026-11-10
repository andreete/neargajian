#!/bin/sh
# Phase 02 operator sequence on NEAR TESTNET: deploy tUSDC + vault, pre-register, fund the
# vault with 1 tUSDC, and run one contract-controlled payout of 0.05 tUSDC.
# Accounts (created beforehand, keys in ~/.near-credentials/testnet, see docs/TESTNET.md):
#   M=gajian-payroll.testnet (faucet-funded master) and sub-accounts tusdc, vault, admin,
#   maker, approver1, worker, recipient1.
# Build first: npm run contracts:build. Each step prints its transaction ID.
# NOTE: written for the Phase 02 vault API (rows stored on-chain). From Phase 03 the vault
# takes a Merkle commitment; kept unchanged as the record of the Phase 02 live run.
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH='' cd -- "$here/../.." && pwd)
NEAR="$here/near.sh"
M=${SentFund_MASTER:-gajian-payroll.testnet}
TOKEN=tusdc.$M VAULT=vault.$M ADMIN=admin.$M MAKER=maker.$M APPROVER=approver1.$M WORKER=worker.$M
RECIPIENT=recipient1.$M
RUN_ID=${RUN_ID:-p02-run-1}
WASM="$root/contracts/target/near"

step() { printf '\n== %s\n' "$*"; }
txid() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|rror|Function execution return value|^\s*(true|false|\{|\")" || true; }
call() { # signer contract method json deposit gas
  "$NEAR" contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas "${6:-30 Tgas}" attached-deposit "${5:-0 NEAR}" \
    sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}
view() { "$NEAR" contract call-function as-read-only "$1" "$2" json-args "$3" network-config testnet now 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | sed -n '/return value/,$p'; }

if [ "${SKIP_DEPLOY:-0}" != 1 ]; then
  step "deploy tUSDC to $TOKEN (owner $ADMIN)"
  "$NEAR" contract deploy "$TOKEN" use-file "$WASM/gajian_tusdc/gajian_tusdc.wasm" \
    with-init-call new json-args "{\"owner_id\":\"$ADMIN\"}" prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
    network-config testnet sign-with-legacy-keychain send 2>&1 | txid
  step "deploy vault to $VAULT"
  "$NEAR" contract deploy "$VAULT" use-file "$WASM/gajian_vault/gajian_vault.wasm" \
    with-init-call new json-args "{\"admin\":\"$ADMIN\",\"token\":\"$TOKEN\",\"maker\":\"$MAKER\",\"approver\":\"$APPROVER\",\"worker\":\"$WORKER\"}" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | txid
  for a in "$VAULT" "$RECIPIENT"; do
    step "register $a with tUSDC (storage_deposit 0.00125 NEAR paid by $ADMIN)"
    call "$ADMIN" "$TOKEN" storage_deposit "{\"account_id\":\"$a\",\"registration_only\":true}" '0.00125 NEAR'
  done
  step "mint 1 tUSDC to $ADMIN"
  call "$ADMIN" "$TOKEN" mint "{\"account_id\":\"$ADMIN\",\"amount\":\"1000000\"}"
  step "fund the vault: ft_transfer_call 1 tUSDC $ADMIN -> $VAULT"
  call "$ADMIN" "$TOKEN" ft_transfer_call "{\"receiver_id\":\"$VAULT\",\"amount\":\"1000000\",\"msg\":\"\"}" '1 yoctoNEAR' '100 Tgas'
fi

step "maker creates run $RUN_ID: 0.05 tUSDC to $RECIPIENT"
call "$MAKER" "$VAULT" create_run "{\"run_id\":\"$RUN_ID\",\"payouts\":[{\"receiver_id\":\"$RECIPIENT\",\"amount\":\"50000\"}]}"
step "premature release by worker (must FAIL: not approved)"
call "$WORKER" "$VAULT" start_release "{\"run_id\":\"$RUN_ID\"}"
step "approver1 approves"
call "$APPROVER" "$VAULT" approve "{\"run_id\":\"$RUN_ID\"}"
step "worker reserves the run total"
call "$WORKER" "$VAULT" start_release "{\"run_id\":\"$RUN_ID\"}"
step "worker pays row 0 (ft_transfer + private callback)"
call "$WORKER" "$VAULT" pay_row "{\"run_id\":\"$RUN_ID\",\"index\":0}" '0 NEAR' '100 Tgas'
step "duplicate payout attempt (must FAIL)"
call "$WORKER" "$VAULT" pay_row "{\"run_id\":\"$RUN_ID\",\"index\":0}" '0 NEAR' '100 Tgas'
step "evidence"
view "$VAULT" get_run "{\"run_id\":\"$RUN_ID\"}"
view "$VAULT" get_balances '{}'
view "$TOKEN" ft_balance_of "{\"account_id\":\"$RECIPIENT\"}"
view "$TOKEN" ft_balance_of "{\"account_id\":\"$VAULT\"}"
