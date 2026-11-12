# Milestone 1 "Safe to pilot": gap analysis (Step 0)

12 Nov 2026, Phase 26. The kit in this folder (PRD, tech spec, QA checklist, backlog) was written without seeing SentFund. This page checks its claims against the code at `main` and says, per requirement and ticket, what is **built**, **partly built** or **missing**. Nothing here is built yet; Steps 2–5 start after the hackathon, on the branch `milestone-1`, with a new vault account.

## Where the kit is wrong about SentFund

| Kit says | SentFund today (evidence) |
| --- | --- |
| The vault enforces approvals "but not *what* was approved at the row level"; "whoever executes the payout chooses the recipients and amounts" | **Wrong.** `create_run` commits a Merkle root over `(index, account, amount)` (`contracts/vault/src/commitment.rs`, `docs/COMMITMENTS.md`); `pay_row` pays a row only with a valid proof into the approved root, once (`InFlight`/`Paid` refuse a repeat), and never above the reserved total (`lib.rs` `pay_row`). Approvers approve that root. |
| "Insider edits the file after approval: possible" | **Wrong.** Submitted versions and rows are frozen by DB triggers, and the chain pays only the approved root. |
| "Maker approves own run: depends on the app" | **Wrong.** `validate_workflow` requires admin, maker, approvers and worker to be distinct accounts, and only assigned approvers can act (`require_actionable`). |
| "No amount limits and no kill switch" | **Partly wrong.** Per-row and per-run caps are on-chain (`max_row_amount`, `max_run_total`, checked at `create_run` and `pay_row`). The public demo has an app-level kill switch (`HOSTED_READONLY=true`). No on-chain freeze and no rolling window. |
| "Same file paid twice: refused" | **Partly.** A row can never be paid twice in one run. A second run with the same file is a new run and would pay again (no salt, no duplicate-root or file-hash refusal). |
| "Server breach redirects payouts: possible" | **True, differently.** A breach cannot change an approved run, but the server holds every role's restricted key (maker, both approvers, worker; `docs/KEY-INVENTORY.md`), so it could create, approve and pay a *new* run up to the vault balance (2 tUSDC, zero value). This is the main gap (F2). |
| Postgres, a `payees` table, U64 run IDs, `@simplewebauthn/server`, Node ≥ 22.18 | SQLite + Drizzle (hand-written triggers, D-023), a recipient directory (`recipients`), string run IDs `sfd-…-vN` (≤ 64 chars), no WebAuthn yet, Node 26.13.0. |

## Requirements F0–F7

| Req | Built | Partly | Missing |
| --- | --- | --- | --- |
| **F0** QA bugs | Part A automated (this phase, `qa-part-a-results.md`); 11 bugs found, 6 fixed (both High), 5 open for Milestone 1 | Human items (camera spoofing, light, skin tones) | The kit's "U1–U5" refer to a QA report not in the kit; we mapped them to A1-01/02/06/08 |
| **F1** Payout proofs | F1.3 proof per row, once, within the reserved total; F1.4 a failed transfer leaves the row `Failed` and retryable on-chain; F1.5 paid state from the vault's outcomes (`settle.ts`, "Paid only when the vault says so") | F1.4 the app retries 3× then shows "Needs attention"; later retries need the operator (`docs/RECOVERY.md`, BUG-26-05) | F1.1 per-run salt and on-chain `file_hash`; F1.2 duplicate-root refusal and `DUPLICATE_FILE`; F1.3 permissionless batches of 10 (ours: one row per call, worker or maker only) |
| **F2** Self-custody | Distinct on-chain accounts per role; sequential order and "assigned approver only" on-chain; every server key is function-call only | Keys are method-restricted, but the server holds all of them | F2.1 Wallet Selector / FastAuth signing; F2.2 owner multisig; F2.3 no fund-moving server key; F2.5 separate demo vault |
| **F3** Passkey step-up | Session + CSRF + origin checks; a camera face check gates one action (Payroll Advance, D-140) | — | WebAuthn registration, action-bound grants, counters, reset |
| **F4** Wallet changes | Recipient directory; "Pay registered recipients only" blocks rows not in the directory (`NOT_IN_DIRECTORY`); a recipient's account never changes in place | Identity check (KTP + face) before a recipient is Ready | Change flow with cooldown, notices to the old contact, on-chain payee registry and activation delay, approver warning |
| **F5** Limits and freeze | Per-row and per-run caps on-chain; one token only (`ft_on_transfer` refuses others) | App kill switch on the public demo | Rolling window, "Approved – release blocked", token allow-list, guardian freeze / owner unfreeze, limits UI |
| **F6** Screening | — | Readiness check: the account exists and is registered with tUSDC | Denylist + vendor, cache, review queue, fail closed |
| **F7** Pre-flight | Block-level file rules at upload and submit: account syntax (now refuses `.near`), amount format and 6 decimals, > 0, row and run caps, directory membership and active, total computed on the server | Duplicate wallet is a warning, not a block | Comparative rules (spike, outlier, new recipient, variance), stored reports, per-approver acknowledgements, the LLM approver note (our Claude assistant drafts runs, it does not review them) |

## Backlog tickets

| Ticket | Status | Note |
| --- | --- | --- |
| M1-001 | **Done** (Phase 26) | Part A run; human items listed |
| M1-002 | **Done for Critical/High found** | No Critical; both High (BUG-26-02, 04) fixed. Also fixed: BUG-26-01, 03, 08, 11 (Medium). Left for Milestone 1 (D-150): BUG-26-05, 06, 10 (Medium), 07, 09 (Low) |
| M1-003 | Partly | U1 wording and live stats exist (D-127). U4 email obfuscation: not seen locally (no Cloudflare), but **found on the hosted site** after the first fix release (React hydration error #418) and **fixed as BUG-26-11** (`no-transform` on pages; Cloudflare's feature stays on, D-150) |
| M1-010 | Partly | Our vault has proofs; vault-guard features need a v2 vault (new account) |
| M1-011 | Partly | Vault unit tests (49) and a near-sandbox test (`contracts/vault/tests`); no batch-gas or vault-guard tests |
| M1-012 | Partly | Commitment built and stored at submit; no salt, no `file_hash` on-chain |
| M1-013 | Partly | Worker: leases, unknown outcomes, bounded retries; no batches, no NEP-145 pre-check per row |
| M1-014 | Partly | Per-run paid/failed/pending from vault outcomes; no event indexer |
| M1-020, M1-021, M1-022, M1-024 | Missing | |
| M1-023 | Partly | Key inventory written (`docs/KEY-INVENTORY.md`); keys not removed |
| M1-030, M1-031, M1-032 | Missing | |
| M1-040 | Partly | Directory tables and admin UI exist (`recipients`, `/admin/recipients`) |
| M1-041, M1-042 | Missing | |
| M1-050, M1-051 | Missing (caps exist) | |
| M1-060, M1-061, M1-062 | Missing | |
| M1-070 | Partly | Upload validation is the block-level half |
| M1-071, M1-072 | Missing | |
| M1-080, M1-081 | Missing | |
| CI-001, CI-002 | Not started | Out of scope until after judging (Andre: nothing for Confidential Intents now) |

## Added by Andre's review (D-150)

Not in the kit's backlog; part of Milestone 1 (none of it is built, and nothing changes before judging):

| Item | What | Where it fits |
| --- | --- | --- |
| BUG-26-06 | The per-client sign-in limit takes the client address only from the proxy's own client-address header (for example Cloudflare's `cf-connecting-ip`, named by a Railway variable), never from `X-Forwarded-For` as the client sent it | F3 / Step 4 |
| QA-A5-05 | An alternative to the camera for a Payroll Advance: an admin verifies the employee in person and records it (who, when, how), with an audit entry; the maker and the approvers see it like a face check result | F3 / Step 4 |
| BUG-26-05 | Retries after 3 failed transfers without the operator | M1-013 |
| BUG-26-07 | A malformed percent-encoding answers 400, not 500/502 | Step 4 |
| BUG-26-09 | The face-attempt count holds under a parallel burst | Step 4 |
| BUG-26-10 | A well-formed account that does not exist is found before submit, not at payout | F6 / F7 |

## vault-guard vs our vault (tech spec §2.4)

| Aspect | Our vault (`vault.sentfund-payroll.testnet`, locked, no key) | vault-guard (kit) |
| --- | --- | --- |
| Roles | One configured account each: admin, maker, worker, 1–2 approvers (`update_workflow` by admin) | Owner + role sets (Admin, Maker, Approver, Guardian) |
| Run ID / snapshot | Maker-chosen string; workflow snapshot per run; revision check against what the maker reviewed | U64 counter; approvers listed per run |
| Commitment | Tagged leaf `GAJIAN:payout-leaf:v1`, `u32be` index, `u8` length, `u128be` amount; positional tree, odd node promoted; `review_digest` salted off-chain | `0x00`/`0x01` prefixes, 16-byte salt in every leaf, little-endian, sorted pairs |
| Duplicates | Run ID unique; supersede cancels the older version | Used-root set, `file_hash` |
| Payout | `pay_row` one row, worker (or maker in maker release), reservation at `start_release`, `InFlight` until the callback, admin `resolve_in_flight` after 120 blocks | `execute_payouts` ≤ 10 rows, anyone, un-mark on failure |
| Limits | Per-row, per-run | Per-row (recipient), per-run, rolling window |
| Freeze, payees, token list | None; single token | Freeze/unfreeze, payee registry with activation delay, allow-list |
| Partial runs | `close_partial` returns the unused reservation | — |
| Code changes | None possible (no access key) | — |

**Keep from ours:** reservation and balance books, `InFlight` with evidence-based resolution, `close_partial`, the workflow revision check, the "never redeployable" lock. **Take from vault-guard:** salt + used roots + `file_hash`, payee registry with delay, freeze, window limit, owner/guardian roles, permissionless proven execution (after a gas measurement).

## Porting notes

- **Database:** translate `001_milestone1_safe_to_pilot.sql` to Drizzle schema + a hand-written SQLite migration (no `gen_random_uuid`, `jsonb`, `text[]`, `timestamptz`; JSON as text, times as integer ms like our `ms()` columns; partial unique indexes work in SQLite; append-only via triggers as in `face_check_attempts`). The migrator runs all pending migrations in one transaction, so table rebuilds use the deferred-foreign-key pattern of migrations 0010/0011.
- **Payees:** extend `recipients` rather than add `payees`; a wallet change becomes a new row in a `wallet_change_requests` table pointing at the recipient. Keep D-131 (company outputs never name an advance employee).
- **Commitment:** keep one encoding shared by Rust and TypeScript with a shared vector (`tests/vectors/commitments.json`). Prefer a new tag `payout-leaf:v2` with the salt rather than the kit's untagged format; regenerate vectors.
- **Roles:** our `maker`, `approver`, `admin`, `employee` stay; add `owner` (multisig, on-chain only) and `guardian`. The worker becomes the untrusted executor.
- **Keys:** follow `docs/KEY-INVENTORY.md`; Wallet Selector for approvers removes the approver keys from the server.
- **Kit reference code** stays out of the app; it is not in this repository.
