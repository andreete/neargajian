# Next steps

Updated: Mon 9 Nov 2026, end of Phase 13. Schedule: on track.

## Single next action

**Andre reviews Phases 09b–13** (stop requested; do not start Phase 14 until approved). Screenshots: `docs/screenshots/phase-09b/` and `docs/screenshots/phase-13/`. Live evidence: `docs/TESTNET.md` (Phase 13) and `docs/BUILD-STATE.md`.

Running for the review on http://127.0.0.1:8092 (database `data/gajian.sqlite`, demo logins in README):

- production server, PID in `.tmp/review-server.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)`
- release worker, PID in `.tmp/worker.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`

After approval: **Phase 14** from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md.

## Phase 16 follow-ups (from Andre's Phases 02–04 review, D-050)

1. Fresh vault from the release commit with a reproducible Wasm hash; delete its full-access key; README commands to verify `code_hash` and the absence of full-access keys. Same for `tusdc` if the demo still works.
2. Rehearsal: in a multi-row run still `Releasing`, repeat `pay_row` on an already-paid row and record the on-chain rejection.
3. Label every sandbox-only recovery path in README and BUILD-STATE.

Contract freeze until then (D-051).

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: 9.89493 NEAR held across our accounts, ≈ 0.105 burned so far. Vault holds 0.70 tUSDC (enough for several more demo runs). No faucet top-up needed.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has reviewed Phases 09b–13. Stop the review server and worker (commands in NEXT-STEPS), then execute Phase 14 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md.
