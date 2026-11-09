# GAJIAN: instructions for Codex and other agents

The standing rules are in **`CLAUDE.md`**. They apply to every agent (Codex included) and win over anything in this file. Keep both files consistent: if you change a rule here, change it there too.

## Read first

1. `CLAUDE.md`: hard limits, resource rules, engineering rules, toolchain, commands.
2. `docs/NEXT-STEPS.md`: the single next action.
3. `docs/BUILD-STATE.md`: per-phase evidence (sandbox vs live testnet kept separate).
4. `docs/DECISIONS.md`, `docs/TESTNET.md`, then `docs/build/` (kickoff first).

## Summary of the hard limits

- Testnet only. Never mainnet.
- No `sudo`, no Docker, nothing outside `/home/neargajian`; ask Andre for system packages.
- Bind to 127.0.0.1 only (port 8092). No tunnels.
- No secrets in git, logs, chat or docs. Keys stay in `~/.near-credentials` and `.env`.
- No public repo, X post, submission or force-push without Andre's explicit yes.
- No PII on-chain or in logs.
- `nice -n 19` for heavy commands, `CARGO_BUILD_JOBS=2`, never a Rust build and a Node install/build/test at the same time.
- Temp files go to the repo's git-ignored `.tmp/`, never the shared `/tmp` tmpfs: use the npm scripts (they run through `scripts/with-tmp.sh`), or prefix other commands with `./scripts/with-tmp.sh` or `TMPDIR=$PWD/.tmp`.

## QA role (Phase 18)

When asked for independent QA: review only. Start from **`docs/QA-HANDOFF.md`** (self-contained: release candidate, setup, what to test with expected results, live evidence, known issues, scope). Follow the README from a clean checkout, verify acceptance checks A01–A08 from `docs/build/01-PRD.md`, report pass/fail/blocked per check with repro steps, severity and paths. Ask before any action that sends a testnet transaction. Never publish or submit anything.
