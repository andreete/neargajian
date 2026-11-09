# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

Phases 06b and 07 are done. Continue with **Phase 08** (manual builder) and **09** (template and upload), then take the Phase 09 screenshots, start the production build for Andre's review and STOP (do not start Phase 10).

## Phase 16 follow-ups (from Andre's Phases 02–04 review, D-050)

1. Fresh vault from the release commit with a reproducible Wasm hash; delete its full-access key; README commands to verify `code_hash` and the absence of full-access keys. Same for `tusdc` if the demo still works.
2. Rehearsal: in a multi-row run still `Releasing`, repeat `pay_row` on an already-paid row and record the on-chain rejection.
3. Label every sandbox-only recovery path in README and BUILD-STATE.

Contract freeze until then (D-051).

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: about 9.9 NEAR held across our accounts, 0.10 burned so far; master 2.87 NEAR. No faucet top-up needed.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has approved the Phase 06 design. Execute Phase 07 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
