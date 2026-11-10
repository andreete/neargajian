# Next steps

Updated: Tue 10 Nov 2026, 13:40 WIB, after **Phase 21** (SentFund rebrand + KTP/face identity checks). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Where things stand

- **Phase 21 is done and verified locally** (BUILD-STATE Phase 21): lint, typecheck, 212/212 unit + integration tests, build, e2e 31/31, judge mode, hosted + kill switch, secret scan, `judge:verify`, and the real Claude KTP reader on the four synthetic specimen scenarios (3 verified, impostor failed on the face).
- The previous session was OOM-killed during `next build`; the cause (Turbopack crawling `contracts/target`) is fixed (D-120). Build under the watchdog (BUILD-STATE Phase 21).
- Code is on `origin` (`andreete/neargajian`) and on the new private **`discoverateagency-ops/sentfund`** (remote `sentfund`), branch `main`. No `release` branch yet, nothing deployed, nothing on-chain changed in Phase 21.
- **Hosting decided** (D-121): Railway Hobby runs the app; Cloudflare Free hosts the DNS of `sentfund.my.id` (registered at Sumopod; public resolvers answer SERVFAIL until the nameservers point at Cloudflare).

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

Also: check GitHub → Actions on `discoverateagency-ops/sentfund` for the Phase 21 commit (first run there; the image job now also self-tests the face models). If red, send the agent the failing step's log.

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
- Review server for Andre: started after Phase 21 on http://127.0.0.1:8092 if the PID files exist: stop with `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)` and `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`. From the laptop: `ssh -N -L 8092:127.0.0.1:8092 neardao@andre.tail66ca93.ts.net`, then http://127.0.0.1:8092.
- Scratch from the killed session (face test images, fonts, scripts) is kept in `~/.cache/sentfund-p21-scratch/`; `~/.cache/sentfund-contracts-target-aside` must not exist (it was moved back).

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/HOSTING.md (section 0), docs/BUILD-STATE.md (Phase 21) and docs/DECISIONS.md (D-116 to D-122). Check that RAILWAY_API_TOKEN, CLOUDFLARE_API_TOKEN and HOSTED_ANTHROPIC_API_KEY exist in .env (names only, never values) and that `dig +short NS sentfund.my.id @1.1.1.1` shows Cloudflare. If Andre said "deploy": do the agent steps in NEXT-STEPS "Then the agent", run the smoke test, update the docs, commit and push to origin and sentfund. Otherwise tell Andre exactly which item of HOSTING section 0 is missing.
