# Payout recovery: failed and uncertain outcomes

Version 1 · 9 Nov 2026 · Contract: `contracts/vault` (Phase 04). The release worker (Phase 12) automates the safe paths below; the unsafe ones always need a person.

## Row states and what they mean

| Row state (on-chain `get_row`) | Meaning | Money | Safe automatic action |
| --- | --- | --- | --- |
| *(none)* | Never requested | reserved, not committed | `pay_row` with the row's proof |
| `InFlight` | `pay_row` ran: the row was marked and `ft_transfer` was scheduled; the callback has not recorded an outcome yet | committed (counts against the run's reservation) | **none**: wait. Never retry. |
| `Paid` | The `ft_transfer` receipt succeeded and the callback booked it | paid, removed from books and reservation | none (final) |
| `Failed` | The `ft_transfer` receipt **failed** (proven by the runtime; NEP-141 `ft_transfer` panics before moving tokens), e.g. the recipient is not registered with tUSDC | back to reserved, not committed | fix the cause, then `pay_row` again (same index, destination and amount; `attempts` increases) |

The contract refuses `pay_row` for a row that is `InFlight` or `Paid`, so a duplicate request from a restarted worker, a double click or a replayed transaction cannot pay twice. The proof binds the retry to the original approved destination and amount.

## Run states

`PendingApproval → Approved → Releasing → Paid`, plus the terminal states `Rejected`, `Cancelled` (by the maker before release, or superseded by a new version) and `PartiallyPaid`.

- **Awaiting funding:** `start_release` fails with `Insufficient vault balance: awaiting funding` and changes nothing. Top up the vault (`ft_transfer_call` from the token), then release again. In automatic mode the worker retries after it sees the funding; in maker-release mode the maker releases again.
- **Needs attention** (app state): a releasing run with at least one `Failed` row. Show confirmed, pending and failed amounts separately.

## Procedures

### 1. Proven failure (`Failed`)

1. Read `get_row(run_id, index)` and the failed receipt (explorer or `node scripts/testnet/tx-receipts.mjs <tx> <signer>`).
2. Fix the cause. Typical case: the recipient is not registered. Register it with `storage_deposit` on the token.
3. Call `pay_row` again with the same arguments and proof. The worker may do this automatically, because a `Failed` row is proven not paid.

### 2. A recipient can never be paid: close the run

1. Make sure no row is `InFlight` (`get_run(...).in_flight_count == 0`).
2. Maker calls `close_partial(run_id)`. The run becomes `PartiallyPaid`, paid rows stay paid, unpaid rows stay unpaid, and the unused reservation returns to the available balance.
3. Pay the missing people in a **new run version** that goes through approval again. Never edit the closed run.

### 3. Uncertain outcome: RPC timeout or an unknown transaction result

An RPC timeout or a lost response proves nothing; the transaction may still execute.

1. Never retry because of a timeout. Retrying is safe on-chain anyway (an `InFlight` or `Paid` row is refused), but it costs gas and confuses the audit trail.
2. Look up the transaction by hash (the worker stores it before waiting) with `tx_status` / `EXPERIMENTAL_tx_status` and `wait_until: FINAL`, or read `get_row`.
3. If the row is `Paid` or `Failed`, act on that. If there is no row record, the `pay_row` call never executed and it can be sent again.

### 4. Stuck `InFlight` row: the callback never ran

This only happens if the `on_payout` callback itself failed, for example by running out of its 10 Tgas (measured use: about 2 Tgas). The `ft_transfer` outcome is still final on-chain.

1. Wait until at least `RESOLVE_AFTER_BLOCKS` (120 blocks, about 2 minutes) have passed since `requested_at_block`. The contract refuses earlier resolution, so it can never race a callback that is still on its way.
2. Find the `ft_transfer` receipt of that row: a NEP-141 `ft_transfer` event from the vault with memo `gajian:<run_id>:<index>` means it **was paid**. A failed `ft_transfer` receipt in the `pay_row` transaction means it **was not**.
3. Admin calls `resolve_in_flight(run_id, index, paid, evidence)` with the transaction hash as evidence. `paid = true` books the payout. `paid = false` marks a proven failure, which can then be retried as in procedure 1.
4. **Trust note:** this is an admin attestation. A wrong `paid = false` followed by a retry would pay twice. Only resolve from the final on-chain receipt, and double-check the recipient's token balance history. A mainnet design would remove this trust, for example by having the token report per-transfer outcomes, or by using `ft_transfer_call` with a receiver contract.

## What the app must persist (Phase 12)

Before sending any chain transaction, store a deterministic action ID (`run_id`, `index`, attempt), then the transaction hash as soon as it is known. After a restart, reconcile from the chain (`get_run`, `get_row`, `tx_status`) before doing anything else. The app shows **Paid** only when the contract says `Paid` for the run and the paid count and total match the approved version.
