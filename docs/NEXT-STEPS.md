# Next steps

Updated: Mon 9 Nov 2026, end of Phase 01. Schedule: on track (kickoff section 8: Phase 01 + Andre's review today, start Phase 02).

## Single next action

**Andre reviews Phases 02–04** (stop requested after Phase 04). Evidence: `docs/BUILD-STATE.md`, `docs/TESTNET.md`, `docs/COMMITMENTS.md`, `docs/RECOVERY.md`; decisions D-034 … D-049. After approval, continue with **Phase 05** (persistent application model and demo fixtures) and run phase after phase.

## Phase 05 plan

1. Drizzle schema + SQL migrations: users, org/workflow config (mirrors the vault workflow revision), drafts, immutable versions (with review salt, root, digest), indexed rows, approval events, payout actions (deterministic action IDs, tx hashes), reporting references.
2. SQLite with WAL + busy_timeout; transaction boundaries for draft replacement and payout-action claims.
3. Deterministic seed (four demo users, D-016) and synthetic fixture generators (small runs, 1,000 rows, invalid variants).
4. Tests: uniqueness, version integrity, restart persistence.

## Open items

- Push: deploy key works (pushed after every phase).
- Testnet NEAR: about 9.9 NEAR held across our accounts, 0.10 burned so far; master 2.87 NEAR. No faucet top-up needed.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md and docs/BUILD-STATE.md. Andre has reviewed Phases 02–04. Execute Phase 05 from docs/build/04-BUILD-PHASES.md as adjusted by docs/build/00-KICKOFF.md, then continue phase by phase.
