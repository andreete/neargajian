# SentFund (formerly GAJIAN): instructions for Codex and other agents

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
- Hosting (live at https://sentfund.my.id; Railway + Cloudflare, `docs/HOSTING.md`): never run Docker here; push to `release` (remote `sentfund`), change Railway or Cloudflare settings, or add/delete host keys on-chain only with Andre's explicit yes. The Railway and Cloudflare tokens are in `.env`: never print them.
- No secrets in git, logs, chat or docs. Keys stay in `~/.near-credentials` and `.env`. Never read, print or log `ANTHROPIC_API_KEY`; never rewrite `.env` in a way that drops lines you did not write.
- No public repo, X post, submission or force-push without Andre's explicit yes.
- No PII on-chain or in logs.
- Payroll Advance (Phase 23, 23b) is an app feature on top of the frozen vault: never change the contract for it. The stand-in vault mode (`VAULT_STANDIN=browser-tests`) is for browser tests under `.tmp/` only.
- Phase 24 face check at the Payroll Advance request: face templates are encrypted with `FACE_TEMPLATE_KEY` (never print, log or commit it; `node scripts/face-template-key.mjs` writes it to `.env` and keeps every other line); camera frames are never stored. The stand-in camera (`FACE_CAMERA_STANDIN=browser-tests`) is for local browser tests only (refused unless `APP_BASE_URL` is `http://127.0.0.1`). The demo override exists only with `HOSTED_DEMO=true`.
- Phase 25 (feature freeze afterwards): the sign-in dialog's **Fill** buttons exist only with `DEMO_MODE=true` and only fill the Email and Password fields; they never sign in. Keep the sign-in lockout, CSRF and CSP unchanged. After Phase 25, only fixes, docs, the video and the submission.
- `nice -n 19` for heavy commands, `CARGO_BUILD_JOBS=2`, never a Rust build and a Node install/build/test at the same time.
- Temp files go to the repo's git-ignored `.tmp/`, never the shared `/tmp` tmpfs: use the npm scripts (they run through `scripts/with-tmp.sh`), or prefix other commands with `./scripts/with-tmp.sh` or `TMPDIR=$PWD/.tmp`.

## QA role (Phase 18; Codex QA not scheduled for now)

When asked for independent QA: review only. Start from **`docs/QA-HANDOFF.md`** (self-contained: release candidate, setup, what to test with expected results, live evidence, known issues, scope). Follow the README from a clean checkout, verify acceptance checks A01–A08 from `docs/build/01-PRD.md` and A09–A14 (Phases 19–24: directory, assistant, hosted demo, identity checks, Payroll Advance, the camera face check) from `docs/QA-HANDOFF.md`, report pass/fail/blocked per check with repro steps, severity and paths. Ask before any action that sends a testnet transaction. Never publish or submit anything.
