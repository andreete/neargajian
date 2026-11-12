# PRD: Milestone 1, "Safe to pilot"

> **SentFund note (Phase 26):** copied from the milestone kit of 12 Nov 2026, unchanged except relative links. The kit was written without seeing SentFund: check it against [milestone-1-gap-analysis.md](milestone-1-gap-analysis.md). Links to the kit's reference code (`contracts/vault-guard`, `services/`, `db/migrations`, `test-vectors/`) do not resolve: that code is deliberately not in this repository.

| | |
|---|---|
| Status | Draft for review |
| Date | 12 Nov 2026 |
| Owner | _fill in_ |
| Engineering lead | _fill in_ |
| Related | [Tech spec](tech-spec-milestone-1.md) · [QA checklist](qa-checklist.md) · [Backlog](backlog.csv) · [Confidential roadmap](roadmap.md) |

## 1. Summary

SentFund works as a demo, but the server signs on behalf of users, and nothing stops a compromised server or insider from redirecting a payout. This milestone makes SentFund safe enough for a first paying pilot by meeting three conditions:

1. **No server key can move money to an unapproved place.** The vault pays only rows that prove into the file the approvers approved.
2. **The cheap, high-value fraud controls are in place:** wallet-change cooldown, spending limits, an emergency freeze, wallet screening and an AI pre-flight check.
3. **The open bugs from QA are fixed.**

The exit gate is passing a customer's security review.

## 2. Problem

| Today | Why it blocks enterprise buyers |
|---|---|
| The server signs for demo users with restricted testnet keys (stated on the landing page). | A security review will ask who can move funds. Today the answer is "our server", so a single breach drains the vault. |
| The vault enforces 1–2 approvals, but not *what* was approved at the row level. | Whoever executes the payout chooses the recipients and amounts. |
| A payout wallet can change right before payday. | This is classic payroll diversion fraud, and on-chain payments can't be reversed. |
| There are no amount limits and no kill switch. | One bad file or a compromised account can pay out the whole vault. |
| No sanctions or risk screening. | On-chain settlement has no recall window, so screening must happen before funds move. |
| Reviewers see a 1,000-row file and must spot problems by eye. | Errors and fraud hide in volume. |

## 3. Goals and non-goals

**Goals**

- G1. **Zero** server-held keys with the power to send funds anywhere other than approved rows.
- G2. **100%** of runs get a pre-flight report before submission and again at approval.
- G3. A changed wallet can't be paid until the cooldown ends, enforced both on-chain and in the app.
- G4. Spending limits and a freeze are enforced by the contract, not just the UI.
- G5. Pass a pilot customer's security review (Gate 1 in the plan).

**Non-goals (later milestones)**

- Confidential payroll (M2; see the [roadmap](roadmap.md)).
- Multi-chain and multi-token payouts, split pay and off-ramps (M2).
- HRIS and accounting integrations, SSO/SCIM (M3).
- Rework of the Payroll Advance feature (M2), apart from its bugs, which are covered in QA.

## 4. Users and roles

| Role | Who | New or changed in M1 |
|---|---|---|
| **Owner** | The company's multisig or DAO account | **New.** Sets roles, limits and allowed tokens, and is the only role that can unfreeze. |
| **Admin** | Payroll or HR operations | Changed: manages the payee directory and approves wallet changes. |
| **Maker** | Payroll preparer | Changed: submits a run *commitment*. A maker can never approve their own run. |
| **Approver** | Finance lead or CFO | Changed: signs approvals with **their own** NEAR account, after a passkey step-up. |
| **Guardian** | Security or ops on-call | **New.** Can freeze the vault, but cannot unfreeze it. |
| **Executor** | Anyone, usually SentFund's worker | **New.** Triggers payouts. Has no special trust, because every row must prove into the approved root. |
| **Employee** | Recipient | Changed: changes their wallet through a verified flow with a cooldown. |

## 5. Requirements

Priority: **P0** = must ship for the pilot, **P1** = should ship, **P2** = nice to have. Acceptance criteria are tested by the matching IDs in [qa-checklist.md](qa-checklist.md).

### F0. Fix QA bugs (P0)

- Run [QA checklist Part A](qa-checklist.md#part-a-exploratory-bug-hunt-on-the-current-app) on the current app and fix every Critical and High finding.
- Landing-page items U1–U5 from the QA report (payout count wording, stale stats, shared demo state, Cloudflare email obfuscation, copy).
- **Acceptance:** no open Critical or High bugs; Part A re-run is clean. (QA-A-*)

### F1. Payout proofs: commit, approve, execute (P0)

As an approver, I want what I approve to be exactly what gets paid, so that no one can change recipients or amounts after my approval.

| ID | Requirement | Priority |
|---|---|---|
| F1.1 | After file validation, the server builds a Merkle commitment over `(index, account, amount)` with a random 16-byte salt, and the maker submits only `root`, `salt`, `total`, `recipient_count` and `file_hash`. | P0 |
| F1.2 | The vault refuses a root that was already submitted. The pre-flight check also flags a re-used file hash. | P0 |
| F1.3 | Anyone can call `execute_payouts` with up to 10 rows plus their proofs. The vault pays a row only if it proves into the approved root, hasn't been paid, and keeps the run within its declared total. | P0 |
| F1.4 | A failed transfer (for example, a recipient not registered with the token, NEP-145) un-marks the row so it can be retried, and the app shows it as "failed – action needed". | P0 |
| F1.5 | The app shows paid, failed and pending counts per run, read from vault state and events, not from the server's memory. | P1 |

**Acceptance:** QA-F1-01 … QA-F1-10.

### F2. Self-custody signing and no fund-moving server keys (P0)

| ID | Requirement | Priority |
|---|---|---|
| F2.1 | Approvers sign `approve_run` and `reject_run` from their own NEAR account, through NEAR Wallet Selector (hardware wallets supported) **or** FastAuth. FastAuth is free on testnet; mainnet requires an application. | P0 |
| F2.2 | The vault owner is a multisig or DAO account. Role, limit, token and unfreeze changes need that multisig. | P0 |
| F2.3 | Remove every server-held key that can call fund-moving methods. The executor needs only gas, and its key can call `execute_payouts`, which is safe by design. | P0 |
| F2.4 | The vault checks that the predecessor is a designated approver on the run, that it isn't the maker, and that it hasn't already approved. For "two in sequence", the first approver must act first. | P0 |
| F2.5 | Demo mode can keep server-signed demo accounts, but only on a separate demo vault, never on a pilot vault. | P1 |

**Acceptance:** QA-F2-01 … QA-F2-07.

### F3. Passkey step-up for sensitive actions (P0)

| ID | Requirement | Priority |
|---|---|---|
| F3.1 | Users register at least one passkey (WebAuthn, user verification required). Admins, approvers and makers must have one before they can act. | P0 |
| F3.2 | A step-up is required before: approve, release, wallet change, Payroll Advance, role change. The challenge is **bound to the action and its parameters**, for example `{runId, root}`. | P0 |
| F3.3 | Grants are single-use, user-bound and valid for 5 minutes. Challenges are valid for 2 minutes. | P0 |
| F3.4 | Store the signature counter, and flag the credential when the counter goes backwards. | P1 |
| F3.5 | Recovery: an admin can reset a user's passkeys only with the owner multisig's approval, and every reset is logged. | P1 |

**Acceptance:** QA-F3-01 … QA-F3-06.

### F4. Wallet-change protection (P0)

| ID | Requirement | Priority |
|---|---|---|
| F4.1 | Wallets change only through the directory, never by editing the payroll file. A row whose wallet differs from the directory **blocks** the run. | P0 |
| F4.2 | Flow: request, then passkey re-verification by the employee within 24 hours, then a **72-hour cooldown**, then active. The old wallet keeps getting paid during the cooldown. | P0 |
| F4.3 | Send notices to the employee's **existing** contact and to admins when a change is requested, verified, cancelled and activated. | P0 |
| F4.4 | On verification, call `register_payees([new])`. The vault refuses to pay an unregistered wallet, or one still in its on-chain activation delay. Keep the app cooldown and the on-chain delay equal. | P0 |
| F4.5 | The employee or an admin can cancel a change any time before it becomes active. | P0 |
| F4.6 | Changes in the last 30 days are shown to approvers as a warning. | P1 |

**Acceptance:** QA-F4-01 … QA-F4-09.

### F5. Spending limits and emergency freeze (P0)

| ID | Requirement | Priority |
|---|---|---|
| F5.1 | The vault enforces a per-run maximum (checked at submit and release), a per-recipient maximum (checked at payout) and a rolling-window maximum (checked at release). | P0 |
| F5.2 | If a limit blocks the release on the last approval, the approval still stands. The run stays "Approved – release blocked", and the maker can retry once the window allows. | P0 |
| F5.3 | Only allow-listed tokens can be used. | P0 |
| F5.4 | Guardians and the owner can freeze the vault, and only the owner can unfreeze it. A freeze stops submit, approve, release and execute. | P0 |
| F5.5 | The admin UI shows the current limits, the amount used in the window, and a large "Freeze vault" button for guardians. | P1 |
| F5.6 | Suggested pilot defaults: per-recipient = 2× the largest salary, per-run = 1.2× the usual payroll, window = 1.5× the usual payroll per 24h. Set them per customer. | P1 |

**Acceptance:** QA-F5-01 … QA-F5-08.

### F6. Wallet risk and sanctions screening (P0)

| ID | Requirement | Priority |
|---|---|---|
| F6.1 | Screen a wallet when it's added or changed, and screen all wallets in a run at pre-flight. Cache results for 24 hours. | P0 |
| F6.2 | The provider interface supports an internal denylist plus at least one vendor. Confirm with the vendor that it covers NEAR accounts. | P0 |
| F6.3 | "Blocked" blocks the run. "Review" needs a compliance sign-off that is recorded and named. If a provider is down, the result is "review" (fail closed). | P0 |
| F6.4 | Unscreened wallets block the run. | P0 |

**Acceptance:** QA-F6-01 … QA-F6-06.

### F7. AI pre-flight check (P0)

| ID | Requirement | Priority |
|---|---|---|
| F7.1 | Deterministic rules produce findings with a severity of block, warn or info (full list in the tech spec, §6). Block findings stop submission. Each warning must be acknowledged by **each** approver before they can approve. | P0 |
| F7.2 | An optional LLM writes a note of up to 5 bullets for approvers. The model sees only codes, counts, row numbers and totals: no wallet addresses or names. It **never** changes the status. If it fails or times out after 8 seconds, show the rule findings instead. | P1 |
| F7.3 | Pre-flight runs before submission and again when an approver opens the run, in case the directory or screening changed in between. | P0 |
| F7.4 | Store each report, the note and each acknowledgement for the audit trail. | P0 |

**Acceptance:** QA-F7-01 … QA-F7-10.

## 6. Key flows

**Maker:** upload file → validate → pre-flight (blocking issues must be fixed) → commitment built → passkey not needed → `submit_run` signed by the maker's wallet.

**Approver:** open run → pre-flight re-runs → read the AI note and findings → acknowledge each warning → passkey step-up bound to `{runId, root}` → wallet signs `approve_run`. For one approver, or the last of two in sequence, release happens automatically if limits allow.

**Payout:** the worker reads the released run, builds batches of up to 10 rows with proofs, and calls `execute_payouts`. It watches the `payout_failed` events and alerts on them. When each failure is fixed (for example, a missing token storage registration), it retries the failed rows.

**Employee wallet change:** request → passkey → 72-hour cooldown with notices → active.

## 7. Success metrics

| Metric | Target for the pilot |
|---|---|
| Server keys able to move funds to unapproved places | 0 |
| Runs with a stored pre-flight report at submit and at approval | 100% |
| Payouts that don't match an approved row | 0 (the contract makes this impossible; monitor `payout_failed` and refusals) |
| Median time from "submitted" to "released" | Track it; no target in M1 |
| Blocking findings caught before submission | Track it, as a signal that pre-flight is worth having |
| Pilot security review | Passed |

## 8. Rollout

1. **Testnet:** deploy the new vault as a separate account, for example `vault-v2.sentfund-payroll.testnet`. Keep the current vault for the public demo until v2 is stable.
2. **Internal dogfood:** run 3 payroll cycles with synthetic data through every approval path, including deliberate failures. Use QA Parts B and C.
3. **Security review:** an external review of the contract and the step-up flow, plus the QA Part C checklist.
4. **Pilot:** one customer on mainnet with low limits. Use real USDC or USDT only once the token decision is made, since tUSDC is testnet-only.

Feature flags: `preflight_llm_note`, `passkey_stepup_required`, `wallet_cooldown_hours`, `screening_vendor`.

## 9. Dependencies

- NEAR Wallet Selector and/or FastAuth (mainnet FastAuth requires an application).
- A screening vendor contract with confirmed NEAR coverage.
- A multisig or DAO account for the vault owner, on testnet and mainnet.
- An LLM provider for the note (optional).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Employees' wallets aren't registered on the token contract (NEP-145), so payouts fail | Check and prompt at wallet registration; the worker retries; show "action needed" |
| Gas per batch: 10 rows × about 20 Tgas each, well under the 300 Tgas limit | Keep `MAX_BATCH = 10`; measure on testnet |
| The cooldown delays a new hire's first payout | Register wallets during onboarding, at least 72 hours before the first pay date; the pre-flight check warns |
| Approvers find step-ups annoying | One step-up per approval, not per page; 5-minute grant |
| A screening vendor lacks NEAR coverage | Denylist plus manual review for the pilot; pick a vendor before mainnet |

## 11. Open questions

1. Which multisig or DAO product will hold the owner role on mainnet?
2. Which stablecoin will the pilot use on mainnet (USDC or USDT on NEAR)?
3. Which screening vendor, and does it cover NEAR named accounts?
4. Is FastAuth acceptable to pilot customers, or do they require hardware wallets for approvers?
5. Default limits per pilot customer: who sets them, and how are they reviewed?
