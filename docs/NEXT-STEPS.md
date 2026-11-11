# Next steps

Updated: Wed 11 Nov 2026, ~09:30 WIB, after **Phase 24** (face check at the Payroll Advance request; released). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 23b approved by Andre** (release `e1b068b`, vault exactly 2.000000 tUSDC, D-138 verified on the regular and archival nodes).
- **Phase 24 built** (D-139..D-144): an encrypted face template per verified employee (AES-256-GCM, `FACE_TEMPLATE_KEY`, never the photo; deleted on deactivation or reset; every change logged); **Verify it's you** before every Payroll Advance request (one-time challenge with a random head-turn order, nonce 60 s; frames checked in memory with YuNet + SFace, match ≥ 0.363; 5 attempts per hour, logged); the request carries the result for the maker and the approvers; the maker's submit and the approval refuse a request without a passed check; public demo only: **Continue as a demo** after a mismatch with a real head turn, flagged; camera allowed only on `/employee` (and `/admin/identity` off the public demo). No contract change.
- **All checks green** (BUILD-STATE Phase 24): 281 unit/integration, e2e 34 + 2 stand-in, judge mode 1, hosted 5 + 2, contracts 3 + 49 + 1, build, secret-scan, vision, `judge:deployment`; `judge:verify` 241 PASS, 0 FAIL.
- **Released** (Andre's yes in the brief): `FACE_TEMPLATE_KEY` set on Railway by API (separate key, never printed), `release` = `dd782f1`, deployment `1e273427…` SUCCESS (~02:12 UTC). Hosted check without a transaction or a camera: **9 passed**.
- **Shared demo data online:** Emma has an open **0.07 tUSDC request made at 01:01 UTC today, before Phase 24** (probably Andre's 23b review). It has no face check, so the maker cannot submit it (red line, button disabled; the server refuses too). Withdraw it as Emma (`emma@sentfund.my.id` → **Withdraw request**, no transaction) to give her the offer back for QA and the video.
- **Keys:** `.env` now holds `FACE_TEMPLATE_KEY` (local) and `HOSTED_FACE_TEMPLATE_KEY` (the Railway value; kept so it can be set again). Backup of the earlier `.env`: `.tmp/env-before-phase24.bak` (mode 600). Tokens pasted in chat stay until the shutdown (D-127).

## Single next action: Andre

1. **Review Phase 24 online with a camera** (phone or laptop) at https://sentfund.my.id: as `grace@` or `daniel@sentfund.my.id` (password `12345678`), tick the consent, **Verify it's you** → allow the camera → **Start** → turn as asked. Expect "This doesn't look like …" with the similarity, then **Continue as a demo** → Requested; as `maker@` the yellow "Face check: demo override …" line. Then withdraw the request as the employee (a maker submit online sends real transactions). Also try: keep still ("Please turn your head as asked"), two faces in view, a covered camera. A14 in `docs/QA-HANDOFF.md`; D-139..D-144.
2. Withdraw Emma's pre-Phase-24 request (above), or tell the agent to leave it.
3. Human QA on https://sentfund.my.id (A01–A14).
4. Check GitHub → Actions on `discoverateagency-ops/sentfund` for `dd782f1` (Railway's Wait for CI let it deploy, so CI passed there).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund`, Railway builds after CI, then the read-only hosted check.
2. Video on the hosted site (`docs/VIDEO.md`, now with the camera moment at 2:42–2:55; profile D needs the camera allowed beforehand).
3. Repository public (Andre confirms which) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
6. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project (its variables include `FACE_TEMPLATE_KEY`), DNS records, hosted Anthropic key, GitHub app access, and **rotate the GitHub, Cloudflare and Railway tokens** that were pasted in chat (step 9).

## State to know

- Local face check: the demo employees' templates come from the synthetic specimen photos, so a real person never matches them locally (refused, no override). The browser tests use the labelled stand-in camera (`FACE_CAMERA_STANDIN=browser-tests`, local `http://127.0.0.1` only). After changing `FACE_TEMPLATE_KEY`, `npm run demo:reset` (or any seed / hosted start) re-creates the demo templates.
- The local review DB `data/gajian.sqlite` is **not migrated to 0012 yet** (it migrates when the app next opens it; tested on a copy: Emma's paid advance kept, sessions kept). Its templates appear after `npm run db:seed` (the key is in `.env`). The local review server and worker are **stopped**.
- `tests/live/hosted-check.spec.ts` is data-aware: an employee with an open request is checked through the request; the camera-notice step runs on the first employee with an offer.
- Railway variables by API: `node .tmp/rw-set-face-key.mjs names|check|set` (names only / compares without printing / sets from `.env`); `.tmp/rw-deploys.sh` lists the latest deployments.
- Landing "On-chain proof" counts are live and per copy (D-127). Vault holds **2.000000 tUSDC** (no transaction in Phase 24). Top-up: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes).
- `judge:deployment` must run after `npm run contracts:build`. `judge:verify` reads aged transactions from the archival node and may take more than 15 minutes when it rate-limits (D-138).
- Hosted reset: a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 24, 23b), docs/DECISIONS.md (D-139 to D-144) and docs/SECURITY.md. The demo is live at https://sentfund.my.id (release `dd782f1`: Phase 24, the camera face check at the Payroll Advance request with the public-demo override; `FACE_TEMPLATE_KEY` set on Railway). Ask Andre for his Phase 24 review (with a camera) and the QA results; fix what he reports with tests, run all checks, and with his yes release to Railway and rerun the read-only hosted check. Never print tokens or keys (including FACE_TEMPLATE_KEY).
