# Next steps

Updated: Mon 9 Nov 2026, end of Phase 16. Schedule: ahead (kickoff target: feature-complete and rehearsed by Thu 12 Nov).

## Single next action

**Andre reviews Phases 13b–16** (stop requested; do not start Phase 17 until approved). Evidence: `docs/TESTNET.md` (Phase 16), `docs/BUILD-STATE.md`, `docs/ACCEPTANCE.md`; screenshots `docs/screenshots/phase-14/` (fixture data) and `docs/screenshots/phase-16/` (live). Read-only re-check: `npm run judge:verify` (93/93) and `npm run judge:deployment`.

Running for the review on http://127.0.0.1:8092 against the final vault `vault2.gajian-payroll.testnet` (database `data/gajian.sqlite`, demo logins in README):

- production server, PID in `.tmp/review-server.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)`
- release worker, PID in `.tmp/worker.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`

After approval: **Phase 17** (README, video runbook and release candidate) from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md.

## State to know

- App and `.env` point at `vault2.gajian-payroll.testnet` (workflow revision 3: two in sequence, automatic release). Vault2 holds 0.24 tUSDC; the admin can mint more test tUSDC and fund it with `node scripts/testnet/phase16.ts fund <amount>`.
- The Phase 04 vault is retired (0 tUSDC, still has its full-access key).
- The contract freeze ended with Phase 16; no contract changes are planned.

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: 9.87311 NEAR across our accounts (≈ 0.127 burned so far); master 0.46 NEAR. Enough for the demo video; no faucet needed.
- Optional for Phase 17: delete the retired vault's full-access key too (irreversible; not requested).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has reviewed Phases 13b–16. Stop the review server and worker (commands in NEXT-STEPS), then execute Phase 17 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md.
