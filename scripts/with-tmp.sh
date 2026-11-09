#!/bin/sh
# Run a command with TMPDIR/TMP/TEMP pointing at the git-ignored .tmp/ folder in
# the repo, never the shared /tmp (a 3.5 GB RAM-backed tmpfs on the dev server).
# Usage: scripts/with-tmp.sh [-C <dir relative to repo root>] <command> [args...]
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root/.tmp"
TMPDIR="$root/.tmp"
TMP="$TMPDIR"
TEMP="$TMPDIR"
export TMPDIR TMP TEMP
if [ "${1:-}" = "-C" ]; then
  cd "$root/$2"
  shift 2
fi
exec "$@"
