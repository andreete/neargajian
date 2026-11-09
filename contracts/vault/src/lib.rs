//! GAJIAN payroll vault (NEAR testnet only).
//!
//! Flow: the maker creates an immutable run version → the assigned approvers approve it
//! (one approver, two in sequence, or two in parallel) → the run is released by the
//! release worker (automatic mode) or by the maker (maker-release mode), which reserves the
//! full total from the vault's tUSDC balance → rows are paid one per call with
//! `ft_transfer`, and a private callback records the real asynchronous outcome per row.
//!
//! Runs commit to their rows with a Merkle root over `(index, receiver, amount)` leaves
//! (see `commitment.rs` and docs/COMMITMENTS.md); every payout must present a proof, so a
//! changed amount, destination or index cannot be paid. No private data is ever on-chain:
//! a run stores only the root, the row count, the total and a salted review digest.
//!
//! Money invariants enforced here:
//! - The vault is credited only by the configured token, through `ft_on_transfer`.
//! - Each run snapshots the workflow (approvers, order, release mode, worker, caps) at
//!   creation; later admin changes never affect existing runs.
//! - Nothing is paid before final approval, or after rejection or cancellation.
//! - Release reserves the full run total first; reservations of all runs never exceed the
//!   vault balance.
//! - A row is marked in flight before its transfer and can never be paid twice.
//! - A row is retried only after a proven failure (the transfer receipt failed).
//! - The sum of all transfers of a run can never exceed its approved total.

pub mod commitment;

use commitment::{Hash, MAX_ROWS, leaf_hash, parse_hash, verify_proof};
use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{Value, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue, env, near, require,
};

/// Gas for the token's `ft_transfer` (measured on testnet: 1.83 Tgas).
pub const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(15);
/// Gas reserved for our own outcome callback (measured on testnet: 1.77 Tgas).
pub const GAS_FOR_PAYOUT_CALLBACK: Gas = Gas::from_tgas(10);
/// Run IDs are chosen by the app (deterministic per version) so retries are idempotent.
pub const MAX_RUN_ID_LEN: usize = 64;
/// A row stuck `InFlight` (its callback never ran) can be resolved by the admin only after
/// this many blocks, so a manual resolution can never race a callback still in progress.
pub const RESOLVE_AFTER_BLOCKS: u64 = 120;
/// Evidence strings (e.g. a transaction hash) recorded with a manual resolution.
pub const MAX_EVIDENCE_LEN: usize = 128;

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Runs,
    Rows,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkflowKind {
    /// One approver.
    One,
    /// Two approvers; the second can act only after the first approved.
    TwoSequential,
    /// Two approvers in any order; both are required.
    TwoParallel,
}

impl WorkflowKind {
    fn approver_count(self) -> usize {
        match self {
            WorkflowKind::One => 1,
            WorkflowKind::TwoSequential | WorkflowKind::TwoParallel => 2,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReleaseMode {
    /// The release worker releases after final approval.
    Automatic,
    /// The maker releases after final approval.
    Maker,
}

/// Active configuration. Every change bumps `revision`; runs keep the revision they were
/// created under, and creation fails if the maker reviewed an older revision.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Workflow {
    pub revision: u32,
    pub kind: WorkflowKind,
    pub approvers: Vec<AccountId>,
    pub release_mode: ReleaseMode,
    pub maker: AccountId,
    pub worker: AccountId,
    /// Largest single payout, in base units.
    pub max_row_amount: U128,
    /// Largest run total, in base units.
    pub max_run_total: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunStatus {
    PendingApproval,
    Approved,
    /// Terminal: an assigned approver rejected this version.
    Rejected,
    /// Terminal: the maker cancelled (or superseded) this version before release.
    Cancelled,
    Releasing,
    /// Terminal: every row paid.
    Paid,
    /// Terminal: the maker closed a release with some rows unpaid after proven failures;
    /// the unused reservation went back to the available balance.
    PartiallyPaid,
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
    /// Block height of the latest transfer request.
    pub requested_at_block: u64,
    /// Set when the admin resolved a stuck `InFlight` row (evidence such as a tx hash).
    pub resolution: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Run {
    pub maker: AccountId,
    /// Workflow snapshot taken at creation.
    pub policy: Workflow,
    pub row_count: u32,
    pub total: U128,
    /// Merkle root (hex) over the ordered payout leaves.
    pub payout_root: String,
    /// Salted SHA-256 (hex) of the private review snapshot; the salt stays off-chain.
    pub review_digest: String,
    pub status: RunStatus,
    /// Approvers in the order they approved.
    pub approvals: Vec<AccountId>,
    pub rejected_by: Option<AccountId>,
    /// Run ID of the newer version that replaced this one, if any.
    pub superseded_by: Option<String>,
    pub created_at_ms: u64,
    /// Amount reserved from the vault balance at release.
    pub reserved: U128,
    /// Sum of rows in flight or paid. Never exceeds `reserved`.
    pub committed: U128,
    pub paid: U128,
    pub paid_count: u32,
    pub in_flight_count: u32,
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
    workflow: Workflow,
    total_balance: u128,
    total_reserved: u128,
    runs: LookupMap<String, Run>,
    rows: LookupMap<(String, u32), RowRecord>,
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

fn sha256(data: &[u8]) -> Hash {
    env::sha256_array(data)
}

/// NEP-297 style event log, readable by the app's reconciliation and on explorers.
fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "gajian_vault", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

#[near]
impl Vault {
    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        admin: AccountId,
        token: AccountId,
        maker: AccountId,
        worker: AccountId,
        kind: WorkflowKind,
        approvers: Vec<AccountId>,
        release_mode: ReleaseMode,
        max_row_amount: U128,
        max_run_total: U128,
    ) -> Self {
        let workflow = Workflow {
            revision: 1,
            kind,
            approvers,
            release_mode,
            maker,
            worker,
            max_row_amount,
            max_run_total,
        };
        Self::validate_workflow(&admin, &workflow);
        Self {
            admin,
            token,
            workflow,
            total_balance: 0,
            total_reserved: 0,
            runs: LookupMap::new(StorageKey::Runs),
            rows: LookupMap::new(StorageKey::Rows),
        }
    }

    // ---------------------------------------------------------------- admin

    /// Admin replaces the workflow for future runs. Existing runs keep their snapshot.
    #[allow(clippy::too_many_arguments)]
    pub fn update_workflow(
        &mut self,
        kind: WorkflowKind,
        approvers: Vec<AccountId>,
        release_mode: ReleaseMode,
        maker: AccountId,
        worker: AccountId,
        max_row_amount: U128,
        max_run_total: U128,
    ) -> Workflow {
        self.require_admin();
        let workflow = Workflow {
            revision: self.workflow.revision + 1,
            kind,
            approvers,
            release_mode,
            maker,
            worker,
            max_row_amount,
            max_run_total,
        };
        Self::validate_workflow(&self.admin, &workflow);
        self.workflow = workflow.clone();
        emit("workflow_updated", json!(workflow));
        workflow
    }

    /// Admin recovery for a row whose callback never ran (still `InFlight` after
    /// `RESOLVE_AFTER_BLOCKS`). The admin must first read the final outcome of the row's
    /// `ft_transfer` receipt on-chain (NEP-141 `ft_transfer` event with memo
    /// `gajian:<run_id>:<index>`) and passes that transaction hash as evidence.
    /// `paid = true` books the payout; `paid = false` marks it a proven failure (retryable).
    pub fn resolve_in_flight(
        &mut self,
        run_id: String,
        index: u32,
        paid: bool,
        evidence: String,
    ) -> RowStatus {
        self.require_admin();
        require!(
            !evidence.is_empty() && evidence.len() <= MAX_EVIDENCE_LEN,
            "evidence must be 1-128 characters"
        );
        let key = (run_id.clone(), index);
        let row = self
            .rows
            .get(&key)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Row not found"));
        require!(row.status == RowStatus::InFlight, "Row is not in flight");
        require!(
            env::block_height() >= row.requested_at_block + RESOLVE_AFTER_BLOCKS,
            "Row is too recent to resolve; wait for its callback"
        );
        let status = self.record_outcome(&run_id, index, paid);
        let row = self.rows.get_mut(&key).expect("row exists");
        row.resolution = Some(evidence.clone());
        emit(
            "row_resolved",
            json!({ "run_id": run_id, "index": index, "paid": paid, "evidence": evidence }),
        );
        status
    }

    // ---------------------------------------------------------------- maker

    /// Maker creates an immutable run version from its commitment. `workflow_revision` is
    /// the revision the maker reviewed; creation fails if the admin changed it since.
    /// `supersedes` cancels an older pending or approved version of the maker in the same
    /// transaction, so it can never be released.
    #[allow(clippy::too_many_arguments)]
    pub fn create_run(
        &mut self,
        run_id: String,
        workflow_revision: u32,
        row_count: u32,
        total: U128,
        payout_root: String,
        review_digest: String,
        supersedes: Option<String>,
    ) -> Run {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.workflow.maker,
            "Only the maker can create runs"
        );
        require!(
            workflow_revision == self.workflow.revision,
            "Workflow changed since review: reload and confirm again"
        );
        validate_run_id(&run_id);
        require!(!self.runs.contains_key(&run_id), "Run already exists");
        require!(
            (1..=MAX_ROWS).contains(&row_count),
            "A run needs 1-1000 rows"
        );
        require!(total.0 > 0, "Total must be positive");
        require!(
            total.0 <= self.workflow.max_run_total.0,
            "Total is above the run cap"
        );
        require!(
            parse_hash(&payout_root).is_some(),
            "payout_root must be 64 lowercase hex characters"
        );
        require!(
            parse_hash(&review_digest).is_some(),
            "review_digest must be 64 lowercase hex characters"
        );
        if let Some(old_id) = &supersedes {
            let old = self.run_mut(old_id);
            require!(old.maker == caller, "Only the run's maker can supersede it");
            require!(
                matches!(old.status, RunStatus::PendingApproval | RunStatus::Approved),
                "Only a pending or approved run can be superseded"
            );
            old.status = RunStatus::Cancelled;
            old.superseded_by = Some(run_id.clone());
            emit(
                "run_cancelled",
                json!({ "run_id": old_id, "superseded_by": run_id }),
            );
        }
        let run = Run {
            maker: caller,
            policy: self.workflow.clone(),
            row_count,
            total,
            payout_root,
            review_digest,
            status: RunStatus::PendingApproval,
            approvals: Vec::new(),
            rejected_by: None,
            superseded_by: None,
            created_at_ms: env::block_timestamp_ms(),
            reserved: U128(0),
            committed: U128(0),
            paid: U128(0),
            paid_count: 0,
            in_flight_count: 0,
        };
        self.runs.insert(run_id.clone(), run.clone());
        emit(
            "run_created",
            json!({
                "run_id": run_id, "revision": run.policy.revision, "row_count": row_count,
                "total": total, "payout_root": run.payout_root,
            }),
        );
        run
    }

    /// Maker cancels a pending or approved run before release. Terminal.
    pub fn cancel_run(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let run = self.run_mut(&run_id);
        require!(caller == run.maker, "Only the run's maker can cancel it");
        require!(
            matches!(run.status, RunStatus::PendingApproval | RunStatus::Approved),
            "Only a pending or approved run can be cancelled"
        );
        run.status = RunStatus::Cancelled;
        emit("run_cancelled", json!({ "run_id": run_id }));
        RunStatus::Cancelled
    }

    /// Maker closes a release that cannot complete (for example a recipient who never
    /// registers). Allowed only when no row is in flight and some row is unpaid. Unpaid rows
    /// stay unpaid; the unused reservation returns to the available balance. Terminal.
    pub fn close_partial(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let run = self.run_mut(&run_id);
        require!(caller == run.maker, "Only the run's maker can close it");
        require!(run.status == RunStatus::Releasing, "Run is not releasing");
        require!(run.in_flight_count == 0, "Rows are still in flight");
        require!(
            run.paid_count < run.row_count,
            "All rows are paid; nothing to close"
        );
        let unused = run.reserved.0 - run.paid.0;
        run.status = RunStatus::PartiallyPaid;
        let (paid, paid_count) = (run.paid, run.paid_count);
        self.total_reserved -= unused;
        emit(
            "run_closed_partial",
            json!({ "run_id": run_id, "paid": paid, "paid_count": paid_count, "released": U128(unused) }),
        );
        RunStatus::PartiallyPaid
    }

    // ------------------------------------------------------------ approvers

    /// An assigned approver approves the run version. Sequential runs require approver 1
    /// first; parallel runs accept either order; each approver counts once.
    pub fn approve(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let run = self.run_mut(&run_id);
        Self::require_actionable(run, &caller);
        run.approvals.push(caller.clone());
        if run.approvals.len() == run.policy.kind.approver_count() {
            run.status = RunStatus::Approved;
        }
        let status = run.status;
        emit(
            "run_approval",
            json!({ "run_id": run_id, "approver": caller, "status": status }),
        );
        status
    }

    /// An assigned approver whose step is actionable rejects the version. Terminal; the
    /// reason is recorded off-chain by the app.
    pub fn reject(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let run = self.run_mut(&run_id);
        Self::require_actionable(run, &caller);
        run.status = RunStatus::Rejected;
        run.rejected_by = Some(caller.clone());
        emit(
            "run_rejected",
            json!({ "run_id": run_id, "approver": caller }),
        );
        RunStatus::Rejected
    }

    // -------------------------------------------------------------- release

    /// Releases an approved run: the worker in automatic mode, the maker in maker-release
    /// mode (per the run's snapshot). Reserves the full total from the available balance.
    pub fn start_release(&mut self, run_id: String) -> RunStatus {
        let caller = env::predecessor_account_id();
        let available = self.total_balance - self.total_reserved;
        let run = self
            .runs
            .get_mut(&run_id)
            .unwrap_or_else(|| env::panic_str("Run not found"));
        match run.policy.release_mode {
            ReleaseMode::Automatic => require!(
                caller == run.policy.worker,
                "Only the release worker can release this run (automatic release)"
            ),
            ReleaseMode::Maker => require!(
                caller == run.maker,
                "Only the maker can release this run (maker release)"
            ),
        }
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
        let total = run.total;
        self.total_reserved += total.0;
        emit(
            "release_started",
            json!({ "run_id": run_id, "by": caller, "reserved": total }),
        );
        RunStatus::Releasing
    }

    /// Pays one row. The row must be proven against the run's payout root. Marks it in
    /// flight, then calls `ft_transfer`; `on_payout` records the real outcome. A row in
    /// flight or paid cannot be paid again; a proven failure can be retried. Callable by
    /// the run's worker, and also by the maker when the run uses maker release.
    pub fn pay_row(
        &mut self,
        run_id: String,
        index: u32,
        receiver_id: AccountId,
        amount: U128,
        proof: Vec<String>,
    ) -> Promise {
        let caller = env::predecessor_account_id();
        let token = self.token.clone();
        let key = (run_id.clone(), index);
        let prior = self.rows.get(&key).cloned();
        let run = self.run_mut(&run_id);
        require!(
            caller == run.policy.worker
                || (run.policy.release_mode == ReleaseMode::Maker && caller == run.maker),
            "Only the release worker (or the maker in maker release) can pay rows"
        );
        require!(run.status == RunStatus::Releasing, "Run is not releasing");
        require!(index < run.row_count, "Row index out of range");
        require!(amount.0 > 0, "Amount must be positive");
        require!(
            amount.0 <= run.policy.max_row_amount.0,
            "Amount is above the row cap"
        );
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
        run.in_flight_count += 1;
        self.rows.insert(
            key,
            RowRecord {
                status: RowStatus::InFlight,
                receiver_id: receiver_id.clone(),
                amount,
                attempts,
                requested_at_block: env::block_height(),
                resolution: None,
            },
        );
        emit(
            "row_requested",
            json!({ "run_id": run_id, "index": index, "attempt": attempts }),
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
        match self.rows.get(&(run_id.clone(), index)) {
            Some(r) if r.status == RowStatus::InFlight => {}
            _ => env::panic_str("Row is not in flight"),
        }
        // ft_transfer returns no value; any successful receipt means the tokens moved.
        let success = !matches!(result, Err(PromiseError::Failed));
        self.record_outcome(&run_id, index, success);
        success
    }

    // ---------------------------------------------------------------- views

    pub fn get_admin(&self) -> AccountId {
        self.admin.clone()
    }

    pub fn get_token(&self) -> AccountId {
        self.token.clone()
    }

    pub fn get_workflow(&self) -> Workflow {
        self.workflow.clone()
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

impl Vault {
    fn require_admin(&self) {
        require!(
            env::predecessor_account_id() == self.admin,
            "Only the admin can do this"
        );
    }

    fn validate_workflow(admin: &AccountId, w: &Workflow) {
        require!(
            w.approvers.len() == w.kind.approver_count(),
            "Approver count does not match the workflow"
        );
        let mut roles: Vec<&AccountId> = vec![admin, &w.maker, &w.worker];
        roles.extend(w.approvers.iter());
        for (i, a) in roles.iter().enumerate() {
            for b in &roles[i + 1..] {
                require!(
                    a != b,
                    "Admin, maker, approvers and worker must be distinct accounts"
                );
            }
        }
        require!(
            w.max_row_amount.0 > 0 && w.max_row_amount.0 <= w.max_run_total.0,
            "Caps must satisfy 0 < max_row_amount <= max_run_total"
        );
    }

    /// The caller must be an assigned approver whose step is actionable now.
    fn require_actionable(run: &Run, caller: &AccountId) {
        require!(
            run.status == RunStatus::PendingApproval,
            "Run is not waiting for approval"
        );
        let Some(step) = run.policy.approvers.iter().position(|a| a == caller) else {
            env::panic_str("Only an assigned approver can act on this run")
        };
        require!(
            !run.approvals.contains(caller),
            "This approver already approved"
        );
        if run.policy.kind == WorkflowKind::TwoSequential {
            require!(
                step == run.approvals.len(),
                "Approver 2 can act only after approver 1 approved"
            );
        }
    }

    /// Books the outcome of an in-flight row (callback or admin resolution).
    fn record_outcome(&mut self, run_id: &String, index: u32, success: bool) -> RowStatus {
        let key = (run_id.clone(), index);
        let amount = self.rows.get(&key).expect("row exists").amount.0;
        let run = self
            .runs
            .get_mut(run_id)
            .unwrap_or_else(|| env::panic_str("Run not found"));
        run.in_flight_count -= 1;
        let status = if success {
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
            RowStatus::Paid
        } else {
            run.committed = U128(run.committed.0 - amount);
            RowStatus::Failed
        };
        let run_status = run.status;
        self.rows.get_mut(&key).expect("row exists").status = status;
        emit(
            if success { "row_paid" } else { "row_failed" },
            json!({ "run_id": run_id, "index": index, "amount": U128(amount) }),
        );
        if run_status == RunStatus::Paid {
            emit("run_paid", json!({ "run_id": run_id }));
        }
        status
    }

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
        let _ = msg;
        require!(
            env::predecessor_account_id() == self.token,
            "Only the configured tUSDC token can fund the vault"
        );
        self.total_balance = self
            .total_balance
            .checked_add(amount.0)
            .unwrap_or_else(|| env::panic_str("Balance overflows"));
        emit(
            "vault_funded",
            json!({ "sender_id": sender_id, "amount": amount }),
        );
        PromiseOrValue::Value(U128(0))
    }
}

#[cfg(test)]
mod tests;
