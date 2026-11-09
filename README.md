# GAJIAN

GAJIAN is a payroll approval and payout app on NEAR testnet. A finance team prepares a payroll run, one or two approvers sign off, and a custom NEAR vault contract pays each recipient's wallet. The contract only pays a run that has the required approvals and only the exact amounts that were approved. Built at NEAR HACKATHON for the Real-World Money track (`realworld`).

## Key facts

| Item | Value |
| --- | --- |
| Track | Real-World Money (`realworld`): payroll |
| Network | NEAR **testnet only** (no mainnet configuration exists in this repository) |
| Token | `tUSDC`: our own NEP-141 test token, 6 decimals, zero value, at `tusdc.gajian-payroll.testnet` |
| Vault contract (used by the app) | `vault2.gajian-payroll.testnet`: release commit `cf4d9a1`, Wasm sha256 `38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0`, **no access keys** (code cannot change) |
| Earlier vault (retired, readable) | `vault.gajian-payroll.testnet` (Phases 04–13) |
| Live proof | `docs/TESTNET.md`: every transaction with explorer links, balances before and after. Re-check without keys: `npm run judge:verify` |
| Demo sign-in (demo mode) | `maker@gajian.my.id`, `app1@gajian.my.id`, `app2@gajian.my.id`, `admin@gajian.my.id`, password `12345678` |
| Stack | Next.js 16 + React 19 (TypeScript), SQLite (Drizzle), Rust contracts with near-sdk 5.30.1, near-api-js 7.4.0 |
| License | MIT (`LICENSE`) |
| AI use | Built with Claude Code; independent QA with Codex. See "AI use" below |

## The problem

A small company paying staff or contractors in stablecoins usually has one person holding a wallet and sending transfers by hand. Nothing enforces the company's approval policy, a typo in an amount or wallet is paid as typed, nobody can prove afterwards that what was paid is what was approved, and the accountant gets a list of transactions instead of a posting that matches the books.

## What GAJIAN does

1. **Prepare.** The maker enters rows by hand or uploads a CSV/TXT file of up to 1,000 rows. Every row is validated: NEAR account format, amount with at most 6 decimals, per-row and per-run caps, phone and email format. An invalid file is rejected as a whole, with every problem listed by file row and column, and the previous draft is kept.
2. **Review and submit.** The maker sees exact totals, the approval path and both accounting previews, then submits. The app freezes the rows into an immutable version. It registers a Merkle commitment of (row, account, amount) on-chain with `create_run`, together with the workflow revision. No names, emails or phones go on-chain.
3. **Approve.** One approver, two in sequence, or two in parallel, as configured by the admin. The vault enforces the order and the assigned accounts.
4. **Release and pay.** Release is automatic (by the release worker) or done by the maker, depending on the workflow. The vault reserves the run total. The worker then pays one recipient per transaction (`pay_row` with the row's Merkle proof). The vault refuses wrong signers, early release, tampered amounts or accounts, and a second payment of a row. If the vault holds less than the run total, the run waits as "Awaiting funding" and pays once funded.
5. **Report.** A run is Paid only when every payout is confirmed and the confirmed count and total equal the approved count and total. History shows each run as one consolidated entry or as one entry per recipient. Exports: a company CSV for the books (no personal data) and a recipient-detail CSV (only for the maker and the run's approvers). A payout's paid time is the timestamp of the block that includes its transaction, the time the explorer shows.

## For judges: do X, see Y (no keys needed)

Requirements: Node.js 26.13 and npm 11 (`.nvmrc`); for step 4, Rust 1.95.0 and cargo-near 0.23.0. Expected output is from 9 Nov 2026.

### 1. Install and run the checks

```sh
git clone https://github.com/andreete/neargajian.git && cd neargajian
npm ci
npm run lint && npm run typecheck     # no errors
npm test                              # Test Files 21 passed (21) · Tests 159 passed (159)
npm run samples:check                 # sample files regenerate byte-for-byte (checksums in docs/SAMPLE-DATA.md)
npm run secret-scan                   # secret-scan: clean (working tree + N commits)
```

### 2. Verify the live testnet evidence (read-only)

```sh
npm run judge:verify
```

See: about 115 lines starting with `PASS`, ending with `All testnet evidence checks passed.` It reads `docs/evidence/testnet-runs.json` and checks, from the vault contract's own views and the final transaction outcomes:
- every run's status, total and paid rows;
- every transaction's signer, receiver and success;
- every payout's `ft_transfer` event (receiver and amount);
- eight on-chain refusals (out-of-order approval, early release, wrong signer, tampered amount, stale workflow, release after rejection, duplicate payment of a paid row, release beyond the vault balance);
- the final vault's code hash and keys;
- that every paid time in the exported CSVs (`docs/evidence/exports/`) equals the block time of its payout transaction.

Every transaction is also linked to the NearBlocks testnet explorer in `docs/TESTNET.md`.

### 3. Verify the deployed vault cannot change (plain RPC)

`code_hash` is base58 of the Wasm's sha256; the key list must be empty:

```sh
RPC=https://rpc.testnet.fastnear.com
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"vault2.gajian-payroll.testnet"}}'
# "code_hash":"4osoZq17KezE6AfBUtma6Ciqnti4oKMPJSYcXQBxNmNP"
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"vault2.gajian-payroll.testnet"}}'
# "keys":[]
```

### 4. Rebuild the contract and compare (optional, Rust)

```sh
npm run contracts:build
sha256sum contracts/target/near/gajian_vault/gajian_vault.wasm
# 38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0
npm run judge:deployment
# PASS  deployed code_hash equals the locally built Wasm
# PASS  no full-access key on vault2.gajian-payroll.testnet (0 keys in total)
npm run contracts:test        # contract unit tests + a local nearcore sandbox flow
```

The build pins Rust 1.95.0, cargo-near 0.23.0 and `Cargo.lock`, and remaps machine paths, so any checkout path builds the same bytes on Linux x86-64. The official `cargo near build reproducible-wasm` needs Docker, which our build host does not allow.

### 5. Run the app locally (demo mode, read-only without keys)

```sh
cp .env.example .env
# edit .env: set SESSION_SECRET to 32+ random characters (for example: openssl rand -hex 32)
npm run demo:reset            # fresh database: 4 demo users + the vault's current workflow (read from the chain)
npm run build && npm run start                     # http://127.0.0.1:8092
```

See:
- Sign in as `maker@gajian.my.id` / `12345678`: "My runs".
- **New run → Upload a file** with `public/templates/gajian-payroll-sample-1000.csv`: accepted, 1,000 rows, exact total 56.69086 tUSDC, 50 rows per page in file order.
- Upload a broken file: every problem is listed with its file row and column, and the previous draft is kept.
- **Continue to review**: both posting previews and the approval path.
- Without signer keys, a yellow "Read-only copy" note is shown and **Submit** answers "This copy of GAJIAN has no signer keys … Nothing was recorded." The live flow is shown by step 2, the screenshots in `docs/screenshots/phase-13/` and `docs/screenshots/phase-16/`, and the demo video.
- Sign in as `admin@gajian.my.id`: the workflow editor and approval map.

### 6. Browser tests (optional)

```sh
npx playwright install chromium
export SESSION_SECRET=$(openssl rand -hex 32)
npm run build && npm run test:e2e     # 22 passed
```

These use an isolated database with a test-only fixture of runs in every state against a stand-in vault (`scripts/e2e-fixture.ts`). No testnet access is needed.

More detail: `docs/JUDGE.md`. Acceptance checks A01–A08, with app/sandbox evidence kept apart from live evidence: `docs/ACCEPTANCE.md`.

## What is real, and what is limited

- **Real on testnet:** the vault contract, every approval and payout, refusals by the contract, balances. The app's main flow uses the real contract, database and validation; there is no mock path in it.
- **Test token:** `tUSDC` is our zero-value NEP-141 token, not a real stablecoin. The admin can mint it.
- **Trust model (prototype):** the server holds restricted, function-call-only testnet keys for the maker, approvers, worker and admin, and signs for the signed-in user. Each key can only call that role's vault methods, without deposits. The contract checks which account signed each action. This is fine for a testnet demo; it is **not** production custody. A mainnet version would use user-held wallets or a multisig/MPC signer.
- **Limits enforced by the vault:** at most 1 tUSDC per row and 100 tUSDC per run (workflow caps), at most 1,000 rows per run, only funds the vault holds.
- **Tested only locally or in the sandbox (not on testnet):** an unknown transaction outcome reconciled before any retry; two release workers at once; a failed token transfer retried a bounded number of times; a worker crash between claim and signing. These need fault injection that testnet does not allow safely. Tests: `tests/integration/release.test.ts`, `tests/integration/run-page-states.test.tsx`, contract sandbox tests, `docs/RECOVERY.md`.
- **Synthetic data only.** Phones use the reserved `+44 7700 900xxx` range and emails use `example.com`.

## Hackathon window and diff (Q-003)

All code in this repository was written during NEAR HACKATHON, on and after 9 Nov 2026 (after the 2026-10-19 announcement). The first commit (`ba205f7`) contains only planning documents and sample-data scripts. There is no pre-hackathon code. The tags `pre-hackathon` (on `ba205f7`) and `hackathon-submission` will be added by the team at submission; the diff will be at `https://github.com/andreete/neargajian/compare/pre-hackathon...hackathon-submission`.

## Third-party software

- App runtime: Next.js 16.4.3, React 19.3.1, near-api-js 7.4.0, Drizzle ORM 0.45.4, better-sqlite3 13.0.3, csv-parse 7.0.3, server-only. Font: Plus Jakarta Sans (Google Fonts, via `next/font`).
- Development: TypeScript 6.0.3, Vitest 5.0.5, Playwright 1.64.1, ESLint 9 with eslint-config-next, drizzle-kit 0.31.11, ExcelJS 4.4.0 (generates the .xlsx template).
- Contracts: near-sdk 5.30.1, near-contract-standards 5.30.1 (NEP-141 for tUSDC); tests use near-sandbox 0.4.0 (nearcore 2.14.0), near-api 0.8, cargo-near-build 0.11, tokio. Build: cargo-near 0.23.0, Rust 1.95.0.
- Testnet RPC: FastNEAR public endpoint. Explorer links: NearBlocks testnet.

All third-party packages are used under their own licenses (`package-lock.json`, `contracts/Cargo.lock`).

## AI use

GAJIAN was built with **Claude Code** (Anthropic) as the implementing agent. The team set the requirements, made the decisions, reviewed every phase and independently verified the on-chain results. Independent QA of the release candidate is done with **Codex** (OpenAI) in Phase 18. The rules both agents follow are in `CLAUDE.md` and `AGENTS.md`. The phase-by-phase evidence is in `docs/BUILD-STATE.md`, and decisions are in `docs/DECISIONS.md`.

## Commands

```sh
npm run dev                    # development server, http://127.0.0.1:8092
npm run build && npm run start # production server
npm run worker                 # release worker (needs the worker signer key; stop with Ctrl+C)
npm run demo:reset             # move the current database to data/backups/ (never deleted), start a clean demo database
npm run db:seed | db:migrate | db:status
npm test | npm run test:e2e | npm run lint | npm run typecheck
npm run judge:verify           # read-only testnet evidence check
npm run judge:deployment       # read-only: local vault Wasm equals the deployed code, no access keys
npm run secret-scan            # credential scan of the working tree and the full Git history
npm run contracts:build | contracts:test | contracts:lint
```

Commands that send real testnet transactions (operators only, with keys): `npm run live:phase13`, `npm run live:phase16`, scripts in `scripts/testnet/`.

## Troubleshooting

- **`SESSION_SECRET must be at least 32 characters in production`**: set it in `.env` (`openssl rand -hex 32`).
- **`npm run demo:reset` refuses:** stop the app and the worker first (it never touches a database in use). `DEMO_MODE=true` must be set in `.env` (it is in `.env.example`).
- **Port 8092 in use:** the app binds to 127.0.0.1:8092 only; stop the other process, or run `npx next start -H 127.0.0.1 -p <port>`.
- **`npm run typecheck` on a fresh clone:** it generates Next.js route types first, so no build is needed.
- **Playwright cannot find a browser:** `npx playwright install chromium` (on Linux CI: `--with-deps`).
- **`better-sqlite3` fails to install:** it needs a C/C++ toolchain (`build-essential` on Ubuntu) when no prebuilt binary matches your Node version; use Node 26.13.
- **RPC errors in `judge:verify`:** the public FastNEAR endpoint rate-limits briefly; rerun, or set `NEAR_RPC_URL` to another **testnet** RPC.
- **Contracts:** `rustup` installs the pinned toolchain from `contracts/rust-toolchain.toml`; cargo-near 0.23.0 from https://github.com/near/cargo-near/releases. On small machines use `CARGO_BUILD_JOBS=2`.

## Repository layout

```
src/app/         Next.js routes and pages            src/server/   domain code (money, import, auth, chain, runs, payouts, reports)
src/worker/      release worker process              db/           migrations (Drizzle) and the testnet history seed
contracts/       Rust workspace: tusdc (NEP-141 test token), vault (payroll vault)
tests/           unit/, integration/, e2e/, live/    scripts/      sample data, demo reset, testnet operations, judge verifiers
public/          logo and payroll templates          docs/         evidence, decisions, build state, judge and QA guides
```

## Documents

- `docs/JUDGE.md`: reproduce and verify, with expected output.
- `docs/ACCEPTANCE.md`: acceptance checks A01–A08.
- `docs/TESTNET.md`: accounts, deployments, every live transaction, balances, NEAR spent.
- `docs/SECURITY.md`: sessions, CSRF, CSP, rate limits, authorization matrix.
- `docs/RECOVERY.md`: how stuck or unknown payouts are resolved.
- `docs/COMMITMENTS.md`: the on-chain commitment format (Merkle tree, review digest).
- `docs/SAMPLE-DATA.md`: sample files and checksums.
- `docs/VIDEO.md`, `docs/HOSTING.md`, `docs/SUBMISSION.md`, `docs/QA-HANDOFF.md`: demo, hosting plan, submission checklist, independent QA.
- `docs/BUILD-STATE.md`, `docs/DECISIONS.md`: what was built, with evidence, and why.

## License

MIT, see `LICENSE` (Copyright (c) 2026 GAJIAN team).
