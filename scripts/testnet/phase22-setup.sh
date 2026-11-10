#!/bin/sh
# Phase 22: the SentFund testnet deployment under sentfund-payroll.testnet (replaces the
# gajian-payroll.testnet set used until Phase 21; that set stays on-chain as earlier evidence).
# Same contract bytes as the gajian deployment (contract freeze, D-051):
#   tUSDC  fd5a0b9a…  (= tusdc.gajian-payroll.testnet)
#   vault  38953891…  reproducible release build of commit cf4d9a1 (= vault2.gajian-payroll.testnet)
# Stages (run one at a time, check the output before the next; every step prints its tx ID):
#   accounts   create the 10 sub-accounts from the faucet-funded master
#   token      deploy tUSDC + new(owner_id = admin)
#   vault      deploy + init the vault (two in sequence, automatic, caps 1 / 100 tUSDC), register it
#              with tUSDC, DELETE its full-access key (code locked), restricted keys for each role
#   recipients register recipient1-3 with tUSDC
#   fund <n>   admin mints n tUSDC and funds the vault (ft_transfer_call)
# Usage: scripts/testnet/phase22-setup.sh <stage> [args]. Only with Andre's yes (real transactions).
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH='' cd -- "$here/../.." && pwd)
NEAR="$here/near.sh"
export TMPDIR="$root/.tmp"
M=sentfund-payroll.testnet
TOKEN=tusdc.$M VAULT=vault.$M ADMIN=admin.$M
TUSDC_WASM="$root/contracts/target/near/gajian_tusdc/gajian_tusdc.wasm"
TUSDC_SHA=fd5a0b9a3aa46e2da097b1e7920e25184c08ff789574f9c41f5ef221761dd28d
VAULT_WASM=${VAULT_WASM:-$root/.tmp/release/gajian_vault.wasm}
VAULT_SHA=38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0
txid() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|rror|created successfully|deleted|panicked|^\s*(true|false|\")" || true; }
step() { printf '\n== %s\n' "$*"; }
call() { # signer contract method json deposit gas
  "$NEAR" contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas "${6:-30 Tgas}" attached-deposit "${5:-0 NEAR}" \
    sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}
check_sha() { a=$(sha256sum "$1" | cut -d' ' -f1); [ "$a" = "$2" ] || { echo "refused: $1 sha256 $a != $2" >&2; exit 2; }; echo "ok: $1 sha256 $a"; }
sub() { # name amount
  step "create $1.$M ($2 from $M)"
  "$NEAR" account create-account fund-myself "$1.$M" "$2" autogenerate-new-keypair \
    save-to-legacy-keychain sign-as "$M" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}

case "${1:-}" in
  accounts)
    sub admin '0.5 NEAR'; sub maker '0.4 NEAR'; sub approver1 '0.4 NEAR'; sub approver2 '0.4 NEAR'; sub worker '0.4 NEAR'
    sub recipient1 '0.05 NEAR'; sub recipient2 '0.05 NEAR'; sub recipient3 '0.05 NEAR'
    sub tusdc '2.2 NEAR'; sub vault '2.4 NEAR'
    ;;
  token)
    check_sha "$TUSDC_WASM" "$TUSDC_SHA"
    step "deploy tUSDC to $TOKEN (owner $ADMIN)"
    "$NEAR" contract deploy "$TOKEN" use-file "$TUSDC_WASM" with-init-call new json-args "{\"owner_id\":\"$ADMIN\"}" \
      prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | txid
    ;;
  vault)
    check_sha "$VAULT_WASM" "$VAULT_SHA"
    step "deploy + init $VAULT: two approvers in sequence, automatic release, caps 1 / 100 tUSDC"
    init="{\"admin\":\"$ADMIN\",\"token\":\"$TOKEN\",\"maker\":\"maker.$M\",\"worker\":\"worker.$M\",\"kind\":\"TwoSequential\",\"approvers\":[\"approver1.$M\",\"approver2.$M\"],\"release_mode\":\"Automatic\",\"max_row_amount\":\"1000000\",\"max_run_total\":\"100000000\"}"
    "$NEAR" contract deploy "$VAULT" use-file "$VAULT_WASM" with-init-call new json-args "$init" \
      prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | txid
    step "register $VAULT with tUSDC"
    call "$ADMIN" "$TOKEN" storage_deposit "{\"account_id\":\"$VAULT\",\"registration_only\":true}" '0.00125 NEAR'
    step "delete the full-access key of $VAULT (locks the code)"
    pk=$(node --input-type=module -e "
      const r = await fetch('https://rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_access_key_list', finality: 'final', account_id: '$VAULT' } }) });
      const keys = (await r.json()).result.keys.filter((k) => k.access_key.permission === 'FullAccess');
      if (keys.length !== 1) { console.error('expected exactly one full-access key, found ' + keys.length); process.exit(1); }
      console.log(keys[0].public_key);")
    "$NEAR" account delete-keys "$VAULT" public-keys "$pk" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
    rm -f "$HOME/.near-credentials/testnet/$VAULT.json" "$HOME/.near-credentials/testnet/$VAULT/"*.json 2>/dev/null || true
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
    ;;
  recipients)
    for n in 1 2 3; do
      step "register recipient$n.$M with tUSDC (storage_deposit 0.00125 NEAR paid by $ADMIN)"
      call "$ADMIN" "$TOKEN" storage_deposit "{\"account_id\":\"recipient$n.$M\",\"registration_only\":true}" '0.00125 NEAR'
    done
    ;;
  fund)
    amount=${2:?amount in base units, e.g. 2180000 for 2.18 tUSDC}
    step "mint $amount base units of tUSDC to $ADMIN"
    call "$ADMIN" "$TOKEN" mint "{\"account_id\":\"$ADMIN\",\"amount\":\"$amount\"}"
    step "fund $VAULT: ft_transfer_call $amount"
    call "$ADMIN" "$TOKEN" ft_transfer_call "{\"receiver_id\":\"$VAULT\",\"amount\":\"$amount\",\"msg\":\"\"}" '1 yoctoNEAR' '100 Tgas'
    ;;
  *) echo "usage: $0 accounts|token|vault|recipients|fund <base units>" >&2; exit 2 ;;
esac
