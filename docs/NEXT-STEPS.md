# Next steps

Updated: Wed 11 Nov 2026, ~06:30 WIB, after **Phase 23b** (employee form; release of Phases 23 + 23b; vault top-up). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 23 approved by Andre** (all ten transactions of the two runs verified on testnet; vault 1.586, recipient1 0.414, vault without access keys; D-130..D-134 accepted).
- **Phase 23b built** (D-135..D-137): withdraw a request while Requested (server-enforced, own request only, races with the maker's submit safely; migration 0011), "Estimated" deduction months everywhere with the one-line note, 25% / 50% / Max shortcuts (rounded down to 0.01), detailed-history breakdown on two lines. All checks green (BUILD-STATE Phase 23b): 246 unit/integration, e2e 31 + 2 stand-in, judge mode 1, hosted 4 + 2, contracts 3 + 49 + 1, build, secret-scan, vision, `judge:deployment`.
- **Released** (Andre's yes): `release` = `e1b068b` (Phases 23 + 23b), Railway deployment `5906cf23…` SUCCESS; the hosted DB migrated and seeded the employee sign-ins. Hosted check without any NEAR transaction: **6 passed** (health; Emma, Daniel, Grace see the offer with the shortcuts and the Estimated months, nothing requested; admin Payroll Advance read-only; assistant preview; specimen dry run).
- **Vault topped up** to **2.000000 tUSDC** (mint 0.414 + `ft_transfer_call`, 0.00077 NEAR; `docs/TESTNET.md` Phase 23b).
- **`judge:verify` fix (D-138):** the 9 Nov transactions aged out of the regular RPC node; aged lookups now go to the testnet archival node: **241 PASS, 0 FAIL**.
- **Tokens:** Andre keeps the GitHub, Cloudflare and Railway tokens pasted in chat **until the shutdown after 25 Nov** (D-127).

## Single next action: Andre

1. **Review Phase 23b online** at https://sentfund.my.id: sign in as `emma@`, `daniel@` or `grace@sentfund.my.id` (password `12345678`): shortcuts, Estimated months, request and **Withdraw request** (a request online sends nothing; a maker submit online sends real transactions). A13 in `docs/QA-HANDOFF.md`; D-135..D-138.
2. Human QA on https://sentfund.my.id (A01–A13).
3. Check GitHub → Actions on `discoverateagency-ops/sentfund` for `e1b068b` (Railway's Wait for CI let it deploy, so CI passed there; the agent cannot read Actions).
4. Optional: `www.sentfund.my.id` → apex (two Cloudflare dashboard steps, `docs/HOSTING.md` section 5).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund` (command in CLAUDE.md), Railway builds after CI, then the read-only hosted check (`tests/live/hosted-check.spec.ts`).
2. Video on the hosted site (`docs/VIDEO.md`, including the short Payroll Advance scene, now possible online).
3. Repository public (Andre confirms which: `discoverateagency-ops/sentfund` is in README, SUBMISSION and X-POST) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
6. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project, DNS records, hosted Anthropic key, GitHub app access, and **rotate the GitHub, Cloudflare and Railway tokens** that were pasted in chat (step 9).

## State to know

- Landing "On-chain proof" counts are live and **per copy** (D-127): the imported chain history plus the runs this copy paid, for its configured vault, "as of" the latest payout it recorded. A judge's fresh copy shows the history only (2 runs, 5 payouts).
- Top up the vault to at most 2 tUSDC: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes). It holds **2.000000** since the Phase 23b top-up (10 Nov 23:17 UTC).
- Payroll Advance live re-runs: `tests/live/phase23.spec.ts` (`p23-advance`, `p23-payroll` send real transactions; `p23-shots`, `p23-offer-shot` are read-only). Emma has an outstanding advance now, so `p23-advance` would need another employee or a full repayment first.
- Hosted reset: set a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.
- The local `.env` keeps `DATABASE_URL` pointing at `data/gajian.sqlite` (file name only; the content is the SentFund demo DB). Pre-Phase-22 `.env` backup: `.tmp/env-before-phase22.bak` (mode 600).
- `judge:deployment` must run after `npm run contracts:build` (`contracts:test` leaves a non-remapped build in `contracts/target`).
- Read-only hosted check after a release (no transaction): `npx playwright test -c playwright.hosted-live.config.ts tests/live/hosted-check.spec.ts` (6 tests; screenshots to `docs/screenshots/phase-23b/`).
- `judge:verify` reads aged transactions from `https://archival-rpc.testnet.fastnear.com` (D-138); the free tier rate-limits, so it backs off (a full run takes a few minutes).
- Local review DB `data/gajian.sqlite` is migrated to 0011 (backup `data/backups/before-phase23b-2026-11-10T23-09-31Z.sqlite`); the local review server and worker are **stopped** (start: `npm run start` + `npm run worker`).
- Railway deployments by API: `.tmp/rw-deploys.sh` lists the latest three (status + commit; token from `.env`, never printed).
- New run IDs `sfd-…`, new references `SFD-…`; already stored ones keep `gjn-`/`GJN-` (D-125).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 23b, 23, 22b), docs/DECISIONS.md (D-128 to D-138) and docs/HOSTING.md (status). The demo is live at https://sentfund.my.id (release `e1b068b`: Phases 23 + 23b, Payroll Advance with the employee sign-ins; hosted Claude key set; vault 2.00 tUSDC). Ask Andre for his Phase 23b review and the QA results; fix what he reports with tests, run all checks, and with his yes release to Railway (push main + release to the `sentfund` remote with ~/.ssh/sentfund_deploy) and rerun the read-only hosted check. The chat-pasted tokens stay until the shutdown (never say they were rotated). Never print tokens or keys.
