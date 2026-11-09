# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

**Andre reviews Phases 06b–09** (stop requested; do not start Phase 10 until approved). Screenshots: `docs/screenshots/phase-06b/` and `docs/screenshots/phase-09/`. The production build runs on http://127.0.0.1:8092 (database `data/gajian.sqlite`; demo logins in README).

After approval: **Phase 10** (read-only preview and immutable submission: freeze the draft into a version with `activeSnapshot` + `createVersion`, submit `create_run` through the maker's restricted key with the tx hash stored first, honest pending state, reconcile before opening approvals, new versions with `supersedes`, maker cancellation).

## Phase 16 follow-ups (from Andre's Phases 02–04 review, D-050)

1. Fresh vault from the release commit with a reproducible Wasm hash; delete its full-access key; README commands to verify `code_hash` and the absence of full-access keys. Same for `tusdc` if the demo still works.
2. Rehearsal: in a multi-row run still `Releasing`, repeat `pay_row` on an already-paid row and record the on-chain rejection.
3. Label every sandbox-only recovery path in README and BUILD-STATE.

Contract freeze until then (D-051).

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: about 9.9 NEAR held across our accounts, 0.10 burned so far; master 2.87 NEAR. No faucet top-up needed.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has reviewed Phases 06b–09. Execute Phase 10 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
