# Payout commitments and review digest

Version 1 · 9 Nov 2026 · Implemented in `src/server/commitments.ts` (app) and `contracts/vault/src/commitment.rs` (contract). Shared test vectors: `tests/vectors/commitments.json`, checked by both test suites and by an independent Python re-implementation during Phase 03.

## Why

An approver approves one immutable run version. The contract must pay exactly the approved rows: the same index, destination and amount, at most once each, and never more than the approved total. Storing 1,000 rows on-chain is expensive and would publish more than needed, so the run stores a 32-byte Merkle root, and each payout carries a short proof (at most 10 hashes for 1,000 rows).

Private review data (names, phones, emails, posting mode) never goes on-chain. The run stores only a salted digest of it, which binds the approval to the exact data the approver saw without revealing that data.

## Encoding

All integers are big-endian. `‖` is byte concatenation. SHA-256 everywhere.

| Item | Bytes |
| --- | --- |
| Leaf | `SHA-256( "GAJIAN:payout-leaf:v1" ‖ 0x00 ‖ u32(index) ‖ u8(len(account)) ‖ account ‖ u128(amount) )` |
| Node | `SHA-256( "GAJIAN:payout-node:v1" ‖ 0x00 ‖ left ‖ right )` |
| Review digest | `SHA-256( "GAJIAN:review-digest:v1" ‖ 0x00 ‖ salt[32] ‖ str(posting_mode) ‖ u32(row_count) ‖ for each row i: u32(i) ‖ str(account) ‖ str(receiver_name) ‖ str(currency) ‖ u128(amount) ‖ str(mobile_phone) ‖ str(email) )` |

- `index`: 0-based row position in the reviewed order (the original file order for uploads).
- `account`: the NEAR account ID as ASCII, validated with the NEAR rules (2–64 chars `[a-z0-9-_.]`, no leading, trailing or double separators), so its length fits in one byte.
- `amount`: tUSDC base units (6 decimals), 1 ≤ amount < 2^128.
- `str(x)`: `u32(len(utf8(NFC(x)))) ‖ utf8(NFC(x))`. Fields are the normalized values the app stored for review.
- `posting_mode`: `consolidated` or `detailed`.
- `salt`: 32 random bytes per run version, kept in the app database and never sent on-chain.
- The ASCII tag plus `0x00` separates the three hash domains, so a leaf can never be read as a node or as a review digest.

## Tree and odd-leaf rule

1. Level 0 is the list of leaf hashes in index order (1 to 1,000 rows).
2. Each next level hashes pairs left to right: `Node(level[2k], level[2k+1])`.
3. If a level has an odd number of nodes, the last node is **promoted unchanged** to the next level. It is never duplicated: duplication would let two different row lists share a root.
4. The single node of the last level is the root. A one-row run's root is its leaf hash.

## Proof and verification

- A proof is the list of sibling hashes from the leaf up, **skipping levels where the node was promoted**.
- Verifier input: `root`, `row_count` (both stored by the contract at run creation), and `index`, `account`, `amount`, `proof` (supplied by the payer).
- Algorithm: `h = Leaf(index, account, amount); pos = index; size = row_count`. While `size > 1`: if `pos` is odd, `h = Node(proof[next], h)`; else if `pos + 1 < size`, `h = Node(h, proof[next])`; else the node is promoted (no proof element). Then `pos = pos / 2` (floor) and `size = ceil(size / 2)`.
- Valid only if every proof element was used exactly once and `h == root`.
- `index ≥ row_count` and `row_count` outside 1–1,000 are invalid.

## What this guarantees, and what it does not

- **Changed amount, destination or index** → different leaf → proof fails (tested in TypeScript, Rust unit tests and the sandbox).
- **The same wallet and amount on two indexes** are two distinct leaves (the index is hashed), so both rows can be paid once each, and a proof for one index cannot pay the other. The importer shows a duplicate-wallet warning at review (PRD §4).
- **Overpayment:** the contract also keeps per-row state (`InFlight`, `Paid`, `Failed`) keyed by `(run_id, index)` and refuses any payout that would make the run's committed amount exceed its reservation. Even a root whose leaves add up to more than the declared total cannot pay more than that total (unit test `root_with_more_value_than_total_cannot_overpay`).
- **Not guaranteed by the contract:** that the root matches the rows the approver saw. The app computes the root and the review digest from the stored, immutable snapshot and shows the approver that version. This is the prototype's server trust model (README).

## Changing this format

Any change needs a new tag version (`…:v2`), new vectors, and matching changes in both implementations. Runs created under v1 keep verifying with v1.
