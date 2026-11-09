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
| D-007 | Showcase amounts | 0.01–0.10 tUSDC per row. Sample-1000 total 56.690860; uniform-1000 total 10.000000. Mint to the vault only as needed (suggested 100 tUSDC). |
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

### D-028 · Indonesian Excel CSV handling (recommended addition, accepted)

- Auto-detect `,` / `;` / tab from the header row. Reject comma decimals with a specific error: "Use a dot as the decimal separator, e.g. 1500.50". The template instructions recommend Save As → Text (Tab delimited) (.txt) or CSV UTF-8. Implemented in Phase 09.

### D-029 · Non-reproducible Wasm builds on this server

- NEP-330 reproducible builds need Docker, which is not available here. Local and CI builds use `cargo near build non-reproducible-wasm --locked`. A reproducible build can be added later in CI (GitHub runners have Docker) if time allows.

### D-030 · Contract test stack: near-sandbox + near-api

- Follow the current `cargo near new` template (near-sandbox 0.4.0, near-api 0.8, cargo-near-build 0.11.0) instead of near-workspaces. The template stack matches cargo-near 0.23.0 and nearcore 2.14.

### D-031 · Playwright deferred to the first end-to-end test

- Chromium's system libraries are already on the server (checked 9 Nov), so no `sudo` step is expected. The `@playwright/test` package and browser download are added with the first e2e test (Phase 06/14) to keep Phase 01 light on disk and memory.

### D-032 · License: MIT (proposed, Andre to confirm)

- `package.json` and the Cargo workspace declare MIT; HACKATHON.md Q-014 accepts MIT. The `LICENSE` file is added in Phase 17 after Andre confirms the holder name.

### D-033 · Git identity

- Repo-local `user.name = Andre`, `user.email = andre@courseeker.com` (no global git config existed). Commits carry a `Co-Authored-By: Claude` trailer.
