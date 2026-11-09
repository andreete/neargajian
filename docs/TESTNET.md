# NEAR testnet record

Public information only: account IDs, contract IDs, transaction hashes and explorer links. **Never** keys, seed phrases or `.env` contents. Network: **testnet** only (no mainnet, ever).

- RPC: `https://rpc.testnet.fastnear.com` (since 9 Nov 2026; `rpc.testnet.near.org` is deprecated and returned HTTP 429 "switch to FastNEAR") (provider list: https://docs.near.org/api/rpc/providers)
- Explorer: `https://testnet.nearblocks.io` (links below). near-cli also prints `explorer.testnet.near.org` links for the same hashes.
- Network state checked 9 Nov 2026: nearcore `2.14.0-rc.5`, protocol 88.
- Keys: `~/.near-credentials/testnet/` on the dev server only (legacy keychain of near-cli-rs 0.31.1).
- Read-only helpers: `node scripts/testnet/balances.mjs` (NEAR + tUSDC per account), `node scripts/testnet/tx-receipts.mjs <hash> <signer>` (receipt chain and logs).

## Accounts (created 9 Nov 2026)

One faucet-funded master; every role is a sub-account funded by the master (D-038). Reuse them for all later runs.

| Role | Account ID | Creation tx | Notes |
| --- | --- | --- | --- |
| Master (faucet-funded, creates sub-accounts) | [`gajian-payroll.testnet`](https://testnet.nearblocks.io/address/gajian-payroll.testnet) | [`7U6z9xpb…`](https://testnet.nearblocks.io/txns/7U6z9xpboTrwrGXKi5DkxKNoYCDGbLezfJQNknLsqGUH) | 10 NEAR from the faucet service; full-access key |
| tUSDC token contract | [`tusdc.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/tusdc.gajian-payroll.testnet) | [`7CkMT8dU…`](https://testnet.nearblocks.io/txns/7CkMT8dULfMh3xwtvUZ59yEA2NGQ51ed8AvKUCjde6s9) | funded 2.2 NEAR; NEP-141, 6 decimals, owner = admin |
| **Final vault (Phase 16, used by the app)** | [`vault2.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/vault2.gajian-payroll.testnet) | [`FFUnH2wU…`](https://testnet.nearblocks.io/txns/FFUnH2wUUeR5XVKsZzZyfyM6QUEQAu4L21gsjWuyMJ6B) | funded 2.4 NEAR; release build, **no full-access key** (code locked) |
| Phase 04 vault (retired in Phase 16, kept readable) | [`vault.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/vault.gajian-payroll.testnet) | [`Efcy6kUe…`](https://testnet.nearblocks.io/txns/Efcy6kUes8dwHcZ76v38AX4sMTemVp76znfC13J9Fs3Z) | funded 2.6 NEAR; balance moved to the final vault, 0 tUSDC left |
| Admin signer (token owner, workflow admin) | [`admin.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/admin.gajian-payroll.testnet) | [`3pSa8YYr…`](https://testnet.nearblocks.io/txns/3pSa8YYro5zVckhVtasbG2QbNjzg9ukZt8yYut2wwTEU) | 0.5 NEAR |
| Maker signer | [`maker.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/maker.gajian-payroll.testnet) | [`BQ4H6f2t…`](https://testnet.nearblocks.io/txns/BQ4H6f2tNNgMoU26nxWGy7dcKjjRwLouVMdihfiKtR6R) | 0.4 NEAR |
| Approver 1 signer | [`approver1.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/approver1.gajian-payroll.testnet) | [`GVqzpYD1…`](https://testnet.nearblocks.io/txns/GVqzpYD1QuiJXDQfXHYF2XTREFVFgG66rDvWM4d2FPpT) | 0.4 NEAR |
| Approver 2 signer | [`approver2.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/approver2.gajian-payroll.testnet) | [`7oZPDYaD…`](https://testnet.nearblocks.io/txns/7oZPDYaDzD7NP1HJEjjaUPwGzyEZG9kfTuCDgK1sRwFa) | 0.4 NEAR |
| Release worker signer | [`worker.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/worker.gajian-payroll.testnet) | [`B2EMwyPX…`](https://testnet.nearblocks.io/txns/B2EMwyPXU9rCz3BoqgQwF3uNZxKfDQFehySgH7AxA2nh) | 0.4 NEAR |
| Demo recipient 1 | [`recipient1.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/recipient1.gajian-payroll.testnet) | [`GNHEhePd…`](https://testnet.nearblocks.io/txns/GNHEhePdtbe7kEwaGCZ7FpuWExhxnKWWcZqmBtRaATSR) | 0.05 NEAR; tUSDC-registered |
| Demo recipient 2 | [`recipient2.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/recipient2.gajian-payroll.testnet) | [`B4yGxBzB…`](https://testnet.nearblocks.io/txns/B4yGxBzBaW4QkjE9jpXUD5a6AECDggF1ZzKvhZJenYmS) | 0.05 NEAR |
| Demo recipient 3 | [`recipient3.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/recipient3.gajian-payroll.testnet) | [`9edsHCw2…`](https://testnet.nearblocks.io/txns/9edsHCw2TJLpQU5VstgiSFm8SuLg5BZBZFtAfwfaPa5g) | 0.05 NEAR |

Creating the 10 sub-accounts cost 0.071 NEAR in gas (10.000 → 9.929 NEAR across all accounts).

## Deployments

| Contract | Account | Wasm SHA-256 | Size | Phase | Deploy tx |
| --- | --- | --- | --- | --- | --- |
| tUSDC (`gajian-tusdc` 0.1.0) | `tusdc.gajian-payroll.testnet` | `fd5a0b9a3aa46e2da097b1e7920e25184c08ff789574f9c41f5ef221761dd28d` | 153,849 B | 02 | [`MU9UKTdR…`](https://testnet.nearblocks.io/txns/MU9UKTdR4QGjZMMk8jHbAM3KvvtS77FjTz6rKYMiYoS) |
| ~~Vault (`gajian-vault` Phase 02 skeleton)~~ deleted in Phase 04 | `vault.gajian-payroll.testnet` | `ee8d9b7b5cf4b6479f0518e34e32de569b7282b5b4782a57d5ab197dce811e8d` | 157,596 B | 02 (built before `cargo fmt`; the formatted source builds `9145511b…` because panic line numbers moved, same logic) | [`8QwaP4gK…`](https://testnet.nearblocks.io/txns/8QwaP4gKC4Lxdkt9X3CpeMnMkQfzYuGfrZo9gHGgR4fN) |
| Vault (`gajian-vault` Phase 04), retired in Phase 16 | `vault.gajian-payroll.testnet` (recreated) | `306c7f15a6ecf34d9e77fe4e51e53ad6b646a345af55ab3fbbe5d3d38849162a` | 214,632 B | 04 | [`DKWoV943…`](https://testnet.nearblocks.io/txns/DKWoV9435TLRc4rfUe62gxp3b7z7dByq4TJZKnG2GmjT) |
| **Vault (`gajian-vault`, final)**, release commit `cf4d9a1` | `vault2.gajian-payroll.testnet` | `38953891dc449f13eb64a8706ff66f81d5438c86abf820edfc36cbe8996752c0` (on-chain `code_hash` `4osoZq17KezE6AfBUtma6Ciqnti4oKMPJSYcXQBxNmNP`) | 214,272 B | 16 | [`7vEa2kTt…`](https://testnet.nearblocks.io/txns/7vEa2kTthxwp5SUWGWgqUUw4y61H6GutrUStnhCvidV) |

The Phase 16 vault has the same source as Phase 04 (contract freeze, D-051). Only the build changed: machine paths are remapped (`scripts/build-contracts.sh`), so the bytes no longer depend on the checkout path or user. Two clean clones of `cf4d9a1` at different paths with separate target directories built byte-identical Wasm (sha256 above).

## Phase 02 live run: first contract-controlled payout (9 Nov 2026)

Script: `scripts/testnet/phase02-single-payout.sh` (log of the run kept locally only). All steps are real testnet transactions.

| # | Step | Tx | Result |
| --- | --- | --- | --- |
| 1 | Deploy tUSDC + `new(owner_id=admin)` | [`MU9UKTdR…`](https://testnet.nearblocks.io/txns/MU9UKTdR4QGjZMMk8jHbAM3KvvtS77FjTz6rKYMiYoS) | ok |
| 2 | Deploy vault + `new(admin, token, maker, approver1, worker)` | [`8QwaP4gK…`](https://testnet.nearblocks.io/txns/8QwaP4gKC4Lxdkt9X3CpeMnMkQfzYuGfrZo9gHGgR4fN) | ok |
| 3 | Register vault with tUSDC (`storage_deposit`, 0.00125 NEAR) | [`3nT1Dcxa…`](https://testnet.nearblocks.io/txns/3nT1DcxaLt4FhcRafqhTsZv88SP9VXSLmhG7zVQmc82U) | ok |
| 4 | Register recipient1 with tUSDC | [`BcH46qmR…`](https://testnet.nearblocks.io/txns/BcH46qmRAq6jnZ9aVtrRdG9Kh2yvKBY2pmccpEMDds53) | ok |
| 5 | Admin mints 1 tUSDC to itself | [`1DRRwTvt…`](https://testnet.nearblocks.io/txns/1DRRwTvt9MfHXMG33U2SApeS7J8ZoXg8iM6NtSKZmnu) | ok |
| 6 | Fund vault: `ft_transfer_call` 1 tUSDC admin → vault (`ft_on_transfer` credits the books) | [`2Acj5k1A…`](https://testnet.nearblocks.io/txns/2Acj5k1AQi7gsYdNCjrHALdpVeuAZc3sVikVsu18GgBV) | ok, used 1000000 |
| 7 | Maker `create_run(p02-run-1)`: 0.05 tUSDC → recipient1 | [`9nPkiwHz…`](https://testnet.nearblocks.io/txns/9nPkiwHz86SU6E6b9Yr4PWMHq3QSdmnhWFETE3gsV3WV) | ok, PendingApproval |
| 8 | Worker `start_release` **before approval** | [`BtkgTjy5…`](https://testnet.nearblocks.io/txns/BtkgTjy5sKh2rg7uNnU5XrRKp97ZcovQmH9v63pzaymL) | **failed as expected**: `Run is not approved for release` |
| 9 | Approver1 `approve` | [`CaPgWr2k…`](https://testnet.nearblocks.io/txns/CaPgWr2khsPp4oJqXTsYxYwyJj36UTy8N1WNX8MzontM) | ok, Approved |
| 10 | Worker `start_release` (reserves 0.05) | [`EYSLrasc…`](https://testnet.nearblocks.io/txns/EYSLrascnRZ4gUT8ikYm2k9WmCWVDKHd47EYkWk11snb) | ok, Releasing |
| 11 | **Worker `pay_row(0)` → `ft_transfer` → `on_payout`** | [`7DwmqekZ…`](https://testnet.nearblocks.io/txns/7DwmqekZtpB7u2L3JU4wEv9DoXKTdYhaQKaDXWnt5xwL) | **ok, returned `true`; NEP-141 event vault → recipient1 50000, memo `gajian:p02-run-1:0`** |
| 12 | Worker `pay_row(0)` again (duplicate) | [`6Hg4aX2q…`](https://testnet.nearblocks.io/txns/6Hg4aX2qC3cHWQwNZPVa7oBeZG9HqzMH3EVB8VtAMeXq) | **failed as expected**: `Run is not releasing` |

Final state (RPC, finality `final`): run `p02-run-1` = `Paid`, paid 50000 of 50000; vault books `total 950000, reserved 0, available 950000`; token ledger: vault 0.950000 tUSDC, recipient1 0.050000 tUSDC. Books and ledger match.

## Phase 04: retire the Phase 02 vault (9 Nov 2026)

The Phase 04 vault has a new state layout, so the account was recreated. Its 0.95 tUSDC went back to the admin through the old vault's own approved flow (every row 0.095 tUSDC), then the account was deleted. Script: `scripts/testnet/phase04-retire-p02-vault.sh`.

| Step | Tx | Result |
| --- | --- | --- |
| Maker `create_run(p02-drain)`: 10 rows × 0.095 tUSDC → admin (old API) | [`BZNkzBYv…`](https://testnet.nearblocks.io/txns/BZNkzBYvvzKE3fiCeoq4rqWbAi9LBVWofuZwzZgnL1uM) | ok |
| Approver1 `approve` | [`71wbYGD2…`](https://testnet.nearblocks.io/txns/71wbYGD2wXdhQFcxD1w3ywAiN8TJ8ZsacRqYWikUSovG) | ok |
| Worker `start_release` | [`cVv7s38h…`](https://testnet.nearblocks.io/txns/cVv7s38hiQ33ErYTukK83QR3u7vsYrnrLq49nXtA2Mi) | ok |
| Worker `pay_row` rows 0–9 (each `true`) | [0](https://testnet.nearblocks.io/txns/Fet8zYwNr1DC9DDiwycHrANWd2CMwRYmitxkazVJ7zCL) [1](https://testnet.nearblocks.io/txns/58sZkJPpUviztiSGx83wugtw9bx89pP5HMpR5ChetxWR) [2](https://testnet.nearblocks.io/txns/J4xBVnczPdX9N4VTqdCw3gUZKTXRWvQ9mcLcBhqkq6iH) [3](https://testnet.nearblocks.io/txns/9ZRizR2yyCxM8GdoCsghwcpBMRgSYHK9d1LkunpsbUEC) [4](https://testnet.nearblocks.io/txns/G2GzToeS7dsQMgfEKtrsccPptwxSQ2aBJxfGWvahcFTw) [5](https://testnet.nearblocks.io/txns/2nBWGQWfTvzmDUmvGJ7FywATPoxHCDgL6Jw2qSqyxUVD) [6](https://testnet.nearblocks.io/txns/FHqgiUZPtgtn5shuxf6favvYMMPnNnynLWmVjTGssDDZ) [7](https://testnet.nearblocks.io/txns/AQKMPmbzz39Na7GvbDS6zVPeRvRFCBn6fjZoaxg24ZS4) [8](https://testnet.nearblocks.io/txns/3hhUC3v8b113rJPSZZtQfS9TAFk7Bc9XGFERRRBcwF1V) [9](https://testnet.nearblocks.io/txns/EaqSFT61e1vXPatfps9cDz38yhcarRqqdfieteHcHrGn) | ok, vault 0 tUSDC, admin 0.95 |
| Delete `vault.gajian-payroll.testnet` (beneficiary master) | [`42mNc2W4…`](https://testnet.nearblocks.io/txns/42mNc2W4XMCSMkRvm8nND6Bn1xCvRQVmukei29q5gTRw) | ok, storage NEAR back to the master |

## Phase 04: deploy and restricted signer keys (9 Nov 2026)

Script: `scripts/testnet/phase04-setup.sh`. Each signer role now has a **function-call-only access key** that can call only the listed vault methods, without attaching deposits; the app and the live driver sign with these keys (`.env`, written by `scripts/testnet/write-env.mjs`). Full-access keys stay in `~/.near-credentials` for operator actions (deploy, mint, storage deposits).

| Step | Tx | Result |
| --- | --- | --- |
| Recreate `vault` (2.6 NEAR from master) | [`5NPTVvAX…`](https://testnet.nearblocks.io/txns/5NPTVvAXj8MFfjvD6Cek7ZGU1Bg4jzPapzxnBanYu2nD) | ok |
| Deploy Phase 04 vault + `new` (2 in sequence, automatic, caps 1 / 100 tUSDC) | [`DKWoV943…`](https://testnet.nearblocks.io/txns/DKWoV9435TLRc4rfUe62gxp3b7z7dByq4TJZKnG2GmjT) | ok |
| Register vault with tUSDC | [`AnFJAdJm…`](https://testnet.nearblocks.io/txns/AnFJAdJm3FvZ5YKqKXBsaGbNahL86YKDav3tMM3bQD8H) | ok |
| Register recipient2 | [`LC5sKbtR…`](https://testnet.nearblocks.io/txns/LC5sKbtRDQ1NLdPEKMTZ9Rccq6wDZRvSJGTmhRHHTc8) | ok |
| Register recipient3 | [`8cH5WMar…`](https://testnet.nearblocks.io/txns/8cH5WMarj14ML8APWX6tiu2avtdsonQUjeTqAfA9Kqhm) | ok |
| Admin mints 0.05 tUSDC (holds 1.00 after the drain) | [`8pbSDkNQ…`](https://testnet.nearblocks.io/txns/8pbSDkNQkf8fEm4SJaEQQkmMv65PAC8oFUnup5MntGPC) | ok |
| Fund vault: `ft_transfer_call` 1 tUSDC | [`Fvxa553k…`](https://testnet.nearblocks.io/txns/Fvxa553ku4ti5KZRWjNifsguZVGfAY8vwqHbAqruapbH) | ok |
| Function-call key: maker → `create_run, cancel_run, close_partial, start_release, pay_row` (allowance 0.25 NEAR) | [`jfkDoAQ2…`](https://testnet.nearblocks.io/txns/jfkDoAQ2vooYWuTJifmLqj9cyd2djAjpKBC7SdPAzui) | ok |
| Function-call key: approver1 → `approve, reject` (0.25 NEAR) | [`Fg995Enq…`](https://testnet.nearblocks.io/txns/Fg995EnqgQG1yaWrnn1YhQ1kjJzDmYVwcLHGTgCEnJpu) | ok |
| Function-call key: approver2 → `approve, reject` (0.25 NEAR) | [`8A6JnavZ…`](https://testnet.nearblocks.io/txns/8A6JnavZwRMmyqDYuYK2X62Te8VDtWsdy8UgrAVUen54) | ok |
| Function-call key: worker → `start_release, pay_row` (0.5 NEAR) | [`GznmUm96…`](https://testnet.nearblocks.io/txns/GznmUm96VJUdY76N1oJsuqKEi12x5qt4TQdWzKeZ7va1) | ok |
| Function-call key: admin → `update_workflow, resolve_in_flight` (0.25 NEAR) | [`EZYk5mjk…`](https://testnet.nearblocks.io/txns/EZYk5mjkgJyM6edEQWJHtnFbHGxVZQxKuxnRpTrEoD42) | ok |

Checked: the worker's restricted key calling `approve` is refused before reaching the chain: `Transaction method name <approve> isn't allowed by the access key.`

## Phase 04 live runs: contract-enforced approval policies (9 Nov 2026, 10:47 UTC)

Driver: `node scripts/testnet/phase04-live.ts` (commitments and proofs from `src/server/commitments.ts`, every call signed with the role's restricted key).

| Run | Rows (recipient amount tUSDC) | Total | Policy snapshot | Final status |
| --- | --- | --- | --- | --- |
| `p04-seq-202611091047` | recipient1 0.030000, recipient2 0.070000, recipient3 0.050000 | 0.150000 | TwoSequential, Automatic (rev 1) | **Paid** |
| `p04-par-202611091047` | recipient2 0.020000, recipient3 0.010000 | 0.030000 | TwoParallel, Maker (rev 2) | **Paid** |
| `p04-rej-202611091047` | recipient1 0.010000 | 0.010000 | TwoParallel, Maker (rev 2) | **Rejected** |

| # | Step | Signer | Tx | Result |
| --- | --- | --- | --- | --- |
| 1 | run1 create (2 in sequence, automatic) | maker | [`GzCjK9Kh…`](https://testnet.nearblocks.io/txns/GzCjK9KhBSehhiQ6t2uKjfcpenWc3r5S632P9h2eu7tF) | ok: `run/workflow returned` |
| 2 | run1 approver2 before approver1 | approver2 | [`GJcGj4WP…`](https://testnet.nearblocks.io/txns/GJcGj4WPT4GhtNDowQ8N5QfrE34yHK1EiJBabPVgfNrp) | **rejected as expected**: `Approver 2 can act only after approver 1 approved` |
| 3 | run1 approver1 approves | approver1 | [`5JjWMB3D…`](https://testnet.nearblocks.io/txns/5JjWMB3D7SxqFozzQ38psj88YpygnQcDkbpAzoyzJMES) | ok: `"PendingApproval"` |
| 4 | run1 worker release before final approval | worker | [`CZsAPrnu…`](https://testnet.nearblocks.io/txns/CZsAPrnuYM8n6VN6PhzAmtXfSPAWsJVau79Qsgnn7hpv) | **rejected as expected**: `Run is not approved for release` |
| 5 | run1 approver2 approves | approver2 | [`3idDNziF…`](https://testnet.nearblocks.io/txns/3idDNziFG1Y2tWcjUba5uYfD9SNP5ohsabNGkVTN8xty) | ok: `"Approved"` |
| 6 | run1 maker release in automatic mode | maker | [`5EbiJBsW…`](https://testnet.nearblocks.io/txns/5EbiJBsWgSgrYQ3jtoGzAwFngZDhEkbgtQJbN9jYRoEy) | **rejected as expected**: `Only the release worker can release this run (automatic release` |
| 7 | run1 worker reserves total | worker | [`CW1asRBq…`](https://testnet.nearblocks.io/txns/CW1asRBq6tJB89tJzoLFiikKMvP5H1nUe8ovxarJJc34) | ok: `"Releasing"` |
| 8 | run1 worker pays row 0 | worker | [`3JxCtfXo…`](https://testnet.nearblocks.io/txns/3JxCtfXomzLrGvSwsFT3AVXB9HnzxLWgEBzAGRkCMKPF) | ok: `true` |
| 9 | run1 worker pays row 1 | worker | [`GDd9YWkE…`](https://testnet.nearblocks.io/txns/GDd9YWkE44AJLptJQ98EdJ7Kmz5fnBio4wwKtQmm9Ff) | ok: `true` |
| 10 | run1 worker pays row 2 | worker | [`9DKhPivd…`](https://testnet.nearblocks.io/txns/9DKhPivdPHpMPi82UhA5C3ri9Zr2SygdEiCptHM1euZR) | ok: `true` |
| 11 | run1 duplicate payout of row 0 | worker | [`9rXgzDWG…`](https://testnet.nearblocks.io/txns/9rXgzDWGdaFv99rEgw9vdR7cBq3vp4NwRQc6Eck6JKhq) | **rejected as expected**: `Run is not releasing` |
| 12 | admin: 2 in parallel + maker release (revision 2) | admin | [`HVEfJFg9…`](https://testnet.nearblocks.io/txns/HVEfJFg9gqMBswNMfBD3bHkRUdPX94oso4dERic5T7L1) | ok: `run/workflow returned` |
| 13 | run2 create at stale revision 1 | maker | [`B6yp7NxG…`](https://testnet.nearblocks.io/txns/B6yp7NxGa6JrKMPMisFrQH1AF4oBccMoozCTXc2ARGn7) | **rejected as expected**: `Workflow changed since review: reload and confirm again` |
| 14 | run2 create (2 in parallel, maker release) | maker | [`HcuQ6rrG…`](https://testnet.nearblocks.io/txns/HcuQ6rrGrdH5sbhG38CTNm8QL4JwxVDzmP9qqyLVfkxg) | ok: `run/workflow returned` |
| 15 | run2 approver2 approves first | approver2 | [`2aRhtrQW…`](https://testnet.nearblocks.io/txns/2aRhtrQWy8QcTgLLFtCU3FQkwiu3khPax3Qs34CFQ8Ym) | ok: `"PendingApproval"` |
| 16 | run2 approver1 approves | approver1 | [`EFkkJudv…`](https://testnet.nearblocks.io/txns/EFkkJudvRe9FWy7Y2ihGx1CTGhrwXCmnskhKstRisMwt) | ok: `"Approved"` |
| 17 | run2 worker release in maker mode | worker | [`G9sgA8X9…`](https://testnet.nearblocks.io/txns/G9sgA8X9JJ7wGJZFoqLn6wa36F4Goga2jxhmNRajE8XA) | **rejected as expected**: `Only the maker can release this run (maker release` |
| 18 | run2 maker releases | maker | [`4av69XHL…`](https://testnet.nearblocks.io/txns/4av69XHLUMRKrWeXWYF3x8vKGbPMv5wnXgov7RbGZCoe) | ok: `"Releasing"` |
| 19 | run2 tampered amount | maker | [`7TUUMNJT…`](https://testnet.nearblocks.io/txns/7TUUMNJTvUTGTzngZUDqKATiN69PKQCFNdbEph5DU1Tn) | **rejected as expected**: `Payout proof does not match the approved run` |
| 20 | run2 maker pays row 0 | maker | [`8bZ6chcL…`](https://testnet.nearblocks.io/txns/8bZ6chcLc6RRAQKpo6ZPyDxSYnLqwph8AiSjhzt2fAVY) | ok: `true` |
| 21 | run2 worker pays row 1 | worker | [`EnfLJSx2…`](https://testnet.nearblocks.io/txns/EnfLJSx231Yo2r42pHRtXPLGBp8H3LF6A4tidP79xuGF) | ok: `true` |
| 22 | run3 create | maker | [`C32vGB2k…`](https://testnet.nearblocks.io/txns/C32vGB2kaT5QWsvCYq9vLDPQdv3x4bQcZSXdPf1Eg6hQ) | ok: `run/workflow returned` |
| 23 | run3 approver1 rejects | approver1 | [`3uW7d5P6…`](https://testnet.nearblocks.io/txns/3uW7d5P6WzxYLnv7HQHDEvY5N1a8yAYa7XabKN8M3n7g) | ok: `"Rejected"` |
| 24 | run3 maker release after rejection | maker | [`FB58uo5U…`](https://testnet.nearblocks.io/txns/FB58uo5UpWCLiGaypv2Eurr3hkRFXAehsqTTRPyb1Fen) | **rejected as expected**: `Run is not approved for release` |
| 25 | admin: back to 2 in sequence + automatic (revision 3) | admin | [`5cK2gf4z…`](https://testnet.nearblocks.io/txns/5cK2gf4zTy9R7itMZ7YZrGnXg96mGfW9L5H893n6fh8S) | ok: `run/workflow returned` |

Final state (RPC, `final`): vault books `total 0.820000, reserved 0`; token ledger: vault 0.820000, recipient1 0.080000, recipient2 0.090000, recipient3 0.060000 tUSDC (Phase 02 + Phase 04 payouts). Books and ledger match. Active workflow: revision 3 (two in sequence, automatic release).

## Phase 07: workflow changes through the app (9 Nov 2026)

Sent by the production app (`POST /api/admin/workflow` as `admin@gajian.my.id`), signed with the admin's restricted function-call key; the app activated each revision only after re-reading `get_workflow` from the vault.

| Step | Tx | Result |
| --- | --- | --- |
| Revision 4: two approvers in parallel, maker release | [`9uFmgbRC…`](https://testnet.nearblocks.io/txns/9uFmgbRC3npJuxhpuxUv4zUqMjL9pvatfG9JhpsWKhZh) | ok, app shows revision 4 active |
| Revision 5: back to two in sequence, automatic release (demo default) | [`2sQjKbtV…`](https://testnet.nearblocks.io/txns/2sQjKbtVha9g5oSdrPycsyNp829TxZbc6yiCFyWRsvAv) | ok, app shows revision 5 active |
| Same reviewer twice | — | refused by the app before any transaction ("Choose two different reviewers.") |

Active vault workflow now: **revision 5**, two in sequence (approver1 → approver2), automatic release, caps 1 / 100 tUSDC. The seed mirrors it (`SEED_WORKFLOW` in `src/server/db/seed.ts`).

## Phase 13: complete flow through the app (9 Nov 2026)

Driven in the browser (Playwright against the production build on 127.0.0.1:8092, `npm run live:phase13`, spec `tests/live/phase13.spec.ts`), never by scripts: the maker uploaded `tests/live/live-3-rows.csv`, chose **detailed posting** and submitted; approver 1 and then approver 2 approved in the browser; the release worker (`npm run worker`, its own process, stopped afterwards) released and paid. Every transaction was signed by the app with the role's restricted function-call key.

Run "November contractors (live testnet)", version 1, vault run `gjn-c042c3e14af142669ce4-v1`, 3 rows, total 0.12 tUSDC, workflow revision 5 (two in sequence, automatic release).

| # | Step (UTC) | Signer | Tx | Result |
| --- | --- | --- | --- | --- |
| 1 | 13:18:10 maker submits (`create_run`) | maker | [`4oyBhx2k…`](https://testnet.nearblocks.io/txns/4oyBhx2kATjLb7Cesfp6LioEfVxmuP9WSUEFAeNCcPMF) | ok, PendingApproval |
| 2 | 13:28:47 approver 1 approves | approver1 | [`BtCpa3C4…`](https://testnet.nearblocks.io/txns/BtCpa3C4CBca9KyrWquRdfzAdpYLfasC9SviFovWeUgH) | ok, confirmed 13:28:50 |
| 3 | 13:28:52 approver 2 approves | approver2 | [`2XfXfgzN…`](https://testnet.nearblocks.io/txns/2XfXfgzNqsqajrEoj8KaFRU4FwAjYZc5LSgGY84DUKuo) | ok, Approved (confirmed 13:28:56) |
| 4 | 13:28:54 worker `start_release` | worker | [`8M53CacB…`](https://testnet.nearblocks.io/txns/8M53CacBjHr5Dhhr2G6Fh6Sr3ecZJhLcYqpNbGUJfrmK) | ok, Releasing, 0.12 reserved |
| 5 | 13:28:54 `pay_row` 0 → recipient1, 0.04 | worker | [`Awh72Fb6…`](https://testnet.nearblocks.io/txns/Awh72Fb6syidtHQ488FEU6DVtSruhYvSsZubcQoGuQ9X) | ok, `true` (ft_transfer event: recipient1, 40000) |
| 6 | 13:29:11 `pay_row` 1 → recipient2, 0.06 | worker | [`BcXTo8SA…`](https://testnet.nearblocks.io/txns/BcXTo8SA84kVy6reY7hCenkY831Phn2p6aZxqRdS9V9o) | ok, `true` |
| 7 | 13:29:21 `pay_row` 2 → recipient3, 0.02 | worker | [`Ee67Kff6…`](https://testnet.nearblocks.io/txns/Ee67Kff6BNer8FpBUT9yKJGaJ6AWTJWfedxYXCKaCkQz) | ok, `true`, run Paid |

Balances (`node scripts/testnet/balances.mjs`, RPC `final`), before → after:

| Account | Before | After | Change | Expected |
| --- | --- | --- | --- | --- |
| vault | 0.820000 | 0.700000 | −0.120000 | −0.120000 |
| recipient1 | 0.080000 | 0.120000 | +0.040000 | +0.040000 |
| recipient2 | 0.090000 | 0.150000 | +0.060000 | +0.060000 |
| recipient3 | 0.060000 | 0.080000 | +0.020000 | +0.020000 |

Every balance changed by exactly the paid amount. History shows the run in both views (consolidated 0.12 = detailed 0.12, references `GJN-UP6YUKW8`, lines `-0001..-0003`); the company CSV and the recipient-detail CSV were downloaded from the app. Screenshots: `docs/screenshots/phase-13/`. NEAR spent: 9.89790 → 9.89493 = **0.00297 NEAR** (gas only).

## Phase 16: final vault and live rehearsal through the app (9 Nov 2026)

Everything below is on NEAR testnet. App steps were driven in a browser (`npm run live:phase16`, `tests/live/phase16.spec.ts`) against the production build and the release worker on 127.0.0.1:8092. Operations outside the app's normal flow used `scripts/testnet/phase16-deploy.sh` and `scripts/testnet/phase16.ts`. Vault actions were always signed with the role's restricted function-call key. Re-check everything read-only with `npm run judge:verify` (93/93 checks pass) and `npm run judge:deployment`.

### 16a · Final vault from the release commit, locked

| # | Step | Signer | Tx | Result |
| --- | --- | --- | --- | --- |
| 1 | Create `vault2.gajian-payroll.testnet` (2.4 NEAR) | master | [`FFUnH2wU…`](https://testnet.nearblocks.io/txns/FFUnH2wUUeR5XVKsZzZyfyM6QUEQAu4L21gsjWuyMJ6B) | ok |
| 2 | Deploy the release Wasm (sha256 `38953891…`) + `new` (two in sequence, automatic release, caps 1 / 100 tUSDC) | vault2 | [`7vEa2kTt…`](https://testnet.nearblocks.io/txns/7vEa2kTthxwp5SUWGWgqUUw4y61H6GutrUStnhCvidV) | ok, workflow revision 1 |
| 3 | Register vault2 with tUSDC | admin | [`6p72Zqxw…`](https://testnet.nearblocks.io/txns/6p72ZqxwNW1u9HvZrUycP2oq8bxhiM7SSW6qiSK2pDBZ) | ok |
| 4 | **Delete vault2's only full-access key** (`ed25519:FHHqhwmx…`) | vault2 | [`8FxcRfsL…`](https://testnet.nearblocks.io/txns/8FxcRfsL8ushQhPFfNvqjo51qHVj6KVkaZW1jvYTDWYF) | ok: 0 keys left, code can never change |
| 5–9 | Restricted function-call keys on vault2 for maker, approver 1, approver 2, worker, admin | each role | [`T3iBajyn…`](https://testnet.nearblocks.io/txns/T3iBajyng9f116e3AobSTp1DZnuQxSzK4fvL4AFgX7e) [`AGYQp3qH…`](https://testnet.nearblocks.io/txns/AGYQp3qH4qM4ctVcpSBzjLptX1tcFWpLvY8rMHDh9vrs) [`D6j3VYDJ…`](https://testnet.nearblocks.io/txns/D6j3VYDJv5fMTcPuByAmerLBNC5jDcFhGfNLsa8UQidx) [`5ViLoMh2…`](https://testnet.nearblocks.io/txns/5ViLoMh2sV1ir1V6DgJy6QwN7MgNFfUqUBW2SsPv4abj) [`8NEZkMY9…`](https://testnet.nearblocks.io/txns/8NEZkMY9rjdpi4ZnfeFEqi3MCXCAyEp1rcb6C6j9HAir) | ok (same method lists as Phase 04) |
| 10 | Migration run `p16-migrate-202611091439` on the **old** vault: create (maker) | maker | [`3s3fNvET…`](https://testnet.nearblocks.io/txns/3s3fNvETpko2aHD7oAow7Nc1YF2pRbCHHbGBmtDyebyn) | ok, 1 row: 0.70 tUSDC → admin |
| 11 | approve (approver 1) | approver1 | [`3ywfE8xJ…`](https://testnet.nearblocks.io/txns/3ywfE8xJUpUht7ivbCFS3vm7JcbFz2xH3ubUsBdJUouJ) | `"PendingApproval"` |
| 12 | approve (approver 2) | approver2 | [`HvjeydQC…`](https://testnet.nearblocks.io/txns/HvjeydQCTHqo2KY69kRbdTmzHxPd5aexj1GxJZZLVq3G) | `"Approved"` |
| 13 | start_release (worker) | worker | [`Eci9LLv4…`](https://testnet.nearblocks.io/txns/Eci9LLv469KAxE6x3rLXhSDnGZeGryLnNAc6Lv66aFfR) | `"Releasing"` |
| 14 | pay_row 0 → admin (worker) | worker | [`7wgi6HNZ…`](https://testnet.nearblocks.io/txns/7wgi6HNZMq1McJTFLXi2xbeFturVzqNXcq26zFE2fPhQ) | `true`, old vault 0 tUSDC |
| 15 | Admin funds vault2 with 0.70 tUSDC (`ft_transfer_call`, the only way the vault books funds) | admin | [`A6UfQojC…`](https://testnet.nearblocks.io/txns/A6UfQojCmXQ338DMKsS3JNuQpLf9yzVYCdBcfb6QimZQ) | `"700000"` used; vault2 books 0.70 |

The app was then pointed at vault2 (`node scripts/testnet/write-env.mjs` rewrote `.env` with the vault2 keys; `scripts/testnet/switch-vault.ts` mirrored vault2's workflow revision 1 into the app database and superseded the old vault's revision 5). The migration run is listed in the app as an **operations transfer**, never as payroll.

### 16e · Full demo through the app: detailed posting, automatic release

Run "Phase 16 rehearsal: November contractors", vault run `gjn-b3bbdf502fcd477d958b-v1`, rows 0.05 / 0.03 / 0.04 = 0.12 tUSDC.

| Step | Signer | Tx |
| --- | --- | --- |
| Maker submits (`create_run`) | maker | [`9zn7zAv8…`](https://testnet.nearblocks.io/txns/9zn7zAv89zf4PRmLWsZX28DGBexP6ZEfe5YpEpt6xfUQ) |
| Approver 1 approves in the browser | approver1 | [`39qXFDVH…`](https://testnet.nearblocks.io/txns/39qXFDVHyz3xBd5avEZjoq8pUhXPXaPZExvowB28qhTV) |
| Approver 2 approves in the browser | approver2 | [`28kxEMbG…`](https://testnet.nearblocks.io/txns/28kxEMbGAeMTDmyPFG2PVgowHaGZ9mAzgoTKdBE2LX8n) |
| Worker `start_release` | worker | [`BhiKobSB…`](https://testnet.nearblocks.io/txns/BhiKobSBJdaaK73UmhhLMwBiZSn1uw6T6qjoJ28dur1o) |
| `pay_row` 0 / 1 / 2 → recipient1 / 2 / 3 | worker | [`1BKKAueP…`](https://testnet.nearblocks.io/txns/1BKKAueP99jyq3HrqARzNSp93fRXK4ZAjphyztkjepc) [`CbbvUE7p…`](https://testnet.nearblocks.io/txns/CbbvUE7pbyNXhDtBKdQ1P5ojU2epmHYSzRkBHHMMQkVM) [`6xjYGwVY…`](https://testnet.nearblocks.io/txns/6xjYGwVYmQEqPNSzUjdqBAKD3qUnbAdFn65QFrtgxHME) |

Paid 3 of 3 in the app with explorer links; history shows it in the consolidated and detailed views. The company CSV and the recipient-detail CSV were downloaded; their lines match the UI (references `GJN-UHZFZX9V-0001..0003`, 0.050000 / 0.030000 / 0.040000).

### 16c · Maker release through the app (and back to automatic)

| Step | Signer | Tx |
| --- | --- | --- |
| Admin switches to "Maker releases" in the app (workflow revision 2) | admin | [`6qn1L6VT…`](https://testnet.nearblocks.io/txns/6qn1L6VTiP8hzc7hnKWi38P1v3wPAhqH9mqG3tfNX3SJ) |
| Maker submits "Phase 16 rehearsal: maker release" (consolidated, 0.02 / 0.04 / 0.03 = 0.09), `gjn-b8686812506e46a58811-v1` | maker | [`HSqGAcBj…`](https://testnet.nearblocks.io/txns/HSqGAcBjyWtAVB3FNfQu4nWCE3iSosxVVLLNd91akheq) |
| Approver 1 / approver 2 approve in the browser | approver1, approver2 | [`25ZSZ2R7…`](https://testnet.nearblocks.io/txns/25ZSZ2R7wbcrD1TqCbJG816a8np3o7ptrUxLwHH2dcFh) [`4zhhcLMQ…`](https://testnet.nearblocks.io/txns/4zhhcLMQjDSjpR5BXXgwLJ2833Kgt6HY51CX7MigUoMz) |
| **Maker clicks "Release payments"** (`start_release` with the maker's key) | maker | [`Cor9XzgL…`](https://testnet.nearblocks.io/txns/Cor9XzgLdty47newTqZWzbPKofj9AVRN5cgHz3ySH5g9) |
| Worker `pay_row` 0 / 1 / 2 | worker | [`4uKNnqpD…`](https://testnet.nearblocks.io/txns/4uKNnqpD6snGDUBrs6kCUU8TrzRYPtJ52WcPBKNH6NrE) [`9r5NuZpL…`](https://testnet.nearblocks.io/txns/9r5NuZpLVV6xnXThbRvFUJufwsB8PCabX9jdd5CcGmj) [`5ocd2h98…`](https://testnet.nearblocks.io/txns/5ocd2h98tu7T7bE7vUvF3oNZq8hEqGXH9TwrTodSNHv6) |
| Admin switches back to "Automatic release" in the app (workflow revision 3, active now) | admin | [`GvJxnx9e…`](https://testnet.nearblocks.io/txns/GvJxnx9eyVnKz6rLKa2C7stMoLoEb1YaM6JPNCyu4Ruc) |

### 16b · Live row-level duplicate payout refused

While the maker-release run was still **Releasing with 1 of 3 rows paid**, `scripts/testnet/phase16.ts duplicate gjn-b8686812506e46a58811-v1 0` sent `pay_row` for the already-paid row 0 again, with the worker's restricted key and the row's real proof:

| Step | Signer | Tx | Result |
| --- | --- | --- | --- |
| Duplicate `pay_row` 0 | worker | [`65Bfb7cj…`](https://testnet.nearblocks.io/txns/65Bfb7cjk6U19wTWYiTijb9yeL1W5gV1L2VM4N9S81tD) | **rejected as expected**: `Row is already paid`; run still Releasing, paid count unchanged (1) |

(The Phase 04 duplicate attempt was refused with `Run is not releasing`, because that run had already finished. This one proves the row-level guard inside a live, releasing run.)

### 16d · Awaiting funding, funded by the admin, paid automatically

Vault2 held 0.49 tUSDC. Run "Phase 16 rehearsal: November bonuses" (`gjn-648622d67c1e4c47a8b3-v1`, detailed, 0.30 / 0.25 / 0.20 = 0.75 tUSDC; every row within 0.01–1.00, the run within the 100 tUSDC cap):

| Step | Signer | Tx | Result |
| --- | --- | --- | --- |
| Maker submits | maker | [`y4m6PGjM…`](https://testnet.nearblocks.io/txns/y4m6PGjMHdcg1gef7GdE1ouiL3pus63JTLAk7xw8qxK) | ok |
| Approver 1 / approver 2 approve in the browser | approver1, approver2 | [`Bg51f2GM…`](https://testnet.nearblocks.io/txns/Bg51f2GM6QEksReJNquCsX25Wp3aeFtCUotW5o6fSVKj) [`CdNojjaU…`](https://testnet.nearblocks.io/txns/CdNojjaUB7JhsNUpBvJZHRnZaxkmQJWQmbcUWcSW25gj) | Approved |
| Worker `start_release` (attempt 1) | worker | [`7g7TouYY…`](https://testnet.nearblocks.io/txns/7g7TouYYt46zHV4GZiV1thEAa7Y8joJTNqVS62WXMq3S) | **refused**: `Insufficient vault balance: awaiting funding`; the app shows **Awaiting funding** (run page and list) |
| Admin mints 0.50 test tUSDC (mock token) | admin | [`8MEZ3sio…`](https://testnet.nearblocks.io/txns/8MEZ3sioG9dhJ3hY8yA2cYUyuLq8QzwPVeLi85AZgEC2) | ok |
| Admin funds vault2 with 0.50 tUSDC (`ft_transfer_call`) | admin | [`F2f721YJ…`](https://testnet.nearblocks.io/txns/F2f721YJ4sNvi2P5jt2pcebBym4u3fY4HLvJcNPUEsm1) | vault2 books 0.99 |
| Worker `start_release` (attempt 2, retried automatically after 60 s) | worker | [`Hu2czk1h…`](https://testnet.nearblocks.io/txns/Hu2czk1hR6w21qaseoagxZ3DL59dNz4wu2n1bfaCgmb3) | Releasing |
| Worker `pay_row` 0 / 1 / 2 | worker | [`56UPmkwb…`](https://testnet.nearblocks.io/txns/56UPmkwb4fyhnyBaimqCjoZvG17Lbo9dv1zBUyjzYAQT) [`93Yp7k4g…`](https://testnet.nearblocks.io/txns/93Yp7k4gyHxXXeWJxsaJe8dUmjD6qDSCUHuyMF164hjv) [`Hnaz3p3P…`](https://testnet.nearblocks.io/txns/Hnaz3p3PtRQeBYU1gQvRMuoFPRNPvvbn94LLdjUo5wfv) | Paid 3 of 3 |

### 16e · 1,000-row import check (app, not on-chain)

`public/templates/gajian-payroll-uniform-1000.csv` uploaded in the running app as a draft ("Phase 16 import check: 1,000 rows (not submitted)"): accepted, 1,000 rows, exact total 10.00 tUSDC, first 50 rows in file order. It was not submitted (1,000 payouts are out of scope for the rehearsal). The accounting fixture (1 consolidated entry vs 1,000 detailed entries, both 10.000000) is checked by `tests/integration/reports.test.ts`.

### Balances (`node scripts/testnet/balances.mjs`, RPC `final`)

| Account | Before Phase 16 | After | Change | Explained by |
| --- | --- | --- | --- | --- |
| vault (Phase 04) | 0.700000 | 0.000000 | −0.700000 | migration run |
| vault2 (final) | (did not exist) | 0.240000 | +0.240000 | +0.70 migrated +0.50 funded −0.12 −0.09 −0.75 paid |
| admin | 0.000000 | 0.000000 | 0 | received 0.70 and minted 0.50, forwarded both to vault2 |
| recipient1 | 0.120000 | 0.490000 | +0.370000 | 0.05 + 0.02 + 0.30 |
| recipient2 | 0.150000 | 0.470000 | +0.320000 | 0.03 + 0.04 + 0.25 |
| recipient3 | 0.080000 | 0.350000 | +0.270000 | 0.04 + 0.03 + 0.20 |

Every balance changed by exactly the paid amounts. NEAR across all our accounts: 9.89493 → 9.87311 = **0.02182 NEAR spent** in Phase 16 (mostly the 214 KB deploy; the 2.4 NEAR that funds vault2's storage stays inside our accounts).

### Not done on testnet (labelled)

The old vault (`vault.gajian-payroll.testnet`) keeps its full-access key; it is retired and holds no tUSDC. The tUSDC token was not redeployed (unchanged since Phase 02). Paths proven only locally or in the sandbox: an unknown transaction outcome (landed or lost), two release workers at once, a failed token transfer with bounded retries, and a worker crash between claim and signing. They need fault injection that testnet does not allow safely.

## Live runs and NEAR spent

| Date | Run | Rows | tUSDC paid | NEAR spent (gas) | Evidence |
| --- | --- | --- | --- | --- | --- |
| 9 Nov 2026 | Account setup (10 sub-accounts) | — | — | 0.0712 | table above |
| 9 Nov 2026 | Phase 02 deploy + register + fund + `p02-run-1` | 1 | 0.050000 | 0.0053 (plus 0.0025 NEAR storage deposits and ~3.1 NEAR locked for contract storage, both still held by our accounts) | Phase 02 table |
| 9 Nov 2026 | Phase 04: retire old vault (drain 10 × 0.095 to admin, delete), recreate + deploy, 3 registrations, fund, 5 function-call keys, 3 live runs (25 steps) | 5 | 0.180000 to recipients (+0.950000 returned to admin) | 0.0253 | Phase 04 tables |
| 9 Nov 2026 | Phase 07: 2 workflow updates via the app | — | — | ≈ 0.0005 | Phase 07 table |
| 9 Nov 2026 | Phase 13: live app run (submit, 2 approvals, release, 3 payouts) | 3 | 0.120000 | 0.00297 | Phase 13 table |
| 9 Nov 2026 | Phase 16: final vault deploy + lock + 5 keys, fund migration (6 txs), 3 app runs (demo, maker release, awaiting funding), 2 workflow changes, duplicate proof, funding | 9 | 0.960000 to recipients (+0.70 migrated) | 0.02182 | Phase 16 tables |

**Total testnet NEAR burned so far: ≈ 0.127 NEAR** (10.00000 → 9.87311 across all our accounts; storage deposits and contract storage stay inside our accounts).
