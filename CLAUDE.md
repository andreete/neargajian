# SentFund (formerly GAJIAN): standing rules for Claude sessions

SentFund is a NEAR HACKATHON (Real-World Money) payroll prototype: a finance team prepares a payroll batch (manual rows, CSV/TXT up to 1,000 rows, or the maker's **payroll assistant** drafting from words or voice via the Claude API), routes it through 1 or 2 approvers (sequential or parallel), and a custom NEAR **testnet** vault contract enforces the approvals and pays recipients in our mock tUSDC token. Employees (role `employee`, linked to one directory recipient) can take a **Payroll Advance** (Phase 23: a salary advance repaid like a loan, up to 300% of monthly net pay, 2% fee at payout, 6 instalments deducted from payroll; paid as an ordinary one-row run, no contract change; D-129..D-134; Phase 23b: withdraw while Requested, estimated months, 25%/50%/Max shortcuts, D-135..D-137). The admin keeps a **recipient directory** and runs **identity checks** (KTP read by Claude vision with the face covered, NIK rules offline, face match on this server with OpenCV YuNet + SFace; Phase 21, `docs/SECURITY.md`); "Pay registered recipients only" is an app/approver guardrail, not a contract rule. Company reporting has consolidated and detailed posting modes. A public hosted demo runs at **https://sentfund.my.id** (Railway + Cloudflare, `HOSTED_DEMO=true`, runbook `docs/HOSTING.md`) and stays online until at least 25 Nov 2026.

## Start every session here

1. Read `docs/NEXT-STEPS.md` (single next action and resume prompt).
2. Read `docs/BUILD-STATE.md` (what is done, with real evidence) and `docs/DECISIONS.md`.
3. Source docs: `docs/build/00-KICKOFF.md` (overrides everything older), `01-PRD.md`, `04-BUILD-PHASES.md` (18 phases), `03-CLAUDE-MASTER-PROMPT.md`, `02-DESIGN-SYSTEM.md`, `docs/SAMPLE-DATA.md`.
4. Work one phase at a time. After each phase, update the second-brain files, commit, then continue (only Phase 01 required a stop for review).

## Hard limits (never)

1. **No mainnet**: no mainnet config, accounts, keys or transactions.
2. **No `sudo`, no Docker**, nothing outside `/home/neargajian`. Missing system package → stop, give Andre one exact command (run as user `andre`), record it in `docs/NEXT-STEPS.md`.
3. Bind only to **127.0.0.1** (app port **8092**) on this host. No tunnels (Tailscale Serve/Funnel, ngrok, cloudflared). The Railway container binds 0.0.0.0 inside Railway only; it is built in Railway's cloud from the `release` branch, never with Docker here, and nothing is pushed to `release`, no Railway account is created and no host key is added on-chain without Andre's explicit yes.
4. **No secrets in git, chat, logs or docs.** Keys live in `~/.near-credentials` and the git-ignored `.env`. Never print private keys or seed phrases. Never read, print or log `ANTHROPIC_API_KEY` (Andre adds it to `.env` himself), and never rewrite `.env` in a way that drops lines you did not write (`write-env.mjs` keeps them).
5. No making the GitHub repo public, no X posts, no hackathon submission, no force-push without Andre's explicit yes.
6. No PII on-chain or in logs. Synthetic data only.
7. Do not touch other users' files or processes (a production system runs on this host).

`.claude/settings.json` denies `sudo`, `docker`, `tailscale`, tunnels, force-push and any command containing `mainnet`.

## Resource rules (shared host: 4 cores, ~3 GB free RAM, swap in use)

- **`next build` once OOM-killed this host** when Turbopack crawled `contracts/target` (D-120): any `fs` path built from an unknown directory needs `/* turbopackIgnore: true */`. Run builds under the watchdog in `docs/BUILD-STATE.md` Phase 21.
- Every heavy command (cargo builds/tests, `npm install`, test suites, `next build`, Playwright) runs with `nice -n 19`.
- Rust: `CARGO_BUILD_JOBS=2` (also set as `build.jobs = 2` in `contracts/.cargo/config.toml`). Node: `NODE_OPTIONS=--max-old-space-size=1536` for builds if needed.
- **Never run a Rust build and a Node install/build/test at the same time.** Heavy steps run one after another.
- No heavy work Saturday or Sunday 07:00–14:00 WIB (production batch window).
- Do not leave dev servers, sandboxes or watchers running.
- **Temp files go to the repo's git-ignored `.tmp/`, never `/tmp`** (a 3.5 GB RAM-backed tmpfs shared with other users). Every npm script runs through `scripts/with-tmp.sh`, which sets `TMPDIR`/`TMP`/`TEMP` to `<repo>/.tmp`; `contracts/.cargo/config.toml` forces the same `TMPDIR` for rustc, build scripts and test binaries. For any command outside an npm script (`npm ci`, `near …`, ad-hoc `cargo`), prefix `TMPDIR=$PWD/.tmp` or use `./scripts/with-tmp.sh <cmd>`. Throwaway builds use `CARGO_TARGET_DIR=~/.cache/sentfund-fresh-target`, deleted afterwards. `npm run clean:tmp` empties `.tmp/`.

## Engineering rules (production-grade prototype)

- Strict TypeScript; no `any` in domain code. Money is integer base units (BigInt, 6 decimals) end to end; JSON amounts are strings.
- Server-side validation and authorization on every read, write and export. Idempotent mutations, DB transactions around state changes.
- Release worker survives restarts, never double-pays, keeps unknown outcomes unknown until reconciled.
- No fake paths in the main flow; any mock or sandbox-only path is labelled in code, UI and README.
- English only, times in UTC with the label, phones in +44 7700 900xxx, amounts via `displayAmount` (UI) / `fixedAmount` (exports) (D-061, D-066).
- Default NEAR RPC is FastNEAR (`https://rpc.testnet.fastnear.com`); `rpc.testnet.near.org` is deprecated (D-062).
- Strict CSP (D-058): no inline `style=` attributes, no `next/image`; e2e fails on CSP violations.
- Honest evidence: never claim a test ran if it did not. Separate sandbox results from live-testnet results.
- **Contract freeze** during the app phases (D-051): no contract changes; if unavoidable, batch them, retire-and-recreate by script, return funds through an approved run, log NEAR spent.

## Toolchain (pinned; see docs/DECISIONS.md D-019..D-026)

| Tool | Version | Location |
| --- | --- | --- |
| Node.js / npm | 26.13.0 / 11.20.0 | `~/.local/opt/node-v26.13.0-linux-x64`, symlinked in `~/.local/bin` |
| Rust | 1.95.0 + `wasm32-unknown-unknown` | rustup, `contracts/rust-toolchain.toml` |
| cargo-near | 0.23.0 | `~/.cargo/bin` |
| near-cli-rs (`near`) | 0.31.1 | `~/.cargo/bin` |
| near-sdk / near-contract-standards / near-sandbox | 5.30.1 / 5.30.1 / 0.4.0 (nearcore 2.14.0) | `contracts/Cargo.toml` |

Testnet: accounts and contracts in `docs/TESTNET.md`. **The app uses `vault.sentfund-payroll.testnet`** (Phase 22: the same release build as the earlier `vault2.gajian-payroll.testnet`, no access key at all, cannot be redeployed; token `tusdc.sentfund-payroll.testnet`); the `gajian-payroll.testnet` accounts are the retired earlier deployment, kept as evidence; `vault.gajian-payroll.testnet` is retired. Always go through `scripts/testnet/near.sh` (testnet-only guard, output redaction), never plain `near`. App signers use the restricted function-call keys in `.env` (`node scripts/testnet/write-env.mjs` rewrites it; never print it). Recovery rules: `docs/RECOVERY.md`. Commitment format: `docs/COMMITMENTS.md`.

Server code (`src/server`) must stay runnable by Node directly: relative imports with `.ts` extensions, erasable TypeScript only (D-047).

If `cargo` is not on PATH in a non-login shell: `. ~/.cargo/env`.

## Commands

```sh
# App (repo root)
./scripts/with-tmp.sh nice -n 19 npm ci
npm run vision:models            # face models (git-ignored, SHA-256 pinned); needed by the tests and the identity check
npm run vision:selftest          # loads them and matches the synthetic specimens
npm run lint && npm run typecheck && nice -n 19 npm test
npm run samples:check            # regenerates sample files; must produce no git diff
nice -n 19 npm run build
npm run dev                      # http://127.0.0.1:8092 ; health: /api/health
npm run db:seed                  # demo users/workflow/draft (DEMO_MODE=true)
nice -n 19 npm run test:e2e      # Playwright vs the production build (port 8092 must be free), then the stand-in whole-flow test (Payroll Advance; labelled stand-in vault, no testnet)
nice -n 19 npm run screenshots   # docs/screenshots/phase-06
npm run worker                   # release worker, its own process; run only when payouts are needed, stop with SIGTERM/Ctrl+C
nice -n 19 npm run live:phase13  # LIVE testnet flow through the app (needs server + worker on 8092); real transactions, on purpose only
nice -n 19 npm run live:phase16  # LIVE Phase 16 rehearsal (one step at a time with --grep); real transactions, on purpose only
nice -n 19 npm run live:phase19 -- --grep p19-directory   # Phase 19 screenshots (no key); p19-assistant / p19-live-run need ANTHROPIC_API_KEY (p19-live-run: real transactions)
npx playwright test -c playwright.hosted-live.config.ts tests/live/hosted-check.spec.ts   # READ-ONLY hosted check after a release (health, employee offers, read-only policy, assistant preview, specimen dry run); no transaction
nice -n 19 npx playwright test -c playwright.live.config.ts tests/live/phase23.spec.ts --grep p23-shots   # Phase 23 read-only recaptures; p23-advance / p23-payroll send REAL transactions (done 10 Nov)
node --env-file=.env scripts/testnet/record-run-evidence.ts <runId> <phase> "<label>"   # add a paid app run to judge:verify
npm run judge:verify             # read-only re-check of all live evidence (docs/evidence/testnet-runs.json)
npm run demo:reset               # move data/sentfund.sqlite to data/backups/ (never deleted), fresh demo DB (stop app + worker first)
nice -n 19 npm run test:judge-mode  # Playwright: fresh demo DB and no signer keys (read-only copy)
npm run judge:deployment         # read-only: the vault's code_hash = local release Wasm, no access key (run AFTER contracts:build; contracts:test leaves a non-remapped build in target/)
npm run secret-scan              # credential scan: worktree + full Git history (--staged before commits)
nice -n 19 npm run test:hosted   # Playwright: hosted demo mode, then the kill switch (fresh demo DB, no admin key)
scripts/testnet/hosting-keys.sh status          # read-only; add --yes / delete --yes only with Andre's yes (real transactions)
npx playwright test -c playwright.hosted-live.config.ts   # LIVE smoke test of https://sentfund.my.id (one real 0.01 run); on purpose only
git -c core.sshCommand="ssh -i ~/.ssh/sentfund_deploy -o IdentitiesOnly=yes" push sentfund main main:release   # release to Railway (Andre's yes; CI green first)
scripts/testnet/phase22-setup.sh <stage>        # how the SentFund deployment was built (done; do not rerun)
node scripts/testnet/phase16.ts top-up 2.00     # the vault up to at most 2 tUSDC (real transactions, with Andre's yes)

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

Both must print nothing (except rule text in docs). Then `git push -u origin main` (origin = `git@github.com:andreete/neargajian.git`, deploy key `~/.ssh/gajian_deploy` via repo-local `core.sshCommand`) **and** push `main` to the remote `sentfund` = `https://github.com/discoverateagency-ops/sentfund.git` (private; the repository Railway deploys from, D-121). That push needs a credential from Andre (a token he gives per session, used from an environment variable and never stored, or a deploy key he adds himself); without one, note it in `docs/NEXT-STEPS.md`. If auth fails, note it in `docs/NEXT-STEPS.md` and retry at the next phase end. Never force-push, never change repo visibility.
