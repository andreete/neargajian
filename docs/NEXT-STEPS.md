# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

**Andre reviews Phase 01** (commit `phase-01: …`; evidence in `docs/BUILD-STATE.md`, decisions D-019 … D-033 in `docs/DECISIONS.md`). Points for Andre to confirm or change:

1. Toolchain pins (D-019, D-020): Rust 1.95.0, cargo-near 0.23.0, near-cli-rs 0.31.1, near-sdk 5.30.1.
2. TypeScript 6.0.3 / ESLint 9.39.5 instead of the newest majors (D-024, D-025).
3. License MIT and the copyright holder name for the `LICENSE` file (D-032).
4. Repo-local git identity `Andre <andre@courseeker.com>` (D-033).

After approval, start **Phase 02** without further stops (unless a hard limit or a missing system package needs Andre).

## Phase 02 plan (single-payout walking skeleton)

1. Create the testnet accounts with near-cli-rs and the faucet (operator, tUSDC, vault, maker, approver 1, worker, 1–2 recipients); record public IDs in `docs/TESTNET.md`. Reuse them later (D-008).
2. `contracts/tusdc`: NEP-141 mock with `near-contract-standards`, 6 decimals, owner-only mint.
3. `contracts/vault`: maker creates an immutable run, one approver approves, vault credited via `ft_on_transfer` from tUSDC only, reserve, pay one recipient via `ft_transfer` with a private callback.
4. Sandbox tests: premature release, wrong token, duplicate payout, real async transfer outcome.
5. Testnet: deploy, register storage, mint ≤ 1 tUSDC, run one 0.01–0.10 tUSDC payout, capture explorer links, log NEAR spent.

Carry-over: add the importer test for the three sample files' exact totals in Phase 09.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has approved Phase 01. Execute Phase 02 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
