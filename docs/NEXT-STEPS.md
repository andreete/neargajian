# Next steps

Updated: Tue 10 Nov 2026, ~15:10 WIB, after **Phase 22** (testnet migration to `sentfund-payroll.testnet`, hosted demo live). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Live demo: https://sentfund.my.id** (Railway project `sunny-simplicity`, service `sentfund`, branch `release` of `discoverateagency-ops/sentfund`; Cloudflare DNS proxied, SSL Full). Smoke-tested on 10 Nov in a real browser, including a real 0.01 run paid by the host keys (BUILD-STATE Phase 22).
- **Testnet deployment: `sentfund-payroll.testnet`**: vault `vault.sentfund-payroll.testnet` (same audited release Wasm as before, no access key), token `tusdc.sentfund-payroll.testnet` ("SentFund test USDC"). Vault **1.93 tUSDC**, workflow revision 3. The `gajian-payroll.testnet` set is the retired **earlier deployment**, kept as evidence (D-123).
- **Code**: Phases 21 (SentFund rebrand, KTP + face identity checks) and 22 committed and pushed to `origin` (`andreete/neargajian`) and `sentfund` (`discoverateagency-ops/sentfund`, `main` + `release`).
- **All checks green** on 10 Nov: 213 unit/integration, contracts 53 + lint, build, e2e 31, judge mode, hosted + kill switch, `judge:verify` **221/221**, `judge:deployment` pass, live local app run (assistant → paid), live hosted smoke test.
- **Local review server** runs on http://127.0.0.1:8092 with the release worker (fresh demo DB on the new accounts). Stop: `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/review-server.pid)` and `kill -TERM -- -$(cat /home/neargajian/near-gajian/.tmp/worker.pid)`. From the laptop: `ssh -N -L 8092:127.0.0.1:8092 neardao@andre.tail66ca93.ts.net`, then http://127.0.0.1:8092.

## Single next action: Andre

1. **Human QA on https://sentfund.my.id** with `docs/QA-HANDOFF.md` (A01–A12; on the hosted site the assistant and KTP reader are off until step 2).
2. **Hosted Anthropic key** (optional but recommended for the video): a separate workspace key with a monthly spend limit. Put `HOSTED_ANTHROPIC_API_KEY=…` in `.env` yourself and say "add the hosted key"; the agent sets it on Railway as `ANTHROPIC_API_KEY` by API (never printed) and redeploys.
3. **Check GitHub → Actions** on `discoverateagency-ops/sentfund` (the token given in chat cannot read Actions).
4. **Roll the three tokens pasted in chat** once you are happy: GitHub (revoke; pushes now use the deploy key), Cloudflare (create a new "Edit zone DNS" token, replace `CLOUDFLARE_API_TOKEN` in `.env`), Railway (new workspace token, replace `RAILWAY_API_TOKEN`).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund` (command in CLAUDE.md), Railway builds after CI (or the agent starts the deploy by API), then the hosted smoke test.
2. Video on the hosted site (`docs/VIDEO.md`; include the identity-check scene: specimens verified, impostor failed; needs step 2 above on the hosted site, or record that scene locally).
3. Repository public (Andre confirms which: `discoverateagency-ops/sentfund` is in README, SUBMISSION and X-POST) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10). Shutdown after 25 Nov (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project, DNS records, hosted Anthropic key.

## State to know

- Top up the vault to at most 2 tUSDC: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes; it now targets the SentFund vault).
- Hosted reset: set a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.
- The local `.env` keeps `DATABASE_URL` pointing at `data/gajian.sqlite` (file name only; the content is the fresh SentFund demo DB). Pre-Phase-22 `.env` backup: `.tmp/env-before-phase22.bak` (mode 600).
- `judge:deployment` must run after `npm run contracts:build` (`contracts:test` leaves a non-remapped build in `contracts/target`).
- New run IDs `sfd-…`, new references `SFD-…`; already stored ones keep `gjn-`/`GJN-` (D-125).
- Scratch from the killed Phase 21 session: `~/.cache/sentfund-p21-scratch/`.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 22 and 21), docs/DECISIONS.md (D-116 to D-126) and docs/HOSTING.md (status). The demo is live at https://sentfund.my.id on the sentfund-payroll.testnet deployment. Ask Andre for the QA results; fix what he reports with tests, run all checks, and with his yes release to Railway (push main + release to the `sentfund` remote with ~/.ssh/sentfund_deploy) and rerun the hosted smoke test. Never print tokens or keys.
