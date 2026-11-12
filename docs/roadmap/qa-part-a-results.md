# QA Part A results (milestone kit, Step 1)

12 Nov 2026, Phase 26. Checklist: [`qa-checklist.md`](qa-checklist.md) Part A. Severity and the bug template are the kit's.

**Where each item ran**

- **Hosted (read-only):** `tests/live/qa-part-a.spec.ts` against https://sentfund.my.id. It signs in and reads, and tries mutations that are refused before anything happens. No NEAR transaction, no upload, no approval, no change to the shared demo data. `npx playwright test -c playwright.hosted-live.config.ts tests/live/qa-part-a.spec.ts`
- **Local:** the same spec against a local production build (`QA_BASE_URL=http://127.0.0.1:8092 …`, fresh demo DB). Plus `tests/integration/qa-part-a.test.ts` (15 tests, real route handlers, contract-faithful stand-in vault, temporary DB) and the existing suites named below. Upload and approval items run only locally, because on the public demo they would change shared data or send transactions.
- **Human:** needs a person, a camera or a real device. Listed at the end.

**Runs**

- Hosted before the fix release (release `81417b3`): **7 of 11 passed**. Failed: A1-01 (BUG-26-01); A7-04 (no HSTS, BUG-26-08); A7-03 (a test expectation, corrected: a 400 for an empty body is also a refusal); A7-07 (malformed percent-encoding gave 502, BUG-26-07).
- Local after the fixes: **11 of 11**; `qa-part-a.test.ts` **15 of 15**.
- Hosted after the first fix release (`878fb65`): **20 of 21** (with `hosted-check.spec.ts`); A1-01 failed on console errors (BUG-26-11, fixed in the second release).
- Hosted after the second release: see "Hosted re-run after the release" at the end.

## Results

| Item | Result | Evidence |
| --- | --- | --- |
| A1-01 No sideways scroll at 375 px; no console or hydration errors | **Fail → fixed** (BUG-26-01, BUG-26-11) | Hosted: scroll width 484 at 375 px. Fixed and checked locally at 320–640 px (`tests/e2e/auth.spec.ts` "Phase 26 (QA-A1-01)"). After the first fix release the hosted page showed the kit's U4: Cloudflare Email Address Obfuscation rewrote the seven demo emails, its decoder script was blocked by our CSP, and React reported hydration error #418 (BUG-26-11). Locally there were no console errors. |
| A1-02 All 7 demo accounts readable and sign in | Pass | Phase 25 Fill buttons; `hosted-check.spec.ts` checks all seven. |
| A1-03 Generic error; rate limit | **Fail → fixed** (BUG-26-02); BUG-26-06 open | The generic message is the same for a wrong password and an unknown email (hosted and local). The limit is 5 failures per email and 20 per client in 15 min. A burst of parallel guesses got past it; fixed, `qa-part-a.test.ts` (10 parallel → 5 checked). |
| A1-04 Back after sign-out; cookie flags | Pass | `sentfund_session` is `HttpOnly; SameSite=Lax; Secure` on HTTPS. After sign-out, `/maker` → sign-in and `/api/runs` → 401 (hosted and local). |
| A1-05 Two roles, two profiles | Pass | The employee gets 404/403 on the maker's runs, drafts and pages (hosted and local). Note: two tabs of the *same* browser share one cookie, so the last sign-in wins and the first tab's mutations get 403 `bad_csrf`. That is normal browser behaviour. |
| A1-06 Proof links and stats | Pass | Every explorer link is `https://testnet.nearblocks.io/…`. Stats are live per copy (D-127). `judge:verify` re-checks the runs. |
| A1-07 Header anchors | Pass | Every `#anchor` has its target. |
| A1-08 Shared demo, reset path | Pass (documented) | Shared on purpose. Reset: `demo:reset` locally; hosted by a new `DEMO_RESET_TOKEN` and a redeploy (NEXT-STEPS). No visitor button. |
| A2-01 1,000-row sample, 56.69086, 20 pages | Pass | `import.test.ts` "exact totals"; `e2e/upload.spec.ts`. |
| A2-02 1,001 rows, header-only, empty refused | Pass | `import.test.ts`. |
| A2-03 TXT, semicolons, comma decimal | Pass | `import.test.ts`; `qa-part-a.test.ts` (`0,05` in a TXT → dot hint, never 5 or 0). |
| A2-04 BOM, CRLF/LF, trailing newline, blank lines | Pass | `import.test.ts`; `qa-part-a.test.ts` (no trailing newline; BOM + CRLF keeps row 3). |
| A2-05 Amount formats | Pass | `money.test.ts`, `validate.test.ts`, `qa-part-a.test.ts`. 7 decimals, `1e-2`, `+0.05`, `1,000.00` and `-0.05` are refused; `0.050000` and a trailing space are exact. |
| A2-06 Zero and negative | Pass | As above; the file-level negative case is in `qa-part-a.test.ts`. |
| A2-07 Account IDs | **Fail → fixed** (BUG-26-04) | `alice.near` was accepted on testnet. Now refused everywhere rows are validated (upload, builder, directory). The other cases already passed; 64-hex implicit accounts are accepted. |
| A2-08 Nonexistent account flagged before payout | **Partly** (BUG-26-10, open) | The public demo submits only directory recipients that are "Ready" (the account exists and is registered with tUSDC). A local copy with that setting off finds out at payout (the row fails, is retried, then "Needs attention"). |
| A2-09 Duplicates flagged | Pass | Duplicate wallet = warning on both lines (`import.test.ts`, `qa-part-a.test.ts`). |
| A2-10 Formula injection escaped | Pass | `reports.test.ts`, `import.test.ts`, `qa-part-a.test.ts` (`=`, `+`, `-`, `@`). |
| A2-11 HTML shown as text | Pass (code review) | React escapes all text; no `dangerouslySetInnerHTML` or `innerHTML` in `src`. |
| A2-12 10 MB file; renamed .xlsx | Pass | The route refuses > 2 MB by `content-length` with 413 before reading the body. A renamed .xlsx gets "not UTF-8 … Save As CSV UTF-8" (`qa-part-a.test.ts`). |
| A2-13 Windows-1252 | Pass | Clear "not UTF-8" message (`qa-part-a.test.ts`). |
| A2-14 Re-upload, immutable history | Pass (by design) | A draft can be replaced, and each submitted version is frozen and listed. Uploading the same file again is allowed; a duplicate-file refusal is M1 F1.2. |
| A2-15 Row and column in errors | Pass | `import.test.ts` (row 56 / record 55; "Row 61" e2e). |
| A2-16 Server computes the total | Pass | The upload takes only the file; the total comes from the rows and the payout tree (`regression.test.ts`). |
| A3-01 One approver → auto release | Pass (local) | `regression.test.ts`, `release.test.ts`. |
| A3-02 Sequence order, UI and API | Pass (local + on-chain) | `decisions.test.ts`, `regression.test.ts`. The vault refusal is on testnet (`judge:verify --full`, "Approver 2 can act only after approver 1 approved"). |
| A3-03 Parallel; only the maker releases | Pass (local + on-chain) | `regression.test.ts`, `release.test.ts`, `boundaries.test.ts`; Phase 22 run `p22-par-…`. |
| A3-04 Maker can't approve | Pass | `decisions.test.ts`, `boundaries.test.ts`. On-chain the maker is never an approver (distinct accounts). |
| A3-05 Rejected can't be released | Pass | `decisions.test.ts`. |
| A3-06 Double approve | Pass | `qa-part-a.test.ts`: two at once → one approval, the other "already decided". |
| A3-07 Parallel approvals at the same moment | Pass | `qa-part-a.test.ts`. |
| A3-08 Policy change after submit | Pass | `workflow.test.tsx` (snapshot per version; vault revision check). |
| A3-09 Removed approver | Pass (by design) | A role change or disabled user is refused at once. An approver removed from the *workflow* keeps the runs already assigned in their snapshot, on-chain too (A3-08 depends on it). |
| A3-10 Review in file order | Pass | `regression.test.ts`. |
| A3-11 Approval transactions on NearBlocks | Pass | `npm run judge:verify` (signer of every approval). |
| A4-01 X/X paid, exact on-chain sum | Pass | `judge:verify` (every paid row and its `ft_transfer` event); `release.test.ts`. |
| A4-02 No double payment | Pass | `regression.test.ts`, `release.test.ts`, `db.test.ts`. On-chain, a paid row is refused. |
| A4-03 Recipient not registered on tUSDC | **Partly** (BUG-26-05, open) | The failure is visible ("Needs attention", row `Failed` on-chain, retryable by the contract). The app retries 3 times; after that the retry is an operator step (`docs/RECOVERY.md`). |
| A4-04 Vault balance too low | Pass | "Awaiting funding" before any payout (`release.test.ts`; live Phase 16d). |
| A4-05 Browser closed mid-payout | Pass | Payouts run in the worker, not the browser; restart and unknown-outcome tests in `release.test.ts`. |
| A4-06 Posting modes, IDs, Excel | Pass (Excel opening: human) | `reports.test.ts`. CSVs are UTF-8 with BOM and CRLF. |
| A4-07 UTC, month label | Pass | `advance-terms.test.ts` (`2026-11-30T23:59:59Z` → November). |
| A4-08 1,000-recipient run on testnet | **Blocked** | It needs 56.69 tUSDC (the vault holds 2) and about 1,000 transactions on the shared vault. Local 1,000-row runs pass in the stand-in vault. |
| A5-01 Employee sees only their own data | Pass | Hosted and local spec; `boundaries.test.ts`. |
| A5-02 Employee history matches the chain | Pass | Phase 23 runs in `judge:verify`. |
| A5-03 Advance limits and precision | Pass | `advance.test.ts`. |
| A5-04 Repayment line, both posting modes | Pass | `advance.test.ts` (deduction, approver view, both CSVs). |
| A5-05 Consent before the camera; another way if declined | **Partly**: consent and notice come first (Pass); **no other way** to request (decision needed) | By design (D-140, D-141): an advance needs the face check. The kit expects an alternative. The employee's normal pay is unaffected. |
| A5-06 Spoofing (photo, screen, video, virtual camera) | **Human** | D-144 already says a replayed video in the right order, a deepfake stream or a 3D mask may pass. |
| A5-07 Denied camera, low light, glasses, skin tones | Denied camera: Pass (`face-camera.spec.ts`, hosted check). The rest: **human** | |
| A5-08 Face data storage | Pass | Template only, AES-256-GCM (`face-check.test.ts`); no images stored; no logging of face data (code review). |
| A5-09 Advance only to the verified wallet | Pass | `advance.test.ts`. The destination is the directory account, which never changes in place. |
| A5-10 Face attempts rate-limited | Pass; BUG-26-09 open | 5 attempts and 20 challenges per hour. A parallel burst can reach the 20-challenge bound. |
| A6-01 Role change in open sessions | Pass | `qa-part-a.test.ts` (role from the DB on every request). There is no role-management UI. |
| A6-02 Settings apply to new runs only | Pass | `workflow.test.tsx`, `submission.test.ts`. |
| A6-03 Audit log | Pass | `directory.test.ts`, `advance.test.ts`, `/api/admin/audit`. |
| A6-04 Admin can't edit a submitted run | Pass | `db.test.ts` (triggers), `boundaries.test.ts`. |
| A7-01 IDOR sweep | Pass | `boundaries.test.ts` (122 refusals, every route × principal). Hosted read-only sweep with real run IDs. |
| A7-02 401 / 403 | Pass | Hosted and local spec; `boundaries.test.ts`. |
| A7-03 CSRF | Pass | No token → 403 `bad_csrf`; foreign origin → 403 `bad_origin` (hosted and local). Sign-in checks the origin. |
| A7-04 Security headers | **Fail → fixed** (BUG-26-08) | CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, Referrer-Policy and nosniff were present; HSTS was missing. Now sent on every response (`e2e/auth.spec.ts` "QA-A7-04"). |
| A7-05 No key material in client JS | Pass | Hosted: every script loaded by the landing, maker, approver, admin and employee pages. Local: all 25 built chunks. No key patterns, no secret names, no source maps. |
| A7-06 Every access key; server keys function-call only | Pass as worded; see the note | `docs/KEY-INVENTORY.md`. The app and Railway hold only function-call keys. But **together** the server's role keys can create, approve and pay a new run (up to 2 tUSDC, zero value). That is the M1 F2 gap. |
| A7-07 No stack traces | Pass; BUG-26-07 open | No stack in any error page or API error (hosted and local). A malformed percent-encoding answers 500 (502 behind the proxy) instead of 400. BUG-26-03 fixed. |
| A7-08 `npm audit` | Pass | Production deps: 0. Dev deps: 13 moderate, 0 high, 0 critical. |
| A7-09 Logs | Pass (code review) | No `console.*` in `src`. The worker logs event names, counts and short error messages. The audit keeps an email-HMAC prefix only. |
| A8-01..06 UI, accessibility, devices | Not run in this phase (scope A1–A7) | Existing evidence: keyboard and focus e2e (`signin-fill.spec.ts`), `contrast.test.ts`, the 1024 px layout sweep. Safari, Firefox and phones are human. |

## Bugs

| ID | Severity | Item | Summary | Status |
| --- | --- | --- | --- | --- |
| BUG-26-01 | Medium | QA-A1-01 | The landing page scrolls sideways on phones (hero card chip, upload card, posting tables) and the header's "Try the demo" is cut off | **Fixed** |
| BUG-26-02 | **High** | QA-A1-03 | A parallel burst of sign-ins passed the 5-per-email and 20-per-client limits (the check ran before the slow password check, the record after) | **Fixed** |
| BUG-26-03 | Medium | QA-A4/A7-07 | The maker's release returned a bare 500 when this copy has no maker signer or the vault was switched | **Fixed** |
| BUG-26-04 | **High** | QA-A2-07 | A mainnet `.near` account was accepted on testnet (it would fail only at payout) | **Fixed** |
| BUG-26-05 | Medium | QA-A4-03 | After 3 failed transfers the app stops retrying; the retry needs the operator | Open (RECOVERY.md; M1-013) |
| BUG-26-06 | Medium | QA-A1-03 | The per-client sign-in limit uses the first `X-Forwarded-For` entry, which the client controls. The per-email limit still holds off the public demo; the demo passwords are public | Open: needs a trusted-proxy setting (decision) |
| BUG-26-07 | Low | QA-A7-07 | A malformed percent-encoding in a path answers 500 (502 at the proxy), not 400; no stack trace, the server stays up | Open |
| BUG-26-08 | Medium | QA-A7-04 | No HSTS header | **Fixed** |
| BUG-26-09 | Low | QA-A5-10 | A parallel burst of face attempts can pass 5 per hour, bounded by 20 single-use challenges | Open |
| BUG-26-11 | Medium | QA-A1-01 (kit U4) | Cloudflare Email Address Obfuscation rewrote the demo emails on the landing page (Fill rows) and the admin's directory pages; the injected decoder script was blocked by the CSP; React hydration error #418 | **Fixed** (pages send `Cache-Control: … no-transform`, which Cloudflare honours) |
| BUG-26-10 | Medium | QA-A2-08 | Off the public demo, a well-formed account that does not exist is found only at payout | Open (M1 F6/F7) |

### Bug reports (kit template)

```
ID: BUG-26-01   Severity: Medium   Checklist item: QA-A1-01
Role + account: signed out   Browser/device: Chromium 375x812, 390x844   Time (UTC): 2026-11-12 07:13
Steps: 1. Open https://sentfund.my.id at 375 px wide. 2. Scroll sideways.
Expected: the page fits the screen.
Actual: page scroll width 484 px; header "Try the demo" ends at 396 px; the upload card is 464 px wide.
Evidence: tests/live/qa-part-a.spec.ts (QA-A1-01) on release 81417b3.
Fix: src/app/globals.css (upload card grid column, dropzone wrap, header gap, "Sign in" hidden under 480 px, total row wrap, posting tables); test tests/e2e/auth.spec.ts (320–640 px).

ID: BUG-26-02   Severity: High   Checklist item: QA-A1-03
Role + account: signed out, app1@sentfund.my.id   Browser/device: API   Time (UTC): 2026-11-12 07:25 (local)
Steps: 1. Send 10 sign-in requests with wrong passwords for one email at the same moment.
Expected: at most 5 are checked; the rest get 429.
Actual: all 10 were checked (the limit was read before the argon2 check and the attempt written after it).
Evidence: tests/integration/qa-part-a.test.ts fails on the old src/server/auth/login.ts and passes on the new one.
Fix: the limit check and a provisional failed attempt are one immediate transaction before the password check; success updates it.

ID: BUG-26-03   Severity: Medium   Checklist item: QA-A4-04 / QA-A7-07
Role + account: maker@sentfund.my.id   Browser/device: API   Time (UTC): 2026-11-12 (code review + local test)
Steps: 1. On a copy without the maker's signer key, approve a maker-release run. 2. POST /api/runs/<id>/release.
Expected: 409 with "This copy of SentFund has no signer keys …".
Actual: an unhandled DomainError → 500 "Internal Server Error".
Evidence: tests/integration/qa-part-a.test.ts (BUG-26-03).
Fix: src/app/api/runs/[runId]/release/route.ts maps domain errors like every other route.

ID: BUG-26-04   Severity: High   Checklist item: QA-A2-07
Role + account: maker   Browser/device: importer   Time (UTC): 2026-11-12 (local)
Steps: 1. Upload a row with near_account_id alice.near.
Expected: refused on testnet.
Actual: accepted; the payout would fail at release.
Evidence: tests/integration/qa-part-a.test.ts (A2-07).
Fix: src/server/near-account.ts isMainnetAccountId + message; src/server/payroll/validate.ts.

ID: BUG-26-05   Severity: Medium   Checklist item: QA-A4-03
Role + account: worker   Browser/device: n/a   Time (UTC): code review
Steps: 1. Pay a row to an account not registered with tUSDC. 2. Register it more than ~90 s later.
Expected: the app can retry the row.
Actual: after 3 attempts (30 s apart) the run stays "Needs attention"; retry or close_partial is an operator step (docs/RECOVERY.md).
Evidence: src/server/payouts/release.ts MAX_ROW_ATTEMPTS; tests/integration/release.test.ts (bounded retries).

ID: BUG-26-06   Severity: Medium   Checklist item: QA-A1-03
Role + account: signed out   Browser/device: API   Time (UTC): code review
Steps: 1. Send failed sign-ins with a different X-Forwarded-For value each time.
Expected: the per-client limit (20 / 15 min) still applies.
Actual: each value counts as a new client. The per-email limit (5 / 15 min) still applies off the public demo; on the public demo it is per email and client, and the passwords are public there.
Evidence: src/server/web/api.ts clientKey().

ID: BUG-26-07   Severity: Low   Checklist item: QA-A7-07
Role + account: signed out   Browser/device: curl   Time (UTC): 2026-11-12 07:19
Steps: 1. GET https://sentfund.my.id/api/runs/%E0%A4%A
Expected: 400.
Actual: 502 (hosted), 500 "Internal Server Error" (local); no stack; health ok afterwards.
Evidence: tests/live/qa-part-a.spec.ts (QA-A7-07).

ID: BUG-26-08   Severity: Medium   Checklist item: QA-A7-04
Role + account: signed out   Browser/device: curl   Time (UTC): 2026-11-12 07:10
Steps: 1. curl -I https://sentfund.my.id/
Expected: Strict-Transport-Security.
Actual: missing (HTTP → 301 at Cloudflare only).
Fix: next.config.ts sends max-age=31536000; includeSubDomains on every response; tests/e2e/auth.spec.ts.

ID: BUG-26-09   Severity: Low   Checklist item: QA-A5-10
Role + account: employee   Browser/device: API   Time (UTC): code review
Steps: 1. Request several challenges, then send their face checks in parallel.
Expected: at most 5 attempts per hour.
Actual: the count is read before the analysis and written after it, so a parallel burst can reach the 20-challenge bound.
Evidence: src/server/identity/face-check.ts runFaceCheck.

ID: BUG-26-11   Severity: Medium   Checklist item: QA-A1-01 (kit U4)
Role + account: signed out; admin@sentfund.my.id   Browser/device: Chromium 375x812   Time (UTC): 2026-11-12 07:45
Steps: 1. Open https://sentfund.my.id (release 878fb65) with the console open.
Expected: no console errors.
Actual: "Loading the script '…/cdn-cgi/scripts/…/email-decode.min.js' violates … script-src" and "Minified React error #418". The HTML had 7 __cf_email__ links (the Fill rows); /admin and /admin/recipients had them too.
Evidence: tests/live/qa-part-a.spec.ts (QA-A1-01) on 878fb65.
Fix: src/proxy.ts adds no-transform to the pages' Cache-Control (Cloudflare docs: Email Obfuscation does not apply with Cache-Control: no-transform); e2e header test.

ID: BUG-26-10   Severity: Medium   Checklist item: QA-A2-08
Role + account: maker   Browser/device: local copy, "Pay registered recipients only" off   Time (UTC): code review
Steps: 1. Upload a row for a well-formed account that does not exist. 2. Submit and approve.
Expected: flagged before payout.
Actual: found at payout (Failed, retried, Needs attention). The public demo refuses the submit unless the directory recipient is Ready.
Evidence: src/server/recipients/readiness.ts, src/server/recipients/directory.ts hostedSubmitProblem.
```

## Needs a human

- **A5-06** spoofing: a printed photo, a phone screen with a photo, a video of the employee, a virtual camera (OBS). Record which pass. Locally a real face never matches the synthetic employees, so use the public demo's mismatch path, or verify yourself as a new recipient on a local copy.
- **A5-07** low light, glasses and headwear, a range of skin tones: note the false rejects.
- **A4-06** open both CSVs in Excel (Windows and Mac) and in LibreOffice.
- **A8-03 / A8-06** an approver on a phone; Safari and Firefox.
- **A1-08** what another tester's actions do to your view (two people at once).

## Hosted re-run after the release

(Filled in after the release below.)
