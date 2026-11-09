# Next steps

Updated: Tue 10 Nov 2026 (WIB), after Phase 19 (recipient directory and payroll assistant). Schedule: ahead (feature-complete; deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB).

## Single next action

**Andre: human QA pass** of Phase 19 and the whole app with `docs/QA-HANDOFF.md` (A01–A10), on the running copy below. Then add `ANTHROPIC_API_KEY` to `.env` (the agent never reads it) and say **"do the Phase 19 live run"** (step 3: one assistant-drafted Sales run approved by both approvers in the browser and paid on testnet, plus screenshots 03–06).

Running for QA on http://127.0.0.1:8092, **fresh demo database** (`npm run demo:reset`; the previous database is in `data/backups/`, see `data/backups/RESET-LOG.jsonl`), final vault `vault2.gajian-payroll.testnet` (2.00 tUSDC):

- production server, PID in `.tmp/review-server.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)`
- release worker, PID in `.tmp/worker.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`

The server reads `.env` only at start: after you add the key, the server must be restarted to use it. The agent does that in step 3.

## Step 3 (when the key is in `.env`), for the agent

1. Restart the server (key is read at start); the worker keeps running. New run must show "Model: claude-opus-5-5", not "off on this copy".
2. `nice -n 19 npm run live:phase19 -- --grep p19-assistant` (screenshots 04, 05; no transactions).
3. `nice -n 19 npm run live:phase19 -- --grep p19-live-run` (**real transactions**: Sales division 0.03 × 2 = 0.06 tUSDC; screenshots 03, 06; IDs in `.tmp/live-exports/p19-assistant-run.json`).
4. `node --env-file=.env scripts/testnet/record-run-evidence.ts <runId> 19 "Payroll assistant draft for the Sales division, approved by both in the browser, paid (final vault)"`, then `npm run judge:verify`.
5. Record the transactions and NEAR spent in `docs/TESTNET.md`, update A10 in `docs/ACCEPTANCE.md`, BUILD-STATE, `docs/screenshots/phase-19/README.md`; commit `phase-19b: live assistant run`.

## Andre's open items (the agent does not do these)

From `docs/SUBMISSION.md`:
1. Human QA (above); add `ANTHROPIC_API_KEY` for the live assistant run.
2. Record the demo video (`docs/VIDEO.md`, under 3 minutes, includes a short assistant moment); upload to **YouTube**. Vault2 holds 2.00 tUSDC (about ten takes at 0.20).
3. One tag only: `hackathon-submission` (no pre-hackathon code, D-099); make the repository public.
4. Post on X (`docs/X-POST.md`, video link in the reply); NEAR mainnet payout address for the form; **Q-015 (a second project?) still open**.
5. Submit the form.
6. Check the GitHub Actions run for the phase-19 commit (not checked from this machine).

## State to know

- Hosting: not pursued (local-only + YouTube video). Codex QA: not scheduled.
- App and `.env` point at `vault2.gajian-payroll.testnet` (workflow revision 3: two in sequence, automatic release). Top up with `node scripts/testnet/phase16.ts fund <amount>` (≤ 10 tUSDC per call).
- Directory: "Pay registered recipients only" is on after `demo:reset`; Sales = Emma Clark + Daniel Hall, Operations = Grace Lewis (max 0.10 each); 1,000 sample employees in Engineering / Customer Support / Logistics.
- `npm run judge:verify` 117/117.

## Open items

- Push: deploy key works.
- Testnet NEAR: about 9.87 NEAR across our accounts (≈ 0.128 burned); master 0.46 NEAR.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has added ANTHROPIC_API_KEY to .env (never read or print it). Do "Step 3" in NEXT-STEPS: restart the server so it reads the key, run the Phase 19 live specs, record the run in TESTNET.md and judge:verify, update the docs, commit and push, leave server and worker running, and stop.
