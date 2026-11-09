#!/bin/sh
# Credential scan of the working tree (tracked + untracked, not ignored) and the FULL Git
# history (every commit's content and every file name ever added). Prints where a match is,
# never the matched value. Exit 0 = clean, 1 = findings, 2 = usage error.
#
#   scripts/secret-scan.sh            # worktree + history
#   scripts/secret-scan.sh --staged   # staged diff only (pre-commit)
#
# Patterns: NEAR/ed25519/secp256k1 PRIVATE keys (public keys are fine and shorter), PEM private
# keys, NEAR credential JSON, seed phrases in JSON, GitHub/AWS/Slack/OpenAI-style tokens,
# non-placeholder values for *_PRIVATE_KEY / SESSION_SECRET, and secret-looking file names.
set -eu
cd "$(git rev-parse --show-toplevel)"

B58='[1-9A-HJ-NP-Za-km-z]'
CONTENT="ed25519:${B58}{80,}|secp256k1:${B58}{80,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\"private_key\"[[:space:]]*:[[:space:]]*\"[a-z0-9]+:|\"seed_phrase\"[[:space:]]*:[[:space:]]*\"[a-z]+( [a-z]+){11,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}|_PRIVATE_KEY=[^[:space:]#]{20,}|SESSION_SECRET=[A-Za-z0-9+/=_-]{32,}"
NAMES='(^|/)\.env($|\.[^e])|(^|/)\.env\.(local|production|development|test)$|\.pem$|\.key$|(^|/)id_(rsa|ed25519)$|near-credentials/|\.near-credentials/'

found=0
report() { echo "  FOUND: $1"; found=1; }

if [ "${1:-}" = "--staged" ]; then
  git diff --cached -U0 | grep -nE "^\+.*($CONTENT)" | cut -d: -f1 | while read -r n; do echo "  FOUND: staged diff line $n"; done | grep -q . && found=1
  git diff --cached --name-only | grep -E "$NAMES" | grep -v '\.env\.example$' | while read -r f; do echo "  FOUND: staged file name $f"; done | grep -q . && found=1
  [ $found -eq 0 ] && echo "secret-scan (staged): clean" || { echo "secret-scan (staged): FINDINGS"; exit 1; }
  exit 0
fi

echo "secret-scan: working tree"
files=$(git ls-files --cached --others --exclude-standard)
for f in $files; do
  [ -f "$f" ] || continue
  if printf '%s\n' "$f" | grep -qE "$NAMES" && [ "${f##*/}" != ".env.example" ]; then report "secret-like file name: $f"; fi
  if grep -IqE "$CONTENT" "$f" 2>/dev/null; then report "$f (lines: $(grep -InE "$CONTENT" "$f" | cut -d: -f1 | tr '\n' ' '))"; fi
done

commits=$(git rev-list --all | wc -l | tr -d ' ')
echo "secret-scan: full history ($commits commits, all branches and tags)"
for c in $(git rev-list --all); do
  if git grep -IqE "$CONTENT" "$c" -- 2>/dev/null; then
    git grep -IlE "$CONTENT" "$c" -- | while read -r hit; do echo "  FOUND: commit ${hit%%:*} file ${hit#*:}"; done
    found=1
  fi
done
names=$(git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -E "$NAMES" | grep -v '\.env\.example$' || true)
if [ -n "$names" ]; then printf '%s\n' "$names" | while read -r n; do echo "  FOUND: file ever committed: $n"; done; found=1; fi

if [ $found -eq 0 ]; then echo "secret-scan: clean (working tree + $commits commits)"; else echo "secret-scan: FINDINGS above"; exit 1; fi
