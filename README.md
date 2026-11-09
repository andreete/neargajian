# GAJIAN

**Payroll batches with a clear approval trail, paid to NEAR testnet wallets.**

GAJIAN lets a finance team prepare a payroll run (manual rows or a CSV/TXT upload of up to 1,000 rows), route it to one or two approvers (in sequence or in parallel), and pay recipients from a custom NEAR vault contract that enforces those approvals on-chain. Company reporting shows the same payouts either as one consolidated entry or as one entry per recipient. Built for NEAR HACKATHON, Real-World Money track.

> **Status: Phase 16 of 18.** The complete payroll flow works in the app on NEAR testnet against the **final vault `vault2.gajian-payroll.testnet`**: deployed from release commit `cf4d9a1` with a reproducible Wasm hash and **no full-access key**, so its code can never change. You can build or upload a run, submit it, and approve it in the browser (one or two approvers, in sequence or in parallel). Release is automatic or by the maker, and the release worker pays each recipient from the vault. Runs that exceed the vault balance wait as "Awaiting funding" and pay once funded. History shows consolidated and detailed posting, with company and recipient-detail CSV exports. Rehearsed live through the app on 9 Nov 2026 (`docs/TESTNET.md`, Phases 13 and 16); re-check it read-only with `npm run judge:verify`.

## Network, token and trust model

- **NEAR testnet only.** No mainnet configuration exists in this repository.
- **Token:** `tUSDC`, our own mock NEP-141 token with 6 decimals and zero value, deployed by us on testnet at `tusdc.gajian-payroll.testnet`. Vault: **`vault2.gajian-payroll.testnet`** (final, locked: no full-access key; verify below). The earlier `vault.gajian-payroll.testnet` (Phases 04–13) is retired, kept readable, and its funds were moved to the final vault through an approved run.
- **Data:** synthetic only. Sample files use reserved phone ranges and `example.com` emails.
- **Trust model (prototype):** the server holds restricted, function-call-only testnet signer keys (scoped to the vault and to each role's methods) for the maker, approvers, release worker and admin, and relays authenticated actions. The contract checks which account signed each action. This is acceptable for a testnet demo but is **not** production custody. A mainnet version would use user-held wallets or a multisig/MPC signer.

## What works today

| Check | Command | Result on 9 Nov 2026 |
| --- | --- | --- |
| Sample files reproduce byte-for-byte | `npm run samples:check` | 4/4 SHA-256 checksums match `docs/SAMPLE-DATA.md`, no git diff |
| Lint, typecheck | `npm run lint`, `npm run typecheck` | pass |
| Unit + integration tests | `npm test` | 155/155 pass (lifecycle, decisions, release worker incl. restart / unknown outcome / two workers, reports, run page in every payout state, API permission matrix, file integrity) |
| Browser tests (Chromium, production build) | `npm run test:e2e` | 21/21 pass (incl. every page at 1280x720 and 1440x900, dialogs, copy actions) |
| Credential scan | `npm run secret-scan` | clean: working tree + full Git history |
| Live evidence, read-only | `npm run judge:verify` | 93/93 checks: runs, rows, tx outcomes, ft_transfer events, operations, the final vault's code hash and keys, on-chain refusals (see `docs/JUDGE.md`) |
| Upload of the three sample files | `npm test` (import tests) | 56.690860 / 56.690860 / 10.000000 tUSDC, 1,000 rows each |
| Production build | `npm run build` | pass |
| Health endpoint | `npm run start`, then `curl http://127.0.0.1:8092/api/health` | `{"status":"ok","network":"testnet",...}` |
| Contracts (sandbox) | `npm run contracts:test` | tUSDC + vault Wasm on a local nearcore 2.14.0 sandbox: fund, approve, reserve, pay; premature release, wrong token and duplicate payout rejected; real failed transfer recorded and retried |
| Money math and payout commitments | `npm test` | Exact 6-decimal parsing; Merkle commitments with shared Rust/TypeScript vectors (`docs/COMMITMENTS.md`); 1,000-row sample proofs generated and verified in ~40 ms |
| Contracts (live testnet) | `scripts/testnet/phase02-single-payout.sh`, `node scripts/testnet/phase04-live.ts` | First contract-controlled payout (0.05 tUSDC); then runs with two approvers in sequence (automatic release) and in parallel (maker release), and a rejection, all signed with restricted function-call keys. See `docs/TESTNET.md` |
| Complete flow through the app (live testnet) | `npm run live:phase13` (needs the production server and `npm run worker` running) | Upload 3 rows, submit, approver 1 then approver 2 in the browser, worker pays 0.04 / 0.06 / 0.02 tUSDC, run Paid with explorer links, history in both views, both CSVs; balances changed by exactly the paid amounts. See `docs/TESTNET.md` |
| Live rehearsal through the app (final vault) | `npm run live:phase16` (server + worker running; real transactions) | Detailed and consolidated posting, automatic and maker release, Awaiting funding then funded and paid, duplicate `pay_row` on a paid row refused on-chain, 1,000-row import; balances changed by exactly the paid amounts. See `docs/TESTNET.md` Phase 16 |
| Approval policies and recovery (sandbox) | `npm run contracts:test` | 1 / 2-sequential / 2-parallel approvals, reject, cancel, supersede, workflow snapshot, release modes, reservations, stuck-row recovery (`docs/RECOVERY.md`) |

## Verify the deployed vault

The final vault runs the Wasm built from release commit `cf4d9a1` (`npm run contracts:build`: pinned Rust 1.95.0 and cargo-near 0.23.0, `--locked`, machine paths remapped, so any checkout path builds the same bytes). Its only full-access key was deleted after deployment, so nobody can redeploy it.

```sh
git checkout cf4d9a1 && npm run contracts:build
sha256sum contracts/target/near/gajian_vault/gajian_vault.wasm
# 38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0
npm run judge:deployment          # read-only RPC
# PASS  deployed code_hash equals the locally built Wasm      (4osoZq17KezE6AfBUtma6Ciqnti4oKMPJSYcXQBxNmNP)
# PASS  no full-access key on vault2.gajian-payroll.testnet (0 keys in total)
```

Without Node, the same facts via plain RPC (`code_hash` is base58 of the Wasm's sha256; the key list must be empty):

```sh
RPC=https://rpc.testnet.fastnear.com
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"vault2.gajian-payroll.testnet"}}'
curl -s $RPC -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"vault2.gajian-payroll.testnet"}}'
```

The official `cargo near build reproducible-wasm` (NEP-330 metadata) needs Docker, which this project's build host does not allow; the pinned-toolchain build above is reproducible across checkouts and users on Linux x86-64 with the same toolchain.

## Tested only locally or in the sandbox

These recovery paths are proven by automated tests (`tests/integration/release.test.ts`, `tests/integration/run-page-states.test.tsx`, contract sandbox tests, `docs/RECOVERY.md`), **not** on testnet, because they need fault injection that testnet does not allow safely:

- an **unknown transaction outcome** (landed, or never landed) reconciled from the vault before any retry;
- **two release workers at once** never paying a row twice;
- a **failed token transfer** retried a bounded number of times, then Needs attention (never a false Paid);
- a **worker crash** between claiming a payout and signing it.

Everything else in the main flow, including the duplicate-payout refusal and Awaiting funding, also ran live (`docs/TESTNET.md`).

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 26.13.0 (see `.nvmrc`) | npm 11.20+ |
| Rust | 1.95.0 + `wasm32-unknown-unknown` | pinned in `contracts/rust-toolchain.toml`; rustup installs it automatically |
| cargo-near | 0.23.0 | https://github.com/near/cargo-near/releases |
| near-cli-rs | 0.31.1 | only needed for testnet operations (Phase 02+) |
| C toolchain | `cc`, `make`, `pkg-config`, OpenSSL headers | Ubuntu: `build-essential pkg-config libssl-dev` |

Why these versions: `docs/DECISIONS.md` (D-019 to D-026).

## Quick start

```sh
git clone <repo-url> gajian && cd gajian
cp .env.example .env            # placeholders only; nothing to fill in for Phase 01
npm ci
npm run check                   # lint + typecheck + unit tests
npm run samples:check           # regenerate sample data and confirm no diff
npm run db:seed                 # demo users (DEMO_MODE=true in .env)
npm run build && npm run start  # http://127.0.0.1:8092
```

Contracts (needs Rust and cargo-near; the first run downloads the nearcore sandbox binary):

```sh
npm run contracts:build   # cargo near build non-reproducible-wasm --locked
npm run contracts:test    # unit + sandbox tests
npm run contracts:lint    # cargo fmt --check + clippy -D warnings
```

On a shared or small machine, prefix heavy commands with `nice -n 19` and set `CARGO_BUILD_JOBS=2`.

## Demo sign-in (demo mode only)

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Maker (Maya Maker) | `maker@gajian.my.id` | `12345678` | `/maker` My runs |
| Approver 1 (Alex Approver) | `app1@gajian.my.id` | `12345678` | `/approver` Review queue |
| Approver 2 (Riley Reviewer) | `app2@gajian.my.id` | `12345678` | `/approver` Review queue |
| Admin (Adam Admin) | `admin@gajian.my.id` | `12345678` | `/admin` Workflow settings |

Type the email and password; the server opens the dashboard for the account's role. All times are shown in UTC.

Security model (sessions, CSRF, CSP, rate limiting, authorization matrix): `docs/SECURITY.md`.

## Browser tests and screenshots

```sh
npx playwright install chromium   # once, user-level
npm run build
npm run test:e2e                  # starts the build on 127.0.0.1:8092 with an isolated seeded DB, then stops it
npm run screenshots               # writes the current phase's design screenshots
```

## Release worker

The release worker is its own long-running process. It reconciles submitted runs with the vault, releases approved runs in automatic-release mode and pays one recipient per transaction (tx hash stored before sending; only proven failures retried, at most 3 attempts). Run it only while you need payouts:

```sh
npm run worker        # Ctrl+C (SIGINT) or SIGTERM stops it cleanly after the current step
```

History and exports live at `/history` (maker, approvers, admin). The company CSV follows each run's posting mode (one line per run, or one line per recipient line); the recipient-detail CSV (names, emails, NEAR accounts, tx links) is available only to the maker and the approvers assigned to a run, never to the admin. Times are UTC to the second.

`npm run live:phase13` drives the full flow in a real browser against the running server and **sends real testnet transactions**; run it only on purpose.

## Database

SQLite file (`DATABASE_URL`, default `file:./data/gajian.sqlite`, git-ignored) via Drizzle. Migrations in `db/migrations/` are applied automatically when the app or a script opens the database.

```sh
npm run db:migrate   # apply migrations, print row counts
npm run db:seed      # demo users + active workflow + a demo draft (requires DEMO_MODE=true in .env)
npm run db:status    # row counts per table
```

The seed also imports the real Phase 02/04 testnet runs from `db/seed/testnet-history.json` (exported from the chain by `scripts/testnet/export-history.mjs`; `--check` re-verifies against testnet), shown in the app as "Testnet run".

Schema: `src/server/db/schema.ts`; integrity triggers: `db/migrations/0001_integrity.sql` (submitted versions and their rows can never change, one live payout action per row). To start over locally, stop the app and delete `data/gajian.sqlite*`.

## Templates

The run builder offers four downloads: `gajian-payroll-template-blank.csv`, `gajian-payroll-template.xlsx` (macro-free; Instructions + Payroll sheet with the 1,000 sample rows; account, amount and phone columns formatted as Text), `gajian-payroll-sample-1000.csv` and `gajian-payroll-sample-1000.txt`. Regenerate the Excel file with `npm run templates:xlsx`. Excel with regional settings that save semicolon-separated CSV is detected automatically; amounts must use a dot as decimal separator.

## Sample data

`public/templates/` holds a blank template, a realistic 1,000-row sample (CSV and tab-delimited TXT, total **56.690860 tUSDC**) and a uniform 1,000 × 0.01 file (total **10.000000 tUSDC**). They are generated deterministically by `scripts/generate-sample-payroll.mjs`; details and checksums are in `docs/SAMPLE-DATA.md`. The wallets in these files are not real demo accounts, and the app will refuse to pay them.

## Repository layout

```
src/app/        Next.js routes (App Router)       src/server/   domain code
contracts/      Rust workspace: tusdc (NEP-141 test token), vault (payroll vault)
tests/          unit tests (Vitest)                scripts/      sample-data generator
public/         logo and payroll templates         docs/         PRD, build plan, decisions, build state
```

## Project documents

- `docs/JUDGE.md`: reproduce and verify (fresh checkout, expected output, read-only testnet verification).
- `docs/ACCEPTANCE.md`: acceptance checks A01–A08 with app/sandbox and live testnet evidence kept apart.

- `docs/build/`: kickoff decisions, PRD with acceptance checks A01–A08, design system, 18-phase build plan
- `docs/BUILD-STATE.md`: what has been built and verified, phase by phase
- `docs/DECISIONS.md`: decision log
- `docs/TESTNET.md`: public testnet account and contract IDs (none yet)

## AI assistance

This repository is built with AI coding assistants (Claude Code as implementer; Codex for independent QA), directed and reviewed by the team. See `CLAUDE.md` and `AGENTS.md` for the rules the agents follow.

## License

MIT, see `LICENSE` (Copyright (c) 2026 GAJIAN team).
