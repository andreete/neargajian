#!/bin/sh
# Build every deployable contract Wasm (run from contracts/, via npm run contracts:build).
# Output: contracts/target/near/<crate>/<crate>.wasm
#
# Reproducible without Docker (Docker is not allowed on this host, so cargo-near's
# `reproducible-wasm` mode is unavailable): the toolchain is pinned (rust-toolchain.toml,
# cargo-near 0.23.0, Cargo.lock with --locked) and machine-specific paths are remapped, so
# the same commit builds the same bytes on any checkout path and any user. The flags equal
# cargo-near's defaults (`-C link-arg=-s`, `--cfg near` is always appended) plus the remaps.
set -eu
cargo_home=${CARGO_HOME:-$HOME/.cargo}
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
flags="-C link-arg=-s --remap-path-prefix=$cargo_home/registry/src=/cargo/registry/src --remap-path-prefix=$repo=/gajian"
for crate in tusdc vault; do
  cargo near build non-reproducible-wasm --manifest-path "$crate/Cargo.toml" --locked --env "RUSTFLAGS=$flags"
done
