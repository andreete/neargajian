#!/bin/sh
# Build every deployable contract Wasm (run from contracts/, via npm run contracts:build).
# Output: contracts/target/near/<crate>/<crate>.wasm
set -eu
for crate in tusdc vault; do
  cargo near build non-reproducible-wasm --manifest-path "$crate/Cargo.toml" --locked
done
