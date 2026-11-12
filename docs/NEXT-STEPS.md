# Next steps

Updated: Thu 12 Nov 2026, ~12:45 WIB, after **Phase 25** (Fill buttons in the sign-in dialog; released). **Feature freeze from now on**: only fixes, docs, the video and the submission. Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 24 approved by Andre** (he verified release `dd782f1`: camera allowed only on `/employee`, `FACE_TEMPLATE_KEY` in `.env`, the vault at 2.000000 tUSDC).
- **Phase 25 built** (D-145): in demo mode the sign-in dialog lists the seven demo accounts (maker, app1, app2, admin, Emma, Daniel, Grace) with "role · name" and a **Fill** button (`aria-label="Fill <email>"`). Fill puts the email and the demo password into the fields, marks the row, clears an earlier error and focuses **Sign in** (Enter signs in); it never signs in by itself. No box and no Fill with `DEMO_MODE` off. Lockout, CSRF and CSP unchanged. The dialog fits 1280x720 and 1440x900 without scrolling (form beside the accounts) and stacks on a phone.
- **All checks green** (BUILD-STATE Phase 25): 282 unit/integration, e2e 39 + 2 stand-in + 1 demo-off, judge mode 1, hosted 5 + 2, contracts 3 + 49 + 1, build, secret-scan, vision, `judge:deployment`; `judge:verify` 241 PASS, 0 FAIL.
- **Released** (Andre's yes in the brief): `release` = `81417b3`, Railway deployment `28c220ec…` SUCCESS (~05:35 UTC). Read-only hosted check without a transaction or a camera: **10 passed** (health ok; Fill on each of the seven accounts fills both fields and stays signed out; Sign in as app2 lands on the Review queue; the Phase 24 checks). Screenshots `docs/screenshots/phase-25/`.
- **Shared demo data online:** the maker's queue has **no open Payroll Advance request** now (Emma's pre-Phase-24 request from 11 Nov is no longer open; the agent did not touch it).
- **Seen, not fixed (freeze):** the landing page scrolls sideways on a 390 px phone window (hero upload card; QA-HANDOFF known issue 17). Desktop is fine. Say if you want it fixed as a QA fix.
- **Keys:** `.env` holds `FACE_TEMPLATE_KEY` (local) and `HOSTED_FACE_TEMPLATE_KEY` (the Railway value). Tokens pasted in chat stay until the shutdown (D-127).

## Single next action: Andre

1. **Review Phase 25 online** at https://sentfund.my.id: **Try the demo** → **Fill** on a row → **Sign in**; try the keyboard (Tab to a Fill button, Space, Enter). A01 in `docs/QA-HANDOFF.md`; D-145.
2. If not done yet: the Phase 24 camera review with a real camera (A14), and human QA A01–A14.
3. Check GitHub → Actions on `discoverateagency-ops/sentfund` for `81417b3` (Railway's Wait for CI let it deploy, so CI passed there).

## Order of work after that

1. Fixes from QA, released with Andre's yes: all checks on `main`, push `main` + `release` to `sentfund`, Railway builds after CI, then the read-only hosted check.
2. Video on the hosted site (`docs/VIDEO.md`: sign-ins with **Fill**, the camera moment at 2:42–2:55; profile D needs the camera allowed beforehand).
3. Repository public (Andre confirms which) and the `hackathon-submission` tag.
4. X post (`docs/X-POST.md`, only `<VIDEO>` left to fill), submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
5. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
6. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project (its variables include `FACE_TEMPLATE_KEY`), DNS records, hosted Anthropic key, GitHub app access, and **rotate the GitHub, Cloudflare and Railway tokens** that were pasted in chat (step 9).

## State to know

- Local face check: the demo employees' templates come from the synthetic specimen photos, so a real person never matches them locally (refused, no override). The browser tests use the labelled stand-in camera (`FACE_CAMERA_STANDIN=browser-tests`, local `http://127.0.0.1` only). After changing `FACE_TEMPLATE_KEY`, `npm run demo:reset` (or any seed / hosted start) re-creates the demo templates.
- The local review DB `data/gajian.sqlite` is **not migrated to 0012 yet** (it migrates when the app next opens it; tested on a copy: Emma's paid advance kept, sessions kept). Its templates appear after `npm run db:seed` (the key is in `.env`). The local review server and worker are **stopped**.
- `tests/live/hosted-check.spec.ts` (screenshots to `docs/screenshots/phase-25/`) checks Fill on all seven accounts and one sign-in, and is data-aware: an employee with an open request is checked through the request; the camera-notice step runs on the first employee with an offer.
- Railway variables by API: `node .tmp/rw-set-face-key.mjs names|check|set` (names only / compares without printing / sets from `.env`); `.tmp/rw-deploys.sh` lists the latest deployments.
- Landing "On-chain proof" counts are live and per copy (D-127). Vault holds **2.000000 tUSDC** (no transaction in Phases 24 and 25). Top-up: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes).
- `judge:deployment` must run after `npm run contracts:build`. `judge:verify` reads aged transactions from the archival node and may take more than 15 minutes when it rate-limits (D-138).
- Hosted reset: a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 25, 24), docs/DECISIONS.md (D-139 to D-145) and docs/SECURITY.md. The demo is live at https://sentfund.my.id (release `81417b3`: Phase 25, Fill buttons in the sign-in dialog; Phase 24, the camera face check). **Feature freeze**: no new features. Ask Andre for his Phase 25 review and the QA results; fix what he reports with tests, run all checks, and with his yes release to Railway and rerun the read-only hosted check. Never print tokens or keys (including FACE_TEMPLATE_KEY).
