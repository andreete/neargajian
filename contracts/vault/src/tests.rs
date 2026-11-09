//! Unit tests (near-sdk mocked runtime). The real asynchronous transfer outcome is
//! exercised in the sandbox tests (tests/sandbox.rs); here the callback is called directly.

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const CAP_ROW: u128 = 1_000_000; // 1 tUSDC (D-027)
const CAP_RUN: u128 = 100_000_000; // 100 tUSDC

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn at(name: &str, block: u64) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(acc("vault.test"))
        .predecessor_account_id(acc(name))
        .block_height(block);
    testing_env!(ctx.build());
}

fn as_caller(name: &str) {
    at(name, 100);
}

fn vault_with(kind: WorkflowKind, approvers: &[&str], mode: ReleaseMode) -> Vault {
    as_caller("admin.test");
    Vault::new(
        acc("admin.test"),
        acc("tusdc.test"),
        acc("maker.test"),
        acc("worker.test"),
        kind,
        approvers.iter().map(|a| acc(a)).collect(),
        mode,
        U128(CAP_ROW),
        U128(CAP_RUN),
    )
}

fn vault() -> Vault {
    vault_with(
        WorkflowKind::One,
        &["approver1.test"],
        ReleaseMode::Automatic,
    )
}

fn fund(v: &mut Vault, amount: u128) {
    as_caller("tusdc.test");
    let _ = v.ft_on_transfer(acc("admin.test"), U128(amount), String::new());
}

fn funded(amount: u128) -> Vault {
    let mut v = vault();
    fund(&mut v, amount);
    v
}

struct Committed {
    rows: Vec<(AccountId, u128, Vec<String>)>,
}

fn hex(h: &commitment::Hash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}

fn commit(rows: &[(&str, u128)]) -> (String, Committed) {
    let sha = |d: &[u8]| env::sha256_array(d);
    let leaves: Vec<commitment::Hash> = rows
        .iter()
        .enumerate()
        .map(|(i, (a, amt))| commitment::leaf_hash(sha, i as u32, a, *amt))
        .collect();
    let (root, proofs) = commitment::root_and_proofs(sha, &leaves);
    let c = Committed {
        rows: rows
            .iter()
            .zip(proofs)
            .map(|((a, amt), p)| (acc(a), *amt, p.iter().map(hex).collect()))
            .collect(),
    };
    (hex(&root), c)
}

/// Creates a run (as maker, at the current workflow revision) and returns rows + proofs.
fn create_v(
    v: &mut Vault,
    run_id: &str,
    rows: &[(&str, u128)],
    supersedes: Option<&str>,
) -> Committed {
    let (root, c) = commit(rows);
    let total: u128 = rows.iter().map(|r| r.1).sum();
    let revision = v.get_workflow().revision;
    as_caller("maker.test");
    v.create_run(
        run_id.into(),
        revision,
        rows.len() as u32,
        U128(total),
        root,
        "ab".repeat(32),
        supersedes.map(String::from),
    );
    c
}

fn create(v: &mut Vault, run_id: &str, rows: &[(&str, u128)]) -> Committed {
    create_v(v, run_id, rows, None)
}

fn one_row(v: &mut Vault, run_id: &str, amount: u128) -> Committed {
    create(v, run_id, &[("recipient1.test", amount)])
}

fn approve_as(v: &mut Vault, who: &str, run_id: &str) -> RunStatus {
    as_caller(who);
    v.approve(run_id.into())
}

fn release_as(v: &mut Vault, who: &str, run_id: &str) -> RunStatus {
    as_caller(who);
    v.start_release(run_id.into())
}

fn pay_as(v: &mut Vault, who: &str, run_id: &str, c: &Committed, index: u32) {
    let (receiver, amount, proof) = c.rows[index as usize].clone();
    as_caller(who);
    let _ = v.pay_row(run_id.into(), index, receiver, U128(amount), proof);
}

fn pay(v: &mut Vault, run_id: &str, c: &Committed, index: u32) {
    pay_as(v, "worker.test", run_id, c, index);
}

fn callback(v: &mut Vault, run_id: &str, index: u32, ok: bool) -> bool {
    as_caller("vault.test");
    let result = if ok {
        Ok(())
    } else {
        Err(PromiseError::Failed)
    };
    v.on_payout(run_id.into(), index, result)
}

fn status(v: &Vault, run_id: &str, index: u32) -> Option<RowStatus> {
    v.get_row(run_id.into(), index).map(|r| r.status)
}

fn run_status(v: &Vault, run_id: &str) -> RunStatus {
    v.get_run(run_id.into()).unwrap().status
}

fn panics(f: impl FnOnce()) -> bool {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err()
}

/// A funded single-approver run that is releasing.
fn releasing(rows: &[(&str, u128)]) -> (Vault, Committed) {
    let mut v = funded(10_000_000);
    let c = create(&mut v, "run-1", rows);
    approve_as(&mut v, "approver1.test", "run-1");
    release_as(&mut v, "worker.test", "run-1");
    (v, c)
}

fn update(v: &mut Vault, approver: &str, mode: ReleaseMode) -> Workflow {
    as_caller("admin.test");
    v.update_workflow(
        WorkflowKind::One,
        vec![acc(approver)],
        mode,
        acc("maker.test"),
        acc("worker.test"),
        U128(CAP_ROW),
        U128(CAP_RUN),
    )
}

// ------------------------------------------------------------ happy path + recovery

#[test]
fn happy_path_single_payout() {
    let mut v = funded(1_000_000);
    let c = one_row(&mut v, "run-1", 50_000);
    assert_eq!(
        approve_as(&mut v, "approver1.test", "run-1"),
        RunStatus::Approved
    );
    assert_eq!(
        release_as(&mut v, "worker.test", "run-1"),
        RunStatus::Releasing
    );
    assert_eq!(v.get_balances().reserved, U128(50_000));
    pay(&mut v, "run-1", &c, 0);
    assert_eq!(status(&v, "run-1", 0), Some(RowStatus::InFlight));
    assert!(callback(&mut v, "run-1", 0, true));
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!(
        (run.status, run.paid, run.in_flight_count),
        (RunStatus::Paid, U128(50_000), 0)
    );
    let b = v.get_balances();
    assert_eq!(
        (b.total, b.reserved, b.available),
        (U128(950_000), U128(0), U128(950_000))
    );
}

#[test]
fn proven_failure_keeps_reservation_and_allows_retry() {
    let (mut v, c) = releasing(&[("recipient1.test", 50_000)]);
    pay(&mut v, "run-1", &c, 0);
    assert!(!callback(&mut v, "run-1", 0, false));
    assert_eq!(status(&v, "run-1", 0), Some(RowStatus::Failed));
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!((run.status, run.committed), (RunStatus::Releasing, U128(0)));
    assert_eq!(v.get_balances().reserved, U128(50_000));
    pay(&mut v, "run-1", &c, 0);
    let row = v.get_row("run-1".into(), 0).unwrap();
    assert_eq!((row.status, row.attempts), (RowStatus::InFlight, 2));
}

#[test]
#[should_panic(expected = "Row is not in flight")]
fn stale_or_duplicate_callback_is_rejected() {
    let (mut v, c) = releasing(&[("recipient1.test", 50_000)]);
    pay(&mut v, "run-1", &c, 0);
    callback(&mut v, "run-1", 0, true);
    callback(&mut v, "run-1", 0, true);
}

#[test]
#[should_panic(expected = "Row is already in flight")]
fn duplicate_pay_while_in_flight_fails() {
    let (mut v, c) = releasing(&[("recipient1.test", 1)]);
    pay(&mut v, "run-1", &c, 0);
    pay(&mut v, "run-1", &c, 0);
}

#[test]
#[should_panic(expected = "Row is already paid")]
fn paid_row_cannot_be_paid_again_while_run_releasing() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000), ("recipient2.test", 10_000)]);
    pay(&mut v, "run-1", &c, 0);
    callback(&mut v, "run-1", 0, true);
    pay(&mut v, "run-1", &c, 0);
}

#[test]
fn close_partial_releases_unused_reservation() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000), ("recipient2.test", 20_000)]);
    pay(&mut v, "run-1", &c, 0);
    callback(&mut v, "run-1", 0, true);
    pay(&mut v, "run-1", &c, 1);
    callback(&mut v, "run-1", 1, false);
    as_caller("maker.test");
    assert_eq!(v.close_partial("run-1".into()), RunStatus::PartiallyPaid);
    let b = v.get_balances();
    assert_eq!((b.total, b.reserved), (U128(9_990_000), U128(0)));
    assert!(
        panics(|| pay(&mut v, "run-1", &c, 1)),
        "a closed run cannot pay its failed row"
    );
}

#[test]
#[should_panic(expected = "Rows are still in flight")]
fn close_partial_refuses_while_in_flight() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000), ("recipient2.test", 20_000)]);
    pay(&mut v, "run-1", &c, 0);
    as_caller("maker.test");
    v.close_partial("run-1".into());
}

#[test]
fn admin_resolves_stuck_in_flight_row_after_wait() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000)]);
    pay(&mut v, "run-1", &c, 0); // requested at block 100; the callback "never arrives"
    at("admin.test", 100 + RESOLVE_AFTER_BLOCKS);
    assert_eq!(
        v.resolve_in_flight("run-1".into(), 0, true, "tx-hash-evidence".into()),
        RowStatus::Paid
    );
    let row = v.get_row("run-1".into(), 0).unwrap();
    assert_eq!(row.resolution.as_deref(), Some("tx-hash-evidence"));
    assert_eq!(run_status(&v, "run-1"), RunStatus::Paid);
    assert_eq!(v.get_balances().reserved, U128(0));
}

#[test]
#[should_panic(expected = "Row is too recent to resolve")]
fn resolution_cannot_race_a_callback() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000)]);
    pay(&mut v, "run-1", &c, 0);
    at("admin.test", 100 + RESOLVE_AFTER_BLOCKS - 1);
    v.resolve_in_flight("run-1".into(), 0, false, "x".into());
}

#[test]
#[should_panic(expected = "Only the admin can do this")]
fn only_admin_resolves() {
    let (mut v, c) = releasing(&[("recipient1.test", 10_000)]);
    pay(&mut v, "run-1", &c, 0);
    at("worker.test", 1_000);
    v.resolve_in_flight("run-1".into(), 0, false, "x".into());
}

// ---------------------------------------------------------------- roles and funding

#[test]
#[should_panic(expected = "Only the maker can create runs")]
fn approver_cannot_create_run() {
    let mut v = vault();
    as_caller("approver1.test");
    v.create_run(
        "run-1".into(),
        1,
        1,
        U128(1),
        "ab".repeat(32),
        "ab".repeat(32),
        None,
    );
}

#[test]
#[should_panic(expected = "Only an assigned approver can act on this run")]
fn maker_cannot_approve_own_run() {
    let mut v = vault();
    one_row(&mut v, "run-1", 1);
    approve_as(&mut v, "maker.test", "run-1");
}

#[test]
#[should_panic(expected = "Only an assigned approver can act on this run")]
fn unassigned_approver_cannot_approve() {
    let mut v = vault();
    one_row(&mut v, "run-1", 1);
    approve_as(&mut v, "approver2.test", "run-1");
}

#[test]
#[should_panic(expected = "Run is not approved for release")]
fn release_before_approval_fails() {
    let mut v = funded(100);
    one_row(&mut v, "run-1", 1);
    release_as(&mut v, "worker.test", "run-1");
}

#[test]
#[should_panic(expected = "Insufficient vault balance: awaiting funding")]
fn release_without_funding_fails() {
    let mut v = funded(10);
    one_row(&mut v, "run-1", 11);
    approve_as(&mut v, "approver1.test", "run-1");
    release_as(&mut v, "worker.test", "run-1");
}

#[test]
fn concurrent_runs_cannot_over_reserve() {
    let mut v = funded(100_000);
    one_row(&mut v, "run-a", 60_000);
    one_row(&mut v, "run-b", 60_000);
    approve_as(&mut v, "approver1.test", "run-a");
    approve_as(&mut v, "approver1.test", "run-b");
    release_as(&mut v, "worker.test", "run-a");
    assert!(
        panics(|| {
            release_as(&mut v, "worker.test", "run-b");
        }),
        "second release must wait for funding"
    );
    assert_eq!(run_status(&v, "run-b"), RunStatus::Approved);
    assert_eq!(v.get_balances().reserved, U128(60_000));
    fund(&mut v, 20_000);
    assert_eq!(
        release_as(&mut v, "worker.test", "run-b"),
        RunStatus::Releasing
    );
    let b = v.get_balances();
    assert_eq!((b.reserved, b.available), (U128(120_000), U128(0)));
}

#[test]
#[should_panic(expected = "Only the configured tUSDC token can fund the vault")]
fn wrong_token_cannot_fund() {
    let mut v = vault();
    as_caller("fake-token.test");
    let _ = v.ft_on_transfer(acc("admin.test"), U128(5), String::new());
}

#[test]
#[should_panic(expected = "Run already exists")]
fn run_id_cannot_be_reused() {
    let mut v = vault();
    one_row(&mut v, "run-1", 1);
    one_row(&mut v, "run-1", 2);
}

#[test]
#[should_panic(expected = "must be distinct")]
fn admin_cannot_be_an_approver() {
    vault_with(WorkflowKind::One, &["admin.test"], ReleaseMode::Automatic);
}

#[test]
#[should_panic(expected = "must be distinct")]
fn maker_cannot_be_an_approver() {
    vault_with(
        WorkflowKind::TwoParallel,
        &["approver1.test", "maker.test"],
        ReleaseMode::Automatic,
    );
}

#[test]
#[should_panic(expected = "must be distinct")]
fn two_step_approvers_must_differ() {
    vault_with(
        WorkflowKind::TwoSequential,
        &["approver1.test", "approver1.test"],
        ReleaseMode::Automatic,
    );
}

#[test]
#[should_panic(expected = "Approver count does not match the workflow")]
fn two_step_workflow_needs_two_approvers() {
    vault_with(
        WorkflowKind::TwoSequential,
        &["approver1.test"],
        ReleaseMode::Automatic,
    );
}

// -------------------------------------------------------------- approval policies

#[test]
fn sequential_requires_order_and_both() {
    let mut v = vault_with(
        WorkflowKind::TwoSequential,
        &["approver1.test", "approver2.test"],
        ReleaseMode::Automatic,
    );
    one_row(&mut v, "run-1", 1);
    assert!(
        panics(|| {
            approve_as(&mut v, "approver2.test", "run-1");
        }),
        "approver 2 cannot go first"
    );
    assert_eq!(
        approve_as(&mut v, "approver1.test", "run-1"),
        RunStatus::PendingApproval
    );
    assert_eq!(
        approve_as(&mut v, "approver2.test", "run-1"),
        RunStatus::Approved
    );
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!(
        run.approvals,
        vec![acc("approver1.test"), acc("approver2.test")]
    );
}

#[test]
#[should_panic(expected = "Approver 2 can act only after approver 1 approved")]
fn sequential_step_two_cannot_reject_first() {
    let mut v = vault_with(
        WorkflowKind::TwoSequential,
        &["approver1.test", "approver2.test"],
        ReleaseMode::Automatic,
    );
    one_row(&mut v, "run-1", 1);
    as_caller("approver2.test");
    v.reject("run-1".into());
}

#[test]
fn parallel_accepts_either_order_and_requires_both() {
    let mut v = vault_with(
        WorkflowKind::TwoParallel,
        &["approver1.test", "approver2.test"],
        ReleaseMode::Automatic,
    );
    fund(&mut v, 100);
    one_row(&mut v, "run-1", 1);
    assert_eq!(
        approve_as(&mut v, "approver2.test", "run-1"),
        RunStatus::PendingApproval
    );
    assert!(
        panics(|| {
            release_as(&mut v, "worker.test", "run-1");
        }),
        "one parallel approval is not enough"
    );
    assert_eq!(
        approve_as(&mut v, "approver1.test", "run-1"),
        RunStatus::Approved
    );
    assert_eq!(
        release_as(&mut v, "worker.test", "run-1"),
        RunStatus::Releasing
    );
}

#[test]
#[should_panic(expected = "This approver already approved")]
fn repeated_approval_adds_no_credit() {
    let mut v = vault_with(
        WorkflowKind::TwoParallel,
        &["approver1.test", "approver2.test"],
        ReleaseMode::Automatic,
    );
    one_row(&mut v, "run-1", 1);
    approve_as(&mut v, "approver1.test", "run-1");
    approve_as(&mut v, "approver1.test", "run-1");
}

#[test]
fn rejection_is_terminal_and_blocks_release() {
    let mut v = vault_with(
        WorkflowKind::TwoParallel,
        &["approver1.test", "approver2.test"],
        ReleaseMode::Automatic,
    );
    fund(&mut v, 100);
    one_row(&mut v, "run-1", 1);
    approve_as(&mut v, "approver1.test", "run-1");
    as_caller("approver2.test");
    assert_eq!(v.reject("run-1".into()), RunStatus::Rejected);
    assert_eq!(
        v.get_run("run-1".into()).unwrap().rejected_by,
        Some(acc("approver2.test"))
    );
    assert!(panics(|| {
        approve_as(&mut v, "approver2.test", "run-1");
    }));
    assert!(panics(|| {
        release_as(&mut v, "worker.test", "run-1");
    }));
    assert_eq!(run_status(&v, "run-1"), RunStatus::Rejected);
}

// ------------------------------------------------------- cancel, supersede, snapshot

#[test]
fn maker_cancels_before_release_only() {
    let mut v = funded(1_000);
    one_row(&mut v, "run-1", 1);
    approve_as(&mut v, "approver1.test", "run-1");
    as_caller("maker.test");
    assert_eq!(v.cancel_run("run-1".into()), RunStatus::Cancelled);
    assert!(
        panics(|| {
            release_as(&mut v, "worker.test", "run-1");
        }),
        "a cancelled run cannot release"
    );

    one_row(&mut v, "run-2", 1);
    approve_as(&mut v, "approver1.test", "run-2");
    release_as(&mut v, "worker.test", "run-2");
    as_caller("maker.test");
    assert!(
        panics(|| {
            v.cancel_run("run-2".into());
        }),
        "a releasing run cannot be cancelled"
    );
}

#[test]
#[should_panic(expected = "Only the run's maker can cancel it")]
fn only_maker_cancels() {
    let mut v = vault();
    one_row(&mut v, "run-1", 1);
    as_caller("approver1.test");
    v.cancel_run("run-1".into());
}

#[test]
fn new_version_supersedes_and_stale_version_cannot_release() {
    let mut v = funded(1_000);
    one_row(&mut v, "run-1-v1", 10);
    approve_as(&mut v, "approver1.test", "run-1-v1");
    create_v(
        &mut v,
        "run-1-v2",
        &[("recipient1.test", 12)],
        Some("run-1-v1"),
    );
    let old = v.get_run("run-1-v1".into()).unwrap();
    assert_eq!(old.status, RunStatus::Cancelled);
    assert_eq!(old.superseded_by.as_deref(), Some("run-1-v2"));
    assert!(
        panics(|| {
            release_as(&mut v, "worker.test", "run-1-v1");
        }),
        "stale version cannot release"
    );
    // The new version needs fresh approvals.
    assert_eq!(run_status(&v, "run-1-v2"), RunStatus::PendingApproval);
    assert!(v.get_run("run-1-v2".into()).unwrap().approvals.is_empty());
}

#[test]
fn workflow_update_does_not_change_existing_runs() {
    let mut v = funded(1_000);
    one_row(&mut v, "run-old", 10);
    let w = update(&mut v, "approver2.test", ReleaseMode::Maker);
    assert_eq!(w.revision, 2);
    // The old run keeps approver1 and automatic release.
    let old = v.get_run("run-old".into()).unwrap();
    assert_eq!(old.policy.revision, 1);
    assert_eq!(old.policy.approvers, vec![acc("approver1.test")]);
    assert!(
        panics(|| {
            approve_as(&mut v, "approver2.test", "run-old");
        }),
        "new approver cannot act on the old run"
    );
    approve_as(&mut v, "approver1.test", "run-old");
    assert_eq!(
        release_as(&mut v, "worker.test", "run-old"),
        RunStatus::Releasing
    );
    // New runs use revision 2.
    one_row(&mut v, "run-new", 10);
    let new = v.get_run("run-new".into()).unwrap();
    assert_eq!(
        (new.policy.revision, new.policy.release_mode),
        (2, ReleaseMode::Maker)
    );
}

#[test]
#[should_panic(expected = "Workflow changed since review: reload and confirm again")]
fn create_with_stale_workflow_revision_fails() {
    let mut v = vault();
    update(&mut v, "approver2.test", ReleaseMode::Automatic);
    as_caller("maker.test");
    v.create_run(
        "run-1".into(),
        1,
        1,
        U128(1),
        "ab".repeat(32),
        "ab".repeat(32),
        None,
    );
}

#[test]
#[should_panic(expected = "Only the admin can do this")]
fn only_admin_updates_workflow() {
    let mut v = vault();
    as_caller("maker.test");
    v.update_workflow(
        WorkflowKind::One,
        vec![acc("approver2.test")],
        ReleaseMode::Automatic,
        acc("maker.test"),
        acc("worker.test"),
        U128(CAP_ROW),
        U128(CAP_RUN),
    );
}

// ------------------------------------------------------------------ release modes

#[test]
fn maker_release_mode() {
    let mut v = vault_with(WorkflowKind::One, &["approver1.test"], ReleaseMode::Maker);
    fund(&mut v, 1_000);
    let c = one_row(&mut v, "run-1", 10);
    approve_as(&mut v, "approver1.test", "run-1");
    assert!(
        panics(|| {
            release_as(&mut v, "worker.test", "run-1");
        }),
        "worker cannot release a maker-release run"
    );
    assert_eq!(
        release_as(&mut v, "maker.test", "run-1"),
        RunStatus::Releasing
    );
    pay_as(&mut v, "maker.test", "run-1", &c, 0);
    assert!(callback(&mut v, "run-1", 0, true));
    assert_eq!(run_status(&v, "run-1"), RunStatus::Paid);
}

#[test]
#[should_panic(expected = "Only the release worker can release this run (automatic release)")]
fn maker_cannot_release_automatic_run() {
    let mut v = funded(1_000);
    one_row(&mut v, "run-1", 10);
    approve_as(&mut v, "approver1.test", "run-1");
    release_as(&mut v, "maker.test", "run-1");
}

#[test]
#[should_panic(expected = "Only the release worker (or the maker in maker release) can pay rows")]
fn maker_cannot_pay_rows_of_automatic_run() {
    let (mut v, c) = releasing(&[("recipient1.test", 10)]);
    pay_as(&mut v, "maker.test", "run-1", &c, 0);
}

// ------------------------------------------------------------------------- caps

#[test]
#[should_panic(expected = "Total is above the run cap")]
fn run_cap_is_enforced() {
    let mut v = vault();
    as_caller("maker.test");
    v.create_run(
        "run-1".into(),
        1,
        1,
        U128(CAP_RUN + 1),
        "ab".repeat(32),
        "ab".repeat(32),
        None,
    );
}

#[test]
#[should_panic(expected = "Amount is above the row cap")]
fn row_cap_is_enforced() {
    let (mut v, c) = releasing(&[("recipient1.test", CAP_ROW + 1)]);
    pay(&mut v, "run-1", &c, 0);
}

// ------------------------------------------------------------- commitments on-chain

const ROWS: [(&str, u128); 3] = [
    ("recipient1.test", 10_000),
    ("recipient2.test", 20_000),
    ("recipient1.test", 10_000),
];

#[test]
#[should_panic(expected = "Payout proof does not match the approved run")]
fn changed_amount_is_rejected() {
    let (mut v, c) = releasing(&ROWS);
    let (r, _, proof) = c.rows[1].clone();
    as_caller("worker.test");
    let _ = v.pay_row("run-1".into(), 1, r, U128(20_001), proof);
}

#[test]
#[should_panic(expected = "Payout proof does not match the approved run")]
fn changed_destination_is_rejected() {
    let (mut v, c) = releasing(&ROWS);
    let (_, amt, proof) = c.rows[1].clone();
    as_caller("worker.test");
    let _ = v.pay_row("run-1".into(), 1, acc("attacker.test"), U128(amt), proof);
}

#[test]
#[should_panic(expected = "Payout proof does not match the approved run")]
fn changed_index_is_rejected() {
    // Row 0 and row 2 have the same wallet and amount; row 0's proof cannot pay index 2.
    let (mut v, c) = releasing(&ROWS);
    let (r, amt, proof) = c.rows[0].clone();
    as_caller("worker.test");
    let _ = v.pay_row("run-1".into(), 2, r, U128(amt), proof);
}

#[test]
fn same_wallet_on_two_indexes_is_two_payouts() {
    let (mut v, c) = releasing(&ROWS);
    for i in 0..3 {
        pay(&mut v, "run-1", &c, i);
        assert!(callback(&mut v, "run-1", i, true));
    }
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!(
        (run.status, run.paid, run.paid_count),
        (RunStatus::Paid, U128(40_000), 3)
    );
    assert_eq!(v.get_balances().reserved, U128(0));
}

#[test]
#[should_panic(expected = "Payout would exceed the reserved run total")]
fn root_with_more_value_than_total_cannot_overpay() {
    // A maker commits a root whose leaves sum to more than the declared total: the
    // reservation guard stops payouts once the approved total is used up.
    let (root, c) = commit(&[("recipient1.test", 30_000), ("recipient2.test", 30_000)]);
    let mut v = funded(1_000_000);
    as_caller("maker.test");
    v.create_run(
        "run-x".into(),
        1,
        2,
        U128(40_000),
        root,
        "ab".repeat(32),
        None,
    );
    approve_as(&mut v, "approver1.test", "run-x");
    release_as(&mut v, "worker.test", "run-x");
    pay(&mut v, "run-x", &c, 0);
    pay(&mut v, "run-x", &c, 1);
}

#[test]
#[should_panic(expected = "payout_root must be 64 lowercase hex characters")]
fn malformed_root_is_rejected() {
    let mut v = vault();
    as_caller("maker.test");
    v.create_run(
        "run-1".into(),
        1,
        1,
        U128(1),
        "XYZ".into(),
        "ab".repeat(32),
        None,
    );
}

#[test]
#[should_panic(expected = "A run needs 1-1000 rows")]
fn more_than_1000_rows_is_rejected() {
    let mut v = vault();
    as_caller("maker.test");
    v.create_run(
        "run-1".into(),
        1,
        1001,
        U128(1),
        "ab".repeat(32),
        "ab".repeat(32),
        None,
    );
}
