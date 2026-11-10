# Next steps

Updated: Tue 10 Nov 2026, 13:40 WIB, after **Phase 21** (SentFund rebrand + KTP/face identity checks). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 21 is done and verified locally** (BUILD-STATE Phase 21): lint, typecheck, 212/212 unit + integration tests, build, e2e 31/31, judge mode, hosted + kill switch, secret scan, `judge:verify`, and the real Claude KTP reader on the four synthetic specimen scenarios (3 verified, impostor failed on the face).
- The previous session was OOM-killed during `next build`; the cause (Turbopack crawling `contracts/target`) is fixed (D-120). Build under the watchdog (BUILD-STATE Phase 21).
- Code is on `origin` (`andreete/neargajian`) and on the new private **`discoverateagency-ops/sentfund`** (remote `sentfund`), branch `main`. No `release` branch yet, nothing deployed, nothing on-chain changed in Phase 21.
- **Hosting decided** (D-121): Railway Hobby runs the app; Cloudflare Free hosts the DNS of `sentfund.my.id` (registered at Sumopod; public resolvers answer SERVFAIL until the nameservers point at Cloudflare).

## IN PROGRESS: Phase 22, testnet migration to `sentfund-payroll.testnet` (Andre's yes, 10 Nov 2026 ~07:05 UTC)

Andre: "you can migrate … continue with sentfund-payroll.testnet to make sure all align, run all safe without mistake". Plan (each step checked before the next; record every tx in docs/TESTNET.md):
1. Preconditions (read-only): name free; no live version on vault2; local review server + worker stopped.
2. Master `sentfund-payroll.testnet` from the faucet (10 NEAR); sub-accounts admin, maker, approver1, approver2, worker, recipient1-3, tusdc, vault (same funding as the gajian set).
3. Deploy tUSDC (`fd5a0b9a…`, same bytes as tusdc.gajian) with owner = admin; deploy the vault from the reproducible release Wasm `38953891…` (same bytes as vault2) at `vault.sentfund-payroll.testnet`, init two-in-sequence/automatic/caps 1/100; register with tUSDC; **delete its full-access key**; restricted keys per role.
4. Register recipients 1-3 with tUSDC; admin mints and funds the vault with 2.18 tUSDC.
5. `phase04-live.ts` on the new vault → 3 policy runs (0.18 paid) ending at workflow revision 3, vault 2.00 tUSDC. New `testnet-history.json` from those txs (`export-history.mjs`).
6. Switch code defaults, `.env` (write-env.mjs), tests, fixtures, specimens manifest, evidence (`finalVault`), docs to the new accounts; old gajian runs stay as labelled earlier-deployment evidence in judge:verify.
7. Hosted: delete the gajian host keys (before switching constants), add host keys on the new accounts, update Railway variables, new DEMO_RESET_TOKEN, release.
8. Local: `demo:reset` (old DB moved to data/backups), app run through the browser, `record-run-evidence`, judge:verify, judge:deployment.
Old deployment: vault2 stays locked with 1.94 tUSDC of the OLD token (zero value, cannot be moved without an approved run on it); the contract's payout memo prefix `gajian:` is in the frozen code and stays.

## Progress on HOSTING section 0 (10 Nov, 14:00 WIB)

- **Done: Cloudflare.** Zone `sentfund.my.id` is **Active** (Free) with nameservers `leonidas.ns.cloudflare.com` and `zelda.ns.cloudflare.com`, set at Sumopod (was `ns1/ns2.sumopod.com`); 1.1.1.1 and 8.8.8.8 answer with them. The zone has **no records yet**. `CLOUDFLARE_API_TOKEN` is in `.env` (verified active, can read the zone's DNS; given in chat, so **roll it after the deploy**).
- **Generated:** the deploy key pair `~/.ssh/sentfund_deploy` (public key given to Andre). **Not yet added** on GitHub (`git ls-remote` with it: permission denied). Push with: `git -c core.sshCommand="ssh -i ~/.ssh/sentfund_deploy -o IdentitiesOnly=yes" push sentfund …` (the remote URL can be switched to `git@github.com:discoverateagency-ops/sentfund.git`).
- **Still missing:** `RAILWAY_API_TOKEN` (Railway account, Hobby + card, GitHub app on `discoverateagency-ops/sentfund`), `HOSTED_ANTHROPIC_API_KEY`, the deploy key on GitHub.

## Single next action: Andre

Follow **`docs/HOSTING.md` section 0** (about 20 minutes):
1. Cloudflare: add `sentfund.my.id` (Free) → note the two nameservers.
2. Sumopod: set those two nameservers for `sentfund.my.id`.
3. Cloudflare API token (template "Edit zone DNS", zone `sentfund.my.id`).
4. Railway: Hobby plan with a card; connect the GitHub app to `discoverateagency-ops` → only `sentfund`; create an account token.
5. A second Anthropic key in its own workspace with a monthly spend limit.
6. Put `RAILWAY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `HOSTED_ANTHROPIC_API_KEY` into `.env` yourself (never in chat).
7. For pushes to `discoverateagency-ops/sentfund` in later sessions: either add a deploy key yourself (GitHub → repo Settings → Deploy keys → Add, **Allow write access**; the agent can generate the key pair and give you only the public key), or give a token at the start of the session. **Revoke the token pasted in chat on 10 Nov** (GitHub → Settings → Developer settings → Fine-grained tokens): it is in the conversation transcript.
8. Say **"deploy"**.

Also: check GitHub → Actions on `discoverateagency-ops/sentfund` (the token given on 10 Nov cannot read Actions, so the agent could not) for the Phase 21 commit (first run there; the image job now also self-tests the face models). If red, send the agent the failing step's log.

## Then the agent ("deploy", with Andre's yes)

1. `scripts/testnet/hosting-keys.sh add --yes` (host keys; record public keys and tx IDs in `docs/TESTNET.md`; never print private keys).
2. CI green on `main` → `git push sentfund main:release`.
3. Railway by API: project from `discoverateagency-ops/sentfund`, branch `release`, Wait for CI, health `/api/health`, 1 replica, volume `/data`, daily backups, variables (HOSTING step 4; `ANTHROPIC_API_KEY` = `HOSTED_ANTHROPIC_API_KEY`, `APP_BASE_URL=https://sentfund.my.id`), custom domain `sentfund.my.id`.
4. Cloudflare by API: the CNAME (apex, flattened) and TXT that Railway shows; wait for the certificate.
5. Smoke test (HOSTING step 6) + identity specimen check on the hosted site (dry run); record in `docs/TESTNET.md`; replace `<HOSTED-URL>` in README, SECURITY, VIDEO and X-POST.

## Order of work after that

1. Human QA on the hosted site (`docs/QA-HANDOFF.md`, A01–A12).
2. Fixes, released with Andre's yes (`docs/HOSTING.md` step 7).
3. Video on the hosted site (`docs/VIDEO.md`; add an identity-check scene: specimens → impostor fails), YouTube.
4. Repository public (Andre confirms which: `discoverateagency-ops/sentfund` is in SUBMISSION and X-POST now) and the `hackathon-submission` tag.
5. X post, submission by Friday 13 Nov (`docs/SUBMISSION.md`; Q-015 still open).
6. Online until at least 25 Nov; kill switch `HOSTED_READONLY=true`. Shutdown after 25 Nov (HOSTING step 12).

## State to know

- Vault2: 1.94 tUSDC. Top up to at most 2: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes).
- Workflow revision 3 (two in sequence, automatic release). Directory: Sales = Emma Clark + Daniel Hall, Operations = Grace Lewis (max 0.10 each), 1,000 sample employees (never identity-verified, so the 1,000-row sample can no longer be submitted while "Pay identity-verified recipients only" is on).
- Identity: the three live recipients are seeded as verified ("Demo seed"). Specimen checks on this copy change statuses (the impostor sets Daniel to Failed: re-run Daniel's specimen to verify him again); in hosted mode they are dry runs.
- `npm run judge:verify` 130/130.
- **Review server for Andre is running** (production build of Phase 21, started 13:04 WIB) on http://127.0.0.1:8092 with the release worker, on this server's database `data/gajian.sqlite` (kept, holds the Phase 19b run; migration 0009 applied on open: sign-ins are now `…@sentfund.my.id`, all 1,003 recipients **Not checked**, "Pay identity-verified recipients only" **off** because this database predates the seed). To try the identity check: admin → Identity checks → run the Emma/Daniel/Grace specimens (real Claude reader; ~5 s each), then switch the setting on. For the exact demo state instead: stop both processes and run `npm run demo:reset` (the current DB is moved to `data/backups/`, never deleted). Stop with `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)` and `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`. From the laptop: `ssh -N -L 8092:127.0.0.1:8092 neardao@andre.tail66ca93.ts.net`, then http://127.0.0.1:8092.
- Scratch from the killed session (face test images, fonts, scripts) is kept in `~/.cache/sentfund-p21-scratch/`; `~/.cache/sentfund-contracts-target-aside` must not exist (it was moved back).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/HOSTING.md (section 0), docs/BUILD-STATE.md (Phase 21) and docs/DECISIONS.md (D-116 to D-122). Check that RAILWAY_API_TOKEN, CLOUDFLARE_API_TOKEN and HOSTED_ANTHROPIC_API_KEY exist in .env (names only, never values) and that `dig +short NS sentfund.my.id @1.1.1.1` shows Cloudflare. If Andre said "deploy": do the agent steps in NEXT-STEPS "Then the agent", run the smoke test, update the docs, commit and push to origin and sentfund. Otherwise tell Andre exactly which item of HOSTING section 0 is missing.
