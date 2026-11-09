# Gajian Claude Code implementation prompts

Send one phase at a time. Start a new session between phases if context gets crowded. Read and update `docs/BUILD-STATE.md` in every phase. Test each phase before moving on. Treat on-chain and money safety failures as blockers.

## Phase 01 · Repository and toolchain

> Execute Phase 01 only. Bootstrap a fresh repository with a small TypeScript app, a Rust contract workspace, version pinning, example configuration, ignored secrets, lint/typecheck/test scripts, a concise root `CLAUDE.md`, `docs/BUILD-STATE.md`, and an honest README. Verify the platform and commands for Node, Rust, cargo-near and a NEAR sandbox/testnet workflow. Choose the simplest persistent DB compatible with the intended demo. Document the choice and write the first CI smoke checks. Prove a clean install and a local build. Stop before creating application features.

## Phase 02 · Single-payout walking skeleton

> Execute Phase 02 only. Build the smallest Rust vault plus test-token path for one payout: authorized maker creates an immutable run, one distinct approver approves, configured test-token funding is credited, the contract reserves funds, and one recipient receives tokens only after approval. Test rejection of premature release, wrong token, duplicate payout, and the real asynchronous transfer outcome in sandbox. Provide a reproducible operator-run testnet command sequence with separate test accounts and pre-registration. Before spending test tokens or deploying externally, show the exact commands and required accounts. Capture explorer proof when the operator runs the testnet flow. Mark sandbox and live-testnet results separately.

## Phase 03 · Immutable run commitments and money math

> Execute Phase 03 only. Implement exact six-decimal money parsing and bounded base-unit arithmetic. Define deterministic, domain-separated indexed payout commitments with a written byte encoding, proof algorithm and odd-leaf rule. Add shared Rust and TypeScript vectors, plus a salted private review snapshot digest. Connect commitment checks to the payout path. Prove that a changed amount, destination, or index fails and that an identical wallet on two different indexes is handled intentionally. Demonstrate proof generation for 1,000 ordered rows without public testnet load testing.

## Phase 04 · Contract policy and payout recovery

> Execute Phase 04 only. Enforce one, two sequential, and two parallel distinct assigned reviewers, maker/reviewer role separation, snapshotted policy, rejection and pre-release cancellation, automatic-worker versus maker release, and balance reservations. Persist per-row payout state and guard private callbacks, duplicate requests, unknown results and proven failures. Verify that concurrent runs cannot over-reserve, configuration updates do not change existing runs, a stale version cannot release, and a successful row cannot pay again. Document recovery for failed and uncertain outcomes. Run contract/sandbox tests.

## Phase 05 · Persistent application model and demo fixtures

> Execute Phase 05 only. Create migrations for users, org/workflow config, drafts, immutable versions, indexed rows, approval events, payout actions and reporting references. Build deterministic seed data and valid/invalid synthetic fixture generators for small runs and 1,000 rows. Define transaction boundaries for replacing a draft and claiming a payout action. Test uniqueness, version integrity and restart persistence. Update schema and seed commands in the README.

## Phase 06 · Landing, login modal and role boundaries

> Execute Phase 06 only. Build the Gajian landing page, accessible login modal, demo-only accounts, secure session handling and role dashboards. Use a server-owned authorization matrix with maker ownership and assigned-approver checks. Add tests for direct unauthorized API and page requests, login, logout and role landing. Use password hashing, server-only credentials and a network/test-data badge. Do not use query parameters or frontend role state as authority.

## Phase 07 · Admin setup and approval map

> Execute Phase 07 only. Add the three workflow choices, distinct reviewer selection, two release policies and an accessible visual preview. Persist valid admin changes and integrate the configuration with the contract authorization design. Ensure submitted runs keep their snapshotted reviewers and policy. Prove an unauthorized user cannot change settings and a sequential policy cannot be displayed as parallel.

## Phase 08 · Manual payroll builder

> Execute Phase 08 only. Implement single and multiple recipient rows, inline validation, exact totals and the consolidated/detailed posting selector. Keep an editable manual draft. Let the maker explicitly confirm a valid subset when some rows are invalid. Never silently drop rows. Test amount precision, required fields, duplicate-wallet warning, role scoping and valid-subset confirmation.

## Phase 09 · Template and upload service

> Execute Phase 09 only. Create one macro-free Excel template with the six canonical headers and CSV export instructions. Implement robust CSV and tab-delimited TXT validation, file/row limits, original data order, physical row diagnostics, and atomic acceptance. Test 1,000 valid rows, 1,001 rows, one invalid row after row 50, malformed CSV, quoted multiline fields, wrong currency and failed replacement preserving the earlier draft. Do not write accepted payout rows until the whole input passes.

## Phase 10 · Read-only preview and immutable submission

> Execute Phase 10 only. Display 50 ordered rows per page, source references, exact totals and both posting previews. Store the exact reviewed snapshot and commitments. Submit a deterministic version through the maker signer, keep an honest pending state, and reconcile the chain result before opening approvals. Implement new versions and maker cancellation per PRD. Verify mutation attempts on uploaded rows or submitted data are rejected and a retry cannot create a duplicate run.

## Phase 11 · Approver queues and review

> Execute Phase 11 only. Add the approver queues and a shared review detail with summary, ordered rows, posting preview and approval map. Connect approved/rejected actions to the correct signer account and version, with finalized evidence and rejection reason off-chain. Test assigned reviewer access after payout, wrong-role or stale-version denial, required order, and rejection preventing release.

## Phase 12 · Release worker and maker release

> Execute Phase 12 only. Implement durable automatic release after final approval and funded eligibility, plus the maker-release action. Use deterministic per-run/per-row actions, resume from durable state and read authoritative chain outcomes before retries. Persist receipts or proof references. Simulate process interruption, repeated submission, insufficient funding, proven transfer failure and unknown outcome. Verify no false Paid status and no duplicate payment. Bound worker concurrency and demonstrate resume with a small test batch.

## Phase 13 · Transaction history and accounting CSVs

> Execute Phase 13 only. Derive both company posting modes from successful recipient payouts with opaque references and matching exact totals. Provide a separately authorized recipient-detail export. Add pending/partial display, role-scoped proof links, spreadsheet formula escaping, and reconciled count/total checks. Test one versus 1,000 company entries with a deterministic fixture and verify direct requests by unauthorized roles do not expose identity or wallet fields.

## Phase 14 · UX and accessibility pass

> Execute Phase 14 only. Apply the starter design system throughout, including responsive tables, accessible approval map, dialog focus/escape/restore behavior, error recovery, consistent payout states and NEAR testnet badges. Exercise maker/admin/approver paths at desktop and narrow widths. Improve confusing or unreachable states without expanding scope. Include screenshots or reproducible steps for QA.

## Phase 15 · Reproducibility and targeted regression tests

> Execute Phase 15 only. Walk acceptance checks A01–A08. Add missing targeted checks around imported file integrity, permission boundaries, contract order, transfer idempotency and reports. Make CI run the local checks and provide judge-mode setup with expected output. Scan worktree and Git history for credentials. Mark blocked checks accurately and separate app/sandbox verification from live testnet verification.

## Phase 16 · Live testnet rehearsal

> Execute Phase 16 only. Prepare the operator-approved testnet rollout commands, confirm actual account IDs, configure the vault and pre-register synthetic recipients, then rehearse a two- or three-recipient automatic-release run when authorized. Check final transfers and balances against the UI and exports. Save only public deployment metadata and evidence. Verify a 1,000-row import and accounting fixture independently. Label any testnet attempt that is incomplete or blocked.

## Phase 17 · README, video runbook and release candidate

> Execute Phase 17 only. Write a bookkeeper-readable README with exact judge steps, output, network, test token, contract ID, permission limits and proofs. Add a license, third-party and AI disclosures, setup troubleshooting, a short demo script and a draft X post. Confirm the submission prerequisites with the live organizer guide. Tag or identify a release candidate locally only if asked. Do not publish or submit. Leave `BUILD-STATE.md` ready for independent QA.

## Phase 18 · Independent QA handoff and remediation

> Execute Phase 18 only. Prepare the release candidate commit, setup instructions, test evidence and known issues for independent Codex QA. Once the user supplies QA findings, fix reproducible failures in priority order and rerun the affected acceptance checks. Update `BUILD-STATE.md` with proof and remaining issues. Keep code publication and submission as separate user-controlled steps.
