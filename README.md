# GAJIAN

**Payroll batches with a clear approval trail, paid to NEAR testnet wallets.**

GAJIAN lets a finance team prepare a payroll run (manual rows or a CSV/TXT upload of up to 1,000 rows), route it to one or two approvers (in sequence or in parallel), and pay recipients from a custom NEAR vault contract that enforces those approvals on-chain. Company reporting shows the same payouts either as one consolidated entry or as one entry per recipient. Built for NEAR HACKATHON, Real-World Money track.

> **Status: Phase 09 of 18.** Contracts with live testnet payouts, the database model, sign-in and role dashboards, the admin workflow editor (chain-confirmed), the manual builder and the CSV/TXT upload with templates exist. Submitting, approving and releasing runs in the app come in Phases 10–12. This README describes only what exists and has been verified. See `docs/BUILD-STATE.md` for evidence per phase.

## Network, token and trust model

- **NEAR testnet only.** No mainnet configuration exists in this repository.
- **Token:** `tUSDC`, our own mock NEP-141 token with 6 decimals and zero value, deployed by us on testnet at `tusdc.gajian-payroll.testnet`. Vault: `vault.gajian-payroll.testnet`.
- **Data:** synthetic only. Sample files use reserved phone ranges and `example.com` emails.
- **Trust model (prototype):** the server holds restricted, function-call-only testnet signer keys (scoped to the vault and to each role's methods) for the maker, approvers, release worker and admin, and relays authenticated actions. The contract checks which account signed each action. This is acceptable for a testnet demo but is **not** production custody. A mainnet version would use user-held wallets or a multisig/MPC signer.

## What works today

| Check | Command | Result on 9 Nov 2026 |
| --- | --- | --- |
| Sample files reproduce byte-for-byte | `npm run samples:check` | 4/4 SHA-256 checksums match `docs/SAMPLE-DATA.md`, no git diff |
| Lint, typecheck | `npm run lint`, `npm run typecheck` | pass |
| Unit + integration tests | `npm test` | 113/113 pass |
| Browser tests (Chromium, production build) | `npm run test:e2e` | 15/15 pass |
| Upload of the three sample files | `npm test` (import tests) | 56.690860 / 56.690860 / 10.000000 tUSDC, 1,000 rows each |
| Production build | `npm run build` | pass |
| Health endpoint | `npm run start`, then `curl http://127.0.0.1:8092/api/health` | `{"status":"ok","network":"testnet",...}` |
| Contracts (sandbox) | `npm run contracts:test` | tUSDC + vault Wasm on a local nearcore 2.14.0 sandbox: fund, approve, reserve, pay; premature release, wrong token and duplicate payout rejected; real failed transfer recorded and retried |
| Money math and payout commitments | `npm test` | Exact 6-decimal parsing; Merkle commitments with shared Rust/TypeScript vectors (`docs/COMMITMENTS.md`); 1,000-row sample proofs generated and verified in ~40 ms |
| Contracts (live testnet) | `scripts/testnet/phase02-single-payout.sh`, `node scripts/testnet/phase04-live.ts` | First contract-controlled payout (0.05 tUSDC); then runs with two approvers in sequence (automatic release) and in parallel (maker release), and a rejection, all signed with restricted function-call keys. See `docs/TESTNET.md` |
| Approval policies and recovery (sandbox) | `npm run contracts:test` | 1 / 2-sequential / 2-parallel approvals, reject, cancel, supersede, workflow snapshot, release modes, reservations, stuck-row recovery (`docs/RECOVERY.md`) |

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

- `docs/build/`: kickoff decisions, PRD with acceptance checks A01–A08, design system, 18-phase build plan
- `docs/BUILD-STATE.md`: what has been built and verified, phase by phase
- `docs/DECISIONS.md`: decision log
- `docs/TESTNET.md`: public testnet account and contract IDs (none yet)

## AI assistance

This repository is built with AI coding assistants (Claude Code as implementer; Codex for independent QA), directed and reviewed by the team. See `CLAUDE.md` and `AGENTS.md` for the rules the agents follow.

## License

MIT, see `LICENSE` (Copyright (c) 2026 GAJIAN team).
