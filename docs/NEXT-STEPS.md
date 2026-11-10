# Next steps

Updated: Tue 10 Nov 2026, ~17:45 WIB, after **Phase 22b** (review fixes, released to the hosted site). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phases 21 and 22 approved by Andre** (he verified on testnet: vault `code_hash` `4osoZq17…` and no access keys, token name, supply 2.18 and all balances, the hosted smoke run signed by the four host keys, the old gajian host keys gone, health ok behind Cloudflare).
- **Live demo: https://sentfund.my.id** runs `a29c514` (Phase 22b) (Railway project `sunny-simplicity`, service `sentfund`, branch `release` of `discoverateagency-ops/sentfund`; Cloudflare DNS proxied, SSL Full). Released 10 Nov 10:20–10:24 UTC (Railway deployment `c0d48f67…` SUCCESS); after the release: health ok (`hostedDemo` true, `faceModels` true); landing shows 3 paid testnet runs, 1 repeat refused, first payout by this vault `UEJ1PEDz…`, 6 payouts as of 10 Nov 07:37 UTC (no `7Dwmqek…`); hosted checks without transactions **2 passed** (health/banner/read-only admin/identity; the 1,000-row sample refused, nothing sent). The 0.01 run test was not rerun (it sends a transaction).
- **Online today:** sign-in, runs to the three live recipients, approvals, payment by the vault, history, reports, exports, read-only admin screens. **Off online:** the payroll assistant and the KTP reader (no `HOSTED_ANTHROPIC_API_KEY` in `.env`, so nothing was set on Railway). README "Try it online" says exactly this.
- **Testnet deployment: `sentfund-payroll.testnet`**: vault `vault.sentfund-payroll.testnet` (locked, no access key), token `tusdc.sentfund-payroll.testnet`. Vault **1.93 tUSDC**, workflow revision 3. No transaction in Phase 22b. The `gajian-payroll.testnet` set is the retired earlier deployment, kept as evidence (D-123).
- **Code**: `a29c514 phase-22b: review fixes` on `origin` (`andreete/neargajian`) and `sentfund` (`main` + `release`). All checks green on 10 Nov (BUILD-STATE Phase 22b): 213 unit/integration, contracts 53 + lint, build, e2e 31, judge mode, hosted + kill switch, `judge:verify` 221/221, `judge:deployment`, secret-scan, vision self-test.
- **Tokens:** Andre keeps the GitHub, Cloudflare and Railway tokens pasted in chat **until the shutdown after 25 Nov** (D-127). On 10 Nov both `.env` tokens worked (checked by name only): `CLOUDFLARE_API_TOKEN` active with the zone, `RAILWAY_API_TOKEN` reads the project.
- **Local review server** runs on http://127.0.0.1:8092 with the release worker (local demo DB, now with the imported Phase 22 history). Stop: `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/review-server.pid)` and `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/worker.pid)` (the pid files hold the process-group IDs). From the laptop: `ssh -N -L 8092:127.0.0.1:8092 neargajian@andre`, then http://127.0.0.1:8092.

## Single next action: Andre

1. **Human QA on https://sentfund.my.id** with `docs/QA-HANDOFF.md` (A01–A12; the assistant and KTP reader are off online until step 2).
2. **Hosted Anthropic key** (optional, recommended for the video): a separate workspace key with a monthly spend limit. Put `HOSTED_ANTHROPIC_API_KEY=…` in `.env` yourself and say "add the hosted key"; the agent sets it on Railway as `ANTHROPIC_API_KEY` by API (never printed), redeploys, and moves the assistant back into README "Try it online".
3. **Check GitHub → Actions** on `discoverateagency-ops/sentfund` for `a29c514` (the agent has no token that reads Actions). Railway's "Wait for CI" held the deployment as WAITING for only about 30 s before building, which is shorter than our CI takes, so it is **not** proof that CI passed; all the same checks passed locally (BUILD-STATE Phase 22b).
4. Optional: **`www.sentfund.my.id` → `https://sentfund.my.id`**: two Cloudflare dashboard steps in `docs/HOSTING.md` section 5 (the agent's token is DNS-only and cannot create redirect rules).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund` (command in CLAUDE.md), Railway builds after CI, then the hosted checks (`npx playwright test -c playwright.hosted-live.config.ts --grep-invert "0.01 tUSDC run"` sends no transaction).
2. Video on the hosted site (`docs/VIDEO.md`; the identity-check scene needs step 2 above, or record it locally).
3. Repository public (Andre confirms which: `discoverateagency-ops/sentfund` is in README, SUBMISSION and X-POST) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
6. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project, DNS records, hosted Anthropic key, GitHub app access, and **rotate the GitHub, Cloudflare and Railway tokens** that were pasted in chat (step 9).

## State to know

- Landing "On-chain proof" counts are live and **per copy** (D-127): the imported chain history plus the runs this copy paid, for its configured vault, "as of" the latest payout it recorded. A judge's fresh copy shows the history only (2 runs, 5 payouts).
- Top up the vault to at most 2 tUSDC: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes).
- Hosted reset: set a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.
- The local `.env` keeps `DATABASE_URL` pointing at `data/gajian.sqlite` (file name only; the content is the SentFund demo DB). Pre-Phase-22 `.env` backup: `.tmp/env-before-phase22.bak` (mode 600).
- `judge:deployment` must run after `npm run contracts:build` (`contracts:test` leaves a non-remapped build in `contracts/target`).
- Railway deployments by API: `.tmp/rw-deploys.sh` lists the latest three (status + commit; token from `.env`, never printed).
- New run IDs `sfd-…`, new references `SFD-…`; already stored ones keep `gjn-`/`GJN-` (D-125).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 22b, 22 and 21), docs/DECISIONS.md (D-116 to D-127) and docs/HOSTING.md (status). The demo is live at https://sentfund.my.id on the sentfund-payroll.testnet deployment; Phases 21 and 22 are approved. Ask Andre for the QA results; fix what he reports with tests, run all checks, and with his yes release to Railway (push main + release to the `sentfund` remote with ~/.ssh/sentfund_deploy) and rerun the hosted checks. The chat-pasted tokens stay until the shutdown (never say they were rotated). Never print tokens or keys.
