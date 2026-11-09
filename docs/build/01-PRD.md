# Gajian product requirements

Version 1.0 · 9 November 2026 · Hackathon prototype

## 1. Product and outcome

Gajian helps a finance team prepare, approve, and pay a batch of workers to their NEAR wallets, then reconcile the payouts against company reporting. The company can record one consolidated entry or one entry per payout without changing how much any recipient receives.

The prototype succeeds when a judge can take a sample file from upload through contract-controlled release, verify payouts on NEAR testnet, and reconcile the report. Build from a new repository with one engineer. Target Real-World Money (`realworld`).

| ID | In scope |
| --- | --- |
| P01 | Public landing page, login modal, role dashboards and isolated demo accounts |
| P02 | Admin approval workflow templates and release policy |
| P03 | Manual single/multi-row entry, Excel template, CSV/TXT upload up to 1,000 rows |
| P04 | All-or-nothing file validation, ordered read-only review and versioning |
| P05 | Authorized summary and detail review, approval, rejection and resubmission |
| P06 | Funded custom NEAR testnet contract, approval enforcement, direct wallet payouts and proof |
| P07 | Consolidated and detailed posting, reporting and role-scoped history |
| P08 | Reproducible repository, demo fixtures, operator instructions and judge checklist |

Defer bank payouts, conversion/FX, mainnet, 1Click, gasless claims, recipient portal, tax, scheduled runs, HR features, external accounting integrations, and workflows with more than two approvers.

### Draft defaults to confirm

Use one synthetic organization, English UI, one USDC-style test token (`tUSDC`, six decimals, zero real value), and direct transfer to NEAR testnet wallet accounts. Use a pre-funded vault, one macro-free `.xlsx` template with CSV export instructions, and a per-run posting-mode selector. The primary demo pays two or three wallets. A separate 1,000-row fixture verifies upload, review and reporting scale. Treat any full-size testnet payout as an additional result requiring evidence. Use four distinct users and four distinct testnet signer accounts for maker, Approver 1, Approver 2 and a dedicated release worker. Admin setup uses a separate demo login. No self-approval or approver impersonation in the app.

## 2. Roles and access

| Role | Default dashboard | Allowed |
| --- | --- | --- |
| Visitor | Landing | Public product information, demo access, sign in |
| Maker | My payroll runs | Create and preview own runs, submit, view own recipient details after payout, release own eligible runs in maker-release mode |
| Approver 1 / 2 | Review queue | Review summary and details of assigned runs before and after execution; approve or reject when the configured step is actionable |
| Admin | Workflow settings | Configure active template, assigned approvers and release mode for future runs; view company-level reporting |
| Release worker | Internal process | Resume eligible automatic releases and reconcile transaction outcomes; no UI session or authority to approve |

Apply authorization on server reads, writes, exports and file-derived responses. A role label or hidden button alone provides no protection. Other users and unassigned approvers cannot retrieve recipient details. App reporting privacy covers private identity/contact fields and recipient-to-payment links; public on-chain transfers may expose destination IDs and amounts.

## 3. User journeys

### J01 · Discover and sign in

The visitor sees what Gajian does, a synthetic preview of an approval map and payroll total, and a persistent **NEAR testnet** label. **Try the demo** opens an accessible login modal. Credentials can be filled from a role selector for the isolated demo. On sign-in, the server chooses the dashboard from the session role. Support keyboard focus, escape, visible field errors, and sign-out.

Seed `maker@gajian.com`, `app1@gajian.com`, `app2@gajian.com`, and proposed `admin@gajian.com` with example password `12345678` only in demo mode. Store password hashes. Show the credentials in the demo only. Use synthetic data and capped test funding. Separate local judge credentials from any deployment secrets.

### J02 · Set the approval path

Admin selects **One approver**, **Two in sequence**, or **Two in parallel**, assigns distinct reviewers, and chooses **Automatic release** or **Maker releases**. The approval map previews step order and the release gate before save. In sequence, step 2 cannot act before a finalized step 1 approval. In parallel, either may act first and both are required. Automatic release is the recorded demo default. Settings are snapshotted at submission, including assigned reviewer identities. Existing submitted versions retain their rules if admin changes settings later.

### J03 · Prepare a run manually

Maker selects a posting mode, adds one or more rows, and enters NEAR account ID, receiver name, currency, amount, mobile phone and email. Validate each row and show errors inline. The maker can edit rows and explicitly remove invalid rows or confirm submission of the clearly identified valid subset. No silent omissions. Show the resulting count and exact total before submission. Store only the confirmed subset in the approved snapshot.

### J04 · Upload, validate and review

Maker downloads the Excel template, fills it, exports CSV, then uploads CSV or delimited TXT. Validate the entire file before accepting any payout rows. Any invalid row rejects the file as a whole. Show accepted/failed status, source row and field for each issue, and a bounded preview of the error list. Fix imported values in the source file and re-upload. Keep accepted rows read-only. A failed replacement does not change a previously accepted version and the UI identifies the active file.

On success, display filename, count, exact total and the first 50 data records in original order. Paginate in the same order and keep source-row references visible. Display the company posting preview beside or above the review table. Maker confirms submission for approval. Preserve the immutable review snapshot, payout manifest and posting mode. A corrected run uses a new version with fresh approvals; retain earlier review history for authorized users.

### J05 · Review, approve or reject

The assigned approver opens a review item, sees the batch total, count, version, posting mode and approval map, and can inspect all details in source order. The action identifies the exact version. An approval only advances the UI after contract confirmation. Rejection requires a reason and invalidates the version for release on the contract. The maker can copy the rejected run into a new draft and, for uploaded rows, replace it with a corrected file. Each revision repeats approval. A stale, duplicate, wrong-role or out-of-sequence action cannot advance the run. Lock a submitted version; to replace a pending version without rejection, first cancel it on-chain as maker before any release and confirm cancellation.

### J06 · Release, pay and reconcile

The final approval makes a funded run eligible. The automatic worker requests release in automatic mode. In maker-release mode the maker clicks **Release payments** and sees the total and count before confirming. The contract verifies the approved version, roles, and available funding and reserves the full amount before payout. For insufficient funds, show **Awaiting funding**. Automatic mode retries eligibility after confirmed funding; maker mode requires the maker's action when funded.

Release executes payouts in bounded steps. The recipient gets a transfer to their NEAR wallet. The run progresses from **Releasing** through **Paid** only when all transfers are confirmed. For some successful and some failed/unresolved rows, show progress and a **Needs attention** state when intervention is necessary. Clearly label confirmed, pending and failed amounts. Never convert an RPC timeout into proof of failure or successful payment. Retry only rows proven failed, against the original approved destination and amount. Preserve successful rows and attach explorer links to confirmed transfers.

### J07 · Review transaction history and export

Show company entries using the posting mode locked at submission. **Consolidated** shows one company entry per fully paid run. **Detailed** shows one company entry per paid recipient line of a fully paid run. Company-visible entries carry opaque references, amount, currency, date and status; omit recipient name, contact data, wallet and recipient-specific explorer links from company-wide views. Expose those fields only to authorized maker and approvers. Show pending or partial runs separately with confirmed totals. Export fully paid company entries for accounting, with a privileged recipient-level CSV as a separate export. Compare reports against the same payout records. For 1,000 payouts of 1,000,000 units each, both views reconcile to 1,000,000,000; the detailed view has 1,000 rows, the consolidated view one. This is an arithmetic example independent of the demo token.

## 4. Data and validation rules

- Canonical headers in order: `near_account_id,receiver_name,currency,amount,mobile_phone,email`. Support UTF-8 CSV (optional BOM, CRLF/LF) and tab-delimited UTF-8 TXT. Parse quoting and quoted newlines with a standard parser. Reject missing, duplicate or unknown headers, malformed quoting, empty files, and files over 1,000 data records or 2 MiB. Ignore only trailing empty records. Preserve data-record ordinal and starting physical line number for diagnostics.
- Require all six fields. Treat phone as text with a leading `+` permitted, 7–15 digits after normalizing spaces and dashes. Validate email shape and length. Trim external whitespace. Validate wallet ID syntax with the NEAR SDK rules and ensure accounts used for the live demo exist and are token-registered before payout. Avoid 1,000 individual RPC checks on upload. Duplicate wallet IDs are allowed as separate labeled payments, with a review warning; a repeated row can still be separately paid if explicitly approved.
- Validate configured currency, positive decimal amount of up to six fractional digits, and bounds for contract arithmetic and configured demo caps. Use exact integer base units end-to-end; serialize JSON amounts as strings. Recompute totals on the server. Display amounts with currency. Report totals use exact decimal strings. Escape spreadsheet formulas in exported user-controlled text while retaining numeric columns as numeric values.
- Keep immutable submitted version metadata, ordered normalized rows, original file digest, posting mode, workflow snapshot, approval/rejection events, payout state, and transaction references. Do not store original upload binaries by default. Never put names, phone numbers, emails, raw files, sessions or secrets on-chain or in logs.

## 5. Contract and integration requirements

1. Enforce maker and assigned approver account IDs, approval order, terminal states, release mode and funding at the contract. Separate app sessions from chain authority. For the prototype, the server can relay authenticated actions using distinct, restricted testnet signer credentials. Document server trust, restrict signing methods and arguments, and exclude mainnet configuration. Contract verifies the predecessor account. Use a distinct worker signer for automatic release. Bind workflow updates to a separate operator-controlled testnet admin signer, and show a workflow as active after the authorized update confirms. At run creation the contract copies its active workflow revision into the run. Reject a submission if the workflow changed after the maker's review and request fresh confirmation.
2. Bind approvals to an immutable version ID, posting/approval policy snapshot and payout commitment. Prefer a deterministic Merkle root over ordered indexed `(rowIndex, wallet, baseUnits)` leaves and a salted digest of private review data. Specify canonical encoding, domain separation, odd-leaf behavior and shared Rust/TypeScript test vectors. The contract verifies row proofs and rejects a changed destination, amount or index. Guard sum, row count and per-row status against overpayment or duplicated payouts. App records the private salt off-chain. The contract never needs contact fields.
3. Credit the vault only from the configured test token through its authenticated transfer callback. Reserve the approved total atomically from the available vault balance when beginning release. Deduct successful amounts from the reservation. Keep pending/failed amounts reserved for controlled reconciliation. No release before approval or after rejection/cancellation. Fund/register the contract and demo recipient accounts before recording. Document any unfinished partial-run recovery operations.
4. Use bounded payout calls, starting with one recipient per call, then tune only after measuring. Store a stable row identity and mark in flight before initiating a transfer. A private callback records success or proven failure. A failed or missing callback remains unresolved until reconciled. Do not retry an uncertain transfer automatically. Workers resume from durable state and read final chain outcomes; duplicate calls cannot double-pay. For a 1,000-row batch use pagination and persisted progress rather than one large transaction.
5. Application action writes and chain reconciliation must tolerate retries and restarts. Persist a deterministic version or action ID before requesting a chain operation. Authorize every mutation; refetch status from chain before attempting retries. Show final evidence only from the correct network and verified transfer result. Explain any unresolved recovery limitation in the README.

## 6. Acceptance and QA

| ID | Pass condition |
| --- | --- |
| A01 | Landing, keyboard-operable login modal, and four role dashboards work from seeded demo accounts. Unauthorized reads, mutations and exports fail, including direct URL/API access. |
| A02 | All three approval templates and both release policies are selectable; tests prove sequence ordering, either order in parallel, both approvals required, immutable workflow snapshot and wrong-role rejection. |
| A03 | CSV/TXT imports 1,000 valid rows, rejects 1,001, displays first 50 in source order, and rejects an invalid row after position 50 with no partial accept. Manual valid subset requires explicit confirmation. |
| A04 | Rejection/cancellation prevents release. Re-upload produces a new version, invalidates old actions, and preserves reviewed history. Repeated or stale approval cannot add approval credit. |
| A05 | Testnet evidence shows funded custom contract and verified transfers to two or three wallets. Tests reject early release, wrong signer, insufficient funding, and tampered payout proof. |
| A06 | Successful payout is not repeated after retry, repeated release, or restart. Failure and unknown outcomes remain distinguishable. Paid is reachable only after confirmed payouts match the approved count and total. |
| A07 | Identical fixture data produces one consolidated entry and N detailed entries with identical totals. Both reports reconcile. Recipient details and links remain role-scoped after execution. No private fields appear on chain or in public company CSV. |
| A08 | Fresh checkout can reproduce the documented flow. README states network, token, signers/trust, limits, commands and expected results, testnet contract address and proof when available. License and secret scan pass. |

Track import validation time and payout progress with synthetic fixtures. Aim for a complete guided demo within ten minutes. Report measured timings and limits rather than making untested capacity claims. Use unit tests for exact money/import/reporting, integration tests for roles and persistence, Rust or sandbox tests for contract paths, and an app smoke test for the happy path. Record video after a fresh-checkout rehearsal.

## 7. Submission

Confirm a public repo with a license, reproducible README, dependencies and AI assistance disclosed, public tagged X demo post with video, Real-World Money selection, and the team's mainnet NEAR prize address. The prototype uses testnet. Deadline is **15 November 2026 at 06:59 WIB**. Check the official guide before submission. [Organizer guide](https://nearhackathon.com/HACKATHON.md) · [Real-World Money](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md)
