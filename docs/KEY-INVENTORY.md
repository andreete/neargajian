# Key inventory (QA-A7-06)

Every access key on every NEAR testnet account SentFund controls, read from the chain on **12 Nov 2026, 07:10 UTC** (`finality: final`) with the read-only script `node scripts/testnet/key-inventory.mjs` (add `--json` for machine output). The script never opens a private key file, never reads `.env` and sends no transaction. It marks where a key's private half is kept by checking whether a key file of that exact public key exists in this server's keychain (`~/.near-credentials/testnet/<account>/<public key>.json`) and whether the public key is one of the hosted demo's keys (`.hosting/host-keys.public.json`). **No private key is in this document.** Testnet only: there are no mainnet accounts or keys.

Where the private half lives:

- **This server, keychain**: `~/.near-credentials` (near-cli legacy keychain, user `neargajian`, mode 600). The function-call keys of the five SentFund roles are also copied into the git-ignored `.env` (mode 600) by `scripts/testnet/write-env.mjs`, which reads them from the keychain; the app and the worker sign with those.
- **Railway + .hosting**: the hosted demo's own four keys, in Railway Variables and in this server's git-ignored `.hosting/host-keys.env` (mode 600). Delete after the event: `scripts/testnet/hosting-keys.sh delete --yes` (Andre's yes).
- **Nowhere**: the account has no access key at all.

## SentFund deployment (live since Phase 22)

| Account | NEAR | Public key | Access | Methods (on `vault.sentfund-payroll.testnet`) | Allowance | Private key | Can move funds? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sentfund-payroll.testnet` (master) | 3.08 | `ed25519:BKx7w9B4…` | **Full** | all | – | this server | Its own NEAR; creates sub-accounts. No tUSDC. |
| `vault.sentfund-payroll.testnet` | 2.40 | **no key** | – | – | – | nowhere | **No one** can sign for it or change its code. Its 2.000000 tUSDC leave only through `pay_row` of an approved run. |
| `tusdc.sentfund-payroll.testnet` | 2.20 | `ed25519:2Yk71MVs…` | **Full** | all | – | this server | **Yes, indirectly**: a full-access key on a token contract can redeploy the token and rewrite any balance, the vault's included (zero-value test token). |
| `admin.sentfund-payroll.testnet` | 0.49 | `ed25519:35ztGWoT…` | function-call | `update_workflow`, `resolve_in_flight` | 0.25 | this server (+ `.env`) | No payout. It can change the workflow for **future** runs (who the maker, approvers and worker are, the caps). |
| | | `ed25519:7MjrwvBr…` | **Full** | all | – | this server | Its own NEAR and tUSDC; it is the tUSDC **owner** (can mint test tokens). |
| `maker.sentfund-payroll.testnet` | 0.40 | `ed25519:95CK5dhQ…` | function-call | `create_run`, `cancel_run`, `close_partial`, `start_release`, `pay_row` | 0.25 | this server (+ `.env`) | Not alone (needs both approvals). |
| | | `ed25519:5Ti71fij…` | function-call | `create_run`, `cancel_run` | 0.10 | Railway + .hosting | Not alone. |
| | | `ed25519:HUpNWBPP…` | **Full** | all | – | this server | Its own NEAR. |
| `approver1.sentfund-payroll.testnet` | 0.40 | `ed25519:J3KLwEHU…` | function-call | `approve`, `reject` | 0.25 | this server (+ `.env`) | Not alone. |
| | | `ed25519:DpSffGqM…` | function-call | `approve`, `reject` | 0.05 | Railway + .hosting | Not alone. |
| | | `ed25519:2DMofN9R…` | **Full** | all | – | this server | Its own NEAR. |
| `approver2.sentfund-payroll.testnet` | 0.40 | `ed25519:rXv1z3QE…` | function-call | `approve`, `reject` | 0.25 | this server (+ `.env`) | Not alone. |
| | | `ed25519:HkuCzSaY…` | function-call | `approve`, `reject` | 0.05 | Railway + .hosting | Not alone. |
| | | `ed25519:krnLcDUg…` | **Full** | all | – | this server | Its own NEAR. |
| `worker.sentfund-payroll.testnet` | 0.39 | `ed25519:CDQmFZ1V…` | function-call | `start_release`, `pay_row` | 0.49 | this server (+ `.env`) | Not alone: pays only proven rows of approved runs. |
| | | `ed25519:CPWASqgF…` | function-call | `start_release`, `pay_row` | 0.25 | Railway + .hosting | Not alone. |
| | | `ed25519:APsSqt1b…` | **Full** | all | – | this server | Its own NEAR. |
| `recipient1`, `recipient2`, `recipient3` `.sentfund-payroll.testnet` | 0.05 each | one key each (`DNQtvXTJ…`, `6TnBeeS6…`, `DwcmDMdP…`) | **Full** | all | – | this server | Their own NEAR and the tUSDC they were paid. |

## Earlier gajian deployment (retired, kept as evidence)

| Account | NEAR | Keys | Private key | Can move funds? |
| --- | --- | --- | --- | --- |
| `gajian-payroll.testnet` (master) | 0.46 | 1 **full** (`8FvAnGEA…`) | this server | Its own NEAR. |
| `vault2.gajian-payroll.testnet` (final earlier vault) | 2.40 | **no key** | nowhere | No one; 1.940000 tUSDC of the earlier token leave only through an approved run of that vault. |
| `vault.gajian-payroll.testnet` (Phase 04 vault) | 2.60 | 1 **full** (`3SNXPYaM…`) | this server | Its NEAR; it holds **0 tUSDC**. Its code can still be changed (retired, documented in TESTNET.md). |
| `tusdc.gajian-payroll.testnet` | 2.20 | 1 **full** (`2WmbmW6V…`) | this server | Can redeploy the earlier token (zero value). |
| `admin.gajian-payroll.testnet` | 0.49 | full (`8hs6Y1mk…`); function-call `update_workflow, resolve_in_flight` on vault2 (`2SuCWPWx…`) and on the Phase 04 vault (`Gc2N4YyM…`) | this server | As for the SentFund admin. |
| `maker.gajian-payroll.testnet` | 0.40 | full (`2EjTjBqj…`); function-call `create_run, cancel_run, close_partial, start_release, pay_row` on vault2 (`4oFAnfr4…`) and the Phase 04 vault (`Fsc2KagzC…`) | this server | Not alone. |
| `approver1.gajian-payroll.testnet` | 0.40 | full (`CvGTXQQa…`); function-call `approve, reject` on vault2 (`FAGYVC4u…`) and the Phase 04 vault (`7yErYJex…`) | this server | Not alone. |
| `approver2.gajian-payroll.testnet` | 0.40 | full (`xcY1XbTL…`); function-call `approve, reject` on vault2 (`JCmXVHv1…`) and the Phase 04 vault (`5Vim6X1a…`) | this server | Not alone. |
| `worker.gajian-payroll.testnet` | 0.38 | full (`EZTyPZgC…`); function-call `start_release, pay_row` on vault2 (`2KdbWmzG…`) and the Phase 04 vault (`DySSdpKY…`) | this server | Not alone. |
| `recipient1..3.gajian-payroll.testnet` | 0.05 each | 1 full each | this server | Their own NEAR and earlier-token tUSDC. |

The four Phase 21 host keys on the gajian accounts were deleted in Phase 22 (TESTNET.md).

## Vault settings that bound the risk

| Vault | Workflow | Caps (per row / per run) | tUSDC |
| --- | --- | --- | --- |
| `vault.sentfund-payroll.testnet` | revision 3, two in sequence, automatic release | 1.000000 / 100.000000 | 2.000000 available, 0 reserved |
| `vault2.gajian-payroll.testnet` | revision 3, two in sequence, automatic release | 1.000000 / 100.000000 | 1.940000 (earlier token) |
| `vault.gajian-payroll.testnet` | revision 5 | 1.000000 / 100.000000 | 0 |

## What this means

- **QA-A7-06 passes as worded:** every key the app or the hosted demo signs with is a **function-call** key limited to named vault methods with a small NEAR allowance and no deposit; no full-access key is used by the app, and none is in Railway.
- **No single key moves the vault's funds**, and no key can change an approved run (the root is fixed and each row pays once). But the server is still trusted: **together**, the maker, both approver and worker keys (all held on this server, and a second set on Railway) can create, approve, release and pay a **new** run to any accounts, up to the vault balance (2 tUSDC, zero value) and the 100 tUSDC run cap. Milestone 1 F2 removes this (approvers sign with their own wallets; the server keeps only an executor key).
- **Full-access keys on this server** (all role accounts, both masters, both tokens, the Phase 04 vault, the recipients) are operator keys for deploy, mint, storage and key management. They never leave this host. The token full-access keys are the strongest: a real pilot must use a token we do not control (USDC/USDT), never our own.
- **Shutdown after 25 Nov:** delete the four host keys (`hosting-keys.sh delete --yes`), then the Railway variables. Consider deleting the role accounts' function-call keys for the retired gajian vaults.
