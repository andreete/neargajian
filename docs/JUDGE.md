# Judge mode: reproduce and verify

Everything below runs without any NEAR keys. Expected output is what we got on 9 Nov 2026 (Node 26.13.0, npm 11.20.0, Linux). Nothing here sends a transaction.

## 1. Fresh checkout and local checks (about 3 minutes plus installs)

```sh
git clone https://github.com/andreete/neargajian.git && cd neargajian
npm ci
npm run lint              # no output from ESLint = pass
npm run typecheck         # generates route types, then tsc --noEmit: no errors
npm test                  # Test Files 21 passed (21) · Tests 158 passed (158)
npm run samples:check     # regenerates the four sample files; no git diff (checksums in docs/SAMPLE-DATA.md)
npm run secret-scan       # secret-scan: clean (working tree + N commits)
```

## 2. Browser tests against the production build

```sh
npx playwright install chromium        # once
export SESSION_SECRET=$(openssl rand -hex 32)
npm run build
npm run test:e2e                       # 21 passed
```

`test:e2e` starts the build on 127.0.0.1:8092 with an isolated database under `.tmp/e2e`. The test-only fixture (`scripts/e2e-fixture.ts`) adds runs in every state against a stand-in vault, so no testnet access is needed.

## 3. Verify the live testnet evidence (read-only RPC)

```sh
npm run judge:verify
```

It reads `docs/evidence/testnet-runs.json` and checks, from the vault contract's own views and the final transaction outcomes:

```
== Phase 13: Complete flow through the app (detailed posting, automatic release)
   vault vault.gajian-payroll.testnet · run gjn-c042c3e14af142669ce4-v1
PASS  run status Paid (expected Paid)
PASS  run total 0.120000 tUSDC (expected 0.120000)
PASS  rows 3, paid 3
PASS  row 0: Paid 0.040000 tUSDC → recipient1.gajian-payroll.testnet
...
PASS  pay_row 2 (worker): ft_transfer event 0.020000 tUSDC → recipient3.gajian-payroll.testnet
PASS  pay_row 2 (worker) Ee67Kff6… final, signed by worker.gajian-payroll.testnet

All testnet evidence checks passed.
```

Every transaction is also linked from `docs/TESTNET.md` (NearBlocks testnet explorer).

## 3b. Verify the deployed vault's code and lock

```sh
npm run contracts:build                 # Rust 1.95.0 + cargo-near 0.23.0 (see README)
sha256sum contracts/target/near/gajian_vault/gajian_vault.wasm
# 38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0
npm run judge:deployment
# PASS  deployed code_hash equals the locally built Wasm
# PASS  no full-access key on vault2.gajian-payroll.testnet (0 keys in total)
```

`npm run judge:verify` (step 3) also checks the deployed `code_hash` against the recorded hash and the absence of full-access keys without building anything. It covers Phase 13 and every Phase 16 run (demo, maker release, Awaiting funding, fund migration), the deployment operations, eight on-chain refusals and every paid time in the exported CSVs (`docs/evidence/exports/`) against the block of its payout transaction: 115 checks in total.

## 4. Run the app locally (demo mode)

```sh
cp .env.example .env      # set SESSION_SECRET to a random 32+ character value; DEMO_MODE=true
npm run db:seed
npm run build && npm run start          # http://127.0.0.1:8092
```

Demo sign-ins (password `12345678`): `maker@gajian.my.id`, `app1@gajian.my.id`, `app2@gajian.my.id`, `admin@gajian.my.id`. Without the signer keys (which never leave our machine), you can browse dashboards, build and upload runs, review them and see the imported testnet history. Submitting to the vault needs the restricted signer keys, so judges verify the live flow through step 3 and the recorded screenshots (`docs/screenshots/phase-13/`) instead.

## 5. Contracts (optional, Rust toolchain)

```sh
npm run contracts:lint     # fmt + clippy -D warnings
npm run contracts:test     # unit + sandbox tests on a local nearcore 2.14.0
```
