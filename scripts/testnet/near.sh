#!/bin/sh
# Guarded near-cli-rs wrapper for SentFund testnet operations.
# - refuses to run unless the arguments select `network-config testnet`
# - runs with TMPDIR in the repo's .tmp/
# - redacts anything that looks like a private key or seed phrase from the output
# Usage: scripts/testnet/near.sh <near-cli-rs args...>
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
case " $* " in
  *" network-config testnet "*) ;;
  *) echo "refused: SentFund only talks to testnet (missing 'network-config testnet')" >&2; exit 2 ;;
esac
mkdir -p "$root/.tmp"
PATH="$HOME/.cargo/bin:$PATH"
export TMPDIR="$root/.tmp"
out="$root/.tmp/near-cli.$$.out"
trap 'rm -f "$out"' EXIT
set +e
near "$@" >"$out" 2>&1
status=$?
set -e
# Secret keys are 64 bytes (~88 base58 chars); public keys are 32 bytes (~44 chars).
sed -E \
  -e 's/(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{60,}/\1:<redacted-secret>/g' \
  -e '/[Ss]eed [Pp]hrase|master_seed|seed_phrase/d' \
  "$out"
exit $status
