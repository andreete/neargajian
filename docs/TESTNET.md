# NEAR testnet record

Public information only: account IDs, contract IDs, transaction hashes and explorer links. **Never** keys, seed phrases or `.env` contents. Network: **testnet** only (no mainnet, ever).

- RPC: `https://rpc.testnet.near.org` (provider list: https://docs.near.org/api/rpc/providers)
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
| Vault contract | [`vault.gajian-payroll.testnet`](https://testnet.nearblocks.io/address/vault.gajian-payroll.testnet) | [`Efcy6kUe…`](https://testnet.nearblocks.io/txns/Efcy6kUes8dwHcZ76v38AX4sMTemVp76znfC13J9Fs3Z) | funded 2.6 NEAR |
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
| Vault (`gajian-vault` Phase 02 skeleton) | `vault.gajian-payroll.testnet` | `ee8d9b7b5cf4b6479f0518e34e32de569b7282b5b4782a57d5ab197dce811e8d` | 157,596 B | 02 (built before `cargo fmt`; the formatted source builds `9145511b…` because panic line numbers moved, same logic) | [`8QwaP4gK…`](https://testnet.nearblocks.io/txns/8QwaP4gKC4Lxdkt9X3CpeMnMkQfzYuGfrZo9gHGgR4fN) |

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

## Live runs and NEAR spent

| Date | Run | Rows | tUSDC paid | NEAR spent (gas) | Evidence |
| --- | --- | --- | --- | --- | --- |
| 9 Nov 2026 | Account setup (10 sub-accounts) | — | — | 0.0712 | table above |
| 9 Nov 2026 | Phase 02 deploy + register + fund + `p02-run-1` | 1 | 0.050000 | 0.0053 (plus 0.0025 NEAR storage deposits and ~3.1 NEAR locked for contract storage, both still held by our accounts) | Phase 02 table |
