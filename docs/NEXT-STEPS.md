# Next steps

Updated: Sat 14 Nov 2026, after **Phase 27** (CI green: the contracts job now creates the repo-local `.tmp/` that `contracts/.cargo/config.toml` points TMPDIR at; D-151; workflow-only change, no release). Before that: Andre's **Phase 26 review** (approved; his four answers are D-150). **Feature freeze** stays: no code change and no new release before the submission; only docs, the video and the submission. The live release stays `f25e00b`. Deadline 2026-11-14 23:59 UTC.

## Where things stand

- **Phase 27:** GitHub Actions was red since 10 Nov only because the contracts job's sandbox test could not write to the missing `.tmp/` in a clean checkout (reproduced in `.tmp/ci-repro`). Fixed in `.github/workflows/ci.yml`; result of the Actions run in BUILD-STATE Phase 27. Next: the `hackathon-submission` tag (Andre's yes).
- **Phase 25 approved by Andre** (release `81417b3`, the seven Fill rows).
- **Phase 26 approved by Andre** (D-146..D-150; he checked HSTS and `no-transform` live, no sideways scroll at 375 px, no console errors, vault code hash unchanged with 0 keys and 2.000000 tUSDC, no private key in KEY-INVENTORY): `docs/roadmap/` (gap analysis, QA Part A results, the kit's PRD / tech spec / QA checklist / backlog / Confidential Intents roadmap), `docs/KEY-INVENTORY.md`, README "Roadmap: from demo to pilot". The kit's reference code is **not** in the repo; nothing built for Confidential Intents.
- **QA Part A:** 11 bugs filed (BUG-26-01..11), **6 fixed**, 5 open for Milestone 1. **Fixed:** 01 landing on phones (Medium), 02 sign-in limit under a parallel burst (**High**), 03 maker release route 500 → 409 (Medium), 04 `.near` accepted on testnet (**High**), 08 HSTS (Medium), 11 Cloudflare email obfuscation breaking hydration on the landing page (Medium, found on the hosted site after the first release). **Open:** 05 retries after 3 failed transfers need the operator (Medium), 06 per-client sign-in limit trusts `X-Forwarded-For` (Medium; no Railway change before judging), 07 malformed URL → 500/502 (Low), 09 face-attempt count race (Low), 10 nonexistent account found at payout off the public demo (Medium). No Critical found; both High (02, 04) fixed. All five open bugs wait for Milestone 1 (D-150).
- **`judge:verify`** is quick by default (77 PASS, 4 min 41 s); `npm run judge:verify -- --full` checks every transaction (241 PASS, 0 FAIL, 56 min 30 s on 12 Nov).
- **Released** (Andre's yes in the brief): `release` = `f25e00b` (Railway `6ba0c513…` SUCCESS, live 07:51 UTC). The first release `878fb65` showed BUG-26-11 online (Cloudflare email obfuscation broke hydration), fixed by the second. Read-only hosted re-run: **21 passed** (QA Part A 11 + hosted check 10), no NEAR transaction.

## Andre's to-do: human QA items

From `docs/roadmap/qa-part-a-results.md` "Needs a human" (none blocks the submission; record results there):

1. **A5-06** camera spoofing: a printed photo, a phone screen with a photo, a video of the employee, a virtual camera (OBS). Record which pass (on the public demo, use the mismatch path).
2. **A5-07** low light, glasses and headwear, a range of skin tones: note the false rejects.
3. **A4-06** open both CSVs in Excel (Windows and Mac) and in LibreOffice.
4. **A8-03 / A8-06** an approver on a phone; Safari and Firefox.
5. **A1-08** what another tester's actions do to your view (two people at once).

## Order of work (before the submission)

1. Video on the hosted site (`docs/VIDEO.md`), repository public (Andre confirms which) and the `hackathon-submission` tag, X post (`docs/X-POST.md`), submission by Friday 13 Nov (`docs/SUBMISSION.md`).
2. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true` (HOSTING step 10).
3. **Shutdown after 25 Nov** (HOSTING step 12): host keys `hosting-keys.sh delete --yes`, Railway project and variables, DNS, hosted Anthropic key, GitHub app access, and rotate the GitHub, Cloudflare and Railway tokens pasted in chat. `docs/KEY-INVENTORY.md` lists every key.

## After the submission and judging: Milestone 1 "Safe to pilot" (do not start before)

Plan from `docs/roadmap/` (gap analysis first, section "Added by Andre's review (D-150)"). Work on a **separate branch `milestone-1`**; `main`, `release` and the live demo stay unchanged until judging ends.

1. **Step 2, contract (v2 vault on a new account, e.g. `vault-v2.sentfund-payroll.testnet`):** keep our reservation books, `InFlight` + evidence resolution, `close_partial`, workflow revision check and the lock; add salt + used roots + `file_hash`, payee registry with activation delay, guardian freeze / owner unfreeze, rolling window limit, token allow-list, then proven batch execution after a gas measurement. Sandbox tests for every path; commitment format `payout-leaf:v2` with new shared vectors. Deploy, lock, record in TESTNET.md (Andre's yes for every testnet transaction).
2. **Step 3, self-custody:** Wallet Selector (and FastAuth on testnet) for approvers and the maker; owner multisig; remove the server's approver and maker keys (KEY-INVENTORY shows each one); keep a separate demo vault with server-signed demo accounts.
3. **Step 4, app controls:** passkey step-up bound to the action, wallet-change flow with cooldown and notices, screening (denylist first), pre-flight report with per-approver acknowledgements, optional LLM note; SQLite + Drizzle migrations (porting notes in the gap analysis).
4. **Fixes left from QA Part A (D-150):** BUG-26-06 (take the client address only from the proxy's client-address header, e.g. `cf-connecting-ip`, plus a Railway variable naming it), BUG-26-05 (retries after 3 failed transfers without the operator, M1-013), BUG-26-07 (malformed percent-encoding → 400), BUG-26-09 (face-attempt count race), BUG-26-10 (nonexistent account found before submit, F6/F7).
5. **Payroll Advance without a camera (QA-A5-05, D-150):** an admin verifies the employee in person and records it (who, when, how), with an audit entry; the maker and the approvers see it like a face check.
6. **Step 5, QA Parts B and C** against v2, external review, freeze drill; then decide with Andre when the hosted demo moves to v2.
- Confidential Intents (`docs/roadmap/roadmap.md`) stays research until Milestone 1 is done.

## State to know

- Local face check: the demo employees' templates come from synthetic specimen photos, so a real person never matches them locally. Browser tests use the labelled stand-in camera.
- The local review DB `data/gajian.sqlite` is not migrated to 0012 yet (migrates when the app next opens it). The local review server and worker are **stopped**.
- `tests/live/hosted-check.spec.ts` and `tests/live/qa-part-a.spec.ts` are read-only on the hosted demo (no NEAR transaction).
- Railway variables by API: `node .tmp/rw-set-face-key.mjs names|check|set`; `.tmp/rw-deploys.sh` lists deployments.
- Vault holds **2.000000 tUSDC** (no transaction in Phases 24–26).
- Hosted reset: a new `DEMO_RESET_TOKEN` on Railway (current `2026-11-10-sentfund-payroll`) and redeploy.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/BUILD-STATE.md (Phases 26, 25), docs/DECISIONS.md (D-146 to D-150), docs/roadmap/README.md and docs/roadmap/qa-part-a-results.md. The demo is live at https://sentfund.my.id. **Feature freeze** until the submission: only docs, the video and the submission. Phase 26 is approved and Andre's four answers are D-150: no code change and no release before the submission. Next: Andre's video, repository public, tag, X post and submission (SUBMISSION.md); his human QA items in NEXT-STEPS. Milestone 1 Steps 2–5 start only after judging, on the branch `milestone-1` with a new vault account. Never print tokens or keys.
