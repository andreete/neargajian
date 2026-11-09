# Decision log

Newest decisions at the bottom. Each entry: date, decision, reason. The kickoff (`docs/build/00-KICKOFF.md`) overrides older defaults in the PRD, master prompt and build phases.

## Confirmed by Andre on 9 Nov 2026 (kickoff section 2)

| ID | Topic | Decision |
| --- | --- | --- |
| D-001 | Brand | **GAJIAN** ("payroll" in Indonesian). Logo `public/brand/gajian-logo.jpeg` (reads "Gajian.my.id"). UI language English. |
| D-002 | Track | NEAR HACKATHON, Real-World Money (`realworld`). Testnet only. |
| D-003 | Quality bar | Working prototype with production-grade quality (kickoff section 3). |
| D-004 | Platform priority | Desktop first (1280–1920 px); upload is a flagship feature (kickoff section 4). |
| D-005 | Scope strategy | Core-first: contract-controlled payout → approvals → upload (1,000 rows) → posting modes → UI polish. Never cut: contract approval enforcement, both posting modes, 1,000-row import check, honest test evidence, money-safety invariants. |
| D-006 | Payout token | Own mock **tUSDC**, NEP-141, 6 decimals, zero value, deployed by us on testnet. Currency code `tUSDC`. |
| D-007 | Showcase amounts | 0.01–0.10 tUSDC per row. Sample-1000 total 56.690860; uniform-1000 total 10.000000 (re-verified after the 06b regeneration with English names and +44 phones: unchanged). Mint to the vault only as needed (suggested 100 tUSDC). |
| D-008 | Testnet NEAR budget | Faucet NEAR is for gas/storage only. Reuse accounts, no mass account creation, log NEAR spent per live run in `docs/TESTNET.md`. No live 1,000-row payout unless Andre asks. |
| D-009 | Design reference | Rise main, Deel secondary. Palette from the logo: navy `#0A3C90` primary, bright blue `#2577FE` highlight, sky blue `#57B5FD` accent (never body text on white). Keep amber/red/green status colours; WCAG AA. |
| D-010 | Target date | Feature-complete and rehearsed by Thu 12 Nov 2026. Official deadline 15 Nov 2026 06:59 WIB (14 Nov 23:59 UTC). |
| D-011 | Autonomy | Fully autonomous incl. testnet deploys/transactions, within kickoff section 6 hard limits. Stop for Andre's review after Phase 01. |
| D-012 | Testnet accounts | Agent creates them with near-cli and the faucet. Keys only on this server (`~/.near-credentials`, git-ignored `.env`). |
| D-013 | Second brain | Handover files in the repo (CLAUDE.md, AGENTS.md, docs/BUILD-STATE.md, DECISIONS.md, NEXT-STEPS.md, TESTNET.md); private GitHub remote added later by Andre. |
| D-014 | Hosting | Local demo first on 127.0.0.1:8092. Later external host on gajian.my.id with a persistent disk and long-running worker (e.g. Fly.io, Railway). |
| D-015 | Database | Recommended SQLite via a migration tool that can move to PostgreSQL. Final choice: D-023. |
| D-016 | Demo logins | `maker@gajian.my.id`, `app1@gajian.my.id`, `app2@gajian.my.id`, `admin@gajian.my.id`, password `12345678`, demo mode only. The app never sends email. |
| D-017 | Team | 3 people (`2 - 4`). Andre sole engineer; two teammates do QA and presentation. |
| D-018 | Legacy docs | Old `payroll-tech-docs` pack intentionally excluded. No relayer, gasless, 1Click or payee portal. |

## Phase 01 decisions (9 Nov 2026, by the agent)

### D-019 · Rust toolchain pinned to 1.95.0 (not the newest 1.99.1)

- **Decision:** `contracts/rust-toolchain.toml` pins `1.95.0` with the `wasm32-unknown-unknown` target.
- **Reason:** Andre asked for the version the official docs and the cargo-near template recommend, not the newest Rust. Evidence gathered 9 Nov 2026:
  - `cargo near new` template in cargo-near **0.23.0** pins `channel = "1.95.0"` and `rust-version = "1.95"` (0.22.0 pinned 1.93.0).
  - near-sdk **5.30.0** bumped its `rust-version` to 1.95 (changelog #1639), so 1.95 is also the SDK minimum.
  - Testnet RPC `status` reports nearcore `2.14.0-rc.5`, protocol 88, `rustc_version 1.95.0`.
  - docs.near.org quickstart installs Rust via rustup and points to `cargo near new`; its "tested with" note (rustc 1.86, cargo-near 0.16.1) predates near-sdk 5.30 and cannot build it.
- **Proof:** Wasm built with cargo-near and deployed to a local nearcore 2.14.0 sandbox; owner call succeeded, stranger call failed on-chain (see docs/BUILD-STATE.md Phase 01).
- **Rule:** never bump without repeating the sandbox deploy.

### D-020 · NEAR tool pins: cargo-near 0.23.0, near-cli-rs 0.31.1, near-sdk 5.30.1, near-sandbox 0.4.0

- **Decision:** use the newest releases, not the previous ones.
- **Reason:** all three are the releases that add **nearcore 2.14** support (cargo-near #469, near-cli-rs #682, near-sdk 5.30.0 "stable release for nearcore 2.14"), and testnet already runs nearcore 2.14 / protocol 88. Each went through release candidates (cargo-near rc.1 9 Oct, rc.2 19 Oct). The previous releases (cargo-near 0.22.0, near-cli-rs 0.30.1, near-sdk 5.29.x) target the older protocol, so going back would add risk instead of removing it. near-cli-rs 0.31.1 only adds a Windows dependency fix over 0.31.0; near-sdk 5.30.1 fixes storage measurement for nested collections, which matters for storage deposits.
- **Compatibility doubt noted:** near-sdk 5.30.0 contains breaking changes (unit-testing mock now backed by nearcore host functions; `extern "C-unwind"` host functions). Our code is new, so nothing to migrate. If a regression shows up, fall back to cargo-near 0.22.0 + near-sdk 5.29.1 + Rust 1.93.0 as one set and re-run the sandbox proof.
- **Install method:** prebuilt release tarballs, SHA-256 verified against the published `.sha256` files, installed into `~/.cargo/bin`. GitHub's `releases/download` route returned HTTP 504 on 9 Nov; the same assets were fetched via the GitHub API asset endpoint.
- **Sandbox:** near-sandbox 0.4.0 downloads nearcore sandbox **2.14.0** (matches testnet) and binds RPC and network to 127.0.0.1 only (checked in its source).

### D-021 · Node.js 26.13.0 LTS ("Lithium"), user-level tarball

- Installed from the official tarball (SHA256SUMS verified) into `~/.local/opt/node-v26.13.0-linux-x64`, symlinked into `~/.local/bin`. Pinned in `.nvmrc` and `package.json` `engines`. npm 11.20.0 is bundled; corepack is not, so the project uses npm.

### D-022 · App stack

- Next.js 16.4.3 (App Router) + React 19.3.1 + strict TypeScript, one repository. The release/reconciliation worker will be a separate long-running Node process in the same repo (Phase 12) sharing `src/server`. Vitest 5.0.5 for unit/integration tests; Playwright for the end-to-end test (D-031).
- **Reason:** smallest full-stack TypeScript setup that the master prompt recommends and that deploys to Fly.io/Railway with a persistent disk.

### D-023 · Database: SQLite via better-sqlite3 13.0.3 + Drizzle ORM 0.45.4 / drizzle-kit 0.31.11

- **Reason:** single writer (app + one worker), file on disk, no Docker available. Drizzle migrations are SQL files and Drizzle also supports PostgreSQL, so a later move needs only a driver and dialect change. better-sqlite3 is synchronous, which makes transaction boundaries around state changes simple and explicit. Enable WAL and `busy_timeout` in Phase 05 so the app and worker processes can share the file safely.
- Verified in Phase 01: the native module installs and runs on Node 26 (tests/unit/platform.test.ts).

### D-024 · TypeScript 6.0.3, not 7.0.2

- npm `latest` is now TypeScript 7.0 (native compiler). typescript-eslint 8.72.x (pulled in by eslint-config-next) declares `typescript >=4.8.4 <6.1.0`. Pin 6.0.3 until typescript-eslint supports 7.

### D-025 · ESLint 9.39.5, not 10.x

- eslint-config-next 16.4.3 bundles eslint-plugin-react 7.37, eslint-plugin-import 2.32 and eslint-plugin-jsx-a11y 6.10, whose peer ranges stop at ESLint 9.

### D-026 · npm dependency policy

- Exact versions (`save-exact`), `engine-strict`, lockfile committed, CI uses `npm ci`. Prefer the newest stable release that is at least two weeks old; take a newer one only for a needed fix and record why.

### D-027 · Demo caps

- 1 tUSDC per row (`1000000` base units) and 100 tUSDC per run (`100000000` base units), the suggested values in kickoff section 2. Both are above the sample totals (max row 0.10; 1,000-row sample 56.690860). Configured in `.env` and enforced server-side; the contract enforces its own bounds (Phase 04).

### D-028 · Regional Excel CSV settings (semicolon separator, comma decimals) (recommended addition, accepted)

- Auto-detect `,` / `;` / tab from the header row. Reject comma decimals with a specific error: "Use a dot as the decimal separator, e.g. 1500.50". The template instructions recommend Save As → Text (Tab delimited) (.txt) or CSV UTF-8. Implemented in Phase 09.

### D-029 · Non-reproducible Wasm builds on this server

- NEP-330 reproducible builds need Docker, which is not available here. Local and CI builds use `cargo near build non-reproducible-wasm --locked`. A reproducible build can be added later in CI (GitHub runners have Docker) if time allows.

### D-030 · Contract test stack: near-sandbox + near-api

- Follow the current `cargo near new` template (near-sandbox 0.4.0, near-api 0.8, cargo-near-build 0.11.0) instead of near-workspaces. The template stack matches cargo-near 0.23.0 and nearcore 2.14.

### D-031 · Playwright deferred to the first end-to-end test

- Chromium's system libraries are already on the server (checked 9 Nov), so no `sudo` step is expected. The `@playwright/test` package and browser download are added with the first e2e test (Phase 06/14) to keep Phase 01 light on disk and memory.

### D-032 · License: MIT, "Copyright (c) 2026 GAJIAN team" (confirmed by Andre, 9 Nov 2026)

- `package.json` and the Cargo workspace declare MIT; HACKATHON.md Q-014 accepts MIT. Andre confirmed the license and holder name in the Phase 01 review; `LICENSE` added on 9 Nov 2026.

### D-033 · Git identity (changed by Andre, 9 Nov 2026)

- Repo-local `user.name = Andre`, `user.email = andre.tuwan@gmail.com` (no global git config exists). Commits carry a `Co-Authored-By: Claude` trailer.
- Andre asked to rewrite the author and committer of the two local commits (phase-00, phase-01) to this identity before the first push. Done with `git rebase --root --exec 'git commit --amend --no-edit --reset-author'`; the file trees of both commits were checked identical before and after. New hashes: `ba205f7` (phase-00), `e4cae2d` (phase-01). Nothing had been pushed, so no published history changed.

## Phase 01 review decisions (9 Nov 2026, Andre)

### D-034 · Toolchain pins accepted

- Andre accepted D-019 … D-025 as proposed, including TypeScript 6.0.3 and ESLint 9.39.5.

### D-035 · Temp files live in the repo's `.tmp/`, never the shared `/tmp`

- **Reason:** `/tmp` is a 3.5 GB RAM-backed tmpfs shared with other users; a fresh-checkout cargo test filled it in Phase 01.
- **How:** `scripts/with-tmp.sh` sets `TMPDIR`/`TMP`/`TEMP` to `<repo>/.tmp` (git-ignored) and every npm script runs through it (`-C contracts` for cargo). `contracts/.cargo/config.toml` also forces `TMPDIR` for rustc, build scripts and test binaries (`[env] … force = true`) and caps `build.jobs = 2`. Ad-hoc commands outside npm scripts are prefixed by hand: `TMPDIR=$PWD/.tmp`. `npm run clean:tmp` empties it.

### D-036 · GitHub remote and deploy key

- Private repo `git@github.com:andreete/neargajian.git` (Andre corrected the first URL `andreete/gajian`). Dedicated ed25519 deploy key `~/.ssh/gajian_deploy` (no passphrase, outside the repo, never printed); only the public key was shown to Andre. Repo-local `core.sshCommand = ssh -i ~/.ssh/gajian_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`.
- `git push -u origin main` at the end of every phase. If authentication fails, note it in `docs/NEXT-STEPS.md` and retry at the next phase end. Never force-push, never change visibility.

### D-037 · Unattended permissions in `.claude/settings.json`

- Allow rules for routine project commands (npm, npx, node, cargo, rustup, `./scripts/*`, near-cli only with `network-config testnet`, git add/commit/status/diff/log, non-force push to origin main, and the same commands under `nice -n 19`). Every Phase 01 deny rule is kept; extra denies: `git push --mirror`/`--delete`, `gh repo edit`, `npm publish`, `cargo publish`, reading `~/.ssh/gajian_deploy` and `.env`. Deny always wins over allow.

### D-038 · Testnet authority for Phases 02–04

- Andre authorised account creation, contract deploys and testnet transactions without asking first. One faucet-funded master account; sub-accounts per role (tusdc, vault, admin, maker, approver1, approver2, worker, 2–3 recipients). Payouts 0.01–0.10 tUSDC. Keys only in `~/.near-credentials` and `.env` (written by a script, never printed).

## Phase 02 decisions (9 Nov 2026, by the agent)

### D-039 · Smoke canary retired

- The Phase 01 smoke contract proved the toolchain. The tusdc and vault sandbox tests now deploy real Wasm on nearcore 2.14.0 in every `cargo test`, which repeats that proof, so `contracts/smoke` was removed to save build time and memory.

### D-040 · Vault API conventions

- `run_id` is chosen by the app (1–64 chars `[a-z0-9_-]`, deterministic per run version) and unique on-chain, so a retried create is idempotent: the duplicate fails and the app reconciles by reading `get_run`.
- One recipient per `pay_row` call (PRD §5.4: start with one, tune after measuring). Memo `gajian:<run_id>:<index>` (no PII). `ft_transfer` gets 15 Tgas, the callback 10 Tgas; callers attach 100 Tgas. Measured on testnet: pay_row 2.50 + ft_transfer 1.83 + on_payout 1.77 Tgas.
- Outcome rule: the callback treats the transfer as paid unless the receipt **failed** (`PromiseError::Failed`). A failed receipt is a proven failure (NEP-141 `ft_transfer` panics before moving tokens). Only proven failures are retryable.
- Funding uses `ft_transfer_call` → `ft_on_transfer` (only from the configured token, keeps the full amount). A plain `ft_transfer` into the vault would not be credited to the books and stays outside the payout accounting.

### D-041 · Testnet account layout

- Master `gajian-payroll.testnet` (faucet service, 10 NEAR) and sub-accounts `tusdc`, `vault`, `admin`, `maker`, `approver1`, `approver2`, `worker`, `recipient1..3`. Budget: contracts 2.2 / 2.6 NEAR (≈1.6 NEAR storage each), signers 0.4–0.5, recipients 0.05; ~2.9 NEAR kept on the master for redeploys. Explorer links use `testnet.nearblocks.io`.
- A later vault with an incompatible state layout is deployed by deleting and recreating `vault.gajian-payroll.testnet` (storage NEAR returns to the master) rather than creating new accounts.

## Phase 03 decisions (9 Nov 2026, by the agent)

### D-042 · Commitment format v1

- Ordered Merkle tree over `(index, account, amount)` leaves, SHA-256 with ASCII domain tags, odd node promoted (not duplicated), proofs skip promoted levels; salted review digest over all private fields + posting mode. Full spec: `docs/COMMITMENTS.md`.
- **Why promotion, not duplication:** duplicating the last node lets two different row lists share a root (the Bitcoin CVE-2012-2459 pattern). Promotion is unambiguous because `row_count` is fixed on-chain at run creation.
- **Why the index is in the leaf:** the same wallet can legitimately appear twice (PRD §4); hashing the index makes every row a distinct payout and stops proof replay across indexes.
- **Overpayment guard independent of the tree:** committed (in flight + paid) ≤ reserved = declared total, checked on every `pay_row`.

### D-043 · No testnet redeploy for Phase 03

- The vault API changes again in Phase 04 (policies, cancel/reject, admin config). To save testnet NEAR, the commitment-based vault is proven in sandbox now and deployed to testnet once, at the end of Phase 04. The Phase 02 deployment stays live until then.

## Phase 04 decisions (9 Nov 2026, by the agent)

### D-044 · Contract-enforced workflow with per-run snapshot

- One active workflow with a revision number. Admin, maker, worker and approvers must be distinct accounts (maker/reviewer separation; the admin cannot approve). Runs copy the whole workflow at creation, and `create_run` requires the revision the maker reviewed (PRD §5.1).
- Sequential: the approver's position must equal the number of approvals so far, which also stops approver 2 from rejecting first. Parallel: any order. Each approver counts once.
- New versions use `supersedes` to cancel the previous version in the same transaction (PRD J05: a corrected run is a new version with fresh approvals).

### D-045 · Release roles

- Automatic mode: only the snapshotted worker can `start_release`. Maker mode: only the maker. `pay_row` is allowed for the worker in both modes (it executes bounded steps after release) and for the maker in maker mode.

### D-046 · Recovery and the in-flight rule

- An `InFlight` row is never retried automatically. Only a receipt failure is a proven failure. A stuck `InFlight` row (its callback failed) is resolved by the admin with on-chain evidence, and only after 120 blocks so it cannot race a pending callback. `close_partial` ends a release that cannot complete. Details: `docs/RECOVERY.md`.

### D-047 · Server code runnable by Node directly

- `src/server` uses relative imports with `.ts` extensions (`allowImportingTsExtensions`, `noEmit`). Node 26 strips types natively, so scripts and the Phase 12 worker can import server modules without a bundler. Constraint: server code must use only erasable TypeScript syntax (no enums, namespaces or parameter properties) and relative imports (no `@/` alias) where Node runs it.

### D-048 · Restricted function-call keys for app signers

- Each role signs vault calls with a function-call-only key scoped to `vault.gajian-payroll.testnet` and specific methods: maker `create_run, cancel_run, close_partial, start_release, pay_row`; approvers `approve, reject`; worker `start_release, pay_row`; admin `update_workflow, resolve_in_flight`. Allowances 0.25 NEAR (worker 0.5). The keys are in `~/.near-credentials` and `.env` (written by `scripts/testnet/write-env.mjs`, mode 600). Full-access keys stay out of `.env` and are used only for operator actions (deploy, mint, storage deposits).
- Prepaid gas for vault calls: 50 Tgas (measured: `pay_row` chain ≈ 7 Tgas), so allowances last longer.

### D-049 · Demo default workflow on testnet

- The live vault ends Phase 04 at revision 3: two approvers in sequence (approver1 → approver2), automatic release, caps 1 tUSDC per row and 100 tUSDC per run. Vault balance 0.82 tUSDC.

## Phases 02–04 review (9 Nov 2026, Andre)

### D-050 · Phases 02–04 approved; follow-ups scheduled for Phase 16 (not done yet)

Andre verified the key transactions and balances independently on testnet.
1. **Immutable final vault.** For the final demo, deploy a fresh vault built from the release commit with a reproducible Wasm hash, then delete its full-access key so the code can never change. Add README commands that let a judge verify the code hash (`view_code` / `view_account` `code_hash`) and that no full-access key exists (`view_access_key_list`). Apply the same to `tusdc` if it does not break the demo (minting needs the owner `admin`, not the token account's own key, so it should not).
2. **Live row-level duplicate proof.** In the Phase 16 rehearsal, in a multi-row run that is still `Releasing`, call `pay_row` again on an already-paid row and record the on-chain rejection (`Row is already paid`).
3. **Label sandbox-only recovery paths** clearly in README and BUILD-STATE: wrong-token funding, unregistered-recipient failure + retry, `close_partial`, `resolve_in_flight`, over-reservation.

### D-051 · Contract freeze during the app phases (05–15)

- No contract changes while building the app. If one is unavoidable: batch the changes into one release, use the scripted retire-and-recreate procedure (`scripts/testnet/phase04-retire-p02-vault.sh` pattern adapted to the current API), return the vault's funds through an approved run (rows 0.01–0.10 tUSDC), and log the NEAR spent in `docs/TESTNET.md`.

## Phase 05 decisions (9 Nov 2026, by the agent)

### D-052 · Integrity in the database, not only in code

- Immutability of submitted versions and rows, terminal statuses, single live approval/payout action, and one active workflow are enforced with SQLite triggers and partial unique indexes (`db/migrations/0001_integrity.sql`), so a bug or a second process cannot break them. PostgreSQL has equivalents (triggers, partial indexes) for a later move.
- Money is stored as canonical decimal TEXT of base units, so no int64 limit and no float rounding.

### D-053 · argon2id from Node's standard library

- Node 26 ships `crypto.argon2`, so no native password-hashing dependency is needed. Parameters follow the OWASP minimum (19 MiB, 2 passes, 1 lane); about 40 ms per hash on this server.

### D-054 · `erasableSyntaxOnly`

- TypeScript now rejects syntax that Node's type stripping cannot run (parameter properties, enums, namespaces), enforcing D-047 at compile time.

### D-055 · Demo identities

- `maker@gajian.my.id` → `maker.gajian-payroll.testnet`, `app1@` → `approver1.…`, `app2@` → `approver2.…`, `admin@` → `admin.…` (read from `.env`, defaults to these). The seed mirrors the live vault workflow revision 3 (D-049); Phase 07 adds the chain sync for admin changes.

## Phase 06 decisions (9 Nov 2026, by the agent)

### D-056 · Sessions in the database, not JWTs

- Opaque random token in an HttpOnly cookie, SHA-256 stored server-side, so logout and expiry are immediate and a stolen database row is useless. Per-session CSRF token plus origin checks for mutations.

### D-057 · 404 for runs you may not see, 403 for role-forbidden areas

- Resource reads that fail authorization return 404 (no existence leak). Whole areas or endpoints a role can never use return 403 (`forbidden()` with `experimental.authInterrupts`).

### D-058 · Strict nonce CSP; no inline styles

- `src/proxy.ts` issues a per-request nonce; style-src has no `'unsafe-inline'`. Consequences: no `style=` attributes in our markup and no `next/image` (it adds `style="color:transparent"`); the logo is a plain `<img>` of a trimmed transparent PNG. The Playwright suite fails on any CSP violation.

### D-059 · Visual system

- Rise-inspired light surfaces with the logo palette; Plus Jakarta Sans (self-hosted at build time by `next/font`); status chips use text + icon; approval maps switch to a vertical layout in narrow containers (CSS container queries). Contrast is enforced by `tests/unit/contrast.test.ts`.

### D-060 · Playwright 1.64.1

- Newest release at least two weeks old (1.65.0 is from 5 Nov). Chromium headless shell only; screenshots and e2e run against the production build with an isolated database.

## Phase 06b decisions (9 Nov 2026, Andre's design review)

### D-061 · English-only product

- No IDR, no Indonesian names, no +62 numbers, no local time zones in the product, data, tests or docs meant for users. Times are UTC with the "UTC" label. Phones use the fictional UK range +44 7700 900000–900999. The GAJIAN brand and logo stay. (Internal ops notes such as the host's weekend batch window keep their local time.)

### D-062 · NEAR RPC: FastNEAR

- `rpc.testnet.near.org` returned HTTP 429 "THIS ENDPOINT IS DEPRECATED … Switch to FastNEAR". Default RPC is now `https://rpc.testnet.fastnear.com` (listed on docs.near.org RPC providers), configurable with `NEAR_RPC_URL`.

### D-063 · Real testnet history as demo data, kept separate

- Runs executed by the Phase 02/04 scripts are imported from the chain (`db/seed/testnet-history.json`, re-verifiable with `export-history.mjs --check`) into separate immutable `testnet_*` tables, not into `run_versions`: they have no app review snapshot or salt, and faking one would break the integrity rules. The UI labels them "Testnet run". No transaction, amount or reason is invented.

### D-064 · Sign-in by email and password only

- No role picker; the account decides the role and the server picks the dashboard. In demo mode a plain-text note lists the demo emails and the shared password.

### D-065 · Layout system

- One container (max 1280 px, gutters 48/32/20 px), one section rhythm (96/72/56 px). App shell: left sidebar ≥ 1024 px, top row below. Main tables full width with supporting panels underneath, so wide tables never squeeze. Enforced by the first-screen e2e test.

### D-066 · Amount display

- UI: exact amount, trailing zeros removed down to 2 decimals, thousands separators, tabular figures, right-aligned (`displayAmount`). CSV exports and base-unit/on-chain views: 6 fixed decimals (`fixedAmount`). Never rounded (property test).

## Phase 07 decisions (9 Nov 2026, by the agent)

### D-067 · App-side NEAR client: near-api-js 7.4.0, local signing

- near-api-js 7 is the maintained, consolidated SDK (the `@near-js/*` packages stopped at 2.5.x in Nov 2025). The client signs locally so the transaction hash is known and persisted before sending (needed by Phase 10–12 reconciliation). Only restricted function-call keys are used by the app.

### D-068 · Workflow changes are chain-first

- The vault is the source of truth for the active workflow. The app writes a `pending` revision, signs `update_workflow`, and activates only after `get_workflow` matches. If the app and the vault disagree, changes are refused until an operator reconciles. Failed attempts stay in the table for audit and do not block a retry.
- Release-mode and approver changes apply to new runs only; each run version copies the active snapshot (`activeSnapshot`).

## Phase 08 decisions (9 Nov 2026, by the agent)

### D-069 · Valid-subset confirmation is an exact contract

- The maker confirms the exact row indexes to remove; the server recomputes the invalid set and applies the removal only if both match, under the draft revision the maker saw. Drafts keep invalid rows until then (PRD J03: no silent omissions).

### D-070 · Entry method fixed per run

- A run is created as **manual** (editable rows) or **upload** (read-only imported rows, replaced only by a new accepted file). Switching means creating another run. This keeps PRD J04's "accepted rows are read-only" simple to enforce.

### D-071 · One validation module everywhere

- The browser imports the same `validate.ts` as the server for instant feedback; the server always re-validates with the active workflow's caps.

## Phase 09 decisions (9 Nov 2026, by the agent)

### D-072 · Importer rules

- "Row N" always means the spreadsheet row (physical start line; header is row 1), which is what the user sees in Excel; the data-record number is in the error report too. Column order may vary but the header set must be exact. Only trailing empty records are ignored. Names with line breaks are rejected (parsed correctly, then refused with a clear message).

### D-073 · Libraries

- `csv-parse` 7.0.3 (runtime, standard RFC 4180 parser with line info). `exceljs` 4.4.0 (dev-only, template generation; brings a moderate `uuid` advisory in dev only). The template is generated, committed, and checked by a test.

### D-074 · Screenshot specs are opt-in

- `npm run test:e2e` skips `tests/e2e/screenshots-*.spec.ts`; `npm run screenshots` (Phase 09 set) and `npm run screenshots:06b` run them with `SCREENSHOTS=1`, so review screenshots are never overwritten by a normal test run.

## Phase 09b decisions (9 Nov 2026, Andre's review)

### D-075 · Operations transfers are not payroll

- Imported testnet runs carry `category` (`payroll` | `operations`). Operations transfers keep their proof links in a separate section and never count toward payroll runs, payouts or paid totals (dashboards, landing facts).

### D-076 · Manual builder currency

- The manual builder fixes the currency to tUSDC (the only allowed value) and shows it in the amount header; the stored row still carries `tUSDC` and the shared validation still checks it (files can contain other values and are rejected).

## Phase 10 decisions (9 Nov 2026, by the agent)

### D-077 · Submit returns at inclusion; the page reconciles

- Chain actions from the web app are sent with `wait_until: INCLUDED`, so the UI can show an honest "waiting for NEAR" state with the tx link. The run page then reconciles from `get_run` and tx status every 3 s until settled. Success is never assumed from inclusion.

### D-078 · One live version per run

- A run has at most one live version. Editing reopens only after rejection, cancellation or a failed submission; replacing a pending version uses `supersedes` (atomic on-chain cancel). Paid runs are closed; further payments need a new run.

## Phase 12 decisions (9 Nov 2026, by the agent)

### D-079 · Worker as its own process, sequential payouts

- The release worker runs as a separate Node process sharing the SQLite file (WAL). It pays one row per transaction, rows in order, at most 5 per tick per run (bounded concurrency). In maker-release mode the maker reserves (start_release) and the worker pays, as the contract allows (D-045).

### D-080 · Retry policy

- Retry only proven failures (the token transfer failed: `pay_row` returned false or `get_row` is Failed), at most 3 attempts per row with 30 s backoff; afterwards the run shows Needs attention and an operator follows docs/RECOVERY.md. "Already paid / in flight" refusals are reconciled from the vault, never treated as failures.

## Phase 13 decisions (9 Nov 2026, by the agent)

### D-081 · History views vs locked posting mode

- The history page offers both views (consolidated and detailed) for every paid run so totals can be reconciled on screen; the **company CSV** always follows each run's posting mode locked at submission. Both views are built from the same vault-confirmed payout records, and a run enters reports only when Paid with every row confirmed.

### D-082 · Export scoping

- Company CSV: maker (own runs), assigned approvers, admin; no recipient fields at all. Recipient-detail CSV: a separate route for the maker and the approvers assigned to the run; the admin gets 403. Exports use UTC timestamps to the second, exact 6-decimal amounts, formula escaping, UTF-8 BOM and CRLF.

### D-083 · Live proof through the app

- The live testnet proof is a Playwright spec under `tests/live/` with its own config (`playwright.live.config.ts`), run only on purpose against the running production server and worker with the real demo database. It is never part of `npm run test:e2e` (isolated seeded DB, no chain transactions).

## Phase 13b decisions (9 Nov 2026, Andre's review)

### D-084 · Paid only from confirmed payout records

- A version moves to Paid only when the vault reports Paid AND every row's payout record is confirmed AND the confirmed count and total equal the approved version. Reconciliation settles open payout records from `get_row` before deciding. The run page derives badge, counters, banner and timeline from one `paymentState`. A confirmed payout record is never changed by a later answer.

## Phase 14 decisions (9 Nov 2026, by the agent)

### D-085 · Dense tables: one line, truncate with copy, page the detailed history

- In history and review tables, identifiers never wrap: they truncate with an ellipsis, keep the full value in the tooltip and offer a copy button. The detailed history groups lines under a run header row and shows 100 lines per page; the line number lives in the reference suffix on screen and in the CSV `line` column.

### D-086 · One derived display status

- Every list and the run page use the same derived status (`paymentState` / `displayStatusFor`): Awaiting funding, Needs attention, and never Paid before every payout is confirmed.

### D-087 · Test-only e2e fixture

- Browser tests seed runs in every lifecycle state with `scripts/e2e-fixture.ts` against the stand-in vault in the isolated `.tmp/e2e` database only (the script refuses other paths). Its tx hashes are fake and screenshots made from it are labelled as fixture data.

## Phase 15 decisions (9 Nov 2026, by the agent)

### D-088 · Public evidence file and read-only judge verification

- `docs/evidence/testnet-runs.json` lists public evidence only (account IDs, run IDs, tx hashes, base-unit amounts, expected refusal messages). `npm run judge:verify` re-checks it against testnet with view calls and tx status; it never needs keys. Phase 16 appends its runs here.

### D-089 · Credential scan covers the full history

- `scripts/secret-scan.sh` scans tracked and untracked (non-ignored) files and every commit reachable from any ref; CI runs it with full history. Patterns target private material (NEAR private keys are 80+ base58 characters; public keys are not flagged). Matches are reported by location only.

## Phase 16 decisions (9 Nov 2026, by the agent, within Andre's Phase 16 brief)

### D-090 · Reproducible build without Docker

- cargo-near's `reproducible-wasm` mode needs Docker, which this host forbids. The release build pins the toolchain (Rust 1.95.0, cargo-near 0.23.0, `--locked`) and remaps machine paths (cargo registry → `/cargo/registry/src`, repo → `/gajian`) through `--env RUSTFLAGS=…` (cargo-near ignores a plain `RUSTFLAGS`). Proof: two clean clones at different paths produce byte-identical Wasm, and the on-chain `code_hash` equals it.

### D-091 · Final vault under a new name, locked

- `vault2.gajian-payroll.testnet` holds the release build and has no access keys at all, so its code can never change; `vault.gajian-payroll.testnet` stays readable with its history. Funds moved through an approved run of the old vault to the admin, then `ft_transfer_call` into vault2, because the vault books only funds that arrive through `ft_on_transfer`.

### D-092 · The app records which vault a version and a revision belong to

- Revisions restart at 1 in a new vault, so uniqueness is per vault. No chain action is ever sent for a version through a client of another vault. Versions from the earlier vault stay as their vault last confirmed them.

### D-093 · A confirmed payout record is immutable

- The first confirmation of a payout (by the worker or by reconciliation from the vault) fixes its status and its time; exports and history can no longer change after the fact.

## Phase 16b decisions (9 Nov 2026, Andre's review)

### D-094 · Paid time is the chain block time (correction of existing records)

- A payout's paid time is the timestamp of the block that includes its `pay_row` transaction: the time the explorer shows. The release action records its block time the same way. The value is read from the chain at confirmation (worker or reconciliation), set once and protected by a trigger. If the RPC cannot answer, it stays empty and the worker fills it later. It is never estimated from a local clock, and a run enters reports only when every paid time is known. The run page, history, both CSVs and `judge:verify` use this one value.
- The 16 confirmed actions recorded before this change were filled from the chain by `scripts/testnet/backfill-block-times.ts`. This is a **correction**: the values are derived from the chain, logged with block heights (`docs/evidence/backfill-block-times-16b.json`) and audited, and nothing else changed. The earlier app times remain in the audit detail.

### D-095 · Run page actions have one fixed place

- The run header is a three-column grid: back link | title and chips (the title wraps inside its column) | actions (top right, on the title row). It is the same for every run state, at 1280 and 1440 px.

