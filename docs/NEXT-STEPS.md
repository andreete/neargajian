# Next steps

Updated: Tue 10 Nov 2026, ~19:30 WIB, after **Phase 23** (hosted Claude key; Payroll Advance). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 22b approved by Andre** (live release `a29c514`, first payout `UEJ1PEDz…`, token wording).
- **Hosted Claude key set (Part 1, D-128):** `ANTHROPIC_API_KEY` on Railway from `HOSTED_ANTHROPIC_API_KEY` (never printed), current release `a29c514` redeployed with the same image (deployment `4aab2264…` SUCCESS, 10:51 UTC). Checked online without any NEAR transaction: the assistant preview for the Sales request (0.06 total; no draft created) and a specimen dry run (Emma Verified 0.932). The assistant and the KTP reader now work on https://sentfund.my.id.
- **Phase 23 Payroll Advance (Part 2):** built, tested and proven on testnet through the local app; committed and pushed to `main` on `origin` and `sentfund`. **NOT released to the hosted site** (`release` still `a29c514`): Andre reviews first.
  - Live (10 Nov 11:26–11:28 UTC): Emma's advance `sfd-d42481f6ec94460ca716-v1` (0.30 owed, fee 0.006 kept, 0.294 paid) and her November payroll `sfd-fb3204a5a83c43afb4cb-v1` (gross 0.10, instalment 0.05, net 0.05 paid); balance 0.25, 5 instalments left. Vault 1.93 → **1.586 tUSDC**. `judge:verify` **241/241**.
  - Checks green (BUILD-STATE Phase 23): 240 unit/integration, e2e 31 + 1 stand-in whole flow, judge mode 1, hosted 4 + 2, contracts, build, secret-scan, vision.
- **Local review server** on http://127.0.0.1:8092 with the release worker (local demo DB, migrated to Phase 23, with the two live runs; backup before the migration in `data/backups/before-phase23-*.sqlite`). Stop: `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/review-server.pid)` and `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/worker.pid)` (process-group IDs). From the laptop: `ssh -N -L 8092:127.0.0.1:8092 neargajian@andre`, then http://127.0.0.1:8092. Sign in as `emma@sentfund.my.id` (advance outstanding 0.25), `daniel@` or `grace@` (an offer, nothing requested), `maker@`, `app1@`, `app2@`, `admin@`; password `12345678`.
- **Tokens:** Andre keeps the GitHub, Cloudflare and Railway tokens pasted in chat **until the shutdown after 25 Nov** (D-127).

## Single next action: Andre

1. **Review Phase 23** on the local review server (A13 in `docs/QA-HANDOFF.md`; screenshots `docs/screenshots/phase-23/`; TESTNET Phase 23; D-128..D-134). Note D-130 (which payroll deducts) and D-133 (the live recipients' maximum is now 0.30).
2. With your yes, **release Phase 23**: all checks on `main` are green; push `main` + `release` to `sentfund` (command in CLAUDE.md); Railway builds after CI; at start `hosted-prepare.ts` migrates the hosted DB (sessions kept) and seeds the employee sign-ins and the Payroll Advance fields (no reset needed). Then the hosted checks without transactions: `npx playwright test -c playwright.hosted-live.config.ts --grep-invert "0.01 tUSDC run"`, and an employee sign-in online. A live advance online sends real transactions (only with your yes).
3. Human QA on https://sentfund.my.id (A01–A12 now; A13 after the release).
4. Check GitHub → Actions on `discoverateagency-ops/sentfund` for the Phase 23 commit (the agent cannot read Actions).
5. Optional: `www.sentfund.my.id` → apex (two Cloudflare dashboard steps, `docs/HOSTING.md` section 5).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund` (command in CLAUDE.md), Railway builds after CI, then the hosted checks (`npx playwright test -c playwright.hosted-live.config.ts --grep-invert "0.01 tUSDC run"` sends no transaction).
2. Video on the hosted site (`docs/VIDEO.md`, now with a short Payroll Advance scene that needs the Phase 23 release; the assistant and identity scenes work online now).
3. Repository public (Andre confirms which: `discoverateagency-ops/sentfund` is in README, SUBMISSION and X-POST) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
6. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project, DNS records, hosted Anthropic key, GitHub app access, and **rotate the GitHub, Cloudflare and Railway tokens** that were pasted in chat (step 9).

## State to know

- Landing "On-chain proof" counts are live and **per copy** (D-127): the imported chain history plus the runs this copy paid, for its configured vault, "as of" the latest payout it recorded. A judge's fresh copy shows the history only (2 runs, 5 payouts).
- Top up the vault to at most 2 tUSDC: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes). It holds 1.586 after Phase 23.
- Payroll Advance live re-runs: `tests/live/phase23.spec.ts` (`p23-advance`, `p23-payroll` send real transactions; `p23-shots`, `p23-offer-shot` are read-only). Emma has an outstanding advance now, so `p23-advance` would need another employee or a full repayment first.
- Hosted reset: set a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.
- The local `.env` keeps `DATABASE_URL` pointing at `data/gajian.sqlite` (file name only; the content is the SentFund demo DB). Pre-Phase-22 `.env` backup: `.tmp/env-before-phase22.bak` (mode 600).
- `judge:deployment` must run after `npm run contracts:build` (`contracts:test` leaves a non-remapped build in `contracts/target`).
- Railway deployments by API: `.tmp/rw-deploys.sh` lists the latest three (status + commit; token from `.env`, never printed).
- New run IDs `sfd-…`, new references `SFD-…`; already stored ones keep `gjn-`/`GJN-` (D-125).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 23, 22b, 22), docs/DECISIONS.md (D-123 to D-134) and docs/HOSTING.md (status). The demo is live at https://sentfund.my.id (release `a29c514`, hosted Claude key set). Phase 23 (Payroll Advance, employee role) is on `main`, proven on testnet locally, NOT released. Ask Andre for his Phase 23 review; fix what he reports with tests, run all checks, and with his yes release to Railway (push main + release to the `sentfund` remote with ~/.ssh/sentfund_deploy) and rerun the hosted checks. The chat-pasted tokens stay until the shutdown (never say they were rotated). Never print tokens or keys.
