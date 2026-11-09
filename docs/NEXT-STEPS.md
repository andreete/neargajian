# Next steps

Updated: Tue 10 Nov 2026 (WIB), after Phase 19b (live assistant run) and Phase 20 (hosting readiness). Deadline 2026-11-14 23:59 UTC = 2026-11-15 06:59 WIB; **our target: submit by Friday 13 Nov**.

## Single next action

**Andre: prepare the accounts** in `docs/HOSTING.md` step 1, and **decide the domain**:
- a Railway Hobby account with a card;
- GitHub access limited to this repository;
- a second Anthropic key in its own workspace with a monthly spend limit;
- the domain: **`app.gajian.my.id` (recommended)** or the apex `gajian.my.id`, which today serves your existing "Gajian — HR & Payroll Modern untuk UMKM Indonesia" site on Vercel and would be replaced.

Then tell the agent "add the host keys" and "push main to release".

Running for review on http://127.0.0.1:8092 (this server's database, unchanged by Phase 20; it holds the Phase 19b run), final vault `vault2.gajian-payroll.testnet` (1.94 tUSDC):

- production server, PID in `.tmp/review-server.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/review-server.pid)`
- release worker, PID in `.tmp/worker.pid` → stop: `kill $(cat /home/neargajian/near-gajian/.tmp/worker.pid)`

## Order of work

1. ~~Hosting readiness~~ (Phase 20, done).
2. **Andre's accounts** (`docs/HOSTING.md` step 1) and the domain decision.
3. **Host keys and go live**:
   - agent, with Andre's yes: `scripts/testnet/hosting-keys.sh add --yes`, then `git push origin main:release`;
   - Andre: Railway project, volume, backups, variables, domain (steps 3–5);
   - together: the smoke test (step 6), recorded in `docs/TESTNET.md`.
4. **Human QA on the hosted site** (`docs/QA-HANDOFF.md`, A01–A11).
5. **Fixes**, released with Andre's yes (`docs/HOSTING.md` step 7).
6. **Video** on the hosted site, local as a fallback (`docs/VIDEO.md`); upload to YouTube.
7. **Repository public** and the `hackathon-submission` tag (no pre-hackathon tag).
8. **X post** (`docs/X-POST.md`: repository, video and demo links).
9. **Submission by Friday 13 Nov** (`docs/SUBMISSION.md`; Q-015, a second project, still open).
10. **Online until at least 25 Nov**; the kill switch `HOSTED_READONLY=true` is ready (step 10).
11. **Shutdown after 25 Nov** (step 12): host keys deleted on-chain (agent, with your yes), Railway project deleted, DNS records removed, the hosted Anthropic key revoked.

Once the URL is live, replace `<HOSTED-URL>` in README, SECURITY, VIDEO and X-POST.

## State to know

- Vault2: 1.94 tUSDC after the Phase 19b run. Top up to at most 2: `node scripts/testnet/phase16.ts top-up 2.00` (with Andre's yes).
- Workflow revision 3 (two in sequence, automatic release). Directory: Sales = Emma Clark + Daniel Hall, Operations = Grace Lewis (max 0.10 each); the 1,000 sample employees are in Engineering, Customer Support and Logistics.
- `npm run judge:verify` 130/130. The live assistant run is `gjn-6e2922fcf5cd4d0f91f1-v1`.
- Railway: `railway.json` is not available for new services; the runbook uses the dashboard (D-110).

## Open items

- Push: deploy key works (`main` only).
- Testnet NEAR: about 9.87 NEAR across our accounts (≈ 0.130 burned); master 0.46 NEAR.

## Resume prompt

> Read CLAUDE.md, docs/NEXT-STEPS.md, docs/HOSTING.md and docs/BUILD-STATE.md. Andre has prepared the Railway account, GitHub access, a second Anthropic key and chosen the domain (he will say which). With his explicit yes: run `scripts/testnet/hosting-keys.sh add --yes` (record the public keys and tx IDs in docs/TESTNET.md; never print the private keys), then `git push origin main:release`. Guide him through docs/HOSTING.md steps 3–6 and run the smoke test. Then update the docs and stop.
