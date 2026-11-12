# Demo video runbook (2 to 3 minutes)

One complete payroll moment on NEAR testnet: upload → review → submit → two approvals → automatic payout → Paid with an explorer link → history and export, then a short payroll-assistant moment and a short Payroll Advance scene with the camera face check (Phase 24). Total under 3 minutes (about 2:58 with the end card dropped). Every step is real (final vault `vault.sentfund-payroll.testnet`, real transactions, real database). Nothing is staged or mocked.

**Where to record:** on the **hosted site** (https://sentfund.my.id, live since 10 Nov 2026; current release **`f25e00b`** (Phase 26, 12 Nov 2026), read-only hosted check 21 passed; `docs/HOSTING.md`), so the video shows exactly what judges can open. **Fallback:** this local copy on http://127.0.0.1:8092 with the checklist below. The script is the same in both; on the hosted site the purple "Public demo on NEAR testnet" banner is visible, which is fine (say it once), and steps 1–4 of the checklist are replaced by: kill switch off, `/api/health` ok, vault at 2.00 tUSDC or less (`docs/HOSTING.md` step 9).

Run: **"November 2026 contractors"**, file `docs/video/november-2026-contractors.csv`, detailed posting, 3 recipients:

| Recipient | NEAR account | Amount |
| --- | --- | --- |
| Emma Clark | `recipient1.sentfund-payroll.testnet` | 0.08 tUSDC |
| Daniel Hall | `recipient2.sentfund-payroll.testnet` | 0.05 tUSDC |
| Grace Lewis | `recipient3.sentfund-payroll.testnet` | 0.07 tUSDC |
| **Total** | | **0.20 tUSDC** |

## What it costs

- **tUSDC:** 0.20 per take, paid from the vault. On 12 Nov 2026 the vault (`vault.sentfund-payroll.testnet`) holds **2.000000 tUSDC** (while the demo is public it stays at 2.00 or less; no transaction in Phases 24–26): enough for about **ten** takes, less any QA runs. The assistant moment creates a draft only and costs nothing.
- **NEAR (gas):** about 0.003 NEAR per take (Phase 13 measured 0.00297: create_run, two approvals, start_release, three payouts). The maker, approver and worker accounts each hold more than 0.37 NEAR, and the admin 0.48 NEAR. No faucet is needed.

## Pre-recording checklist

1. [ ] **Stop** the app and the worker if they run (`kill $(cat .tmp/review-server.pid)`, `kill $(cat .tmp/worker.pid)`).
2. [ ] **Clean database:** `npm run demo:reset`. The current database is moved to `data/backups/` and never deleted. Expect: `recipient check on testnet: Ready to receive tUSDC; Ready to receive tUSDC; Ready to receive tUSDC`, `fresh database …: maker@sentfund.my.id, app1@sentfund.my.id, app2@sentfund.my.id, admin@sentfund.my.id, workflow revision 3, recipient directory (3 testnet recipients + 1000 sample employees), "Pay registered recipients only" on, …, emma@sentfund.my.id, daniel@sentfund.my.id, grace@sentfund.my.id, Payroll Advance fields for 3 live recipients (net pay 0.10, maximum 0.30)` and `workflow mirrors vault.sentfund-payroll.testnet revision 3: two in sequence …, automatic release`.
2b. [ ] **Payroll assistant on:** `ANTHROPIC_API_KEY` is set in `.env` (the New run page shows "Payroll assistant" with "Model: claude-opus-5-5", not "off on this copy"). Without a key, skip the 2:30 segment. For voice, use Chrome or Edge and allow the microphone once; Chrome sends the audio to Google's speech service.
3. [ ] **Vault balance:** `node scripts/testnet/balances.mjs` → the `vault.sentfund-payroll.testnet` line shows at least **0.200000 tUSDC** per planned take. To top up (the admin mints test tUSDC and funds the vault; needs the operator keys on this machine): `node scripts/testnet/phase16.ts fund 0.60`.
4. [ ] **App and worker running:** `npm run build && npm run start` (http://127.0.0.1:8092) and, in a second terminal, `npm run worker`. The worker log shows `"event":"started" … "vault":"vault.sentfund-payroll.testnet"`. `curl -s http://127.0.0.1:8092/api/health` returns `"status":"ok"`.
5. [ ] **Three separate browser sessions** (sign-ins are per browser profile): Chrome profile A for the maker, profile B for approver 1 (`app1@sentfund.my.id`), profile C for approver 2 (`app2@sentfund.my.id`). Sign in to B and C beforehand (**Try the demo** → **Fill** on the `app1@…` / `app2@…` row → **Sign in**) and leave them on **Review queue**. Leave A on the landing page, signed out.
5b. [ ] **Payroll Advance scene:** a fourth profile D signed in as `grace@sentfund.my.id` (**Fill** on the `grace@…` row → **Sign in**; an employee with no advance yet), left on "My pay and Payroll Advance". The hosted release `f25e00b` has it. **Camera:** the recording computer has a front camera; in profile D the camera is already **allowed** for the site (click **Verify it's you** once beforehand, Allow, then **Cancel**); good light on your face, nobody else in view. You are not Grace, so the check will say so: that is the honest moment to show. On the hosted site **Continue as a demo** then sends the request flagged; on a local copy there is no override (end the scene on the refusal).
6. [ ] **Window size 1440x900**, zoom 100%, bookmarks bar hidden, notifications and extensions off. For example: `google-chrome --profile-directory="Profile 1" --window-size=1440,900 http://127.0.0.1:8092`.
7. [ ] **NearBlocks** testnet (https://testnet.nearblocks.io) reachable in profile A; the explorer link opens in a new tab.
8. [ ] The CSV file `docs/video/november-2026-contractors.csv` is ready in the file picker's folder.
9. [ ] All times on screen are UTC; say so once.

## Script (about 2:55; keep it under 3:00)

| Time | Window | Click / action | What appears on screen | Voice-over (suggested) |
| --- | --- | --- | --- | --- |
| 0:00 | A | Landing page, scroll a little | SentFund headline, "NEAR testnet" badge, proof strip | "SentFund: payroll with approvals that a NEAR contract enforces. Everything here runs on NEAR testnet with our test token tUSDC." |
| 0:10 | A | **Try the demo** → in **Demo accounts**, **Fill** on `maker@sentfund.my.id` (*Maker · Maya Maker*) → **Sign in** | The fields fill and the row is marked; then "My runs", empty | "I'm the maker in the finance team. The demo fills the sign-in for me." |
| 0:18 | A | **New run** → title `November 2026 contractors` → **Upload a file** → **Detailed** → **Create draft run** | Draft page with the drop zone and templates | |
| 0:28 | A | **Choose a payroll file** → `november-2026-contractors.csv` | "Accepted … 3 rows, exact total 0.20 tUSDC", review table with file rows 2–4 | "Every row is validated; one bad row would reject the whole file." |
| 0:40 | A | **Continue to review** | Exact total, approval path (Alex Approver → Riley Reviewer → automatic release), detailed posting preview | "The approval path is snapshotted with the run." |
| 0:50 | A | **Submit for approval** → dialog → **Submit 0.20 tUSDC for approval** | Run page: "Submitted: waiting for the vault…", then **Awaiting approval** with the `create_run` tx link | "The vault now holds a commitment to exactly these three payouts." |
| 1:02 | B | Review queue → open **November 2026 contractors** → **Approve version 1** → **Approve 0.20 tUSDC** | Timeline "Alex Approver approved (step 1) · Waiting for NEAR", then "Confirmed on NEAR" | "Approver 1 approves; the contract checks the signer and the order." |
| 1:18 | C | Review queue → open the run → **Approve version 1** → **Approve 0.20 tUSDC** | "Riley Reviewer approved (step 2)", status **Approved** | "Approver 2 can only act after approver 1." |
| 1:30 | A | Back to the run page (it refreshes itself) | **Releasing**: "Paid 1 of 3", "2 of 3"… then **Paid**, "3 of 3", "0.20 of 0.20 tUSDC confirmed", Recipients table with **Paid (UTC)** times and proof links | "The release worker pays each recipient in its own transaction. The run is Paid only when all three are confirmed and the total matches." |
| 1:55 | A | Click Emma Clark's proof link (opens NearBlocks) | NearBlocks: status Success, signer `worker.sentfund-payroll.testnet`, receiver `vault.sentfund-payroll.testnet`, method `pay_row`, token transfer 0.08 tUSDC to `recipient1.sentfund-payroll.testnet`, and the block time equal to the app's Paid (UTC) | "The paid time in the app is this block's time." |
| 2:10 | A | Back to the app → **History and reports** → **Consolidated** / **Detailed** | One line for the run vs one line per payout, same total 0.20, "Both views match" | "Accounting gets either one entry per run or one per recipient, and both reconcile." |
| 2:22 | A | **Exports** → **Company entries (accounting)** | CSV download | "The company export has no personal data. The recipient export is restricted to the maker and the approvers." |
| 2:28 | A | **New run** → Payroll assistant box → type (or click **Speak** and say) `Create a disbursement for the Sales division, 0.05 tUSDC each, called November commissions` → **Send** | Preview: "Sales division, 2 recipients, 0.05 tUSDC each, total 0.10 tUSDC", rows Daniel Hall and Emma Clark from the directory | "Or just ask. The assistant only turns my words into a draft request; the app picks the recipients from the admin's directory and checks every amount." |
| 2:38 | A | **Create draft** | Draft page: "Drafted by the payroll assistant from: …" with the two rows; not submitted | "It never submits or pays. I review and submit it, and the approvers see where it came from." |
| 2:42 | D | Grace's "My pay and Payroll Advance": amount 0.10, tick **I agree to these 6 salary deductions** → **Verify it's you** | The disclosure "Repaid like a loan", fee 0.002, you receive 0.098, six Estimated months; then the camera with the notice (images processed in memory, never stored; the result goes to the maker and the approvers) | "Employees can take a Payroll Advance: a salary advance repaid like a loan. Before the request goes out, they prove it's them." |
| 2:47 | D | **Start** → follow "Turn your head slowly to the left/right", then the other way (the order is random) | "This doesn't look like Grace Lewis." with the similarity; the yellow public-demo note and **Continue as a demo** → **Continue as a demo** → **Requested** | "A live camera check with a random head turn, matched on our server against the encrypted face template from the identity check. I'm not Grace, so it says no. The public demo lets me continue, flagged for the approvers." |
| 2:55 | A | **Payroll Advance requests** | Grace's request: the yellow "Face check: demo override …" line and the eligibility checks | "The maker and the approvers see the face check result; an ordinary one-row run through the same approvals." (Stop here; submitting it is optional and costs 0.098 tUSDC. Withdraw it as Grace afterwards.) |
| (cut) | A | (optional end card, drop it to stay under 3:00) | Text: repo link, `vault.sentfund-payroll.testnet`, "verify: npm run judge:verify (about 5 min; -- --full about an hour)", "next: Milestone 1, docs/roadmap" | "The vault's code can't change: it has no access keys. Everything is verifiable from the repository; a quick read-only check takes about five minutes. What a pilot needs is in the roadmap, with a key inventory." |

Not in the video, but in the repository for the description and the X post: the roadmap from demo to pilot (README "Roadmap: from demo to pilot", `docs/roadmap/`: gap analysis, QA Part A results with BUG-26-01..11, the Milestone 1 plan; planned, not built) and the key inventory (`docs/KEY-INVENTORY.md`). Do not show the roadmap as built.

If a step takes longer on testnet (a few seconds per transaction), or the face check takes its ~6 seconds of head turning, cut the waiting in editing; do not speed up or alter what the screen shows.

## After recording

- Stop the worker if no more takes are planned (`kill $(cat .tmp/worker.pid)`, or Ctrl+C in its terminal).
- Record the run's transaction hashes from the run page in `docs/TESTNET.md` (a "Demo video run" section) so the video's run is evidence too, and add the run to `docs/evidence/testnet-runs.json` if it should be re-checked by `npm run judge:verify`.
- Upload the video to YouTube (public or unlisted) and put its link in `docs/X-POST.md` and `docs/SUBMISSION.md`. Once the hosted demo is live, the X post links it too (`docs/X-POST.md`).
- The assistant draft from a take stays as an unsubmitted draft in "My runs" (drafts are never paid); `npm run demo:reset` before the next take clears it.
