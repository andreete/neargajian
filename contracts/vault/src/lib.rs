//! GAJIAN payroll vault (NEAR testnet only). Phase 02 walking skeleton.
//!
//! Flow: the maker creates an immutable run → the assigned approver (a different account)
//! approves → the release worker reserves the run total from the vault's tUSDC balance →
//! the worker pays each row with `ft_transfer`, and a private callback records the real
//! asynchronous outcome per row.
//!
//! Money invariants enforced here:
//! - The vault is credited only by the configured token, through `ft_on_transfer`.
//! - Nothing is paid before approval; release reserves the full run total first.
//! - A row is marked in flight before its transfer and can never be paid twice.
//! - A row is retried only after a proven failure (the transfer receipt failed).
//! - The sum of all transfers of a run can never exceed its approved total.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
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
/// Maximum rows in a Phase 02 run (rows are stored on-chain; Phase 03 replaces this with
/// a Merkle commitment that scales to 1,000 rows).
pub const MAX_ROWS_PHASE02: usize = 10;
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

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payout {
    pub receiver_id: AccountId,
    pub amount: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Run {
    pub maker: AccountId,
    /// Approver snapshotted at creation; later config changes do not affect this run.
    pub approver: AccountId,
    pub payouts: Vec<Payout>,
    pub total: U128,
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
    rows: LookupMap<(String, u32), RowStatus>,
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

    /// Maker creates an immutable run. The approver is snapshotted into the run.
    pub fn create_run(&mut self, run_id: String, payouts: Vec<Payout>) -> Run {
        require!(
            env::predecessor_account_id() == self.maker,
            "Only the maker can create runs"
        );
        validate_run_id(&run_id);
        require!(!self.runs.contains_key(&run_id), "Run already exists");
        require!(
            !payouts.is_empty() && payouts.len() <= MAX_ROWS_PHASE02,
            "A run needs 1-10 rows"
        );
        let mut total: u128 = 0;
        for p in &payouts {
            require!(p.amount.0 > 0, "Every amount must be positive");
            total = total
                .checked_add(p.amount.0)
                .unwrap_or_else(|| env::panic_str("Total overflows"));
        }
        let run = Run {
            maker: self.maker.clone(),
            approver: self.approver.clone(),
            payouts,
            total: U128(total),
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

    /// Pay one row. Marks it in flight, then calls `ft_transfer`; `on_payout` records the
    /// real outcome. A row in flight or paid cannot be paid again.
    pub fn pay_row(&mut self, run_id: String, index: u32) -> Promise {
        require!(
            env::predecessor_account_id() == self.worker,
            "Only the release worker can pay rows"
        );
        let token = self.token.clone();
        let key = (run_id.clone(), index);
        let prior = self.rows.get(&key).copied();
        let run = self.run_mut(&run_id);
        require!(run.status == RunStatus::Releasing, "Run is not releasing");
        let payout = run
            .payouts
            .get(index as usize)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Row index out of range"));
        match prior {
            None | Some(RowStatus::Failed) => {}
            Some(RowStatus::InFlight) => env::panic_str("Row is already in flight"),
            Some(RowStatus::Paid) => env::panic_str("Row is already paid"),
        }
        let committed = run
            .committed
            .0
            .checked_add(payout.amount.0)
            .unwrap_or_else(|| env::panic_str("Committed overflows"));
        require!(
            committed <= run.reserved.0,
            "Payout would exceed the reserved run total"
        );
        run.committed = U128(committed);
        self.rows.insert(key, RowStatus::InFlight);

        ext_ft_core::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(
                payout.receiver_id,
                payout.amount,
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
        require!(
            self.rows.get(&key) == Some(&RowStatus::InFlight),
            "Row is not in flight"
        );
        // ft_transfer returns no value; any successful receipt means the tokens moved.
        let success = !matches!(result, Err(PromiseError::Failed));
        let run = self.run_mut(&run_id);
        let amount = run.payouts[index as usize].amount.0;
        if success {
            run.paid = U128(run.paid.0 + amount);
            run.paid_count += 1;
            let mut released_extra = 0;
            if run.paid_count as usize == run.payouts.len() {
                run.status = RunStatus::Paid;
                // Any reservation left above the paid sum goes back to the available balance.
                released_extra = run.reserved.0 - run.paid.0;
            }
            self.total_balance -= amount;
            self.total_reserved -= amount + released_extra;
            self.rows.insert(key, RowStatus::Paid);
        } else {
            run.committed = U128(run.committed.0 - amount);
            self.rows.insert(key, RowStatus::Failed);
        }
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

    pub fn get_row_status(&self, run_id: String, index: u32) -> Option<RowStatus> {
        self.rows.get(&(run_id, index)).copied()
    }
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
