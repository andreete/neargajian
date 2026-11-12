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

## Phase 17 decisions (9 Nov 2026)

### D-096 · No chain action is recorded without a signer key

- Every action that signs (submit, approve/reject, cancel, release, payouts, workflow change) checks the role's key first and changes nothing if it is missing. A copy without keys is an honest read-only copy with a visible note; the worker refuses to start without its key.

### D-097 · Demo reset moves, never deletes

- `npm run demo:reset` moves the database into `data/backups/` (checked row counts) and starts a clean one with the vault's current workflow read from the chain. Live evidence stays in `docs/TESTNET.md`, `docs/evidence/` and the backup.

### D-098 · Hosting plan: Fly.io, one machine, restricted host-only keys

- Web and worker share the SQLite volume on one machine. The host gets its own function-call keys (no admin key by default), small allowances, a small vault balance, optional lower caps and a recipient allowlist. Nothing is created until Andre says so.


## Phase 19 decisions (10 Nov 2026)

### D-099 · Change of plan (Andre, 10 Nov)

- No Codex QA for now: Andre does a human QA pass after Phase 19 (`docs/QA-HANDOFF.md` updated for it; the Codex handoff stays available).
- No hosting: local-only with a YouTube video. `docs/HOSTING.md` is marked "not pursued"; D-014 and D-098 are superseded.
- Tags: there is no pre-hackathon code, so no `pre-hackathon` tag. Only `hackathon-submission`, set by Andre at submission (README, SUBMISSION).
- Q-015 (a second project) stays open.

### D-100 · The recipient directory is an app and approver guardrail, not a contract rule

- The vault is frozen (D-051) and vault2 has no access keys, so the directory cannot be enforced on-chain. "Pay registered recipients only" is enforced by the app at upload (file row and column), in the manual builder (browser and server, same `validate.ts` rule), and **again on the server at submit**. The result (`{enforced, matched, rows}`) is frozen into the version (`run_versions.directory_check`, trigger-protected) and shown to approvers, with a warning when the directory changed since (deactivated recipient or lower maximum).
- README and SECURITY say plainly that a maker key used outside the app is not stopped by the directory; the approvers are the control.

### D-101 · Directory data rules

- Recipients are never deleted (trigger) and their NEAR account never changes (trigger); deactivate instead. Every change is in the append-only `recipient_events` (who, when, source, field → [before, after]); audit events stay PII-free (IDs, counts, field names).
- Maximum per payout ≤ the active workflow's per-row cap, validated with the payroll row rules. Divisions keep their first spelling ("sales" → "Sales").
- Bulk import: the payroll columns plus `division`; `amount` is the maximum. All-or-nothing with row and column; new accounts are added (active), existing ones updated field by field and keep their active/inactive status; a repeated account in the file is an error. New accounts are checked on testnet only for imports of up to 25 (to stay polite to the public RPC); larger imports say so.
- "Ready to receive tUSDC": read-only `view_account` + tUSDC `storage_balance_of`, 5 s timeout, advisory (never blocks a payment).

### D-102 · Demo directory seed

- Sales: Emma Clark (`recipient1`), Daniel Hall (`recipient2`); Operations: Grace Lewis (`recipient3`); maximum 0.10 tUSDC each (the showcase range, D-007).
- The 1,000 sample employees (accounts `gjn-emp-NNNN.testnet`, not on testnet) go to **Engineering, Customer Support and Logistics**, not Sales or Operations. Reason: "the Sales division" must mean the two payable recipients (Andre's example preview "Sales division, 2 recipients"; the live assistant run pays Sales), while the sample upload still passes. They are marked `sample` and shown as "Sample" (never paid).
- `npm run db:seed` and `npm run demo:reset` seed the directory and turn the setting on; `seedDemo` keeps it opt-in (`recipientDirectory: true`) so older integration tests with fixture accounts are unchanged.

### D-103 · Payroll assistant: the model structures, the app decides

- The model gets only the maker's messages and the division names, and returns one strict tool call (`action` draft/ask/refuse, title, divisions, recipients by name with an optional division, amount as typed, currency, posting mode, question, refusal reason).
- The app then, deterministically: refuses requests with a NEAR account or a non-tUSDC currency **before** calling the model; resolves recipients only from active directory entries (division, or exact name; an ambiguous name becomes a follow-up question, "Daniel Hall in Sales" resolves it); requires the amount to appear in the maker's own words (otherwise a question, never a guess); checks the per-row cap, every recipient's maximum and the run cap.
- Previews are stored server-side (`assistant_requests`); **Create draft** sends only the preview ID, works once, for the maker who asked, within 30 minutes, and resolves the directory again. It creates a manual draft (`source = manual`) with the request text fixed on the run (trigger) and shown as "Drafted by the payroll assistant from: …" to maker and approvers. The assistant module cannot submit, approve, release, change the workflow or the directory.
- Rate limit: 20 requests per maker per rolling hour (every request is a row).
- Missing posting mode defaults to consolidated (the New run form's default), labelled "(default)" in the preview. Missing title: "<scope> payout, <Month YYYY>".

### D-104 · Model and SDK

- `@anthropic-ai/sdk` **1.3.0** (newest release at least two weeks old, D-026; 1.4.0+ are newer than 27 Oct). Default model **`claude-opus-5-5`**, the default model in Anthropic's model documentation (Nov 2026); `ASSISTANT_MODEL` overrides it (for example `claude-haiku-5-5` for lower cost).
- Forced `tool_choice` returns 400 on current models, so: one tool with `strict: true`, `tool_choice: auto` with parallel calls off, and the instruction to always call it; a reply without the tool call is an error ("no draft request"), a `refusal` stop is a refusal. `output_config.effort: low` (short extraction). For models that support it, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a classifier decline falls back server-side.
- Timeout 20 s, one retry. The key is read from `.env` on the server only.

### D-105 · Test stub, labelled

- Browser tests and unit tests use `stubModel()` (a naive keyword parser that can be "fooled" on purpose). A running server uses it only with `ASSISTANT_STUB=browser-tests` **and** a database under `.tmp/` (refused otherwise); the box then says "Test stub model (browser tests only)". Labelled in code, UI and README. The judge-mode browser test runs with no key and checks the "off" message.

### D-106 · Voice input

- The browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), `en-US`, interim results; the transcript only fills the text box (never sends). Hidden where unsupported. `Permissions-Policy: microphone=(self)` (was `microphone=()`). README and SECURITY state that browser speech recognition sends audio to the browser vendor's service.

### D-107 · `.env` is never rewritten destructively

- `scripts/testnet/write-env.mjs` now keeps every existing value it does not manage (and carries over variables missing from `.env.example`), so Andre's `ANTHROPIC_API_KEY` survives a rewrite. It was not run in Phase 19.

### D-108 · Vault top-up for QA and video retakes

- Vault2 topped up from 0.24 to 2.00 tUSDC (admin mint + `ft_transfer_call`, `docs/TESTNET.md`). The funding helper's limit is 10 tUSDC per top-up; it had wrongly reused the 1 tUSDC per-row cap.

## Phase 20 decisions (10 Nov 2026)

### D-109 · Change of plan: a public hosted demo on Railway after all (Andre, 10 Nov)

- GAJIAN goes online at submission, on Railway, until at least 25 Nov 2026; the repository becomes public at submission. This supersedes D-099's "no hosting" (D-014, D-098 stay superseded: not Fly.io).
- Railway (Andre's choice): deploys from GitHub, keeps the database on a volume with backups, one replica per service with a volume, a web dashboard for variables. Every Railway detail in `docs/HOSTING.md` was checked against Railway's docs on 10 Nov 2026.
- Railway deploys only from a `release` branch; `main` stays the working branch. Nothing is pushed to `release`, no account is created and no host key is added on-chain without Andre's explicit yes.
- Order of work: hosting readiness → Andre's accounts → host keys and go live → human QA on the hosted site → fixes → video → public repository and `hackathon-submission` tag → X post → submission by Friday 13 Nov → online until 25 Nov → shutdown.

### D-110 · `railway.json` is not available: dashboard runbook plus an optional IaC file

- Railway's docs (10 Nov 2026): Config as Code is deprecated, existing files keep working only for legacy services until 2026-12-01, and "New services cannot opt into Config as Code". The documented replacement is Infrastructure as Code, `.railway/railway.ts` (applied with the Railway CLI after `railway login`).
- So the runbook configures the service in the dashboard, click by click. `.railway/railway.ts` records the same settings as the documented equivalent, but it is **optional, not applied and not validated** (no Railway login on this machine). Restart policy, Wait for CI and backups are not in the IaC reference and stay dashboard settings.
- The build is the root `Dockerfile` (Railway uses it automatically); the start command is its `CMD`.

### D-111 · One service, two processes, fail together

- `scripts/hosted-start.sh`: `hosted-prepare.ts` (migrations; on first boot or a new `DEMO_RESET_TOKEN`: `demo-reset.ts --with-testnet-history`), then the web app and the release worker. If either exits, the other is stopped and the service exits non-zero, so Railway's On Failure policy restarts both. SIGTERM is passed to both.
- Migrations run in the start command, not in a pre-deploy command, because Railway mounts volumes only at container start.
- The container binds `0.0.0.0:$PORT` (`PORT=8080`). The 127.0.0.1 rule is for this host.
- Tested on this host with the real processes bound to 127.0.0.1 and a throwaway database: first boot, second boot, new reset token, same token again, worker killed → service stopped, SIGTERM → clean stop.

### D-112 · Image: Node 26.13.0 pinned by digest, `better-sqlite3` compiled in the image

- `node:26.13.0-bookworm-slim@sha256:add5c17c…` (Docker Hub, 10 Nov). The build stage installs python3/make/g++, runs `npm ci` (install scripts stay denied by `allowScripts`), removes `better-sqlite3`'s shipped prebuilds and compiles it with npm's bundled node-gyp against the image's headers (`--nodedir=/usr/local`), then opens an in-memory database. The same compile command was run on this host on a copy (48 s, loads SQLite 3.53.4). The image itself was not built here (no Docker): the first Railway build is its first real build.

### D-113 · Hosted demo mode (`HOSTED_DEMO=true`)

- A banner on every page (root layout, rendered per request so the deploy's variables count, not the build's).
- Its own keys, least privilege: maker `create_run, cancel_run` (0.1 NEAR allowance), approvers `approve, reject` (0.05), worker `start_release, pay_row` (0.25) on vault2. Never admin, master or full-access; `loadConfig` refuses `ADMIN_SIGNER_PRIVATE_KEY` in hosted mode. `scripts/testnet/hosting-keys.sh add|delete|status` writes private keys only to the git-ignored `.hosting/host-keys.env` (600). `signer-keys.mjs` now picks the role key that has a local key file, so the extra host keys never confuse this server's tooling.
- `chainWritesEnabled` now means the four payroll keys; the admin key is separate (`adminWritesEnabled`). Without it the workflow editor is read-only (preview only), on any copy.
- Directory and setting read-only in hosted mode (403 `hosted_read_only`). Submit allowed only when every row pays an active, "Ready to receive tUSDC" recipient within its maximum.
- Assistant: a separate Anthropic key with a monthly spend limit (Andre's console), plus a global 200 requests per rolling 24 hours in hosted mode.
- Sign-in lockout counts per email and client in hosted mode, so a visitor cannot lock the shared demo accounts.
- Kill switch `HOSTED_READONLY=true`: every mutation except sign-out → 503, the worker pauses, banner.
- Vault at most 2 tUSDC: `phase16.ts top-up <target ≤ 2>`.
- Hosted database: `demo:reset` plus the real Phase 02/04 testnet history (clean: separate immutable tables, labelled "Testnet run", already tested), so visitors see paid runs with explorer links on the dashboards right away. The app runs of Phases 13–19b are not copied (they live in backups of this server's database, with rehearsal leftovers).

### D-114 · Domain: `app.gajian.my.id` recommended; the apex needs Andre's decision

- gajian.my.id's DNS is Vercel DNS (`ns1/ns2.vercel-dns.com`, checked 10 Nov), and **the apex already serves a live site** ("Gajian — HR & Payroll Modern untuk UMKM Indonesia"). `app.gajian.my.id` is free.
- Railway needs CNAME + TXT. A CNAME is not allowed at the apex; Railway supports CNAME flattening and ALIAS, and Vercel DNS supports ALIAS at the apex. So the apex is possible, but it replaces the existing site.
- Recommendation: `app.gajian.my.id` (CNAME). The runbook covers both, plus Cloudflare and typical registrars.

### D-115 · CI builds and boots the hosted image on GitHub's runner (Phase 20b, 10 Nov 2026)

- The Dockerfile had never been built: Docker is forbidden on the build server, so Railway's first build would have been its first real build.
- New CI job **Hosted image** (`.github/workflows/ci.yml`): `docker build` of the root Dockerfile on GitHub's runner, then boots it with `HOSTED_DEMO=true`, a volume at `/data` and a throwaway random worker key (never added to any account, masked in the log). It checks health (`db ok`, `hostedDemo true`), the banner on the landing page, the first-boot reset, a clean SIGTERM stop (exit 0), a migrations-only second boot, and that the service stops non-zero when the worker dies. Nothing is pushed to a registry or deployed.
- The app job now also runs `npm run test:judge-mode` and `npm run test:hosted`.
- The runbook asks for a green Actions run (including **Hosted image**) before every `git push origin main:release`. This keeps the rule "never run Docker on this server"; GitHub's runner is not this server.

## Phase 21 · SentFund rebrand and KTP + face identity checks (10 Nov 2026)

### D-116 · Rebrand GAJIAN → SentFund (`sentfund.my.id`), on-chain names unchanged
- Andre (10 Nov): "domain change to sentfund.my.id, change all the branding … from gajian to sentfund". Done across UI, logo (`public/brand/sentfund-logo.png`, new mark in the same navy/sky palette), templates (`public/templates/sentfund-payroll-*`, byte-identical content, same SHA-256), docs, scripts, image, CI and demo sign-ins (`maker@sentfund.my.id` …; migration 0009 renames existing users' emails).
- **Kept on purpose:** every on-chain identifier (`gajian-payroll.testnet` and its sub-accounts, `vault2.gajian-payroll.testnet`, `tusdc.gajian-payroll.testnet`): accounts cannot be renamed and vault2 cannot be redeployed (D-051). Also kept: the payout reference prefix `GJN-` (part of committed history and evidence), the old repository name and paths on this server (`/home/neargajian/near-gajian`), and historic text in DECISIONS/BUILD-STATE.

### D-117 · Identity check: privacy decisions (asked and answered 10 Nov 2026)
Asked before building because KTP numbers and face images are specific personal data under UU PDP. Andre chose all three recommended options:
1. **Public demo: synthetic specimens only.** Upload and review routes answer 403 in hosted mode; specimen checks are dry runs (logged, status unchanged). Real checks only on a private copy.
2. **Retention: results only.** Images are processed in memory and discarded. Kept: every check (append-only), masked NIK, HMAC of the NIK keyed with `SESSION_SECRET` for duplicate detection, face score, who and when.
3. **Payout gate: setting, default on.** "Pay identity-verified recipients only", re-checked at submit like the directory rule and frozen into the version; the three live recipients are seeded as verified (labelled "Demo seed", no fake check results).

### D-118 · Identity pipeline: local face models + Claude vision for the card text only
- **Faces stay on the server:** OpenCV Zoo YuNet 2023mar (detector, MIT) and SFace 2021dec (recognizer, Apache-2.0) on ONNX Runtime (`onnxruntime-node` 1.31.1, CPU) with `sharp` 0.35.5 for decoding. 5-point alignment to 112×112, cosine similarity; ≥ 0.363 (OpenCV's SFace threshold) = same person, 0.28–0.363 = Needs review, below = Failed. Models are git-ignored, downloaded by `npm run vision:models` against pinned SHA-256 (the Git LFS IDs in opencv_zoo); `npm run vision:selftest` proves they load and separate the specimens.
- **The card text:** Claude (`ASSISTANT_MODEL`, default `claude-opus-5-5`) through one strict tool `record_ktp`; every detected face is **covered with a solid block** first (a blur was not enough: the detector still found the face). The model's fields are re-validated; the NIK, date and sex logic runs offline in `nik.ts`.
- Rejected: sending both images to a vision model to "compare faces" (sends biometric data to a third party and an LLM is not a calibrated face matcher); cloud face APIs (same problem, plus accounts); Dukcapil (needs an official partnership). Not liveness detection; said in the UI and docs.

### D-119 · Synthetic specimens
- Four scenarios in `public/specimens/` built by `scripts/make-identity-specimens.ts`: KTP-style cards marked SPECIMEN with the non-existent kecamatan code 99 (`3174 99 …`), faces from public-domain AI-generated images on Wikimedia Commons (sources in `manifest.json`), plus an impostor face. Each card's photo and the face photo come from the same generated image, so same-person scores (0.91–0.96) are higher than real photos would give; documented in README and the page.
- The test-only stub KTP reader (`IDENTITY_STUB=browser-tests`, database under `.tmp/` only) knows the specimen cards by SHA-256 and is labelled "Test stub reader" in the UI.

### D-120 · Build fix: Turbopack crawled the whole project (OOM on this host)
- Symptom: `next build` reached 4.3 GB RSS in 6 s and was OOM-killed (this killed the previous session). Bisected with clean copies: the code built fine anywhere without `contracts/target` (4.2 GB of Rust output).
- Cause: file reads with an unknown directory and a fixed file name (`existsSync(join(dir, DETECTOR_FILE))`, `readFileSync(join(SPECIMEN_DIR, 'manifest.json'))`) make Turbopack trace a project-wide glob. Fix: `/* turbopackIgnore: true */` on each such path (as `landing.ts` already did), `onnxruntime-node` and `sharp` in `serverExternalPackages`, and onnxruntime's CUDA/TensorRT providers excluded from tracing (and deleted in the image: CPU only). Build peak back to normal (lowest MemAvailable 3.6–4.0 GB during the build).
- Also: the landing page imported `seed.ts` for the demo passwords, which now pulled in the identity engine; the demo users moved to `src/server/db/demo-users.ts`.
- Builds on this host now run under a watchdog that kills the build if MemAvailable drops below 1.2 GB (`.tmp/guarded-build.sh`; recreate from BUILD-STATE Phase 21 if `.tmp` was cleaned).

### D-121 · Hosting: Railway + Cloudflare DNS; repository `discoverateagency-ops/sentfund`
- Andre (10 Nov): push to the private `discoverateagency-ops/sentfund`; the domain `sentfund.my.id` is bought at Sumopod; "determine for us" between Supabase, Cloudflare and Vercel; make deployment automatic on the agent's side.
- Decision: **Railway Hobby** runs the app (unchanged from D-109/D-110: always-on web + worker, volume for SQLite, native modules, CI-tested image). **Cloudflare Free** hosts the DNS (nameservers set at Sumopod; CNAME flattening at the apex). Vercel and Cloudflare Pages/Workers are serverless (no persistent disk, no background worker, no native onnxruntime at this size); Supabase is a database, not app hosting, and would mean rewriting the data layer before the deadline.
- Andre creates the accounts and puts `RAILWAY_API_TOKEN`, `CLOUDFLARE_API_TOKEN` and `HOSTED_ANTHROPIC_API_KEY` in `.env` himself; the agent does the rest by API (`docs/HOSTING.md` section 0). Continuous deployment: Railway builds `release` with "Wait for CI".
- Remote `sentfund` = `https://github.com/discoverateagency-ops/sentfund.git` (private, verified by API on 10 Nov). The first push used Andre's fine-grained token once, from an environment variable, never stored in git config, files or logs. Registering a deploy key for later pushes was **refused by the permission system** (a persistent access grant not explicitly asked for): Andre either adds a deploy key himself or gives a token for each push session.

### D-122 · e2e fixture and judge test with the identity gate
- The e2e fixture builds history dated before the gate (5 Nov), including a paid 1,000-row run of sample employees who are never identity-verified: it turns the gate off while building that history and back on (the demo default) afterwards.
- `tests/judge/read-only.spec.ts` now checks both refusals: the 1,000-row sample by the identity rule ("Nothing was sent"), then the three verified live recipients by the missing signer keys ("Nothing was recorded").

## Phase 22 · Testnet migration to `sentfund-payroll.testnet` and the live hosted demo (10 Nov 2026)

### D-123 · The live deployment moves to `sentfund-payroll.testnet`; the gajian set becomes "earlier deployment"
- Andre (10 Nov): "the vault testnet is still using gajian, can we migrate to sentfund as well?", then "you can migrate … continue with sentfund-payroll.testnet to make sure all align, run all safe without mistake". The agent first explained the cost (NEAR accounts cannot be renamed, vault2 is locked by design, evidence continuity) and recommended waiting; Andre chose to migrate now.
- How: a new faucet-funded master and the same sub-accounts (`phase22-setup.sh`); the vault is the **same audited release Wasm** (`38953891…`, `code_hash 4osoZq17…`) at `vault.sentfund-payroll.testnet`, its only key deleted in the same session (`judge:deployment` passes); the Phase 04 policy scenarios re-run on it as its own history (`phase22-live.ts`, 25 steps incl. 8 refusals); the seed history re-exported from those transactions; host keys moved (old ones deleted on-chain); Railway variables switched with a new `DEMO_RESET_TOKEN`; the local DB reset (old one in `data/backups/`).
- Kept: every gajian run in `docs/evidence/testnet-runs.json` (labelled "[earlier deployment]") and both gajian vaults' lock checks (`earlierVaults`), so `judge:verify` still re-checks Phases 02–19b (221 checks in total after Phase 22). Historical scripts (`phase02/04/16`, `backfill-block-times`) are pinned to the `GAJIAN_*` constants in `signer-keys.mjs`; `phase16.ts migrate` refuses to run.
- Not moved: vault2 keeps 1.94 tUSDC of the **earlier token** (zero value). It can only leave through an approved run of vault2; doing that would only shuffle a test token between our own accounts, so it stays (documented in TESTNET and QA-HANDOFF).
- Kept on purpose inside the frozen vault code: the commitment hash tags `GAJIAN:payout-leaf:v1` / `GAJIAN:payout-node:v1`, the event standard `gajian_vault` and the payout memo `gajian:<run>:<row>`. They are protocol identifiers: changing them would be a new contract version (breaking the release-build proof and the app's commitments) for a cosmetic gain.

### D-124 · Exception to the contract freeze: the tUSDC display name only
- The token's `ft_metadata.name` said "GAJIAN test USDC". It is shown by explorers and wallets on every transfer. Changed to "SentFund test USDC (zero value, testnet only)" in `contracts/tusdc/src/lib.rs` (plus its doc comment and Cargo description); no logic changed. Rebuilt with `scripts/build-contracts.sh` (reproducible: `889ee816…` twice), `cargo test -p gajian-tusdc` 3/3, clippy and fmt clean, then the full `contracts:test` (3 + 49 + 1 sandbox) and `contracts:lint` pass.
- Deployed onto `tusdc.sentfund-payroll.testnet` before any balance existed (no init call; the name is returned by code, not stored). The earlier `tusdc.gajian-payroll.testnet` keeps the old name. The vault was **not** changed (D-051 stands for it).

### D-125 · New references use the SentFund prefix
- New vault run IDs are `sfd-<run>-v<n>` (was `gjn-`), new accounting references `SFD-XXXXXXXX[-NNNN]` (was `GJN-`); same length and alphabet, so the contract's run-ID rule and the report formats are unchanged. References already stored in `report_entries` keep `GJN-` (the paid runs before this change, including the Phase 22 assistant and hosted smoke runs), so exports never change after the fact. The internal hash salt (`gajian-report:`) is unchanged to keep references deterministic.
- The synthetic sample employees keep their `gjn-emp-NNNN.testnet` accounts (they do not exist on-chain; the sample files and their checksums stay byte-identical).

### D-126 · Hosted demo live: Railway + Cloudflare, operated by API
- Railway project `sunny-simplicity` (created by Andre's dashboard click; the agent finished it by API: the staged service was re-staged on branch `release` and committed with deploys skipped), service `sentfund`: Dockerfile build, health `/api/health` (300 s), 1 replica, restart on failure, never sleeps, **Wait for CI** on the `release` trigger, volume `/data` (500 MB). Volume backups and backup schedules need Railway **Pro**: not available on Hobby; the hosted DB is demo data a reset rebuilds.
- Cloudflare: zone `sentfund.my.id` (Free, nameservers set at Sumopod), apex CNAME to Railway's target (flattened) + `_railway-verify` TXT. Railway verified the domain within two minutes, but its own certificate stayed "validating" while DNS-only; with Andre's SSL/TLS mode **Full**, the record was switched to **proxied**: Cloudflare serves HTTPS at its edge and reaches Railway over TLS (Railway's documented setup for proxied domains). HTTPS answered within a minute.
- Credentials: Railway workspace token, Cloudflare zone-DNS token and the GitHub token were pasted in chat by Andre; they are stored only in the git-ignored `.env` (Railway, Cloudflare) or not at all (GitHub), used from environment variables or stdin, never printed. Pushes to the new repository use a deploy key Andre added himself (`~/.ssh/sentfund_deploy`). All three tokens should be rolled after the event (NEXT-STEPS).
- The hosted demo has no `ANTHROPIC_API_KEY` yet (Andre's separate key with a spend limit): the payroll assistant and the KTP reader are off there and say so.

### D-127 · Phase 22b review fixes: live landing facts, tokens kept until shutdown, no www redirect yet
- **Landing facts are live and per vault.** `testnetFacts(db, vault)` (`src/server/landing.ts`) reads this copy's database on every request, for the configured vault only: the imported chain history (`testnet_runs`) plus every app run this copy has paid (`run_versions` + succeeded `pay_row` actions). The hard-coded "First contract-controlled payout `7Dwmqek…`" (a transaction of the earlier gajian deployment, shown next to the SentFund vault) is gone; the page shows the **first payout by this vault** (`UEJ1PEDz…` on `vault.sentfund-payroll.testnet`) and "N payouts in M runs, 0 paid twice, as of <latest payout, UTC>, the latest payout recorded by this copy". Counts are per copy on purpose: the hosted copy and a local copy each count the history plus their own runs (a judge's copy shows the history only). Singular/plural fixed ("1 repeat refused", "1 paid testnet run").
- **Tokens:** Andre keeps the GitHub, Cloudflare and Railway tokens pasted in chat until the shutdown after 25 Nov; rotating them is step 9 of the shutdown checklist (`docs/HOSTING.md` step 12, NEXT-STEPS). Nothing was rotated.
- **`www.sentfund.my.id` redirect not set up:** the Cloudflare token is "Edit zone DNS" only (Redirect Rules and Page Rules refuse it), and a `www` DNS record without a redirect rule would only reach a Railway 404. Two dashboard steps for Andre are in `docs/HOSTING.md` section 5.
- **Tunnel command** for the local review server is `ssh -N -L 8092:127.0.0.1:8092 neargajian@andre` (the earlier `neardao@…` user does not exist).

### D-128 · Hosted Claude API key set (Phase 23, part 1)
- Andre put `HOSTED_ANTHROPIC_API_KEY` in `.env` (separate workspace key with a spend limit) and gave his yes. The agent checked the name only, set it on Railway as `ANTHROPIC_API_KEY` with `variableUpsert` (skip deploys; the value read from `.env` inside a script and never printed), then redeployed the current release `a29c514` with the same image (`deploymentRedeploy`, deployment `4aab2264…` SUCCESS). No code change, no release of new code.
- Checked online without any NEAR transaction (new test in `tests/live/hosted-smoke.spec.ts`): the assistant preview for "Create a disbursement for the Sales division, 0.03 tUSDC each, called November commissions" (Sales, 2 recipients, total 0.06; "Create draft" never pressed) and a specimen identity check as a dry run (Emma Verified, 0.932).

### D-129 · Payroll Advance: a salary advance repaid like a loan, with no contract change
- Andre's brief (Phase 23). Brand "Payroll Advance" everywhere; the disclosure says it is repaid like a loan. Every advance is an ordinary **one-row run** for A − fee through the normal `create_run` and the vault's approvals; repayment is through payroll rows whose **net** amount is committed on-chain. The vault stays locked (D-051).
- Policy (admin, defaults): on; maximum 300% of the monthly net pay, also capped by the recipient's maximum per payout and the per-row cap; fee 2% of A (rounded half up to 6 decimals) taken at payout and kept in the vault as income; 6 equal instalments (A ÷ 6 rounded down, the last absorbs the rounding); 90 days since the start date. Fixed rules (not settings): one advance at a time; active, identity-verified, "Ready to receive tUSDC"; at most 50% of a row's gross per deduction and never to zero. Each request stores the policy it was made under. Policy changes are audited (who, when, from → to) and refused in the public demo.
- Data: `users.role = 'employee'` with `users.recipient_id` (CHECK: employees only, unique); `recipients.monthly_net_pay`, `recipients.start_date`; `payroll_runs.kind` (`payroll` | `advance`) + `advance_id` (fixed, trigger); `payroll_advances` (terms and consent fixed by trigger, never deleted, partial unique index: one open advance per recipient); `advance_deductions` (gross / instalment / net per version row, frozen with the version, insert only while the version is being frozen); `advance_ledger` (append-only). Migration `0010` is hand-written: the migrator runs all pending migrations in ONE transaction, where `PRAGMA foreign_keys=OFF` is a no-op, so `users` is copied aside, dropped, recreated and re-inserted with **deferred** foreign keys (re-inserting the parent rows settles the deferred counter; a rename of a pre-filled table did not), sessions are copied and restored (the drop cascades to them), and `payroll_runs` only gains columns (a rebuild would cascade to draft rows and lose its triggers). Tested on a copy of the real local database first.
- Server checks at the request, at the maker's submit and at the approval (an approval of an advance that no longer qualifies is refused before signing). Statuses and the ledger are derived from the confirmed payout records by `syncAdvances` (idempotent; after every reconciliation and on the advance pages).

### D-130 · Which payroll deducts the instalment
- The brief: "The first payroll of each calendar month (UTC) that includes the employee deducts the instalment due … The repayment schedule starts with the first payroll after the advance is paid", and the live proof expects the November payroll to deduct after Emma's advance although an earlier November run (the assistant's commissions) had already paid her. Read together: a month's deduction is taken by the first payroll that includes the employee **after the advance is paid**; earlier runs that month had nothing to deduct. Implemented as: a month "has deducted" when a live or paid version carries an instalment for that advance in that month (cancelled, rejected or failed versions, and rows not paid, release theirs); instalment 1 is due in the month of the first payroll that carries one; missed months are caught up (capped by the 50% rule); nothing more in a month that already deducted.
- The offer's "expected months" are a forecast: from this month, or from next month when a payroll for the employee was already submitted this month. Emma's offer forecast December; the real schedule started in November because another November payroll followed the payout. Both screens say the first deduction is "the first payroll after the advance is paid".
- The maker can untick "Apply Payroll Advance instalments" for one run (the instalment then stays due); the server requires the choice explicitly when a run carries any, and refuses the submit when the instalments changed since the review (fingerprint) or while it is being frozen (re-planned inside the version's transaction).

### D-131 · Company-level outputs never name the employee of an advance
- The run title "Payroll Advance: <name>, <month year>" is shown to the maker and the run's approvers (who see recipient details anyway). The admin's company view and the company CSV show "Payroll Advance, <month year>" instead. The CSVs gain `run_kind`, `gross_amount`, `advance_instalment`, `advance_amount`, `advance_fee` before `amount` (the net paid on-chain); history reconciles net = paid on-chain and the ledger (advances, instalments) against the paid lines.

### D-132 · Stand-in vault mode for whole-flow browser tests (test-only, labelled)
- The e2e server loads the real signer keys from `.env`, so a browser test that clicks Submit would send real testnet transactions. For the Payroll Advance whole flow in the browser, `VAULT_STANDIN=browser-tests` makes the server use the same contract-faithful stand-in vault as the integration tests (moved to `src/server/chain/standin-vault.ts`; `tests/helpers/fake-vault.ts` re-exports it) and runs the worker tick inside the server (`src/instrumentation.ts`). Refused in the hosted demo and outside a database under `.tmp/`; `scripts/e2e-server-standin.sh` blanks every signer key; every page shows "Test mode. Stand-in vault (browser tests only)". `npm run test:e2e` runs the normal suite, then `playwright.standin.config.ts`.

### D-133 · Seed of the Payroll Advance demo; hosted start applies it
- `seedPayrollAdvance` (idempotent): the three live recipients get monthly net pay 0.10, start dates 2025-09-01 / 2026-01-12 / 2026-03-02 and maximum per payout 0.30 (logged as directory changes, source "seed", only while the net pay is empty, so an admin's edits are never overwritten), and the employee sign-ins `emma@`, `daniel@`, `grace@sentfund.my.id` (demo password). It runs in `db:seed` / `demo:reset` and, in the hosted demo, at every start after the migrations (`scripts/hosted-prepare.ts`), so the next release needs no demo reset.
- Raising the live recipients' maximum to 0.30 also allows payroll rows up to 0.30 to them online (the per-row cap stays 1.00); the vault still holds at most 2 tUSDC, and one advance per employee at most 0.30 bounds the advance exposure to 0.882 net.

### D-134 · Phase 23 screenshots: what is live and what is a read-only recapture
- 01–04 were taken during the live advance run. Two layout defects seen in them were then fixed (an empty line between each eligibility label and its detail; month tiles wrapping). 05 and 06 were first captured before smooth scrolling finished; 06 was recaptured read-only. The pre-submit review of the payroll run cannot be recaptured honestly (that run is paid and Emma's November instalment is taken), so 05 shows the paid payroll run's own instalment section (gross 0.10, instalment −0.05, net 0.05). `01b` is Daniel's offer with the consent ticked and nothing sent, in the final layout.

### D-135 · Phase 23b: the employee may withdraw a request only while it is "Requested"
- Andre's rule: while a request is still "Requested" the employee can withdraw it ("Withdraw request", with a confirmation dialog); it then shows as **Withdrawn** (new status), leaves the maker's queue (it is listed under "Handled requests") and a new request is possible at once (Withdrawn is not an open status, so the partial unique index allows the next one). Once the maker has submitted it, withdrawing is refused with "The payroll maker has already submitted this request, so it can no longer be withdrawn." The employee page says so instead of showing the button.
- Enforced on the server (`withdrawAdvance`, `POST /api/employee/advances/[advanceId]/withdraw`, employee only): the advance is looked up by ID **and** must belong to the signed-in employee's own linked recipient; another employee's request answers exactly like a missing one (404). A request that the maker already sent to the vault once (it went back to "Requested" after a failed submission) cannot be withdrawn either; the maker declines it.
- Withdraw and the maker's submit race safely: both run their status check and update in an **immediate** transaction guarded by `status = 'requested'`, so whichever commits first wins and the other gets 409; a withdrawal while the submission is still on its way to NEAR is refused because the request is already "Submitted" before anything is sent. Tested in both orders and with the vault call held open.
- Migration `0011_phase23b_withdraw.sql` (hand-written) rebuilds `payroll_advances` to add `'withdrawn'` to its status CHECK, with the same deferred-foreign-key pattern as the `users` rebuild in 0010 (copy aside, drop, recreate, re-insert; indexes and the three triggers recreated). Tested on a copy of the local DB (1 advance, 2 ledger rows, 18 sessions kept, `foreign_key_check` clean, the no-delete trigger still refuses). No contract change.

### D-136 · Phase 23b: estimated months and the amount shortcuts
- The deduction month tiles are labelled **"Estimated"** wherever they appear (employee offer, maker queue, approver's run note), with one line: "Estimated: the first instalment is taken from the first payroll after the advance is paid, which may still be this month." (D-130: Emma's forecast said December; her schedule started in November.) One shared component (`MonthsList`) renders all three.
- Shortcut buttons **25%**, **50%** and **Max** next to the amount field fill in that share of the employee's maximum, **rounded down to 0.01 tUSDC** (`shareOfMax`, pure, unit-tested; "Max" is rounded down too, so a maximum of 0.305555 gives 0.30). A shortcut whose value would be below the 0.01 minimum is disabled. They only fill the field: nothing is sent until the employee ticks the consent and presses Request; the server re-checks the amount as before. With the seeded maximum 0.30: 0.07, 0.15 and 0.30.

### D-137 · Phase 23b: detailed history breakdown on two lines
- The whole-flow browser test failed once at 1280x720: the detailed history table was 5 px wider than its container (939 > 934). Phase 23b did not change that page: the gross/instalment breakdown under the recipient name was kept on one line, and the paid-time digits late in the day are a few pixels wider. The breakdown is now two short lines ("gross 0.10" / "− instalment 0.05"; "advance 0.30" / "− fee 0.006"), each kept whole, so the column no longer depends on it. The layout check (`tests/e2e/layout.ts`) now checks each breakdown line on its own instead of the breakdown block; every other one-line rule is unchanged.

### D-138 · `judge:verify` reads aged transactions from a testnet archival node
- On 10 Nov 23:18 UTC `npm run judge:verify` stopped at the Phase 13 run with an RPC timeout ("NOT_OBSERVED") after 35 PASS and 0 FAIL: the regular FastNEAR node no longer keeps the 9 Nov transactions (non-archival nodes keep only a few epochs). Every evidence run will age out the same way before the judges look.
- Fix (read-only, `scripts/judge/verify-testnet.mjs`): views stay on `NEAR_RPC_URL` (default FastNEAR); a transaction, block or chunk lookup that the regular node answers with UNKNOWN_TRANSACTION, NOT_OBSERVED, UNKNOWN_BLOCK or GARBAGE_COLLECTED is repeated on `NEAR_ARCHIVAL_RPC_URL` (default `https://archival-rpc.testnet.fastnear.com`, testnet-only guard). Rate-limit answers (429) back off for longer (up to 8 attempts). The summary says how many lookups came from the archival node. Result: **241 PASS, 0 FAIL**, 19 lookups from the archival node. The deprecated `archival-rpc.testnet.near.org` refuses with 429 and is not used.

### D-139 · Phase 24: an encrypted face template per verified employee
- Andre's brief (Phase 24): the right person must ask for a Payroll Advance. When an identity check is **Verified** with a face photo, SentFund now keeps one **face template** for that recipient (`face_templates`): the SFace feature vector (128 numbers, the same vector the identity check compares) of the verified face photo; never the photo. Encrypted at rest with **AES-256-GCM** under `FACE_TEMPLATE_KEY` (32 random bytes, base64): a fresh 12-byte IV per template, the recipient ID as associated data (a template moved to another recipient's row does not decrypt), and a non-secret key fingerprint (HMAC of a constant) to tell "the key changed" from "no template". Stored as `v1.<iv>.<tag>.<ciphertext>` (base64url).
- Lifecycle, all inside the transaction that records the change: Verified → stored (`created` or `replaced`); **Needs review → stored as `pending`** (not usable; the admin's manual approval activates it, a failure deletes it): the photo is gone after the check, so this is the only way a manually approved employee gets a template, and the pending template is as protected as an active one. Failed, or the admin withdraws a verification (the "reset") → deleted. **Deactivating** the recipient → deleted; reactivating does not bring it back (a new identity check does). A specimen dry run in the public demo changes nothing. Every creation, replacement, activation and deletion is logged in `face_template_events` (append-only, trigger; IDs, action, reason, actor; no biometric data) and in `audit_events`.
- The demo employees (Emma, Daniel, Grace) get templates from their committed **synthetic** specimen face photos in `seedPayrollAdvance` (db:seed, demo:reset, every hosted start), only when they are verified and have no usable template; without the key or the face models it does nothing and says why.
- Keys: generated by the agent with `scripts/face-template-key.mjs` (writes `FACE_TEMPLATE_KEY` and, with `--hosted`, a separate `HOSTED_FACE_TEMPLATE_KEY` into `.env`, never printed, keeps every other line; checked: the 60 earlier lines are byte-identical). The hosted key is set on Railway as `FACE_TEMPLATE_KEY` by API (value read inside a script, never printed). Without a key no template is stored and employees are told the face check is not set up.

### D-140 · Phase 24: the live camera check (challenge, frames, checks)
- "Verify it's you" (after the form and the consent) opens the front camera (`getUserMedia`, `facingMode: user`) with a notice: what is checked, that images are processed in memory and never stored, that the result goes to the maker and the approvers. The server issues a one-time **challenge**: a random order (`crypto.randomInt`: left-then-right or right-then-left) and a 192-bit nonce, **valid 60 s, used once** (only its SHA-256 is stored; any try with a wrong nonce, by another user, expired or reused, uses it up and is logged as `challenge_invalid`; a trigger forbids un-using it). The page shows "Look straight at the camera" (2 frames), "Turn your head slowly to the <first>" (6 frames), "Now slowly to the <second>" (6 frames): 14 JPEGs, 480 px wide, quality 0.8, raw (only the preview is mirrored); then the camera stops.
- Server, in memory only (`runFaceCheck`): 4–16 frames, JPEG only, ≤ 200 KB each, ≤ 1280 px. Checks in this order: **exactly one face** in every frame (detector score ≥ 0.7, the largest face at least 60 px wide), else "No face found" / "More than one face"; **the head turns in the requested order**: yaw = the nose tip's offset from the eye midpoint, measured along the eye line (a tilted head does not count) and divided by the eye distance; a turn is |yaw| ≥ 0.12 (about 12–15°); the first clear turn must be the first requested direction and a later frame must turn the other way (a still photo, or the wrong order: "Please turn your head as asked: slowly to the left, then to the right."); **the same face throughout** (consecutive frames' SFace cosine ≥ 0.363: a face swapped mid-check is refused); then the **most frontal frame vs the template ≥ 0.363** (OpenCV's SFace threshold), else "This doesn't look like <name>." Frame buffers and decoded pixels are zeroed after use; nothing is written anywhere. Positive yaw = the person's own left in the raw frame.
- **At most 5 attempts per employee per hour** (and 20 challenges, against churn); every attempt is logged in `face_check_attempts` (append-only, trigger): outcome, similarity, order, liveness yes/no, frame count, engine; plus an audit event. Rate-limited calls are refused before anything is recorded.
- Engine cost: 14 frames × (YuNet + SFace) on the CPU, about 1–2 s; the existing engine singleton (2 intra-op threads) is reused.

### D-141 · Phase 24: the request carries the result; the maker and the approvers gate on it
- A passed attempt can be used **once** (unique `payroll_advances.face_attempt_id`) and only **within 5 minutes**, by the same employee for their own recipient; it is claimed inside the request's transaction, after the form and eligibility checks (so a form error does not use it up). The request stores `face_check` (JSON: `passed` | `demo_override`, similarity, threshold, order, time, attempt); both new columns are added to the "terms fixed" trigger.
- The maker sees it on the request ("Face verified at request: 0.97 similarity, 11 Nov 2026, 09:12 UTC"), the maker and the approvers on the Payroll Advance run. **The maker's submit refuses** a request without an acceptable check, and so does **the approval** (`advanceApprovalProblem`), so a request stored before Phase 24 (none online; Emma's local advance is already paid) can only be declined or rejected. "No template on file" (never verified, deactivated, reset, or the key changed) refuses the challenge with "Ask your admin to verify your identity first."

### D-142 · Phase 24: the public demo override (HOSTED_DEMO=true only)
- Visitors are not the synthetic employees, so online the check runs for real and shows the true result. After a **mismatch whose head-turn check passed** (a real moving face), the page offers "Continue as a demo"; the request is then stored with `demo_override` and shown to the maker and the approvers in a warning style: "Face check: demo override (the camera face did not match; public demo only)". A failed head turn, no face or more than one face never allows it, and the override must be asked for explicitly. With `HOSTED_DEMO` off the server refuses any override, and the maker's submit and the approval refuse a demo-override request. Tested both ways.

### D-143 · Phase 24: camera only where it is needed; a labelled stand-in camera for the browser tests
- `Permissions-Policy` was `camera=(self)` on every page (since Phase 21, for the admin's face photo). Now `camera=()` everywhere (next.config default, API included) and `camera=(self)` only on `/employee` and, **off the public demo**, `/admin/identity` (the admin's "Use the camera instead" for the face photo, an existing feature; in the public demo uploads are refused, so the camera stays blocked there). Set per page by `src/proxy.ts` (`src/permissions-policy.ts`), which overrides the config default (checked by the browser tests: exact header per page). The public site is HTTPS-only (HTTP → 301 at Cloudflare).
- The browser tests run on a server without a camera. `FACE_CAMERA_STANDIN=browser-tests` replaces **only the camera**: the page sends synthetic head-turn frames made from the specimen photos (`public/specimens/turn/`, `scripts/make-face-turn-frames.ts`: the image is squeezed on one side of the nose and stretched on the other, which moves YuNet's nose landmark like a real turn; every frame is verified with the engine when generated, yaw ±0.17–0.35) and the server check is the real one. The page labels it "Stand-in camera (browser tests only)"; the app refuses to start with it unless `APP_BASE_URL` is `http://127.0.0.1` / `localhost`. The regular browser suite has no stand-in: there the permission is refused (help text) and Chromium's fake camera device runs the real path to "No face found".

### D-144 · Phase 24: what the head turn proves, said plainly
- It stops a held-up photo (a flat picture turned in front of the camera keeps its nose-to-eyes ratio, so it never "turns") and a replayed video of the wrong order. It is **not certified liveness (presentation attack) detection**: a replayed video with the right order (1 in 2 with two orders), a deepfake video stream or a 3D mask could pass. Said in the UI notice's context, README, SECURITY and the identity page's "How the check works".

### D-145 · Phase 25: "Fill" buttons in the sign-in dialog (demo mode only); feature freeze
- Andre's brief: the last feature before the freeze. The sign-in dialog's **Demo accounts** box (rendered only when `DEMO_MODE=true`; the landing page passes `demo: null` otherwise, so nothing reaches the HTML) now lists one row per demo account in a fixed order (maker, app1, app2, admin, Emma, Daniel, Grace) with the email, "role · name" (`demoAccounts()` in `src/server/db/demo-users.ts`, from the same seed data) and a **Fill** button (`aria-label="Fill <email>"`).
- **Fill only fills**: it sets the Email field and the demo password, clears any earlier error, and moves the focus to **Sign in** (Enter then signs in). It never sends a request, so the sign-in rate limit/lockout, the CSRF and origin checks and the CSP are untouched (no inline styles, no new script). The selected row is derived from the fields (email matches a row and the password is the demo password), shown with `aria-current="true"`, `aria-pressed` on its button and a highlighted border; editing a field drops the mark.
- Layout: in demo mode the dialog is 820 px wide with the form beside the accounts (from 780 px viewport width), so it fits 1280x720 without inner scrolling; narrower windows stack the box under the form and the dialog scrolls inside. The landing page behind it already scrolled sideways at 390 px (hero upload card; not touched in the freeze, QA-HANDOFF known issue 17).
- Tests: `tests/e2e/signin-fill.spec.ts` (Fill app1 fills both fields and stays signed out, Fill app2 replaces them, Enter lands on approver 2; error cleared; keyboard and focus outline; 1280x720, 1440x900, 390x844); `tests/e2e-nodemo/signin.spec.ts` with a server started with `DEMO_MODE=false` (`scripts/e2e-server-nodemo.sh`, part of `npm run test:e2e`): no box, no Fill button, no demo email in the page. After this phase only fixes, docs and the video/submission work.

## Phase 26 · Milestone 1, step 0 and QA Part A (12 Nov 2026)

### D-146 · The milestone kit becomes the roadmap; its code stays out; Steps 2–5 wait for judging
- Andre's brief: before the submission only Step 0 (gap analysis) and Step 1 (QA Part A) of the kit "Safe to pilot". The kit's planning documents are copied to `docs/roadmap/` (unchanged except relative links, each with a note that the kit was written without seeing SentFund); the gap analysis corrects its claims (our vault already commits and proves rows). The kit's reference code (`vault-guard`, services, Postgres migration) is **not** added to the repository. Nothing for Confidential Intents.
- After judging: Steps 2–5 on the branch `milestone-1`, against a new vault account (for example `vault-v2.sentfund-payroll.testnet`); `main`, `release` and the live demo stay unchanged until then. No new vault, no change to the live vault or its data in this phase.

### D-147 · `judge:verify` is quick by default; `-- --full` checks every transaction
- Quick (default): both locked vaults' code hash and keys, every run's state from the vault's own views (status, total, each row's receiver and amount; views of current state never age out), and every transaction of the latest 2 runs (the last entries of `docs/evidence/testnet-runs.json`). It prints how many older lookups it skipped. 4 min 41 s, 77 PASS on 12 Nov 2026 (full: 56 min 30 s, 241 PASS). Full (`npm run judge:verify -- --full`): everything as before (older transactions from the archival node, D-138), slow because that node rate-limits. Both times are in the README.

### D-148 · QA Part A fixes (BUG-26-01..04, 08) and what stays open
- **HSTS** (`max-age=31536000; includeSubDomains`, no preload) on every response from `next.config.ts`, always sent: browsers ignore it over plain HTTP, so the local `http://127.0.0.1` copy is unaffected.
- **Sign-in limit under a burst:** the limit check and a provisional failed attempt are written in one immediate transaction before the argon2 check; a success updates the row. Concurrent requests now see each other.
- **`.near` refused** in every row validation (upload, builder, directory): SentFund pays on testnet only.
- **No proxy rewriting of pages** (BUG-26-11): `src/proxy.ts` adds `no-transform` to the pages' `Cache-Control`, so Cloudflare's Email Address Obfuscation leaves the demo emails alone (it injected a decoder script our CSP blocks, and React reported hydration error #418). Alternative for Andre: switch the feature off in Cloudflare (Scrape Shield); our token cannot.
- **Maker release route** maps domain errors (409 with the message) like every other route.
- **Landing on phones (320–640 px):** no sideways scroll; under 480 px the header keeps only **Try the demo** (it opens the same dialog as **Sign in**).
- Left open, with reasons in `docs/roadmap/qa-part-a-results.md`: retries after 3 failed transfers need the operator (BUG-26-05, M1 F1.4); the per-client limit trusts the first `X-Forwarded-For` entry (BUG-26-06: a fix needs a trusted-proxy setting on Railway, Andre's decision); a malformed percent-encoding gives 500/502 (BUG-26-07, Low); the face-attempt count races up to the 20-challenge bound (BUG-26-09, Low); nonexistent accounts are found at payout off the public demo (BUG-26-10).

### D-149 · Key inventory from the chain
- `scripts/testnet/key-inventory.mjs` (read-only) lists every key on the 22 accounts of both deployments and where its private half is kept, by checking only that a key file of that public key exists (it never opens a key file and never reads `.env`). Result in `docs/KEY-INVENTORY.md`: the app and Railway hold only function-call keys (QA-A7-06 passes as worded), but together the role keys can create, approve and pay a new run up to the vault balance; that is the Milestone 1 F2 gap, not something to change during judging.

### D-150 · Andre's Phase 26 review: four answers, freeze until the submission
- Andre approved Phase 26 on 12 Nov 2026 after checking it himself: HSTS and `no-transform` on the live site, no sideways scroll at 375 px and no console errors, the vault's code hash unchanged with 0 keys and 2.000000 tUSDC, no private key in `docs/KEY-INVENTORY.md`.
- **BUG-26-06** (per-client sign-in limit trusts `X-Forwarded-For`): left as it is for the hackathon; **no Railway change before judging**. Fixed in Milestone 1: the client address comes only from the proxy's own client-address header (for example Cloudflare's `cf-connecting-ip`), never from a header the client can set.
- **QA-A5-05** (the camera is the only way to request a Payroll Advance): kept for the hackathon (D-140). Milestone 1 adds an alternative: an admin verifies the employee in person and records it, with an audit entry.
- **BUG-26-05, 07, 09 and 10** are left for Milestone 1. The **feature freeze** stays: no code change and no new release before the submission; the live release stays `f25e00b`.
- **Cloudflare Email Address Obfuscation** stays on: the pages' `no-transform` header (BUG-26-11, D-148) already stops it.
