# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

**Phase 03** (immutable run commitments and money math), then Phase 04, then stop for Andre's review. Phase 02 is done with live testnet proof (`docs/TESTNET.md`).

## Phase 03 plan

1. `src/server/money.ts`: exact 6-decimal parsing/formatting, BigInt base units, bounds (u128, demo caps D-027).
2. `docs/COMMITMENTS.md`: byte encoding, domain tags, Merkle proof algorithm, odd-leaf rule, salted review digest.
3. TypeScript + Rust implementations with shared vectors (`tests/vectors/commitments.json`).
4. Vault: replace on-chain rows with `payout_root` + `row_count` + `total` + `review_digest`; `pay_row` takes `(index, receiver, amount, proof)`.
5. Tests: changed amount/destination/index rejected; same wallet on two indexes paid separately; 1,000-row proof generation for the sample file.

## Phase 04 plan

Policies (one / two sequential / two parallel), maker/reviewer separation, reject, cancel before release, admin workflow revisions snapshotted per run, automatic-worker vs maker release, concurrent reservations, row-state recovery (`InFlight` reconciliation), function-call-only signer keys + `.env` writer script, redeploy vault on testnet and run a live multi-approver payout.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Execute the current phase from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
