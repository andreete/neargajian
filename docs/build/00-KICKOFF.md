# GAJIAN kickoff: decisions, environment and operating rules

Version 1.2 · 9 November 2026 · Written by Claude Desktop (laptop) for the Claude Code agent on the server · Owner: Andre

Read this file FIRST. It overrides the draft defaults in `01-PRD.md`, `03-CLAUDE-MASTER-PROMPT.md` and `04-BUILD-PHASES.md` wherever they differ. Everything not mentioned here follows those documents.

## 1. Reading order

1. `docs/build/00-KICKOFF.md` (this file)
2. `docs/build/01-PRD.md` (scope, journeys, acceptance checks A01–A08)
3. `docs/build/04-BUILD-PHASES.md` (18 phases)
4. `docs/build/03-CLAUDE-MASTER-PROMPT.md` (engineering principles and financial invariants)
5. `docs/build/02-DESIGN-SYSTEM.md` (UI; see section 5 below for the colour change)
6. `docs/build/gajian-prototype-discovery.md` (decision history)
7. `docs/SAMPLE-DATA.md` (ready-made 1,000-row sample files and their expected totals)
8. `docs/reference/HACKATHON.md` (organizer rules; recheck the live copy at https://nearhackathon.com/HACKATHON.md before submission)

`05-CLAUDE-CODE-TUTORIAL.md` describes a Windows setup. Ignore its Windows steps; we build on this Linux server. Its sections on phase discipline, testnet access and Codex QA still apply.

## 2. Decisions confirmed by Andre on 9 November 2026

| Topic | Decision |
| --- | --- |
| Brand | **GAJIAN** ("payroll" in Indonesian). Logo: `public/brand/gajian-logo.jpeg` (reads "Gajian.my.id"). UI language: English. |
| Track | NEAR HACKATHON, Real-World Money (`realworld`). Testnet only. |
| Quality bar | **Working prototype with production-grade quality.** See section 3. |
| Platform priority | **Desktop first.** Upload is a key feature. See section 4. |
| Scope strategy | **Core-first.** Order: contract-controlled payout → approvals → upload (1,000 rows) → posting modes → UI polish. If time runs out, cut polish and optional features. Never cut: real contract approval enforcement, both posting modes, the 1,000-row import check, honest test evidence, money-safety invariants. |
| Payout token | Our own mock **tUSDC**, NEP-141, 6 decimals, zero value, deployed by us on testnet. The currency code in files and UI is `tUSDC`. |
| Showcase amounts | **Tiny amounts: 0.01 to 0.10 tUSDC per row**, in the sample files and in the live demo, so every showcase stays within a small budget (about 10 USD-equivalent per showcase). The 1,000-row sample totals 56.690860 tUSDC; the uniform file totals exactly 10.00. Set demo caps above this (suggested: 1 tUSDC per row, 100 tUSDC per run) and record them in DECISIONS.md. Mint tUSDC to the vault only as needed (suggested: 100 tUSDC). |
| Testnet NEAR budget | tUSDC is our own token (we mint it); the faucet only supplies testnet NEAR for gas and storage deposits. Keep testnet NEAR use low: reuse accounts, do not create hundreds of accounts, and log the NEAR spent per live run in `docs/TESTNET.md`. A live payout of all 1,000 sample rows is out of scope unless Andre asks for it later. |
| Design reference | **Rise (https://www.riseworks.io/) is the main reference**, Deel (https://www.deel.com/) secondary. See section 5. |
| Target date | **Feature-complete and rehearsed by Thursday 12 November 2026.** Official deadline: 15 November 2026 06:59 WIB (14 Nov 23:59 UTC). |
| Autonomy | **Fully autonomous**, including testnet deploys and testnet transactions. See section 6 for the hard limits. Exception: after Phase 01 the first time, stop for Andre's review. |
| Testnet accounts | **The agent creates them** with near-cli and the testnet faucet. Keys live only on this server. |
| Second brain | Handover files in the repo, pushed to a **private GitHub repo on Andre's personal account** (remote added later by Andre). See section 7. |
| Hosting | Local demo first (127.0.0.1:8092). Later: an external host on the domain gajian.my.id (not this server). Keep the app deployable to a host with a persistent disk and a long-running worker (e.g. Fly.io or Railway). |
| Database | Recommended: **SQLite** (single writer, file on disk, no Docker available), via a migration tool that can later move to PostgreSQL. Record the final choice in `docs/DECISIONS.md`. |
| Demo login emails | Use Andre's domain instead of `gajian.com` (a domain that may belong to someone else): `maker@gajian.my.id`, `app1@gajian.my.id`, `app2@gajian.my.id`, `admin@gajian.my.id`, demo password `12345678`, demo mode only. The app never sends email. |
| Team | 3 people (submission size `2 - 4`). Andre is the sole engineer; the other two do QA and presentation. |
| Legacy docs | The old `payroll-tech-docs` pack is NOT included on purpose (relayer, gasless, 1Click, payee portal are out of scope). Do not recreate those features. |

## 3. What "production-grade prototype" means here

The product runs on testnet with synthetic data, but the code, UX and engineering must be what you would ship to a real finance team:

- **No fake paths in the main flow.** The demo path uses the real contract, real testnet transactions, the real database and real validation. Any mock or sandbox-only path is labelled in code, UI and README.
- **Correctness:** strict TypeScript (no `any` in domain code), exact integer money math (BigInt / base units) end to end, server-side validation of every input, idempotent mutations, database transactions around state changes.
- **Security:** server-side authorization on every read, write and export; password hashing (argon2id or bcrypt); secure, httpOnly, SameSite session cookies; CSRF protection on mutations; login rate limiting; security headers (CSP, frame-ancestors, no-sniff); no secrets or PII in logs; dependency audit clean of high/critical issues.
- **Reliability:** the release worker survives restarts, never double-pays, and keeps unknown outcomes unknown until reconciled. Clear error states, no silent failures.
- **Tests:** unit (money, import, commitments, reporting), integration (roles, persistence, workflows), contract tests in sandbox, and an end-to-end browser test of the happy path (Playwright). CI runs lint, typecheck and tests.
- **Operations:** structured logs, a health endpoint, migrations, seed command, `.env.example`, a README a judge can follow from a fresh checkout.
- **Honesty:** be clear in the README about the trust model. The prototype's server holds restricted testnet signer keys on behalf of users. That is acceptable for a testnet demo but is not production custody; say what would change for mainnet (user-held wallets or a multisig/MPC signer).

## 4. Desktop first, upload as a flagship feature

- Design for desktop widths first (1280–1920 px), including dense data tables. Tablet must remain usable; phone only needs readable, non-broken pages (review and status), not full run building.
- Upload experience: drag-and-drop zone plus a file picker, clear accepted formats (CSV, TXT tab-delimited), file size and row limits shown up front, progress while validating, a summary (rows, exact total, currency) and an error panel listing row number, column and reason. Offer a downloadable error report (CSV) when the file is rejected. A rejected upload never replaces the previously accepted version.
- Review table: 50 rows per page in original file order, source row numbers in the first column, fast paging for 1,000 rows, sticky header, right-aligned tabular amounts, monospace wallet IDs with copy.
- **Templates and sample data (ready made, in this handoff):**
  - `public/templates/gajian-payroll-template-blank.csv`: header row only
  - `public/templates/gajian-payroll-sample-1000.csv`: 1,000 realistic synthetic rows, 0.01–0.10 tUSDC each (total 56.690860)
  - `public/templates/gajian-payroll-sample-1000.txt`: the same rows, tab-delimited
  - `public/templates/gajian-payroll-uniform-1000.csv`: 1,000 × 0.01 = exactly 10.00 tUSDC (consolidated 1 entry vs detailed 1,000 entries)
  - The PRD's large-number example (1,000 × 1,000,000 = 1,000,000,000) is covered by unit tests of the money and reporting code, not by a file.
  - Generator: `scripts/generate-sample-payroll.mjs` (deterministic; checksums and expected totals in `docs/SAMPLE-DATA.md`). Keep it, run it in Phase 01 to confirm the checksums match, and add a test that the importer accepts all three data files with the exact totals listed.
  - Still to build (Phase 09): a macro-free `.xlsx` template, generated from code (for example with ExcelJS), with an Instructions sheet and a Payroll sheet containing the six headers plus the same 1,000 sample rows. Format the `near_account_id`, `amount` and `mobile_phone` columns as **Text** so Excel does not strip the leading `+`, use scientific notation, or change decimals.
  - The download area in the run builder offers: blank CSV, Excel template with sample rows, sample CSV and sample TXT.
- **Indonesian Excel pitfall (recommended addition, record in DECISIONS.md):** Excel with Indonesian regional settings saves "CSV" with semicolons as separator and commas as decimal separator. Recommended: auto-detect `,` / `;` / tab from the header row, and reject comma decimals with a specific, friendly error ("Use a dot as the decimal separator, e.g. 1500.50"). Template instructions should recommend **Save As → Text (Tab delimited) (.txt)** or **CSV UTF-8**, and explain the decimal rule.
- The 1,000-row sample files are for import, review and reporting. Their wallets are not real demo accounts: the app must refuse to release a payout to accounts that do not exist or are not registered with tUSDC, and the live demo uses a separate 2–3 row file with the agent-created testnet recipients, also with amounts between 0.01 and 0.10 tUSDC.

## 5. Design direction (update to 02-DESIGN-SYSTEM.md)

- Rise is the main visual reference: product-led landing hero showing a real-looking payroll run card (total, approvals, payout status), clean white/light surfaces, generous spacing, confident typography. Deel is the reference for task-first navigation and guided payroll stages.
- Replace the teal palette with colours sampled from the GAJIAN logo: **navy `#0A3C90`** as primary (buttons, headings, brand), **bright blue `#2577FE`** for highlights and active states, **sky blue `#57B5FD`** as accent (soft backgrounds, charts, illustrations, never for body text on white). Keep amber (waiting), red (danger) and green (success) status colours. Check WCAG AA contrast for every text/background pair and adjust shades as needed.
- Keep everything else in 02-DESIGN-SYSTEM.md: approval map, posting preview, ordered upload table, run statuses, money action dialog, NEAR testnet badge.
- Use original copy, icons and synthetic data. Do not copy Rise or Deel assets, text or layouts verbatim.

## 6. Server environment and hard limits

Verified 9 November 2026:

| Item | Value |
| --- | --- |
| Host / user | `andre` (Ubuntu 26.04), user `neargajian`, **no sudo, no Docker** |
| Repo | `~/near-gajian`, git initialised on branch `main`, no commits yet before this handoff |
| tmux session | `gajian` |
| Port | **8092**, bind to **127.0.0.1 only** |
| Installed | git 2.53, Claude Code (`~/.local/bin/claude`) |
| Not installed | Node.js, npm, Rust/rustup, cargo, cargo-near, near-cli, nvm |
| Hardware | 4 CPU cores, **7 GB RAM (about 3 GB free)**, 416 GB free disk |
| Neighbours | Other users run projects on this machine, including a **production** system owned by user `andre`. Never touch other users' files or processes. |

Resource rules (memory is tight and shared):

- Run every heavy command (Rust builds, `npm install`, test suites, Next.js builds, Playwright) with `nice -n 19`.
- Rust: `CARGO_BUILD_JOBS=2`. Node builds: limit memory if needed (`NODE_OPTIONS=--max-old-space-size=1536`).
- No heavy work on Saturday or Sunday 07:00–14:00 WIB (production batch window).
- Do not leave dev servers, sandboxes or watchers running when not needed.

You may, without asking: write and change code inside `~/near-gajian`; install tools **user-level** in `/home/neargajian` (rustup, a Node version manager or Node tarball, cargo-near, near-cli, npm packages, Playwright browsers); run builds and tests; create NEAR **testnet** accounts; use the testnet faucet; deploy contracts to testnet; send testnet transactions; commit locally.

You must NOT, ever:

1. Touch mainnet: no mainnet config, accounts, keys or transactions.
2. Use `sudo` or Docker, or touch anything outside `/home/neargajian`.
3. Open ports beyond 127.0.0.1, or run Tailscale Serve/Funnel, ngrok, cloudflared or any tunnel.
4. Commit secrets. Private keys stay in `~/.near-credentials` (outside the repo) and the git-ignored `.env`. Never print private keys or seed phrases in chat, logs, docs or commit messages.
5. Make the GitHub repo public, post on X, submit the hackathon entry, or force-push. These need Andre's explicit yes.
6. Put PII (names, phones, emails) on-chain or in logs. Use synthetic data only.

**Missing system packages:** if something needs a system package (for example a C compiler/linker `cc` for Rust host builds, `pkg-config`, OpenSSL headers, or Playwright's browser libraries), STOP and tell Andre in plain words, with the exact single command he can run as user `andre`, e.g. `sudo apt install -y build-essential pkg-config libssl-dev`. Andre installs it manually. Record it in `docs/NEXT-STEPS.md`, then continue once he confirms.

Add `.claude/settings.json` in the repo with deny rules for: `sudo`, `docker`, `tailscale`, `git push --force`, and any command containing `mainnet`.

## 7. Second brain (mandatory, every phase)

Goal: if this Claude account hits its usage limit, another Claude account, an API-key session, or Codex can continue from the repo alone.

Maintain these files and commit them at the end of every phase (and before any long-running step):

| File | Purpose |
| --- | --- |
| `CLAUDE.md` (repo root) | Standing rules for any Claude session: sections 2–7 of this file, condensed, plus the commands to build, test and run. |
| `AGENTS.md` (repo root) | Same rules for Codex. Point to CLAUDE.md and docs/; keep them consistent. |
| `docs/BUILD-STATE.md` | Per phase: changed files, exact commands and real results, sandbox vs live-testnet evidence, blockers. |
| `docs/DECISIONS.md` | Decision log (start with section 2 of this file), with date and reason for each new decision. |
| `docs/NEXT-STEPS.md` | The single next action and a ready-to-paste prompt to resume, e.g. "Read docs/NEXT-STEPS.md and continue Phase 05 from step 3." |
| `docs/TESTNET.md` | Public testnet account IDs, contract IDs, explorer links. Never keys. |

Commit style: one commit per verified phase or sub-step, message `phase-NN: summary`. Before every commit run a secret scan (check `git diff --cached` for `ed25519:`, `PRIVATE KEY`, seed words, `.env`). Push to `origin` once Andre has added the GitHub remote; until then commit locally only.

## 8. Schedule (target)

| Day | Goal |
| --- | --- |
| Mon 9 Nov | Phase 01 (toolchain, repo, second brain), Andre reviews, start Phase 02 |
| Tue 10 Nov | Phases 02–04: contract, first **live** testnet payout with explorer proof |
| Wed 11 Nov | Phases 05–11: DB, auth, admin, manual builder, upload + templates, review, approvals |
| Thu 12 Nov | Phases 12–16: release worker, history/CSV, UX pass, regression, live rehearsal |
| Fri 13 Nov | Codex QA (Phase 18), fixes, README, video, external hosting |
| Sat 14 Nov | Light work only: publish repo, X post, submission (all by Andre) |

If you fall behind, say so in `docs/NEXT-STEPS.md` and propose what to cut. Do not silently drop requirements.

## 9. Phase 01 adjustments

On top of Phase 01 in `04-BUILD-PHASES.md`:

1. First check prerequisites read-only: `cc`/`gcc`, `make`, `pkg-config`, `curl`, `tar`, `unzip`, `python3`, OpenSSL headers. Report what is missing (see section 6) before installing anything that depends on them.
2. Install Node (current LTS) and Rust (stable via rustup, plus the `wasm32-unknown-unknown` target), cargo-near and near-cli user-level. Prefer the official prebuilt installers over compiling from source (memory is tight). Verify versions against the official NEAR docs (https://docs.near.org/) and pin them.
3. Make the first commit with the handoff files exactly as received (`phase-00: planning docs, kickoff decisions and sample data`).
4. Run `node scripts/generate-sample-payroll.mjs` and confirm the four checksums match `docs/SAMPLE-DATA.md` (no diff in git).
5. Create all second-brain files from section 7.
6. Make `.env.example` with placeholders only, and git-ignore `.env`, `node_modules`, `target`, `*.sqlite`, `*.db`, Playwright reports.
7. At the end of Phase 01: update the second-brain files, commit, and STOP for Andre's review. From Phase 02 onward, continue phase after phase without waiting, unless a hard limit or missing system package needs Andre.
