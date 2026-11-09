# GAJIAN: standing rules for Claude sessions

GAJIAN is a NEAR HACKATHON (Real-World Money) payroll prototype: a finance team prepares a payroll batch (manual rows or CSV/TXT up to 1,000 rows), routes it through 1 or 2 approvers (sequential or parallel), and a custom NEAR **testnet** vault contract enforces the approvals and pays recipients in our mock tUSDC token. Company reporting has consolidated and detailed posting modes.

## Start every session here

1. Read `docs/NEXT-STEPS.md` (single next action and resume prompt).
2. Read `docs/BUILD-STATE.md` (what is done, with real evidence) and `docs/DECISIONS.md`.
3. Source docs: `docs/build/00-KICKOFF.md` (overrides everything older), `01-PRD.md`, `04-BUILD-PHASES.md` (18 phases), `03-CLAUDE-MASTER-PROMPT.md`, `02-DESIGN-SYSTEM.md`, `docs/SAMPLE-DATA.md`.
4. Work one phase at a time. After each phase, update the second-brain files, commit, then continue (only Phase 01 required a stop for review).

## Hard limits (never)

1. **No mainnet**: no mainnet config, accounts, keys or transactions.
2. **No `sudo`, no Docker**, nothing outside `/home/neargajian`. Missing system package → stop, give Andre one exact command (run as user `andre`), record it in `docs/NEXT-STEPS.md`.
3. Bind only to **127.0.0.1** (app port **8092**). No tunnels (Tailscale Serve/Funnel, ngrok, cloudflared).
4. **No secrets in git, chat, logs or docs.** Keys live in `~/.near-credentials` and the git-ignored `.env`. Never print private keys or seed phrases.
5. No making the GitHub repo public, no X posts, no hackathon submission, no force-push without Andre's explicit yes.
6. No PII on-chain or in logs. Synthetic data only.
7. Do not touch other users' files or processes (a production system runs on this host).

`.claude/settings.json` denies `sudo`, `docker`, `tailscale`, tunnels, force-push and any command containing `mainnet`.

## Resource rules (shared host: 4 cores, ~3 GB free RAM, swap in use)

- Every heavy command (cargo builds/tests, `npm install`, test suites, `next build`, Playwright) runs with `nice -n 19`.
- Rust: `CARGO_BUILD_JOBS=2` (also set as `build.jobs = 2` in `contracts/.cargo/config.toml`). Node: `NODE_OPTIONS=--max-old-space-size=1536` for builds if needed.
- **Never run a Rust build and a Node install/build/test at the same time.** Heavy steps run one after another.
- No heavy work Saturday or Sunday 07:00–14:00 WIB (production batch window).
- Do not leave dev servers, sandboxes or watchers running.
- **Temp files go to the repo's git-ignored `.tmp/`, never `/tmp`** (a 3.5 GB RAM-backed tmpfs shared with other users). Every npm script runs through `scripts/with-tmp.sh`, which sets `TMPDIR`/`TMP`/`TEMP` to `<repo>/.tmp`; `contracts/.cargo/config.toml` forces the same `TMPDIR` for rustc, build scripts and test binaries. For any command outside an npm script (`npm ci`, `near …`, ad-hoc `cargo`), prefix `TMPDIR=$PWD/.tmp` or use `./scripts/with-tmp.sh <cmd>`. Throwaway builds use `CARGO_TARGET_DIR=~/.cache/gajian-fresh-target`, deleted afterwards. `npm run clean:tmp` empties `.tmp/`.

## Engineering rules (production-grade prototype)

- Strict TypeScript; no `any` in domain code. Money is integer base units (BigInt, 6 decimals) end to end; JSON amounts are strings.
- Server-side validation and authorization on every read, write and export. Idempotent mutations, DB transactions around state changes.
- Release worker survives restarts, never double-pays, keeps unknown outcomes unknown until reconciled.
- No fake paths in the main flow; any mock or sandbox-only path is labelled in code, UI and README.
- Honest evidence: never claim a test ran if it did not. Separate sandbox results from live-testnet results.

## Toolchain (pinned; see docs/DECISIONS.md D-019..D-026)

| Tool | Version | Location |
| --- | --- | --- |
| Node.js / npm | 26.13.0 / 11.20.0 | `~/.local/opt/node-v26.13.0-linux-x64`, symlinked in `~/.local/bin` |
| Rust | 1.95.0 + `wasm32-unknown-unknown` | rustup, `contracts/rust-toolchain.toml` |
| cargo-near | 0.23.0 | `~/.cargo/bin` |
| near-cli-rs (`near`) | 0.31.1 | `~/.cargo/bin` |
| near-sdk / near-contract-standards / near-sandbox | 5.30.1 / 5.30.1 / 0.4.0 (nearcore 2.14.0) | `contracts/Cargo.toml` |

Testnet: accounts and contracts in `docs/TESTNET.md`. Always go through `scripts/testnet/near.sh` (testnet-only guard, output redaction), never plain `near`.

If `cargo` is not on PATH in a non-login shell: `. ~/.cargo/env`.

## Commands

```sh
# App (repo root)
./scripts/with-tmp.sh nice -n 19 npm ci
npm run lint && npm run typecheck && nice -n 19 npm test
npm run samples:check            # regenerates sample files; must produce no git diff
nice -n 19 npm run build
npm run dev                      # http://127.0.0.1:8092 ; health: /api/health

# Contracts (one at a time, never alongside Node work)
nice -n 19 npm run contracts:build   # cargo near build non-reproducible-wasm (tusdc, vault)
nice -n 19 npm run contracts:test    # unit + sandbox tests (local nearcore 2.14.0 on 127.0.0.1)
nice -n 19 npm run contracts:lint    # fmt + clippy -D warnings
```

## Repo layout

```
src/app/        Next.js routes and pages        src/server/   domain code (money, import, auth, db, chain)
src/worker/     release/reconciliation worker   db/           migrations (Drizzle)
contracts/      Cargo workspace: tusdc (NEP-141 test token), vault
tests/          unit/, integration/, e2e/       scripts/      sample-data generator, seed/deploy scripts
public/         brand/, templates/              docs/         build docs + second brain
```

## Second brain (update and commit at the end of every phase)

`CLAUDE.md`, `AGENTS.md`, `docs/BUILD-STATE.md`, `docs/DECISIONS.md`, `docs/NEXT-STEPS.md`, `docs/TESTNET.md`.
Commit message: `phase-NN: summary`. Before every commit, secret-scan the staged diff:

```sh
git diff --cached | grep -nE 'ed25519:|secp256k1:|PRIVATE KEY|seed phrase' ; git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'
```

Both must print nothing (except rule text in docs). Then `git push -u origin main` (origin = `git@github.com:andreete/neargajian.git`, deploy key `~/.ssh/gajian_deploy` via repo-local `core.sshCommand`). If auth fails, note it in `docs/NEXT-STEPS.md` and retry at the next phase end. Never force-push, never change repo visibility.
