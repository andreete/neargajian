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

fn one_row(v: &mut Vault, run_id: &str, amount: u128) {
    as_caller("maker.test");
    v.create_run(
        run_id.into(),
        vec![Payout {
            receiver_id: acc("recipient1.test"),
            amount: U128(amount),
        }],
    );
}

#[test]
fn happy_path_single_payout() {
    let mut v = funded(1_000_000);
    one_row(&mut v, "run-1", 50_000);
    as_caller("approver1.test");
    assert_eq!(v.approve("run-1".into()), RunStatus::Approved);
    as_caller("worker.test");
    assert_eq!(v.start_release("run-1".into()), RunStatus::Releasing);
    assert_eq!(v.get_balances().reserved, U128(50_000));
    let _ = v.pay_row("run-1".into(), 0);
    assert_eq!(
        v.get_row_status("run-1".into(), 0),
        Some(RowStatus::InFlight)
    );
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
    one_row(&mut v, "run-1", 50_000);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
    let _ = v.pay_row("run-1".into(), 0);
    as_caller("vault.test");
    assert!(!v.on_payout("run-1".into(), 0, Err(PromiseError::Failed)));
    assert_eq!(v.get_row_status("run-1".into(), 0), Some(RowStatus::Failed));
    let run = v.get_run("run-1".into()).unwrap();
    assert_eq!((run.status, run.committed), (RunStatus::Releasing, U128(0)));
    assert_eq!(v.get_balances().reserved, U128(50_000));
    as_caller("worker.test");
    let _ = v.pay_row("run-1".into(), 0);
    assert_eq!(
        v.get_row_status("run-1".into(), 0),
        Some(RowStatus::InFlight)
    );
}

#[test]
#[should_panic(expected = "Only the maker can create runs")]
fn approver_cannot_create_run() {
    let mut v = vault();
    as_caller("approver1.test");
    v.create_run(
        "run-1".into(),
        vec![Payout {
            receiver_id: acc("x.test"),
            amount: U128(1),
        }],
    );
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
    one_row(&mut v, "run-1", 1);
    as_caller("approver1.test");
    v.approve("run-1".into());
    as_caller("worker.test");
    v.start_release("run-1".into());
    let _ = v.pay_row("run-1".into(), 0);
    let _ = v.pay_row("run-1".into(), 0);
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
