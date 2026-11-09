# Next steps

Updated: Mon 9 Nov 2026, after Phase 17 and the first half of Phase 18. Schedule: ahead (kickoff target: feature-complete and rehearsed by Thu 12 Nov; Codex QA on Fri 13 Nov).

## Single next action

**Andre reviews Phases 16b, 17 and 18a, then runs the independent Codex QA** with `docs/QA-HANDOFF.md` (release candidate `7483f51`). Do not start the second half of Phase 18 until the QA report (`docs/QA-REPORT.md`) is in.

Running for the review on http://127.0.0.1:8092 with a **clean demo database** (`npm run demo:reset`; the previous database is at `data/backups/`, see `data/backups/RESET-LOG.jsonl`) against the final vault `vault2.gajian-payroll.testnet`:

- production server, PID in `.tmp/review-server.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)`
- release worker, PID in `.tmp/worker.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`

## Andre's open items (the agent does not do these)

From `docs/SUBMISSION.md` (deadline **2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB**):
1. Record the demo video (`docs/VIDEO.md`). The vault holds 0.24 tUSDC, enough for one take; top up for more.
2. Optional: hosting at gajian.my.id (`docs/HOSTING.md`, plan only; say "prepare hosting" to start).
3. Tags `pre-hackathon` (on `ba205f7`) and `hackathon-submission`; make the repository public.
4. Post on X (`docs/X-POST.md`); NEAR mainnet payout address for the form; confirm Q-015 (a second project?).
5. Submit the form.
6. Check the GitHub Actions run for `7483f51` (not checked from this machine).

## State to know

- App and `.env` point at `vault2.gajian-payroll.testnet` (workflow revision 3: two in sequence, automatic release). Vault2 holds 0.24 tUSDC; fund with `node scripts/testnet/phase16.ts fund <amount>`.
- Paid times are block times from the chain (Phase 16b). Evidence: `npm run judge:verify` (115/115).
- The retired vault keeps its full-access key (Andre's decision).

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: about 9.87 NEAR across our accounts (≈ 0.127 burned); master 0.46 NEAR.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has the Codex QA report in docs/QA-REPORT.md. Stop the review server and worker (commands in NEXT-STEPS), then do the second half of Phase 18: fix reproducible findings in priority order, rerun the affected acceptance checks, update BUILD-STATE with proof and remaining issues.
