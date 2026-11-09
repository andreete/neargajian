# Build state

Per phase: changed files, exact commands and real results, sandbox vs live-testnet evidence, blockers. Never mark something as run if it was not.

| Phase | Status | Live testnet evidence |
| --- | --- | --- |
| 00 Handoff commit | Done (`e66a953`) | n/a |
| 01 Repository and toolchain | Done, approved by Andre 9 Nov (`e4cae2d`, follow-ups `phase-01: review follow-ups`) | none |
| 02 Single-payout walking skeleton | Done | **Yes**: first contract-controlled payout `p02-run-1`, see docs/TESTNET.md |
| 03 Commitments and money math | Done | none (sandbox + local only by design; live use of proofs comes with the Phase 04 redeploy) |
| 04 Contract policy and payout recovery | **Done, awaiting Andre's review** | **Yes**: 3 policy runs signed with restricted keys, see docs/TESTNET.md |
| 05 Persistent application model | Not started | — |

---

## Phase 04 · Contract policy and payout recovery (9 Nov 2026)

### Built

- **Vault** (`contracts/vault/src/lib.rs`, Wasm 214,632 B `306c7f15…`):
  - Workflow `{revision, kind: One | TwoSequential | TwoParallel, approvers, release_mode: Automatic | Maker, maker, worker, max_row_amount, max_run_total}`. Admin-only `update_workflow` bumps the revision; validation requires admin, maker, worker and approvers to be distinct accounts and the approver count to match.
  - `create_run(run_id, workflow_revision, row_count, total, payout_root, review_digest, supersedes)`: the maker must pass the revision it reviewed ("Workflow changed since review" otherwise). The run snapshots the whole workflow. Run cap enforced. `supersedes` cancels an older pending or approved version atomically.
  - `approve` / `reject`: only the assigned approvers; sequential order enforced (approver 2 can neither approve nor reject first); parallel in either order; an approver counts once; rejection is terminal.
  - `cancel_run` (maker, before release only), `close_partial` (maker, releasing, nothing in flight → `PartiallyPaid`, unused reservation released).
  - `start_release`: worker in automatic mode, maker in maker-release mode (from the snapshot); reserves the full total or fails "awaiting funding".
  - `pay_row`: worker, or maker in maker-release mode; row cap from the snapshot; proof check; `InFlight` before transfer; private `on_payout` books `Paid`/`Failed`.
  - `resolve_in_flight` (admin, only after 120 blocks, with evidence) for a row whose callback never ran.
  - NEP-297-style `EVENT_JSON` logs (`gajian_vault` 1.0.0): run_created, run_approval, run_rejected, run_cancelled, release_started, row_requested, row_paid, row_failed, row_resolved, run_paid, run_closed_partial, workflow_updated, vault_funded.
- **`docs/RECOVERY.md`**: row/run states and procedures for proven failures, unpayable recipients, uncertain outcomes (RPC timeouts) and stuck `InFlight` rows.
- **Restricted signer keys**: function-call-only keys per role scoped to the vault methods; `scripts/testnet/write-env.mjs` writes them into the git-ignored `.env` (mode 600) without printing; `scripts/testnet/signer-keys.mjs` locates key files by public key via RPC.
- `src/server` imports now use `.ts` extensions (`allowImportingTsExtensions`), so Node 26 runs server code directly (D-047). Live driver `scripts/testnet/phase04-live.ts` uses `src/server/commitments.ts`.

### Sandbox / local evidence

| Command | Result |
| --- | --- |
| `cargo test --lib` | tusdc 3/3, **vault 49/49** (45 contract + 4 commitment). New in Phase 04: sequential order (approve and reject), parallel either order and both required, repeated approval adds no credit, unassigned approver / maker cannot approve, rejection terminal, cancel only before release and only by the maker, supersede cancels and the stale version cannot release, workflow update leaves existing runs on their snapshot, stale revision rejected, only admin updates, maker-release vs automatic (release and pay_row roles), run and row caps, **concurrent runs cannot over-reserve** (second release waits for funding, succeeds after top-up), stale/duplicate callback rejected, `close_partial` (and refused while in flight), `resolve_in_flight` (only admin, not before 120 blocks, books outcome with evidence), distinct-role validation |
| `cargo test --test sandbox` | **1/1** in 70 s, peak RSS 1.10 GB. Phase 02/03 flow plus, on real Wasm: non-admin update fails; create at stale revision fails; approver 2 first fails (sequential); release before final approval fails; rejection blocks release; a run created before a workflow change keeps its sequential/automatic snapshot; parallel either order, duplicate approval fails, worker cannot release a maker-release run, maker releases and pays; supersede cancels v1; over-reserve waits for funding; books = ledger |
| `npm run contracts:lint` | fmt + clippy `-D warnings` clean |
| `npm run lint`, `typecheck`, `npm test` | clean, 26/26 |

### Live testnet evidence (separate from sandbox; details and every tx link in docs/TESTNET.md)

- Phase 02 vault retired cleanly: its 0.95 tUSDC went back to the admin through its own approved 10-row run (0.095 per row), then the account was deleted and recreated with the Phase 04 contract.
- 5 restricted function-call keys added; the worker key calling `approve` was refused before reaching the chain ("method name <approve> isn't allowed by the access key").
- Live driver, every action signed with a restricted key (25 steps, all as expected):
  - `p04-seq-202611091047`: 2 in sequence, automatic. Approver 2 first **rejected on-chain**; release before final approval rejected; maker release rejected (automatic mode); worker reserved and paid 0.03 / 0.07 / 0.05 tUSDC to recipient1/2/3; duplicate payout rejected. **Paid.**
  - Admin switched to 2 in parallel + maker release (revision 2). `p04-par-…`: create at stale revision 1 rejected; approver 2 then approver 1; worker release rejected; maker released; tampered amount rejected; maker and worker each paid one row. **Paid.**
  - `p04-rej-…`: approver 1 rejected; release rejected. **Rejected.**
  - Admin restored 2 in sequence + automatic (revision 3).
- Books (0.82 total, 0 reserved) match the token ledger. Phase 04 gas: 0.0253 NEAR. Total burned since the faucet: 0.1017 NEAR.

### Not done / limits

- Not exercised live (sandbox and unit only, to save NEAR and because they need special conditions): wrong-token funding, unregistered-recipient failure and retry, `close_partial`, `resolve_in_flight` (needs a callback that runs out of gas), over-reservation.
- `resolve_in_flight` is an admin attestation (trust noted in docs/RECOVERY.md).
- Contract upgrades with state migration are not implemented; incompatible changes recreate the vault (D-041).

---

## Phase 03 · Immutable run commitments and money math (9 Nov 2026)

### Built

- `src/server/money.ts`: decimal tUSDC ↔ bigint base units (6 decimals). Rejects empty, signs, exponents, grouping, `.5`/`1.`, more than 6 decimals, zero, values above a cap or above u128; comma decimals get the D-028 message "Use a dot as the decimal separator, e.g. 1500.50". Exact formatting, strict JSON base-unit strings, bounded sums (run cap, u128).
- `src/server/near-account.ts`: NEAR account ID syntax check (nearcore rules).
- `src/server/commitments.ts` + `contracts/vault/src/commitment.rs`: domain-separated leaf/node hashes, ordered Merkle tree with promoted odd node, proofs, verification, salted review digest. Spec: **`docs/COMMITMENTS.md`**. Shared vectors: `tests/vectors/commitments.json` (3 leaf cases incl. index 2^32−1 / u128 max / 64-char account, trees of 1, 2, 3, 5 (duplicate wallet), 7 rows with every proof, 1 review digest).
- Vault now stores `row_count`, `total`, `payout_root`, `review_digest` per run (no rows on-chain, up to 1,000 rows). `pay_row(run_id, index, receiver_id, amount, proof)` verifies the proof with `env::sha256_array` before anything else; per-row `RowRecord {status, receiver_id, amount, attempts}`; view `get_row`.

### Evidence (local / sandbox only)

| Command | Result |
| --- | --- |
| `npm test` | **26/26** (money 9, commitments 8, sample data 6, platform 3). 1,000-row sample: tree + 1,000 proofs generated and verified in **39 ms**, total 56.690860 tUSDC (matches docs/SAMPLE-DATA.md), max proof length 10 |
| `python3 -I .tmp/xcheck.py tests/vectors/commitments.json` (independent re-implementation of the spec, throwaway) | 9/9 vectors match |
| `cargo test --lib` | tusdc 3/3, **vault 22/22**: Rust side reproduces every shared vector (leaves, roots, all proofs); changed amount / destination / index rejected; same wallet + amount on indexes 0 and 2 paid as two payouts; a paid row cannot be paid again; a root whose leaves exceed the declared total cannot overpay (reservation guard); malformed root and >1,000 rows rejected; 1,000-leaf tree has 10-level proofs |
| `cargo test --test sandbox` | **1/1** in 41 s (peak RSS 1.09 GB): everything from Phase 02 plus, on-chain: tampered amount and tampered destination fail "proof does not match", row 0's proof replayed as index 2 fails, rows 0 and 2 (same wallet, same amount) both paid, failed row retried with `attempts = 2` |
| `npm run lint`, `typecheck`, `contracts:lint` | clean |

---

## Phase 02 · Single-payout walking skeleton (9 Nov 2026)

### Built

- `contracts/tusdc`: NEP-141 + NEP-145 + NEP-148 via `near-contract-standards` 5.30.1; 6 decimals, symbol `tUSDC`, zero initial supply, owner-only `mint` to registered accounts.
- `contracts/vault` (skeleton): config `admin, token, maker, approver, worker` (maker/approver/worker must be distinct); `ft_on_transfer` credits the books only from the configured token; `create_run` (maker, app-chosen `run_id`, 1–10 rows stored on-chain, approver snapshotted); `approve` (assigned approver only, once); `start_release` (worker; reserves the full total from the available balance or fails "awaiting funding"); `pay_row` (worker; marks the row `InFlight`, `ft_transfer` with 1 yocto, then private `on_payout` callback records `Paid` or proven `Failed`); views `get_config`, `get_balances`, `get_run`, `get_row_status`. A row in flight or paid cannot be paid again; only a proven failure can be retried; committed (in flight + paid) can never exceed the reservation.
- `contracts/smoke` retired (D-039). `scripts/build-contracts.sh` builds tusdc + vault.
- Testnet tooling: `scripts/testnet/near.sh` (refuses anything but `network-config testnet`, TMPDIR in `.tmp/`, redacts key-like strings and seed-phrase lines from output), `scripts/testnet/phase02-single-payout.sh` (operator sequence), `scripts/testnet/balances.mjs`, `scripts/testnet/tx-receipts.mjs` (read-only RPC).

### Sandbox / local evidence

| Command | Result |
| --- | --- |
| `cargo test --lib` (contracts) | tusdc **3/3**, vault **10/10** unit tests pass (happy path, proven failure keeps the reservation and allows retry, maker cannot approve own run, approver cannot create, release before approval, release without funding, duplicate pay while in flight, wrong token cannot fund, run_id reuse, distinct roles) |
| `cargo test --test sandbox` (vault) | **1/1 pass** in 41 s, peak RSS 755 MB. On a local nearcore 2.14.0 sandbox with real Wasm: fund via `ft_transfer_call`; **wrong token** (second token instance) rejected and refunded to the sender, vault books unchanged; non-maker create fails; duplicate `run_id` fails; **premature** `start_release` and `pay_row` fail; maker cannot approve; double approve fails; non-worker release fails; payout succeeds (`true`, recipient +50000); **duplicate payout** fails; 2-row run: row 0 paid, repeat fails "already paid"; row 1 to an **unregistered account: the real async `ft_transfer` fails, the callback returns `false`, row `Failed`, run stays `Releasing`, 10000 stays reserved**; after registration the retry pays and the run is `Paid`; vault books equal the token ledger |
| `npm run contracts:lint` | fmt + clippy `-D warnings` clean |
| `npm run contracts:build` | tusdc 153,849 B `fd5a0b9a…`; vault 157,596 B (`ee8d9b7b…` before fmt, `9145511b…` after) |

### Live testnet evidence (separate from sandbox)

Accounts, deploys and every transaction are in `docs/TESTNET.md`. Summary: master `gajian-payroll.testnet` (faucet) + 10 role sub-accounts; tUSDC and vault deployed; vault and recipient1 registered; 1 tUSDC minted and transferred into the vault; run `p02-run-1` (0.05 tUSDC → recipient1): premature release **failed on-chain**, approve ok, reserve ok, **`pay_row` paid** (tx `7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL`, receipt chain `pay_row → ft_transfer (NEP-141 event, memo gajian:p02-run-1:0) → on_payout = true`), duplicate payout **failed on-chain**. Books (0.95 total, 0 reserved) match the token ledger. Gas: 0.0712 NEAR for account setup, 0.0053 NEAR for the whole Phase 02 flow.

Not run live (sandbox only): wrong-token funding and the unregistered-recipient failure path; they need no live proof beyond the sandbox and would only spend NEAR.

### Limits of the skeleton (addressed next)

- Rows are stored on-chain, max 10 per run → Phase 03 Merkle commitment (1,000 rows).
- One approver, worker-only release, no reject/cancel, no admin config updates → Phase 04.
- `on_payout` failing (e.g. out of gas) would leave a row `InFlight`; recovery is designed in Phase 04.

---

## Phase 01 · Repository and toolchain (9 Nov 2026)

### Prerequisite check

- First check (14:54 WIB): missing `cc`/`gcc`, `make`, `pkg-config` and OpenSSL headers. Stopped and asked Andre for `sudo apt install -y build-essential pkg-config libssl-dev libudev-dev`.
- Re-check after Andre's install: `cc` (gcc 15.2.0), GNU Make 4.4.1, pkg-config 2.5.1, OpenSSL headers 3.5.5 (`/usr/include/openssl/ssl.h`), `libudev.h`, curl 8.18.0, tar 1.35, unzip 6.00, python3 3.14.4: all present.
- Playwright Chromium runtime libraries (libnss3, libgbm1, libasound2t64, libatk-bridge2.0-0t64, …) already installed.

### Tools installed (user-level, no sudo)

| Tool | Version | Method | Integrity |
| --- | --- | --- | --- |
| Node.js / npm | v26.13.0 / 11.20.0 | official tarball → `~/.local/opt`, symlinks in `~/.local/bin` | `SHASUMS256.txt` OK |
| rustup / Rust | 1.95.0, minimal profile + rustfmt, clippy, wasm32 target | `rustup-init` | `.sha256` OK |
| cargo-near | 0.23.0 | prebuilt tarball → `~/.cargo/bin` | `.sha256` OK |
| near-cli-rs | 0.31.1 | prebuilt tarball → `~/.cargo/bin` | `.sha256` OK |
| nearcore sandbox | 2.14.0 | downloaded by near-sandbox 0.4.0 into `contracts/target` | via crate |

GitHub's `releases/download/...` route returned HTTP 504 for both NEAR tool tarballs (several retries); the same release assets were downloaded through the GitHub API asset endpoint and checked against the published `.sha256` files. Next.js telemetry disabled for this user (`next telemetry disable`) and in CI.

### Version decisions

See `docs/DECISIONS.md` D-019 … D-033. In short: Rust **1.95.0** (cargo-near 0.23.0 template, near-sdk 5.30 MSRV, rustc of testnet's nearcore 2.14.0-rc.5), newest NEAR tools because they are the nearcore-2.14 releases, TypeScript **6.0.3** (typescript-eslint caps at <6.1), ESLint **9.39.5** (Next's React/import/a11y plugins cap at ESLint 9).

### Commands and real results (sandbox / local only)

| # | Command | Result |
| --- | --- | --- |
| 1 | `node scripts/generate-sample-payroll.mjs` + `sha256sum public/templates/*` | 4/4 checksums match `docs/SAMPLE-DATA.md`; `git status` clean (sample-1000 total 56.690860, uniform 10.000000) |
| 2 | `nice -n 19 cargo near build non-reproducible-wasm --manifest-path smoke/Cargo.toml --locked` | OK in 36 s, peak RSS 762 MB; `gajian_smoke.wasm` 88,803 bytes, SHA-256 `5f7ad23d6d6a65ef96edf46523cbd85a947f0a41867bcde818b1a468b751763e` |
| 3 | `nice -n 19 cargo test --workspace` (CARGO_BUILD_JOBS=2) | 2/2 unit + **1/1 sandbox** pass; 3 min 50 s, peak RSS 1.07 GB. Sandbox test: cargo-near builds the Wasm, deploys + `new` init on nearcore sandbox 2.14.0 (127.0.0.1), owner `increment` succeeds, stranger `increment` **fails on-chain**, `get_counter` = 1 |
| 4 | `cargo fmt --all --check`; `cargo clippy --workspace --all-targets --locked -- -D warnings` | both clean |
| 5 | `nice -n 19 npm install` | 389 packages, 36 s, peak RSS 590 MB |
| 6 | `npm run lint` / `npm run typecheck` | pass / pass (lint config verified to apply `no-explicit-any` = error, 16 react-hooks and 22 Next rules) |
| 7 | `nice -n 19 npm test` | 2 files, **9/9 pass** (6 sample-file checksum/header tests, SQLite+Drizzle native-driver test, BigInt 1,000 × 1,000,000 exactness, health payload) |
| 8 | `NODE_OPTIONS=--max-old-space-size=1536 nice -n 19 npm run build` | pass in 5.9 s, peak RSS 684 MB; routes `/` (static), `/api/health` (dynamic) |
| 9 | `npm run start` + `curl` | listening on **127.0.0.1:8092 only** (`ss`); `/api/health` 200 with `nosniff`, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `no-store`; `/` 200; server stopped afterwards |
| 10 | `npm run samples:check` | pass (regenerates, `git diff --exit-code` clean) |
| 11 | `npm audit --audit-level=high` | pass: 0 high/critical. 12 **moderate**, all dev-only: esbuild ≤0.24.2 via drizzle-kit (GHSA-67mh-4wv8-2f99, dev-server CORS; we never run drizzle-kit's server) and minimatch via typescript-eslint (GHSA-g3hv-75wg-m249). Production deps: 0 |
| 12 | Fresh-checkout proof | see below |

npm 11.20's install-script allowlist: `better-sqlite3` and `esbuild` install scripts are **denied** in `package.json` `allowScripts`. better-sqlite3 13 ships N-API prebuilds (`prebuilds/linux-x64.node`) and loads without compiling; esbuild uses its platform package.

### Fresh-checkout proof

Staged tree exported with `git checkout-index -a` into an empty directory (no `node_modules`, no `target`), then:

| Step | Result |
| --- | --- |
| `npm ci` | 389 packages, peak RSS 899 MB |
| `npm run check` (lint + typecheck + tests) | pass, 9/9 tests |
| `npm run samples:check` | pass |
| `npm run build` | pass |
| `npm run contracts:build` (`--locked`) | pass in 35 s; Wasm SHA-256 `5f7ad23d…751763e`, **identical** to the first build |
| `npm run contracts:test` (`--locked`, fresh target dir) | 2/2 unit + 1/1 sandbox pass, 298 s, peak RSS 1.07 GB |

Incident: the first fresh-copy `cargo test` failed with "No space left on device" because the copy lived in the scratchpad under `/tmp`, which is a **3.5 GB RAM-backed tmpfs**. Not a code failure. Freed 2.2 GB right away and re-ran with `CARGO_TARGET_DIR`/`TMPDIR` on the home disk; the throwaway copies were deleted afterwards. Rule added to CLAUDE.md.

### Files added in Phase 01

- Toolchain and config: `.nvmrc`, `.npmrc`, `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.claude/settings.json`, `.github/workflows/ci.yml`
- App skeleton: `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `src/app/api/health/route.ts`, `src/server/health.ts`
- Tests: `tests/unit/sample-data.test.ts`, `tests/unit/platform.test.ts`
- Contracts: `contracts/Cargo.toml`, `contracts/Cargo.lock`, `contracts/rust-toolchain.toml`, `contracts/smoke/{Cargo.toml,src/lib.rs,tests/sandbox.rs}`
- Second brain: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/BUILD-STATE.md`, `docs/DECISIONS.md`, `docs/NEXT-STEPS.md`, `docs/TESTNET.md`

### Not done in Phase 01 (by design)

- No application features, DB schema or migrations (Phase 05+). Drizzle and better-sqlite3 are installed and smoke-tested only.
- Importer total test for the three sample files (56.690860 / 56.690860 / 10.000000) needs the importer: Phase 09.
- Playwright package/browsers: added with the first e2e test (D-031).
- CI has not run yet: no GitHub remote. The workflow mirrors the local commands above.
- No testnet accounts, deployments or transactions.

### Risks and notes

- ESLint 9.39.5 is marked "no longer supported" upstream; we stay on it until eslint-config-next's plugins accept ESLint 10 (D-025).
- near-sdk 5.30 / cargo-near 0.23 / near-cli 0.31 are 3–7 days old; fallback set recorded in D-020.
- Memory: the peak was 1.07 GB (cargo test). Heavy steps were run one at a time; swap was already 2.2 GB used before we started.
