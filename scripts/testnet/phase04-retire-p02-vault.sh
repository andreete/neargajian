#!/bin/sh
# One-off (Phase 04): retire the Phase 02 vault so the account can be recreated with the
# Phase 04 contract (incompatible state layout). The vault's 0.95 tUSDC goes back to the
# admin through the vault's own approved flow (10 rows x 0.095 tUSDC), then the account is
# deleted with the master as beneficiary (its storage NEAR returns to the master).
set -eu
here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
NEAR="$here/near.sh"
M=gajian-payroll.testnet
VAULT=vault.$M ADMIN=admin.$M
txid() { sed 's/\x1b\[[0-9;]*m//g' | grep -E "Transaction ID|rror|^\s*(true|false|\")" || true; }
call() {
  "$NEAR" contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas "${5:-30 Tgas}" attached-deposit '0 NEAR' \
    sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1 | txid
}
rows=$(node -e 'console.log(JSON.stringify(Array.from({length:10},()=>({receiver_id:"admin.gajian-payroll.testnet",amount:"95000"}))))')
echo "== drain run p02-drain: 10 x 0.095 tUSDC -> $ADMIN"
call maker.$M "$VAULT" create_run "{\"run_id\":\"p02-drain\",\"payouts\":$rows}"
call approver1.$M "$VAULT" approve '{"run_id":"p02-drain"}'
call worker.$M "$VAULT" start_release '{"run_id":"p02-drain"}'
i=0
while [ $i -lt 10 ]; do
  echo "-- pay row $i"
  call worker.$M "$VAULT" pay_row "{\"run_id\":\"p02-drain\",\"index\":$i}" '100 Tgas'
  i=$((i + 1))
done
