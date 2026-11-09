# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

**Phase 02** (single-payout walking skeleton). Phase 01 was approved by Andre on 9 Nov 2026 (D-032 … D-038). Follow-ups done: MIT `LICENSE`, git identity `Andre <andre.tuwan@gmail.com>` with both earlier commits rewritten, repo-local `.tmp/` for temp files, deploy key + origin `andreete/neargajian`, permission allowlist. Phases 02, 03 and 04 run back to back; stop after Phase 04 for Andre's review.

## Phase 02 plan (single-payout walking skeleton)

1. Create the testnet accounts with near-cli-rs and the faucet (operator, tUSDC, vault, maker, approver 1, worker, 1–2 recipients); record public IDs in `docs/TESTNET.md`. Reuse them later (D-008).
2. `contracts/tusdc`: NEP-141 mock with `near-contract-standards`, 6 decimals, owner-only mint.
3. `contracts/vault`: maker creates an immutable run, one approver approves, vault credited via `ft_on_transfer` from tUSDC only, reserve, pay one recipient via `ft_transfer` with a private callback.
4. Sandbox tests: premature release, wrong token, duplicate payout, real async transfer outcome.
5. Testnet: deploy, register storage, mint ≤ 1 tUSDC, run one 0.01–0.10 tUSDC payout, capture explorer links, log NEAR spent.

Carry-over: add the importer test for the three sample files' exact totals in Phase 09.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Execute the current phase from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
