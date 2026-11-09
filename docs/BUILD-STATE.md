# Build state

Per phase: changed files, exact commands and real results, sandbox vs live-testnet evidence, blockers. Never mark something as run if it was not.

| Phase | Status | Live testnet evidence |
| --- | --- | --- |
| 00 Handoff commit | Done (`e66a953`) | n/a |
| 01 Repository and toolchain | Done, approved by Andre 9 Nov (`e4cae2d`, follow-ups `phase-01: review follow-ups`) | none |
| 02 Single-payout walking skeleton | Done | **Yes**: first contract-controlled payout `p02-run-1`, see docs/TESTNET.md |
| 03 Commitments and money math | Done | none (sandbox + local only by design; live use of proofs comes with the Phase 04 redeploy) |
| 04 Contract policy and payout recovery | Done, approved by Andre 9 Nov | **Yes**: 3 policy runs signed with restricted keys, see docs/TESTNET.md |
| 05 Persistent application model | Done | none (local DB only) |
| 06 Landing, login and role boundaries | Done; design review by Andre → 06b | none |
| 06b Design review fixes | Done | read-only: history export from testnet RPC |
| 07 Admin setup and approval map | Done | **Yes**: 2 workflow updates through the app, see docs/TESTNET.md |
| 08 Manual payroll builder | Done | none (local) |
| 09 Template and upload | Done, approved by Andre | none (local) |
| 09b Review fixes | Done | none |
| 10 Read-only preview and immutable submission | Done | **Yes** (Phase 13 live run: `create_run` through the app) |
| 11 Approver queues and review | Done | **Yes** (Phase 13 live run: both approvals in the browser) |
| 12 Release worker and maker release | Done | **Yes** (Phase 13 live run: worker release + 3 payouts); maker release proven in sandbox/integration only |
| 13 History and accounting CSVs | Done, approved by Andre (live run independently verified) | **Yes**: complete flow through the app, see docs/TESTNET.md |
| 13b Review fixes (paid-state consistency, screenshot 05b) | Done | none (read-only recapture of the Phase 13 run) |
| 14 UX and accessibility pass | Done | none (local; test-only fixture data) |
| 15 Reproducibility and targeted regression tests | Done | read-only: `npm run judge:verify` re-checks the live evidence (22/22) |
| 16 Live testnet rehearsal | Done, approved by Andre (independently verified on testnet) | **Yes**: final locked vault, fund migration, demo, maker release, duplicate refusal, Awaiting funding (docs/TESTNET.md) |
| 16b Paid time from the chain; run page actions | Done | read-only backfill of 16 block times from the chain; `judge:verify` 115/115 |

---

## Phase 16b · Paid time from the chain; run page actions (9 Nov 2026)

1. **Paid time = block time of the payout transaction.** Before, history and both CSVs used the worker's record time (`updatedAt`): 1–8 s earlier than the chain, and in one case earlier than the run's release. Now:
   - `VaultClient.txBlockTime` reads the timestamp of the block that includes a transaction, the time the explorer shows.
   - `payout_actions.chain_block_time` (migration `0007_chain_block_time.sql`) is set once at confirmation by `fillBlockTimes` (`src/server/payouts/settle.ts`, called by the worker and by reconciliation). Two triggers make it final and only allow it on succeeded transactions. If the RPC cannot answer, the worker fills it on a later tick; it is never guessed.
   - History, both CSVs, the run page (new "Paid (UTC)" column, timeline times for release and payouts) and `judge:verify` all use this value. A run enters reports only when every paid time is known.
   - Backfill: `scripts/testnet/backfill-block-times.ts` set the 16 existing confirmed actions from the chain (dry run first, then applied; a second run sets 0). Log: `docs/evidence/backfill-block-times-16b.json`, plus an audit event per value. Database backed up first (`.tmp/gajian-before-16b.sqlite`).
   - Regression `tests/integration/paid-time.test.ts` (3): the stand-in vault's chain clock runs 4 h from the app clock. Run page, history and both CSVs equal the block time of each payout, never the app time; the release's block time comes before every payout's; the value is set once and a later tick, a reconcile or a direct SQL update cannot change it; with the RPC unavailable the run stays out of reports until the worker reads the times.
   - Both CSVs re-downloaded into `docs/evidence/exports/`. `npm run judge:verify` now also checks every exported paid time against its payout's block: **115/115 PASS**.
2. **Run page actions in one place.** The header is a grid of back link | title + chips (wraps inside its column) | actions (top right, on the title row) for every run state. The new e2e test checks every fixture state (including a long-title run) at 1280x720 and 1440x900: actions at the right edge, on the title row, never overlapped by the title. The recipients table on the run page truncates accounts with a copy action, so the new Paid column fits at 1280.
3. **Found while testing: the upload confirmation disappeared.** The draft page keyed the upload panel by draft revision, so after an accepted file the page refresh remounted the panel and dropped the "Accepted …: N rows, exact total …" message within moments. This was the cause of the transient failure in the 16c live spec and of an intermittent `upload.spec.ts` failure (2 of 3 runs). The panel is now keyed by run and only the review table's pager resets on a new file; `upload.spec.ts` passed 4 of 4 in a row afterwards.

Evidence: `npm run lint`, `npm run typecheck` pass; `npm test` **158/158**; `npm run build` pass; `npm run test:e2e` **22/22**; `npm run judge:verify` **115/115**.

---

## Phase 16 · Live testnet rehearsal (9 Nov 2026)

### Built (app and tooling; contract source unchanged, D-051)

- **Path-independent contract build** (`scripts/build-contracts.sh`): cargo-near's default flags plus `--remap-path-prefix` for the cargo registry and the repo, so the Wasm no longer embeds `/home/<user>/…` paths (21 before, 0 after). Docker-based `reproducible-wasm` is not allowed on this host (D-090).
- **Vault-aware app** (migration `0006_vault_contract.sql`): workflow revisions and submitted versions record their vault; revision uniqueness is per vault (revisions restart at 1 in a new vault); the active workflow is the configured vault's; reconcile, worker, decisions, cancel and release never act on a version of another vault (`assertSameVault`), the run page names the earlier vault. Defaults (config, client, worker log, seed) now point at the final vault; the seed mirrors vault2 revision 3.
- **Confirmed payout records are fully final** (found during the rehearsal, see below): `updatePayoutAction` never changes a `succeeded` record, not even its time.
- Tooling: `scripts/testnet/phase16-deploy.sh` (hash check, create, deploy+init, tUSDC registration, delete the full-access key, role keys), `scripts/testnet/switch-vault.ts` (mirror the vault's workflow into the app DB; refuses while older versions are live), `scripts/testnet/phase16.ts` (`migrate`, `duplicate`, `fund`), `signer-keys.mjs` knows the legacy and the final vault, `scripts/judge/verify-deployment.mjs` (`npm run judge:deployment`), live spec `tests/live/phase16.spec.ts` (`npm run live:phase16`; `live:phase13` now runs only its own file). `.env.example` carries the public testnet account IDs.

### Sandbox / local evidence

- Two clean clones of release commit `cf4d9a1` at different paths, separate target dirs: vault Wasm **byte-identical**, sha256 `38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0` (tUSDC `cc7a437b…` identical too). `npm run contracts:test`: 3 + 49 unit, sandbox flow ok.
- `npm test` **155/155** (new: vault-switch guard; confirmed payout time cannot change after reconciliation; revisions per vault). `npm run test:e2e` 21/21. `npm run lint`, `npm run typecheck`, `npm run samples:check` (no diff), `npm run build` pass; `npm audit --audit-level=high` passes (14 moderate advisories in the esbuild / minimatch / uuid chains, none high or critical); `npm run secret-scan` clean (working tree + all commits).

### Live testnet evidence (every tx in docs/TESTNET.md; `npm run judge:verify` 93/93 PASS)

- **16a** `vault2.gajian-payroll.testnet` deployed from `cf4d9a1`: on-chain `code_hash` `4osoZq17…` = base58(sha256) of the reproducible Wasm; its only full-access key deleted (0 keys left; `npm run judge:deployment` PASS). Role function-call keys added. The old vault's 0.70 tUSDC moved through an **approved run of the old vault** (create, approve ×2, start_release, pay_row → admin), then the admin funded vault2 with `ft_transfer_call` (the only way the vault books funds). App switched to vault2 (`.env` rewritten, workflow mirrored). The migration run is shown as an operations transfer, never as payroll.
- **16e** Full demo through the app: 3-row upload, detailed posting, approver 1 then 2 in the browser, automatic release, Paid 3 of 3 with explorer links, history in both views, company and recipient-detail CSVs downloaded and matching the UI.
- **16c** Maker release through the app: admin switched to "Maker releases" in the app (revision 2), run approved, maker clicked **Release payments**, worker paid, admin switched back to automatic (revision 3).
- **16b** While that run was **Releasing with 1 of 3 paid**, a duplicate `pay_row` for the paid row 0 (worker key, real proof) was **refused on-chain: `Row is already paid`**; paid count unchanged.
- **16d** Run of 0.75 tUSDC with 0.49 in the vault: `start_release` refused on-chain (`Insufficient vault balance`), the app showed **Awaiting funding** on the run page and in the list; the admin minted and funded 0.50; the worker retried after 60 s and paid all 3 rows.
- **16e** 1,000-row import check in the running app (uniform sample, 10.00 tUSDC, 50 rows per page in file order), not submitted.
- Balances changed by exactly the paid amounts: recipient1 +0.37, recipient2 +0.32, recipient3 +0.27, old vault −0.70, vault2 +0.24 (= 0.70 + 0.50 − 0.96). NEAR spent in Phase 16: **0.02182** (total so far ≈ 0.127).
- Screenshots (1440x900) `docs/screenshots/phase-16/`: 01 demo paid, 02/03 history consolidated/detailed, 04 admin maker releases, 05 maker-release button, 06 releasing during the duplicate proof, 07 maker-release run paid, 08 back to automatic, 09 Awaiting funding, 10 paid after funding, 11 1,000-row import.

### Found during the rehearsal and fixed

- **Paid-at time could change after export.** In 16e the page's reconcile confirmed the last payout from the vault first (14:44:29 UTC); the worker's own late "succeeded" write then overwrote the record's time with its earlier tick start (14:44:25). The company CSV downloaded during the rehearsal shows 14:44:29 for line 3; the app shows 14:44:25 for that line. Fix: a confirmed payout record is now immutable (first confirmation wins), regression asserted in `tests/integration/run-page-states.test.tsx`. Amounts and references were never affected.

### Tested only locally or in the sandbox (labelled in README too)

Unknown transaction outcome (landed / never landed), two release workers at once, a failed token transfer with bounded retries, a worker crash between claim and signing: automated tests only, not on testnet.

### Not done

- The old vault keeps its full-access key (retired, 0 tUSDC); the tUSDC token was not redeployed (unchanged since Phase 02, admin-mintable test token).

---

## Phase 15 · Reproducibility and targeted regression tests (9 Nov 2026)

- **Acceptance walk** `docs/ACCEPTANCE.md`: A01–A08 each with app/sandbox evidence and live testnet evidence in separate columns. All pass; pending items are the Phase 16 rehearsal steps (16a reproducible deployment, 16b live duplicate rejection, 16c maker release through the app, 16d live Awaiting funding, 16e live 1,000-row check). Nothing blocked.
- **Permission boundaries** `tests/integration/boundaries.test.ts`: every API route (18 operations) refused for signed-out callers (401); 43 wrong-principal cases (another maker 404, unassigned approver 404, assigned approver on maker/admin routes 403, admin on run routes and recipient export 403, maker on decision/admin routes 403); every mutation refused without CSRF token and from a foreign origin (403). Each case: no chain call, no state change. Lists and exports scoped per caller.
- **Targeted regressions** `tests/integration/regression.test.ts`: file SHA-256, frozen rows and the on-chain payout root describe the uploaded file; frozen rows cannot be edited or deleted; rows tampered below the app are never paid (root mismatch, zero `pay_row`); one-approver template; parallel in either order; no release before both approvals; sequence order refused before any transaction; repeated release reserves once; a restarted worker after payment sends nothing; duplicate `pay_row` refused by the vault.
- **Credential scan** `scripts/secret-scan.sh` (`npm run secret-scan`; `--staged` for pre-commit): private-key, PEM, NEAR credential JSON, seed-phrase JSON, token patterns and secret-like file names in the working tree and in **every commit of the full history** plus every file name ever added; prints locations, never values. Result: **clean (working tree + all commits)**. Self-test: a planted key committed and then deleted is reported (exit 1).
- **Judge mode** `docs/JUDGE.md` + `npm run judge:verify` (`scripts/judge/verify-testnet.mjs`, read-only RPC, no keys) over `docs/evidence/testnet-runs.json`: Phase 13 run status/total/rows from `get_run`/`get_row`, each tx final with the expected signer, each payout's `ft_transfer` event, and six Phase 04 on-chain refusals. Result **22/22 PASS**.
- **CI** (`.github/workflows/ci.yml`): adds browser tests (Playwright Chromium, generated session secret, fixture DB, no testnet) and a credential-scan job with full history. `npm run typecheck` now runs `next typegen` first, so a fresh checkout (or CI) can typecheck before a build; a fresh clone previously failed typecheck without the generated `next-env.d.ts`.
- **Fresh-checkout proof** (clean clone, no `.env`, generated `SESSION_SECRET`, as CI; deleted afterwards): `npm ci` ok; lint ok; typecheck ok (after the typegen fix; failed before it); `npm test` 154/154; `samples:check` no diff; build ok; `npm run test:e2e` 21/21; `secret-scan` clean; `judge:verify` all pass.
- Local: `npm run lint`, `npm run typecheck` pass; `npm test` **154/154**; `npm run test:e2e` **21/21**.

---

## Phase 14 · UX and accessibility pass (9 Nov 2026)

### Changed

- **Detailed history table (Andre's point):** no wrapping of references, accounts, amounts or times at 1280 and 1440 px. Each run is a group header row (title, version, posting, lines, total) instead of a repeated Run column; the Line column is dropped from the screen (the reference suffix `-0001` is the line number; the CSV keeps `line`). Long values (references, NEAR accounts, vault run IDs) sit on one line, truncate with an ellipsis, carry the full value as a tooltip and have a **copy button** (`src/components/copy-value.tsx`, announced via `aria-live`). Paged at **100 lines per page** with Previous/Next, so a 1,000-row run no longer renders a 48,000 px page. Times in "(UTC)" columns no longer repeat "UTC".
- **Consolidated history table:** vault run ID moved under the run title (truncated + copy), fits at 1280.
- **Review table (draft review and upload):** dropped the redundant Currency column (only tUSDC is accepted; stated in the hint and the "Amount (tUSDC)" header); email shown under the receiver name; fits at 1280 with full account IDs.
- **Stat cards** never wrap a long value: review page "Posting: Detailed" + footnote, admin "Active policy: 2 in sequence" + footnote, long file names truncated with a tooltip.
- **One derived status everywhere:** `src/server/runs/status.ts` (`displayStatusFor`) applies the run page's `paymentState` rule to the maker list, the approver queue and the history in-progress list. Before, a run waiting for funding showed "Ready to release" in the list and "Awaiting funding" on its page.
- **Awaiting funding** reads as a wait, not a failure: banner "Awaiting funding: the release worker retries once the vault holds enough tUSDC" (maker mode: "release again"), timeline "Release waiting for funding" in the waiting tone.
- **Layout bug:** screen-reader-only text inside scrollable tables (absolutely positioned, no positioned ancestor) escaped the scroll container and widened the page at narrow widths; `.table-wrap` is now the containing block.

### Checks (sandbox / local only; no testnet)

- `tests/e2e/pages.spec.ts` (6 tests) with a **test-only fixture** (`scripts/e2e-fixture.ts`, run by `scripts/e2e-server.sh`; refuses any database outside `.tmp/`): runs in every state (paid detailed, paid 1,000-row consolidated, releasing, awaiting funding, pending approval, rejected) built through the real lifecycle against the stand-in vault. Every page for maker, approver and admin (landing, dashboards, new run, draft, review, run detail in six states, history both views and page 2, admin setup) at **1280x720 and 1440x900**: no horizontal page scroll, every table fits its card, references/accounts/amounts/times/chips/copy values/headers on one line, no CSP violation or page error. Narrow check at **1024x768**: no horizontal page scroll (tables may scroll inside their region). Copy action puts the full account on the clipboard; pagination 1,003 lines → 11 pages; list and run page agree on Awaiting funding; submit, cancel, approve and reject dialogs close with Escape and return focus to their trigger (login dialog already covered: focus in, Tab trapped, Escape restores).
- `npm run lint`, `npm run typecheck` pass; `npm test` **142/142**; `npm run build` pass; `npm run test:e2e` **21/21**.
- QA screenshots: `docs/screenshots/phase-14/` (fixture data, labelled in its README).

### Not changed

- Below 1024 px the app is usable (sidebar becomes a top nav, tables scroll inside their region) but not optimised: desktop first, as agreed.

---

## Phase 13b · Review fixes (9 Nov 2026)

1. **Paid-state inconsistency (PRD A06).** Root cause: the run page's reconcile (`reconcileVersion`, polled every 3 s) copied the vault's run status. The vault reports the run Paid as soon as the last `pay_row` lands, while the release worker is still waiting for finality before it records that payout. So the version became Paid while the last payout record was still `submitted`: badge "Paid" (from the version) next to "Paid 2 of 3, 0.10 tUSDC" and "Payouts: 2 of 3" (from payout records). Fix:
   - `src/server/payouts/settle.ts` (`settleActions`, `confirmedPayouts`), shared by the worker and reconciliation. When the vault says Paid, reconciliation first settles every open payout record from `get_row`; the version becomes Paid only when every row is confirmed and the confirmed count and total equal the approved version, otherwise it stays Releasing. Report entries are created at that single transition.
   - `paymentState()` in `src/server/runs/view.ts`: one derived state that the run page's badge, Paid counter (now "x of y tUSDC confirmed"), banner and timeline all read; "Paid" is shown only when complete, even for data written by the old code.
   - `updatePayoutAction` never changes a confirmed (`succeeded`) record, so a worker's late answer after reconciliation confirmed the row is harmless (the DB trigger still enforces it).
   - Regression test `tests/integration/run-page-states.test.tsx` renders the real run page (server component) in every intermediate state: approved, releasing 0/3, 1/3, failed row (Needs attention), retried 2/3, last payout landed but unrecorded (vault Paid → page Releasing 2/3), reconciled Paid 3/3, record not provable yet (stays Releasing), stale Paid version (shows Releasing). Each state asserts badge, counter, banner and timeline agree. Verified to fail on the previous code (2/2 failing) and pass after the fix.
2. **Screenshot 05b** recaptured (read-only, `tests/live/phase13-paid-screens.spec.ts`, no transactions): now shows the recipients table with payout status and the three payout tx links. Screenshot 05 recaptured too, since the original was taken at the moment of the bug; it now shows Paid with 3 of 3 and 0.12 of 0.12 tUSDC. The live spec now waits for "3 of 3" before capturing.

Evidence: `npm run lint`, `npm run typecheck` pass; `npm test` **142/142**; `npm run build` pass; `npm run test:e2e` **15/15**.

---

## Phase 13 · History and accounting CSVs (9 Nov 2026)

### Built

- `src/server/reports/history.ts`: `historyFor` (role scope: maker → own runs, approver → assigned runs, admin → all runs at company level only, never recipient identity, contact, wallet or recipient tx), built only from payout actions the vault confirmed. A run is listed as paid only when the version is Paid, every row has a confirmed payout and the confirmed sum equals the frozen total; partially paid or releasing runs show in "In progress" and never in reports. `companyCsv` (each run in its posting mode locked at submission: 1 line per run or 1 line per recipient line, opaque references `GJN-XXXXXXXX[-NNNN]`, no recipient fields) and `recipientCsv` (separate export, maker + assigned approvers only). UTF-8 with BOM, CRLF, formula escaping, exact 6-decimal amounts, UTC to the second.
- API `GET /api/reports/company` (maker, approver, admin) and `GET /api/reports/recipients` (maker, approver; admin 403), authorized server-side, `no-store`.
- `/history` page: consolidated / detailed view switch (`?view=`), paid runs, paid lines and total, a reconciliation tile (consolidated total = detailed total), in-progress section, export area. Nav "History and reports" enabled for all roles (admin: "Company reports").
- Live proof tooling: `playwright.live.config.ts` + `tests/live/phase13.spec.ts` (`npm run live:phase13`), CSV `tests/live/live-3-rows.csv`.

### Sandbox / local evidence

- `tests/integration/reports.test.ts` (5): the same 1,000-row data gives 1 consolidated entry vs 1,000 detailed entries with identical totals (10.000000) and unique references; both views reconcile and a partially paid run stays out of reports; spreadsheet formulas escaped; admin company CSV contains no identity/contact/wallet field and the admin gets 403 on the recipient export (401 when signed out); recipient export scoped to the maker and assigned approvers; timestamps are UTC whole seconds.
- `npm run lint`, `npm run typecheck` pass; `npm test` **140/140**; `npm run build` pass; `npm run test:e2e` **15/15**.

### Live testnet evidence (through the app in a browser; every tx in docs/TESTNET.md)

- Maker uploaded 3 rows (recipient1 0.04, recipient2 0.06, recipient3 0.02 tUSDC), chose detailed posting, submitted (`create_run` 4oyBhx2k…); approver 1 (BtCpa3C4…) then approver 2 (2XfXfgzN…) approved in the browser; the worker process released (8M53CacB…) and paid 3 rows (Awh72Fb6…, BcXTo8SA…, Ee67Kff6…); the run shows **Paid** with explorer links.
- Balances changed by exactly the paid amounts: vault 0.82 → 0.70, recipient1 0.08 → 0.12, recipient2 0.09 → 0.15, recipient3 0.06 → 0.08 tUSDC. NEAR spent 0.00297.
- History shows the run in consolidated (1 line, `GJN-UP6YUKW8`, 0.12) and detailed (3 lines, `-0001..-0003`) views; reconciliation tile "Both views match"; company CSV and recipient-detail CSV downloaded.
- Screenshots (1440x900) `docs/screenshots/phase-13/`: 01 submit confirmation dialog, 02 approver review detail, 03 approval waiting for chain confirmation, 04 run while releasing, 05/05b paid run with explorer links, 06 history consolidated, 07 history detailed, 08 export area.

### Not done / limits

- Maker-release mode and the failure paths (unknown outcome, two workers, insufficient funding, failed transfer) are proven in integration tests with the contract-faithful stand-in and in the contract sandbox, not live in the app.
- The worker ran with `WORKER_MAX_ROWS=1` during the live proof so the "releasing" state could be captured; the default is 5 rows per tick.

---

## Phase 12 · Release worker and maker release (9 Nov 2026)

- `src/server/payouts/release.ts`: `requestRelease` (start_release; worker key in automatic mode, maker key in maker mode), `payRows` (one `pay_row` per row with its Merkle proof, rows in order, at most 5 per tick per run, tx hash stored before sending), `reconcileActions` (claimed-but-unsigned after lease expiry → not sent; otherwise the vault's `get_row` / `get_run` and the tx status decide: Paid → succeeded, Failed → proven failure, InFlight → wait, unknown → stays unknown), `workerTick`. Only proven failures are retried, at most 3 attempts with a 30 s backoff; a refused release (awaiting funding) is retried after 60 s. A run becomes Paid only when the vault reports it Paid; then company posting entries are created (`src/server/reports/entries.ts`, opaque references, totals checked, idempotent).
- `src/worker/index.ts` (`npm run worker`): separate long-running Node process (runs the TypeScript directly), 3 s interval, JSON log lines without personal data, graceful stop on SIGINT/SIGTERM. Smoke-tested: starts, reconciles, stops cleanly; no process left running.
- Maker release: `POST /api/runs/[id]/release` (maker owner, approved, maker-release snapshot) + "Release payments" money action dialog; the worker then pays the rows.
- Run detail derives **Awaiting funding** (approved, last release refused for funding) and **Needs attention** (releasing with a failed row).
- Tests `tests/integration/release.test.ts` (8): automatic release pays each row exactly once and Paid only from the vault (balances: vault −0.15, reserved back to 0; recipients +0.03/+0.07/+0.05); repeated ticks never pay again; **two workers at once** never double-pay; **interruption** between claim and signing resumes after the lease; **unknown-but-landed** reconciled from `get_row` without a second payment; **unknown-never-landed** stays unknown until proven, then retried once; **insufficient funding** → Awaiting funding → releases after top-up; **proven transfer failure** retried 3 times then Needs attention, no false Paid, no report entries; maker release (worker never releases a maker-release run). `npm test` 135/135.

---

## Phase 11 · Approver queues and review (9 Nov 2026)

- `decide` (lifecycle): only an approver snapshotted into the **latest** version, only while it waits for approval, once per approver, in the vault's order (approver 2 only after approver 1 is **confirmed on NEAR**); rejection needs a 3–500 character reason that stays off-chain. The event is stored `pending` with its tx hash before signing (approver's restricted key, mapped from the snapshotted chain account); a vault refusal is stored as `failed` with the error; reconciliation confirms from the vault's approval list.
- API `POST /api/runs/[id]/decision` (approver role, assignment checked in the service; maker/admin 404).
- UI: decision panel on the shared run detail (approve / reject dialogs naming version and exact total; reject reason field), approval map nodes "Waiting for NEAR" / "Approved" / "Rejected" / "After step 1", queue rows link to the run, reviewed list shows each approver's own decision (pending or confirmed) with its tx link.
- Tests `tests/integration/decisions.test.ts` (5): sequence order incl. "step 2 waits while step 1 is still pending on NEAR"; repeated, maker, admin and stale-version decisions refused; fresh approvals for a new version; rejection reason required, terminal, blocks release, never on-chain; refused decision recorded as failed; assigned approvers keep access, admin does not. `npm test` 127/127.

---

## Phase 10 · Read-only preview and immutable submission (9 Nov 2026)

- `src/server/runs/lifecycle.ts`: `submitRun` validates the whole draft, freezes it with `activeSnapshot` + `createVersion` (status `submitting`, deterministic chain run ID, salted review digest), then signs `create_run` with the maker's restricted key, **storing the tx hash before sending** and returning as soon as the tx is included. `reconcileVersion` advances only from what the vault reports (`get_run` must match root, total, row count and workflow revision; tx status for refusals), confirms approval events from the vault's approval list, links superseded versions. `cancelVersion` (maker, `cancel_run`). A retried submit while `submitting` reconciles instead of sending again; "Run already exists" is treated as a landed earlier attempt.
- Draft lock (`draftLock`): no edits or uploads while a version is submitting / waiting / approved / releasing or after payment; reopened after rejection, cancellation or a failed submission, for a new version that needs fresh approvals (`supersede` cancels a pending version atomically on-chain).
- UI: `/maker/runs/[id]/review` (exact totals, both posting previews with the selected one marked, approval path that will be snapshotted, 50-row paged read-only table) with the **submit confirmation dialog** (count, exact total, token, version, approval path, consequence; disabled while pending; uncertain outcome → open the run, never resubmit blindly). `/runs/[id]` run detail for the maker and assigned approvers: status, approval map with node states, proof timeline with explorer links, recipients with payout state, posting preview, earlier versions; auto-reconciles every 3 s while anything waits for NEAR. Migration `0005_status_details.sql` (reason for failed submissions, error for refused decisions).
- Tests: `tests/integration/submission.test.ts` (8) with a contract-faithful stand-in vault (`tests/helpers/fake-vault.ts`): create_run once with the frozen commitment; retry cannot create a second run; unknown-but-landed reconciles; never-landed becomes `submit_failed` only when proven; vault refusal recorded with reason; draft locked while live; cancel → new version with fresh approvals; supersede on-chain; maker-only. `npm test` 122/122.

---

## Phase 09b · Review fixes (9 Nov 2026)

1. **Manual builder fits at 1280 px and wider**: fixed table layout with an account column wide enough for `recipient1.gajian-payroll.testnet`; the currency (only `tUSDC` is allowed) moved into the "Amount (tUSDC)" header, its errors show under the amount; remove buttons inside the card; header labels may wrap. New e2e test at 1280x720 and 1440x900: account input `scrollWidth ≤ clientWidth`, remove button inside the card, card inside the 48 px gutter, no horizontal scroll in the table or the page.
2. **Operations transfer**: the vault retirement (`p02-drain`, 10 × 0.095 tUSDC back to the admin) is now `category = operations` (export script, `db/seed/testnet-history.json` re-exported and `--check` = matches the chain; migration `0004_testnet_category.sql` adds the column and corrects the existing row without rebuilding the table). It is listed in a separate "Operations transfers" section (maker, approver, admin) with its explorer link and excluded from every payroll count and total: payroll on testnet is now **0.23 tUSDC in 6 payouts across 3 paid runs** (was 1.18 / 16 / 4); the landing proof strip says "3 testnet runs".
3. **Review table**: "File row" column with the hint "row number in the uploaded file (the header is row 1), the same number used in error messages"; the error panel and the landing mock use "File row" too.

Evidence: `npm test` 114/114 (+ `tests/integration/testnet-history.test.ts`), `npm run test:e2e` 15/15 (+ builder fit test), screenshots in `docs/screenshots/phase-09b/`.

---

## Phase 09 · Template and upload service (9 Nov 2026)

### Built

- **Importer** `src/server/payroll/import.ts`: `.csv`/`.txt`/`.tsv`, ≤ 2 MiB, strict UTF-8 (BOM allowed), separator detected from the header row (comma, **semicolon** for regional Excel settings, tab), standard RFC 4180 parser (`csv-parse` 7.0.3: quotes, escaped quotes, quoted newlines), exact header set (missing / duplicate / unknown / empty columns reported), only trailing empty records ignored (an empty row in the middle is an error), ≤ 1,000 data records, per-row validation with the shared rules, run cap. Every problem carries the **spreadsheet row** (physical start line, header = row 1), the data-record number and the column. Comma decimals give "Use a dot as the decimal separator, e.g. 1500.50", including the case where an unquoted comma decimal split a comma-separated row. All-or-nothing: nothing is written unless the whole file passes.
- **Upload service**: `uploadToDraft` replaces the draft atomically (file name, SHA-256, source line per row) only for an accepted file under the expected revision; a rejected file changes nothing. `POST /api/runs/[id]/upload` (multipart, maker owner only; 413 over 2 MB), `POST /api/runs/[id]/posting-mode`.
- **Error report** `src/server/payroll/error-report.ts`: CSV with BOM, columns file / spreadsheet_row / data_row / column / problem, formula-injection escaping, no row contents. Downloaded from the error panel.
- **Excel template** `public/templates/gajian-payroll-template.xlsx` from `npm run templates:xlsx` (`scripts/generate-xlsx-template.mjs`, ExcelJS 4.4.0 dev-only): no macros, "Instructions" sheet (fill-in rules, dot decimals, Save As CSV UTF-8 or Text (Tab delimited), regional settings) and "Payroll" sheet with the six headers + the 1,000 sample rows; `near_account_id`, `amount`, `mobile_phone` are Text columns written as strings.
- **UI** (upload runs): downloads area (blank CSV, Excel template, sample CSV, sample TXT), drag-and-drop zone + file picker with limits up front, validating progress, accepted summary (rows, exact total, separator, duplicate-wallet note), error panel (count, first-error sentence, "previous version remains active" or "Nothing was imported", first 100 problems, full CSV report), read-only review table (50 rows per page in file order, source row numbers, First/Previous/page select/Next/Last, sticky header), posting mode + posting preview.

### Evidence

| Check | Result |
| --- | --- |
| `npm test` | **113/113**: `tests/integration/import.test.ts` (16): **the three sample files accepted with 56.690860 / 56.690860 / 10.000000 tUSDC** (carry-over from Phase 01), lines 2–1001; **1,000 rows accepted, 1,001 rejected**; **one invalid row after row 50** rejected with row 56 + column, no partial accept; **malformed CSV**; **quoted multiline field** (line numbers of later rows kept, line break in a name rejected, escaped quotes parsed); **wrong currency**; semicolon detection and comma decimals; split comma decimal; BOM/LF/TSV; header, empty, non-UTF-8, extension and size errors; trailing vs middle empty rows; duplicate wallet warning and run cap; error report escaping; Excel template (2 sheets, 1,001 rows, Text format `@` and string values for account/amount/phone, no `vbaProject`); upload API: accept → **failed replacement keeps the earlier draft** (same revision, 1,000 rows, source line 51 for record 50) → stale revision 409; approver/admin 403, manual run 422 |
| `npm run test:e2e` | **15/15** (screenshot specs excluded unless `SCREENSHOTS=1`): + upload flow in the browser (template link, accept 1,000 rows, 50 per page, row numbers 2 and 52, reject with 2 problems and "previous version remains active", error report download, reload keeps the accepted file) |
| `npm run screenshots` | 9 PNGs in `docs/screenshots/phase-09/` (workflow editor sequence + parallel, manual builder with one invalid row, upload drop zone, rejected file with error panel, accepted 1,000 rows + full first page with page controls, posting preview consolidated + detailed) |
| `npm audit --audit-level=high` | pass: 0 high/critical; production 0; 14 moderate dev-only (+ `uuid` via ExcelJS) |

---

## Phase 08 · Manual payroll builder (9 Nov 2026)

### Built

- `src/server/payroll/validate.ts` (pure, shared by browser, server and the Phase 09 importer): six required fields, NEAR account syntax (lowercase hint), name length/control characters, currency must be `tUSDC`, exact amount parsing with the active per-row cap and the comma-decimal hint, phone 7–15 digits with optional `+` (spaces, dashes, brackets ignored), email shape; run-level checks (≥ 1 row, ≤ 1,000 rows, per-run cap); exact total of valid rows; duplicate wallets flagged as warnings.
- `src/server/runs/draft-service.ts`: owner-only draft view, manual save (rows kept as entered, invalid ones included, optimistic revision, title and posting mode), and **explicit valid-subset confirmation**: the client sends exactly the row indexes to remove; the server removes them only if they equal its own set of invalid rows (otherwise 409, nothing changes).
- API: `POST /api/runs` (maker), `GET|PUT /api/runs/[id]/draft`, `POST /api/runs/[id]/draft/confirm-subset` (maker owner only; other makers get 404, approvers and admin 403).
- UI: `/maker/runs/new` (title, entry method, posting mode), `/maker/runs/[id]` manual builder (editable table, inline errors after touch, duplicate-wallet note, add/remove rows, sticky summary with counts and exact total, save state, "Continue with N valid rows" confirmation dialog listing the rows to remove, posting-mode cards with a live posting preview). Sidebar "New run" enabled; draft runs link to the builder.

### Evidence

| Check | Result |
| --- | --- |
| `npm test` | **97/97**: `tests/unit/validate.test.ts` (7: exact precision incl. 0.000001 and 0.999999, 7 decimals, comma decimal, zero, cap, exponent; all required fields; account/currency/phone/email/name rules; valid total without dropping rows; duplicate wallet = warning; run cap and 1,000-row limit) and `tests/integration/builder-api.test.ts` (3: create → save with an invalid row kept → stale revision 409 → mismatched removal sets 409 with all rows intact → exact confirmation removes only the invalid row; other maker 404, approver/admin 403; create validation and no manual edits to an upload run) |
| `npm run test:e2e` | 13/13: + manual builder flow in the browser (inline error, live posting preview, confirmation dialog, persisted after reload) |

---

## Phase 07 · Admin setup and approval map (9 Nov 2026)

### Built

- `src/server/chain/vault-client.ts`: NEAR testnet client (near-api-js 7.4.0, FastNEAR RPC). Signs with the role's restricted function-call key from `.env`, computes the tx hash locally and reports it **before** sending, classifies outcomes as success / proven failure / unknown, and looks up unknown outcomes. Testnet-only guard. A test-only stand-in can be installed (`setVaultClientForTests`, refuses outside `NODE_ENV=test`).
- `src/server/workflow/service.ts`: validation (template, distinct enabled approvers with signer accounts), optimistic concurrency against the revision the admin saw, refusal when the app and the vault disagree, `pending` row with the tx hash stored at signing, activation only after the vault's `get_workflow` matches, `failed` keeps the previous workflow active (retry allowed: migration `0003_workflow_retry.sql` makes revisions unique only among non-failed rows), `reconcilePendingWorkflow` for unknown outcomes, `activeSnapshot` for new versions. Audit events for requested / updated / failed.
- API `GET|POST /api/admin/workflow`, `POST /api/admin/workflow/reconcile` (admin only, same-origin + CSRF).
- `src/components/workflow-editor.tsx` on `/admin`: three template cards, reviewer selects (distinct, inline error), release-mode cards, live approval map + ordered text summary, consequence notice, pending/active/failed result with explorer link, "Refresh status" for pending changes.

### Evidence

| Check | Result |
| --- | --- |
| `npm test` | **87/87**: new `tests/integration/workflow.test.tsx` (9): activation only after confirmation + previous superseded; invalid inputs (same reviewer twice, maker as approver, missing reviewer, no-op) send nothing; vault rejection keeps the previous workflow and a retry works; unknown outcome stays pending, blocks further changes, reconciles to active; lost transaction reconciles to failed; stale page and app/vault drift refused; **a submitted version keeps its snapshot** after a change; maker and approver get 403 on GET/POST, bad CSRF 403, duplicate reviewers 422, admin 200; **a sequential snapshot can never render as parallel** (server-rendered approval map). DB test: a failed revision does not block a retry |
| `npm run test:e2e` | **12/12**: + editor test (live preview switches to "approve in any order" with the AND gate, same reviewer → inline error and Save disabled, unchanged → Save disabled) |
| **Live testnet** (production build, real admin key) | revision 4 (parallel, maker release) `9uFmgbRC…` and revision 5 (back to sequence, automatic) `2sQjKbtV…`, both confirmed by re-reading the vault; duplicate reviewers refused before signing |

---

## Phase 06b · Design review fixes (9 Nov 2026)

Andre's review points 1–8, all done:

1. **Sign-in without a role picker**: email + password only; the server picks the role and dashboard (all server checks unchanged). Demo mode shows a plain-text "Demo accounts" note (4 emails + shared password). Focus trap, Escape and focus return kept (e2e).
2. **Desktop first screen**: one centred container (max 1280 px) with 48 / 32 / 20 px gutters (desktop / tablet / phone) and one section rhythm (96 / 72 / 56 px). New e2e test asserts that at 1280x720, 1366x768, 1440x900 and 1920x1080 the headline, lead, both CTA buttons and the complete hero card are inside the first screen and at least 48 px from the edges, at 768 the copy and buttons fit, and no page ever scrolls horizontally. App pages use the same container and gutter.
3. **English only**: demo users Maya Maker, Alex Approver, Riley Reviewer, Adam Admin; all times in UTC with the label; sample generator uses international English names (55 rows ≈ 5.5 % with ", Jr.", ", CPA", … suffixes forcing CSV quotes) and 1,000 unique fictional UK numbers `+44 7700 900000`–`900999`, mixed formatting. Regenerated files: **totals unchanged** (56.690860 and 10.000000 tUSDC; the amount sequence is the same), new checksums in `docs/SAMPLE-DATA.md`. Fixtures, seed draft, tests and shared commitment vectors (review digest only) moved to English names and +44 numbers; D-028 now says "regional Excel settings".
4. **Sidebar app shell**: left sidebar from 1024 px (role items; later-phase items disabled with "Soon"), collapsing into a top row below 1024 px; NEAR testnet badge and user menu stay in the top bar.
5. **Demo data from real testnet runs**: `scripts/testnet/export-history.mjs` reads every transaction of the Phase 02 and Phase 04 runs from testnet RPC (signer, method, arguments, success, block time, NEP-141 transfer events), recomputes payout roots and checks them against the on-chain roots, and writes `db/seed/testnet-history.json` (`--check` re-verifies: **matches the chain**). Migration `0002_testnet_history.sql` adds immutable `testnet_runs`, `testnet_run_rows`, `testnet_run_events`; the seed imports 5 runs (4 paid, 1 rejected), 17 rows, 41 transactions. Shown with a **"Testnet run"** chip and explorer links. The rejected run shows "No reason recorded (scripted test run before the app existed)": no reason was invented.
6. **Amounts**: UI shows exact amounts with trailing zeros removed down to 2 decimals (`displayAmount`), tabular, right-aligned; 6 fixed decimals kept for CSV/on-chain views (`fixedAmount`). Tests: fixed examples + 2,000 pseudo-random values round-trip exactly (never rounds).
7. **Landing**: larger hero card (approvals + first payouts + progress, "Sample data"); slim proof strip with facts computed from committed evidence (vault ID; approvals enforced on-chain; 1,000-row upload; "0 double payments, 4 testnet runs, 2 repeats refused" computed from the history JSON); upload section with a static drop-zone mock of the real `gajian-payroll-sample-1000.csv` (size, 1,000 rows, exact total, validated), its first 5 rows with source row numbers, and the example error; "Try the demo" in the header; varied layouts (split, timeline, policy rows, centred ledgers) on alternating white / canvas / sky / navy backgrounds.
8. **Empty states** keep a next action where the role has one (maker: New run, disabled until Phase 08 with hint; approver: "See runs you reviewed").

Also: `rpc.testnet.near.org` now answers HTTP 429 ("deprecated, switch to FastNEAR"); all scripts and `.env.example` use `https://rpc.testnet.fastnear.com` (D-062). `.env` rewritten by `write-env.mjs`.

### Evidence

| Check | Result |
| --- | --- |
| `npm test` | 78/78 |
| `npm run test:e2e` | 11/11 (incl. first-screen test at 5 sizes) |
| `npm run screenshots` | 12 PNGs in `docs/screenshots/phase-06b/`, reviewed against points 1–8 (fixed: header links wrapping, 3-line headline at 1920, cramped run table, reviewed table overflow) |
| `node scripts/testnet/export-history.mjs --check` | matches the chain |
| `cargo test --lib -p gajian-vault commitment` | 4/4 (shared vectors) |
| lint, typecheck | clean |

---

## Phase 06 · Landing, login modal and role boundaries (9 Nov 2026)

### Built

- **Landing** (`src/app/page.tsx`), Rise-style product-led hero with a sample payroll run card (labelled "Sample data"), how it works, the three approval paths (approval maps), consolidated vs detailed posting comparison, live on-chain proof links (vault, token, first payout), prototype trust model, CTA band. Logo palette: navy `#0A3C90`, bright blue `#2577FE`, sky `#57B5FD`; Plus Jakarta Sans (self-hosted by `next/font`). Persistent **NEAR testnet** badge.
- **Login dialog** (`src/components/login-dialog.tsx`): native modal `<dialog>` + explicit Tab trap, Escape, focus restored to the opener, demo role picker (demo mode only), labelled fields with inline errors, live-region form errors, pending state.
- **Auth** (`src/server/auth/*`, `src/server/web/*`, `src/app/api/auth/*`): argon2id, DB sessions (hashed tokens, 8 h / 2 h idle), per-session CSRF token, origin checks, login rate limiting, audit events. Details: **`docs/SECURITY.md`**.
- **Authorization matrix** `src/server/auth/policy.ts` with maker ownership and assigned-approver checks; API routes `/api/me`, `/api/runs`, `/api/runs/[runId]`, `/api/admin/audit`, `/api/auth/login`, `/api/auth/logout`.
- **Role dashboards** (`src/app/(app)/…`): maker (runs table from the DB with exact totals, stats, active approval path, signer identity), approver (pending/reviewed queues from version snapshots, your step, highlighted node on the map), admin (active workflow, assigned reviewers with signer accounts, contracts, recent security events). 403 and 404 pages. Run builder (Phase 08) and workflow editing (Phase 07) are shown as disabled buttons with a note.
- **Headers**: nonce CSP via `src/proxy.ts`, locked-down API CSP, COOP/CORP. `next/image` replaced by a plain `<img>` for the logo because it injects an inline style the CSP blocks. Transparent trimmed logo `public/brand/gajian-logo-trim.png` generated from the original JPEG by `scripts/make-logo-png.py`.
- Build hygiene: `turbopackIgnore` on the runtime DB path (Turbopack had started tracing the whole project including `contracts/target`), `outputFileTracingExcludes`, one build worker.
- **Playwright** 1.64.1 (Chromium headless shell, user-level in `~/.cache/ms-playwright`, no sudo): `playwright.config.ts` runs the production build via `scripts/e2e-server.sh` with an isolated, freshly seeded DB in `.tmp/e2e` and stops it afterwards.

### Evidence (local only)

| Command | Result |
| --- | --- |
| `npm test` | **76/76**: + `tests/unit/policy.test.ts` (5), `tests/unit/contrast.test.ts` (16: every text/background token pair ≥ 4.5:1, focus ring and control border ≥ 3:1, sky never used as text), `tests/integration/auth-api.test.ts` (12: four roles land on their dashboard with HttpOnly/SameSite cookie; mixed-case email; same error for wrong password and unknown user; lockout after 5 failures with 429 + Retry-After even for the right password; cross-site and non-JSON login refused; 401 without session or with a forged token; admin 403 on `/api/runs`; recipient details only for the owner, 404 for unassigned approver and admin, assigned approvers after submission; admin-only audit endpoint, no PII in it; logout needs origin + CSRF and destroys the session) |
| `npm run test:e2e` (production build, Chromium) | **10/10**: strict nonce CSP header and **no CSP violations or page errors** on any page; dialog focus/Tab trap/Escape/focus restore; field and credential errors; maker, approver 1, approver 2, admin each sign in, land on the right dashboard and sign out; unauthenticated `/maker`, `/approver`, `/admin` redirect to sign-in with the dialog open; maker gets **403** on `/admin` and `/approver` and on `/api/admin/audit`; `/admin?role=admin` stays 403 for an approver |
| `npm run screenshots` | 9 PNGs in `docs/screenshots/phase-06/` (1440x900 landing + full page, login modal, maker, approver 1, approver 2, admin; 768x1024 landing + full page) |
| `npm run build` | pass; sampled peak memory of the build's node processes ≈ 675 MB, available memory never below 4.2 GB (GNU `time` reports 4.7 GB "max RSS" for the npm tree, which does not match the sampled resident memory) |
| `npm run lint`, `typecheck`, `samples:check` | clean |
| `npm audit --audit-level=high` | pass: 0 high/critical; 12 moderate dev-only (unchanged); production deps 0 |

### Not done / notes

- CI does not run Playwright yet (needs a browser download step); planned for Phase 15.
- Approver queues and maker runs show real DB data; there are no submitted versions until Phase 10, so queues are empty and the maker sees the seeded draft.

---

## Phase 05 · Persistent application model and demo fixtures (9 Nov 2026)

### Built

- `src/server/db/schema.ts` (Drizzle, SQLite): `users`, `sessions` (hashed tokens), `login_attempts` (hashed email/client), `audit_events`, `workflow_configs` (revisions mirroring the vault), `payroll_runs` (draft owner + optimistic `draft_revision`), `draft_rows`, `run_versions` (immutable snapshot: chain run ID, workflow snapshot, row count, total, payout root, review digest, server-only salt, source file digest), `version_rows`, `approval_events`, `payout_actions`, `report_entries`. Money = base units as canonical TEXT (custom `units` type ↔ bigint).
- Migrations `db/migrations/0000_init.sql` (generated, 20 CHECK constraints) and `0001_integrity.sql` (hand-written): versions and their rows immutable and never deleted; rows insertable only while `submitting`; terminal statuses frozen; one live approval per approver/version; one live payout action per version/kind/row (partial unique index); a succeeded action is final; one active workflow.
- `src/server/db/client.ts`: WAL, `busy_timeout` 5 s, foreign keys, migrations on open. `scripts/db.ts` + `npm run db:migrate | db:seed | db:status`.
- Transaction boundaries: `replaceDraft` (IMMEDIATE transaction, owner + revision check, all-or-nothing), `createVersion` (commitments + rows in one transaction, caps, deterministic `chain_run_id`), `claimPayoutAction` / `updatePayoutAction` (claim before any chain call; repeat returns the live action; new attempt only after `failed`; `unknown` is never re-claimed).
- `src/server/auth/password.ts`: argon2id via Node's built-in `crypto.argon2` (m=19456 KiB, t=2, p=1, PHC string), constant-time compare, dummy hash for unknown users.
- `src/server/db/seed.ts`: refuses unless `DEMO_MODE=true`; 4 demo users mapped to the testnet signer accounts, workflow revision 3 (two in sequence, automatic; tx of the live revision 3), one 3-row demo draft. Idempotent.
- `src/server/fixtures/payroll.ts`: deterministic valid rows (any size up to 1,000) and 10 invalid variants; CSV/TXT/semicolon serializer with BOM/CRLF options.

### Evidence (local only)

| Command | Result |
| --- | --- |
| `npm run db:seed` | migrations applied to `data/gajian.sqlite`; 4 users, 1 active workflow, 1 run with 3 draft rows; a second run reports nothing to do |
| `npm test` | **43/43** (17 new in `tests/integration/db.test.ts`): WAL + foreign keys; idempotent seed; argon2id hashes; demo-mode guard; email/chain-account uniqueness and lowercase CHECK; workflow shape + single active revision; rejection reason required; one live decision per approver; atomic draft replacement with stale-revision conflict, half-way failure keeps the previous draft, owner-only; numbered versions, deterministic chain IDs, fresh salt per version; immutable version data/rows, no deletes, no late rows, frozen terminal status; caps; payout claims (repeat, unknown never re-claimed, retry after failure, succeeded final); **two connections cannot both hold a live claim**, raw insert refused by the partial index; **restart persistence**; deterministic 1,000-row fixtures |
| `npm run lint`, `npm run typecheck` | clean (`erasableSyntaxOnly` now enforced) |

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
