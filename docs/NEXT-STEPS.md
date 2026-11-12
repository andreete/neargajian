# Next steps

Updated: Thu 12 Nov 2026, after **Phase 26** (milestone kit: Step 0 gap analysis + Step 1 QA Part A, QA fixes, roadmap docs). **Feature freeze** stays: only fixes, docs, the video and the submission. Deadline 2026-11-14 23:59 UTC; **our target: submit Friday 13 Nov**.

## Where things stand

- **Phase 25 approved by Andre** (release `81417b3`, the seven Fill rows).
- **Phase 26 built** (D-146..D-149): `docs/roadmap/` (gap analysis, QA Part A results, the kit's PRD / tech spec / QA checklist / backlog / Confidential Intents roadmap), `docs/KEY-INVENTORY.md`, README "Roadmap: from demo to pilot". The kit's reference code is **not** in the repo; nothing built for Confidential Intents.
- **QA Part A:** 10 bugs filed (BUG-26-01..10). **Fixed:** 01 landing on phones (Medium), 02 sign-in limit under a parallel burst (**High**), 03 maker release route 500 → 409 (Medium), 04 `.near` accepted on testnet (**High**), 08 HSTS (Medium), 11 Cloudflare email obfuscation breaking hydration on the landing page (Medium, found on the hosted site after the first release). **Open:** 05 retries after 3 failed transfers need the operator (Medium), 06 per-client sign-in limit trusts `X-Forwarded-For` (Medium, decision below), 07 malformed URL → 500/502 (Low), 09 face-attempt count race (Low), 10 nonexistent account found at payout off the public demo (Medium). No Critical found.
- **`judge:verify`** is quick by default (77 PASS, 4 min 41 s); `npm run judge:verify -- --full` checks every transaction (241 PASS, 0 FAIL, 56 min 30 s on 12 Nov).
- **Released** (Andre's yes in the brief): `release` = `f25e00b` (Railway `6ba0c513…` SUCCESS, live 07:51 UTC). The first release `878fb65` showed BUG-26-11 online (Cloudflare email obfuscation broke hydration), fixed by the second. Read-only hosted re-run: **21 passed** (QA Part A 11 + hosted check 10), no NEAR transaction.

## Decisions needed from Andre

1. **BUG-26-06 (sign-in limit per client):** trust a proxy header for the client address on Railway (for example `cf-connecting-ip`, set by Cloudflare, plus a Railway variable naming it), or leave it (the per-email limit holds off the demo; the demo passwords are public). A Railway variable change needs your yes.
2. **QA-A5-05 (no other way than the camera to request an advance):** keep (D-140, the advance is optional and normal pay is unaffected) or plan an alternative (for example the admin verifies in person) for Milestone 1.
3. **Human QA items** in `docs/roadmap/qa-part-a-results.md` "Needs a human": camera spoofing (A5-06), low light / glasses / skin tones (A5-07), Excel and LibreOffice (A4-06), phone and Safari/Firefox (A8).
4. Whether to fix BUG-26-05/07/09/10 before judging (each is small; none is Critical or High) or leave them for Milestone 1.

## Order of work (before the submission)

1. Andre reviews Phase 26 online: the landing page on a phone (no sideways scroll; header shows **Try the demo** only under 480 px), `curl -sI https://sentfund.my.id | grep -i strict`.
2. Video on the hosted site (`docs/VIDEO.md`), repository public (Andre confirms which) and the `hackathon-submission` tag, X post (`docs/X-POST.md`), submission by Friday 13 Nov (`docs/SUBMISSION.md`).
3. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
4. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project and variables, DNS, hosted Anthropic key, GitHub app access, and rotate the GitHub, Cloudflare and Railway tokens pasted in chat. `docs/KEY-INVENTORY.md` lists every key.

## After the submission and judging: Milestone 1 "Safe to pilot" (do not start before)

Plan from `docs/roadmap/` (gap analysis first). Work on a **separate branch `milestone-1`**; `main`, `release` and the live demo stay unchanged until judging ends.

1. **Step 2, contract (v2 vault on a new account, e.g. `vault-v2.sentfund-payroll.testnet`):** keep our reservation books, `InFlight` + evidence resolution, `close_partial`, workflow revision check and the lock; add salt + used roots + `file_hash`, payee registry with activation delay, guardian freeze / owner unfreeze, rolling window limit, token allow-list, then proven batch execution after a gas measurement. Sandbox tests for every path; commitment format `payout-leaf:v2` with new shared vectors. Deploy, lock, record in TESTNET.md (Andre's yes for every testnet transaction).
2. **Step 3, self-custody:** Wallet Selector (and FastAuth on testnet) for approvers and the maker; owner multisig; remove the server's approver and maker keys (KEY-INVENTORY shows each one); keep a separate demo vault with server-signed demo accounts.
3. **Step 4, app controls:** passkey step-up bound to the action, wallet-change flow with cooldown and notices, screening (denylist first), pre-flight report with per-approver acknowledgements, optional LLM note; SQLite + Drizzle migrations (porting notes in the gap analysis).
4. **Step 5, QA Parts B and C** against v2, external review, freeze drill; then decide with Andre when the hosted demo moves to v2.
- Confidential Intents (`docs/roadmap/roadmap.md`) stays research until Milestone 1 is done.

## State to know

- Local face check: the demo employees' templates come from synthetic specimen photos, so a real person never matches them locally. Browser tests use the labelled stand-in camera.
- The local review DB `data/gajian.sqlite` is not migrated to 0012 yet (migrates when the app next opens it). The local review server and worker are **stopped**.
- `tests/live/hosted-check.spec.ts` and `tests/live/qa-part-a.spec.ts` are read-only on the hosted demo (no NEAR transaction).
- Railway variables by API: `node .tmp/rw-set-face-key.mjs names|check|set`; `.tmp/rw-deploys.sh` lists deployments.
- Vault holds **2.000000 tUSDC** (no transaction in Phases 24–26).
- Hosted reset: a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 26, 25), docs/DECISIONS.md (D-146 to D-149), docs/roadmap/README.md and docs/roadmap/qa-part-a-results.md. The demo is live at https://sentfund.my.id. **Feature freeze** until the submission: only fixes, docs, the video and the submission. Ask Andre for his Phase 26 review and the four decisions in NEXT-STEPS. Milestone 1 Steps 2–5 start only after judging, on the branch `milestone-1` with a new vault account. Never print tokens or keys.
