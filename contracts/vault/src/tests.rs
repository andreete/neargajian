//! Unit tests (near-sdk mocked runtime). The real asynchronous transfer outcome is
//! exercised in the sandbox tests (tests/sandbox.rs); here the callback is called directly.

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn as_caller(name: &str) {
    let mut ctx = VMContextBuilder::new();
    ctx.current_account_id(acc("vault.test"))
        .predecessor_account_id(acc(name));
    testing_env!(ctx.build());
}

fn vault() -> Vault {
    as_caller("admin.test");
    Vault::new(
        acc("admin.test"),
        acc("tusdc.test"),
        acc("maker.test"),
        acc("approver1.test"),
        acc("worker.test"),
    )
}

fn funded(amount: u128) -> Vault {
    let mut v = vault();
    as_caller("tusdc.test");
    let _ = v.ft_on_transfer(acc("admin.test"), U128(amount), String::new());
    v
}

struct Committed {
    rows: Vec<(AccountId, u128, Vec<String>)>,
}

fn hex(h: &commitment::Hash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}

/// Creates a run from (receiver, amount) rows and returns each row with its proof.
fn create(v: &mut Vault, run_id: &str, rows: &[(&str, u128)]) -> Committed {
    let sha = |d: &[u8]| env::sha256_array(d);
    let leaves: Vec<commitment::Hash> = rows
        .iter()
        .enumerate()
        .map(|(i, (a, amt))| commitment::leaf_hash(sha, i as u32, a, *amt))
        .collect();
    let (root, proofs) = commitment::root_and_proofs(sha, &leaves);
    let total: u128 = rows.iter().map(|r| r.1).sum();
    as_caller("maker.test");
    v.create_run(
        run_id.into(),
        rows.len() as u32,
        U128(total),
        hex(&root),
        "ab".repeat(32),
    );
    Committed {
        rows: rows
            .iter()
            .zip(proofs)
            .map(|((a, amt), p)| (acc(a), *amt, p.iter().map(hex).collect()))
            .collect(),
    }
}

fn one_row(v: &mut Vault, run_id: &str, amount: u128) -> Committed {
    create(v, run_id, &[("recipient1.test", amount)])
}

fn pay(v: &mut Vault, run_id: &str, c: &Committed, index: u32) {
    let (receiver, amount, proof) = c.rows[index as usize].clone();
    as_caller("worker.test");
    let _ = v.pay_row(run_id.into(), index, receiver, U128(amount), proof);
}

fn status(v: &Vault, run_id: &str, index: u32) -> Option<RowStatus> {
    v.get_row(run_id.into(), index).map(|r| r.status)
}

#[test]
fn happy_path_single_payout() {
    let mut v = funded(1_000_000);
    let c = one_row(&mut v, "run-1", 50_000);
    as_caller("approver1.test");
    assert_eq!(v.approve("run-1".into()), RunStatus::Approved);
    as_caller("worker.test");
    assert_eq!(v.start_release("run-1".into()), RunStatus::Releasing);
    assert_eq!(v.get_balances().reserved, U128(50_000));
    pay(&mut v, "run-1", &c, 0);
    assert_eq!(status(&v, "run-1", 0), Some(RowStatus::InFlight));
    as_caller("vault.test");
    assert!(v.on_payout("run-1".into(), 0, Ok(())));
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!(run.status, RunStatus::Paid);
    assert_eq!(run.paid, U128(50_000));
    let b = v.get_balances();
    assert_eq!(
        (b.total, b.reserved, b.available),
        (U128(950_000), U128(0), U128(950_000))
    );
}

#[test]
fn proven_failure_keeps_reservation_and_allows_retry() {
    let mut v = funded(1_000_000);
    let c = one_row(&mut v, "run-1", 50_000);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
    pay(&mut v, "run-1", &c, 0);
    as_caller("vault.test");
    assert!(!v.on_payout("run-1".into(), 0, Err(PromiseError::Failed)));
    assert_eq!(status(&v, "run-1", 0), Some(RowStatus::Failed));
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!((run.status, run.committed), (RunStatus::Releasing, U128(0)));
    assert_eq!(v.get_balances().reserved, U128(50_000));
    pay(&mut v, "run-1", &c, 0);
    let row = v.get_row("run-1".into(), 0).unwrap();
    assert_eq!((row.status, row.attempts), (RowStatus::InFlight, 2));
}

#[test]
#[should_panic(expected = "Only the maker can create runs")]
fn approver_cannot_create_run() {
    let mut v = vault();
    as_caller("approver1.test");
    v.create_run("run-1".into(), 1, U128(1), "ab".repeat(32), "ab".repeat(32));
}

#[test]
#[should_panic(expected = "Only the assigned approver can approve")]
fn maker_cannot_approve_own_run() {
    let mut v = vault();
    one_row(&mut v, "run-1", 1);
    as_caller("maker.test");
    v.approve("run-1".into());
}

#[test]
#[should_panic(expected = "Run is not approved for release")]
fn release_before_approval_fails() {
    let mut v = funded(100);
    one_row(&mut v, "run-1", 1);
    as_caller("worker.test");
    v.start_release("run-1".into());
}

#[test]
#[should_panic(expected = "Insufficient vault balance: awaiting funding")]
fn release_without_funding_fails() {
    let mut v = funded(10);
    one_row(&mut v, "run-1", 11);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
}

#[test]
#[should_panic(expected = "Row is already in flight")]
fn duplicate_pay_while_in_flight_fails() {
    let mut v = funded(100);
    let c = one_row(&mut v, "run-1", 1);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
    pay(&mut v, "run-1", &c, 0);
    pay(&mut v, "run-1", &c, 0);
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
fn roles_must_be_distinct() {
    as_caller("admin.test");
    Vault::new(
        acc("admin.test"),
        acc("tusdc.test"),
        acc("maker.test"),
        acc("maker.test"),
        acc("worker.test"),
    );
}

fn releasing(rows: &[(&str, u128)]) -> (Vault, Committed) {
    let mut v = funded(10_000_000);
    let c = create(&mut v, "run-1", rows);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
    (v, c)
}

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
        as_caller("vault.test");
        assert!(v.on_payout("run-1".into(), i, Ok(())));
    }
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!(
        (run.status, run.paid, run.paid_count),
        (RunStatus::Paid, U128(40_000), 3)
    );
    assert_eq!(v.get_balances().reserved, U128(0));
}

#[test]
#[should_panic(expected = "Row is already paid")]
fn paid_row_cannot_be_paid_again_while_run_releasing() {
    let (mut v, c) = releasing(&ROWS);
    pay(&mut v, "run-1", &c, 0);
    as_caller("vault.test");
    v.on_payout("run-1".into(), 0, Ok(()));
    pay(&mut v, "run-1", &c, 0);
}

#[test]
#[should_panic(expected = "Payout would exceed the reserved run total")]
fn root_with_more_value_than_total_cannot_overpay() {
    // A maker commits a root whose leaves sum to more than the declared total: the
    // reservation guard stops payouts once the approved total is used up.
    let sha = |d: &[u8]| env::sha256_array(d);
    let leaves = [
        commitment::leaf_hash(sha, 0, "recipient1.test", 30_000),
        commitment::leaf_hash(sha, 1, "recipient2.test", 30_000),
    ];
    let (root, proofs) = commitment::root_and_proofs(sha, &leaves);
    let mut v = funded(1_000_000);
    as_caller("maker.test");
    v.create_run("run-x".into(), 2, U128(40_000), hex(&root), "ab".repeat(32));
    as_caller("approver1.test");
    v.approve("run-x".into());
    as_caller("worker.test");
    v.start_release("run-x".into());
    let p = |i: usize| proofs[i].iter().map(hex).collect::<Vec<_>>();
    let _ = v.pay_row(
        "run-x".into(),
        0,
        acc("recipient1.test"),
        U128(30_000),
        p(0),
    );
    let _ = v.pay_row(
        "run-x".into(),
        1,
        acc("recipient2.test"),
        U128(30_000),
        p(1),
    );
}

#[test]
#[should_panic(expected = "payout_root must be 64 lowercase hex characters")]
fn malformed_root_is_rejected() {
    let mut v = vault();
    as_caller("maker.test");
    v.create_run("run-1".into(), 1, U128(1), "XYZ".into(), "ab".repeat(32));
}

#[test]
#[should_panic(expected = "A run needs 1-1000 rows")]
fn more_than_1000_rows_is_rejected() {
    let mut v = vault();
    as_caller("maker.test");
    v.create_run(
        "run-1".into(),
        1001,
        U128(1),
        "ab".repeat(32),
        "ab".repeat(32),
    );
}
