//! GAJIAN payroll vault (NEAR testnet only).
//!
//! Flow: the maker creates an immutable run → the assigned approver (a different account)
//! approves → the release worker reserves the run total from the vault's tUSDC balance →
//! the worker pays each row with `ft_transfer`, and a private callback records the real
//! asynchronous outcome per row.
//!
//! Runs commit to their rows with a Merkle root over `(index, receiver, amount)` leaves
//! (see `commitment.rs` and docs/COMMITMENTS.md); every payout must present a proof, so a
//! changed amount, destination or index cannot be paid. No private data is ever on-chain:
//! the run stores only the root, the row count, the total and a salted review digest.
//!
//! Money invariants enforced here:
//! - The vault is credited only by the configured token, through `ft_on_transfer`.
//! - Nothing is paid before approval; release reserves the full run total first.
//! - A row is marked in flight before its transfer and can never be paid twice.
//! - A row is retried only after a proven failure (the transfer receipt failed).
//! - The sum of all transfers of a run can never exceed its approved total.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
pub mod commitment;

use commitment::{Hash, MAX_ROWS, leaf_hash, parse_hash, verify_proof};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue, env, near, require,
};

/// Gas for the token's `ft_transfer` (the standard implementation uses ~3 Tgas).
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
/// Gas reserved for our own outcome callback.
pub const GAS_FOR_PAYOUT_CALLBACK: Gas = Gas::from_tgas(10);
/// Run IDs are chosen by the app (deterministic per version) so retries are idempotent.
pub const MAX_RUN_ID_LEN: usize = 64;

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Runs,
    Rows,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunStatus {
    PendingApproval,
    Approved,
    Releasing,
    Paid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowStatus {
    /// Transfer requested; outcome not yet recorded. Never retried automatically.
    InFlight,
    /// The transfer receipt succeeded.
    Paid,
    /// The transfer receipt failed (proven); the row may be retried.
    Failed,
}

/// Per-row payout state, keyed by (run_id, index). Destination and amount are copied from
/// the verified leaf so a retry can only repeat the original approved transfer.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowRecord {
    pub status: RowStatus,
    pub receiver_id: AccountId,
    pub amount: U128,
    /// Number of transfer attempts (1 + retries after proven failures).
    pub attempts: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Run {
    pub maker: AccountId,
    /// Approver snapshotted at creation; later config changes do not affect this run.
    pub approver: AccountId,
    pub row_count: u32,
    pub total: U128,
    /// Merkle root (hex) over the ordered payout leaves.
    pub payout_root: String,
    /// Salted SHA-256 (hex) of the private review snapshot; the salt stays off-chain.
    pub review_digest: String,
    pub status: RunStatus,
    /// Amount reserved from the vault balance at release.
    pub reserved: U128,
    /// Sum of rows in flight or paid. Never exceeds `reserved`.
    pub committed: U128,
    pub paid: U128,
    pub paid_count: u32,
}

#[near(serializers = [json])]
pub struct Config {
    pub admin: AccountId,
    pub token: AccountId,
    pub maker: AccountId,
    pub approver: AccountId,
    pub worker: AccountId,
}

#[near(serializers = [json])]
pub struct Balances {
    /// tUSDC held by the vault according to its own books.
    pub total: U128,
    /// Part of `total` reserved for runs being released.
    pub reserved: U128,
    /// `total - reserved`: what a new release can reserve.
    pub available: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    admin: AccountId,
    token: AccountId,
    maker: AccountId,
    approver: AccountId,
    worker: AccountId,
    total_balance: u128,
    total_reserved: u128,
    runs: LookupMap<String, Run>,
    rows: LookupMap<(String, u32), RowRecord>,
}

fn require_distinct(accounts: &[&AccountId]) {
    for (i, a) in accounts.iter().enumerate() {
        for b in &accounts[i + 1..] {
            require!(
                a != b,
                "Maker, approver and worker must be distinct accounts"
            );
        }
    }
}

fn validate_run_id(run_id: &str) {
    require!(
        !run_id.is_empty() && run_id.len() <= MAX_RUN_ID_LEN,
        "run_id must be 1-64 characters"
    );
    require!(
        run_id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_'),
        "run_id may only contain a-z, 0-9, '-' and '_'"
    );
}

#[near]
impl Vault {
    #[init]
    pub fn new(
        admin: AccountId,
        token: AccountId,
        maker: AccountId,
        approver: AccountId,
        worker: AccountId,
    ) -> Self {
        require_distinct(&[&maker, &approver, &worker]);
        Self {
            admin,
            token,
            maker,
            approver,
            worker,
            total_balance: 0,
            total_reserved: 0,
            runs: LookupMap::new(StorageKey::Runs),
            rows: LookupMap::new(StorageKey::Rows),
        }
    }

    // ---------------------------------------------------------------- maker

    /// Maker creates an immutable run from its commitment. The approver is snapshotted.
    pub fn create_run(
        &mut self,
        run_id: String,
        row_count: u32,
        total: U128,
        payout_root: String,
        review_digest: String,
    ) -> Run {
        require!(
            env::predecessor_account_id() == self.maker,
            "Only the maker can create runs"
        );
        validate_run_id(&run_id);
        require!(!self.runs.contains_key(&run_id), "Run already exists");
        require!(
            (1..=MAX_ROWS).contains(&row_count),
            "A run needs 1-1000 rows"
        );
        require!(total.0 > 0, "Total must be positive");
        require!(
            parse_hash(&payout_root).is_some(),
            "payout_root must be 64 lowercase hex characters"
        );
        require!(
            parse_hash(&review_digest).is_some(),
            "review_digest must be 64 lowercase hex characters"
        );
        let run = Run {
            maker: self.maker.clone(),
            approver: self.approver.clone(),
            row_count,
            total,
            payout_root,
            review_digest,
            status: RunStatus::PendingApproval,
            reserved: U128(0),
            committed: U128(0),
            paid: U128(0),
            paid_count: 0,
        };
        self.runs.insert(run_id, run.clone());
        run
    }

    // ------------------------------------------------------------- approver

    pub fn approve(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let run = self.run_mut(&run_id);
        require!(
            caller == run.approver,
            "Only the assigned approver can approve"
        );
        require!(
            run.status == RunStatus::PendingApproval,
            "Run is not waiting for approval"
        );
        run.status = RunStatus::Approved;
        run.status
    }

    // --------------------------------------------------------------- worker

    /// Reserve the full approved total from the available vault balance.
    pub fn start_release(&mut self, run_id: String) -> RunStatus {
        require!(
            env::predecessor_account_id() == self.worker,
            "Only the release worker can release"
        );
        let available = self.total_balance - self.total_reserved;
        let run = self
            .runs
            .get_mut(&run_id)
            .unwrap_or_else(|| env::panic_str("Run not found"));
        require!(
            run.status == RunStatus::Approved,
            "Run is not approved for release"
        );
        require!(
            run.total.0 <= available,
            "Insufficient vault balance: awaiting funding"
        );
        run.reserved = run.total;
        run.status = RunStatus::Releasing;
        let total = run.total.0;
        self.total_reserved += total;
        RunStatus::Releasing
    }

    /// Pay one row. The row must be proven against the run's payout root. Marks it in
    /// flight, then calls `ft_transfer`; `on_payout` records the real outcome. A row in
    /// flight or paid cannot be paid again; a proven failure can be retried.
    pub fn pay_row(
        &mut self,
        run_id: String,
        index: u32,
        receiver_id: AccountId,
        amount: U128,
        proof: Vec<String>,
    ) -> Promise {
        require!(
            env::predecessor_account_id() == self.worker,
            "Only the release worker can pay rows"
        );
        let token = self.token.clone();
        let key = (run_id.clone(), index);
        let prior = self.rows.get(&key).cloned();
        let run = self.run_mut(&run_id);
        require!(run.status == RunStatus::Releasing, "Run is not releasing");
        require!(index < run.row_count, "Row index out of range");
        require!(amount.0 > 0, "Amount must be positive");
        let root = parse_hash(&run.payout_root)
            .unwrap_or_else(|| env::panic_str("Stored payout_root is invalid"));
        let proof: Vec<Hash> = proof
            .iter()
            .map(|h| parse_hash(h).unwrap_or_else(|| env::panic_str("Invalid proof hash")))
            .collect();
        let leaf = leaf_hash(sha256, index, receiver_id.as_str(), amount.0);
        require!(
            verify_proof(sha256, &root, run.row_count, index, leaf, &proof),
            "Payout proof does not match the approved run"
        );
        let attempts = match &prior {
            None => 1,
            Some(r) if r.status == RowStatus::Failed => r.attempts + 1,
            Some(r) if r.status == RowStatus::InFlight => {
                env::panic_str("Row is already in flight")
            }
            Some(_) => env::panic_str("Row is already paid"),
        };
        let committed = run
            .committed
            .0
            .checked_add(amount.0)
            .unwrap_or_else(|| env::panic_str("Committed overflows"));
        require!(
            committed <= run.reserved.0,
            "Payout would exceed the reserved run total"
        );
        run.committed = U128(committed);
        self.rows.insert(
            key,
            RowRecord {
                status: RowStatus::InFlight,
                receiver_id: receiver_id.clone(),
                amount,
                attempts,
            },
        );

        ext_ft_core::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                receiver_id,
                amount,
                Some(format!("gajian:{run_id}:{index}")),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PAYOUT_CALLBACK)
                    .on_payout(run_id, index),
            )
    }

    /// Records the outcome of one `ft_transfer`. Returns true when the row was paid.
    #[private]
    pub fn on_payout(
        &mut self,
        run_id: String,
        index: u32,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let key = (run_id.clone(), index);
        let amount = match self.rows.get(&key) {
            Some(r) if r.status == RowStatus::InFlight => r.amount.0,
            _ => env::panic_str("Row is not in flight"),
        };
        // ft_transfer returns no value; any successful receipt means the tokens moved.
        let success = !matches!(result, Err(PromiseError::Failed));
        let run = self.run_mut(&run_id);
        if success {
            run.paid = U128(run.paid.0 + amount);
            run.paid_count += 1;
            let mut released_extra = 0;
            if run.paid_count == run.row_count {
                run.status = RunStatus::Paid;
                // Any reservation left above the paid sum goes back to the available balance.
                released_extra = run.reserved.0 - run.paid.0;
            }
            self.total_balance -= amount;
            self.total_reserved -= amount + released_extra;
        } else {
            run.committed = U128(run.committed.0 - amount);
        }
        let row = self.rows.get_mut(&key).expect("row exists");
        row.status = if success {
            RowStatus::Paid
        } else {
            RowStatus::Failed
        };
        success
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        Config {
            admin: self.admin.clone(),
            token: self.token.clone(),
            maker: self.maker.clone(),
            approver: self.approver.clone(),
            worker: self.worker.clone(),
        }
    }

    pub fn get_balances(&self) -> Balances {
        Balances {
            total: U128(self.total_balance),
            reserved: U128(self.total_reserved),
            available: U128(self.total_balance - self.total_reserved),
        }
    }

    pub fn get_run(&self, run_id: String) -> Option<Run> {
        self.runs.get(&run_id).cloned()
    }

    pub fn get_row(&self, run_id: String, index: u32) -> Option<RowRecord> {
        self.rows.get(&(run_id, index)).cloned()
    }
}

fn sha256(data: &[u8]) -> Hash {
    env::sha256_array(data)
}

impl Vault {
    fn run_mut(&mut self, run_id: &String) -> &mut Run {
        self.runs
            .get_mut(run_id)
            .unwrap_or_else(|| env::panic_str("Run not found"))
    }
}

/// Funding: only the configured token can credit the vault. Any other token is rejected,
/// so its `ft_transfer_call` is refunded to the sender by that token's resolver.
#[near]
impl FungibleTokenReceiver for Vault {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let _ = (sender_id, msg);
        require!(
            env::predecessor_account_id() == self.token,
            "Only the configured tUSDC token can fund the vault"
        );
        self.total_balance = self
            .total_balance
            .checked_add(amount.0)
            .unwrap_or_else(|| env::panic_str("Balance overflows"));
        PromiseOrValue::Value(U128(0))
    }
}

#[cfg(test)]
mod tests;
