//! Sandbox tests: real Wasm (built with cargo-near) on a local nearcore 2.14.0 sandbox
//! (127.0.0.1). These exercise the real asynchronous `ft_transfer` outcome, which unit
//! tests cannot. Payout rows are proven against the run's Merkle commitment.

use gajian_vault::commitment;
use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;

type R<T> = testresult::TestResult<T>;

struct Env {
    sandbox: near_sandbox::Sandbox,
    network: NetworkConfig,
    signer: Arc<Signer>,
}

impl Env {
    async fn start() -> R<Self> {
        let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
        let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(
            near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
        )?;
        Ok(Self {
            sandbox,
            network,
            signer,
        })
    }

    async fn account(&self, name: &str) -> R<AccountId> {
        let id: AccountId = format!("{name}.sandbox").parse()?;
        self.sandbox
            .create_account(id.as_str().parse()?)
            .initial_balance(NearToken::from_near(20))
            .send()
            .await?;
        Ok(id)
    }

    async fn deploy(&self, id: &AccountId, wasm: &[u8], init_args: Value) -> R<()> {
        near_api::Contract::deploy(id.clone())
            .use_code(wasm.to_vec())
            .with_init_call("new", init_args)?
            .with_signer(self.signer.clone())
            .send_to(&self.network)
            .await?
            .assert_success();
        Ok(())
    }

    /// Function call. Returns Ok(json result) on success, Err(failure text) on failure.
    async fn call(
        &self,
        signer: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> R<Result<Value, String>> {
        let result = near_api::Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(deposit)
            .gas(NearGas::from_tgas(100))
            .with_signer(signer.clone(), self.signer.clone())
            .send_to(&self.network)
            .await?;
        if result.is_success() {
            let success = result.assert_success();
            Ok(Ok(success.json::<Value>().unwrap_or(Value::Null)))
        } else {
            Ok(Err(format!("{:?}", result.assert_failure())))
        }
    }

    async fn ok(
        &self,
        signer: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
    ) -> R<Value> {
        match self
            .call(signer, contract, method, args, NearToken::from_yoctonear(0))
            .await?
        {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("{method} by {signer} failed: {e}").into()),
        }
    }

    /// Asserts the call fails and that the failure mentions `expected`.
    async fn fails(
        &self,
        signer: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
        expected: &str,
    ) -> R<()> {
        match self
            .call(signer, contract, method, args, NearToken::from_yoctonear(0))
            .await?
        {
            Ok(v) => Err(format!("{method} by {signer} unexpectedly succeeded: {v}").into()),
            Err(e) => {
                assert!(
                    e.contains(expected),
                    "{method}: expected `{expected}` in: {e}"
                );
                Ok(())
            }
        }
    }

    async fn view(&self, contract: &AccountId, method: &str, args: Value) -> R<Value> {
        Ok(near_api::Contract(contract.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.network)
            .await?
            .data)
    }

    async fn ft_balance(&self, token: &AccountId, account: &AccountId) -> R<u128> {
        let v: U128 = near_sdk::serde_json::from_value(
            self.view(token, "ft_balance_of", json!({ "account_id": account }))
                .await?,
        )?;
        Ok(v.0)
    }

    async fn register(&self, payer: &AccountId, token: &AccountId, account: &AccountId) -> R<()> {
        self.call(
            payer,
            token,
            "storage_deposit",
            json!({ "account_id": account, "registration_only": true }),
            NearToken::from_millinear(10),
        )
        .await?
        .map_err(|e| format!("storage_deposit failed: {e}"))?;
        Ok(())
    }
}

fn build(manifest: &str) -> R<Vec<u8>> {
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(cargo_near_build::camino::Utf8PathBuf::from(manifest))
        .build();
    let path = cargo_near_build::build_with_cli(opts)?;
    Ok(std::fs::read(path)?)
}

fn u128_of(v: &Value) -> u128 {
    v.as_str().expect("U128 string").parse().expect("u128")
}

fn sha(data: &[u8]) -> commitment::Hash {
    near_sdk::env::sha256_array(data)
}

fn hex(h: &commitment::Hash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}

/// A run's rows with their commitment, computed the way the app does it.
pub struct Committed {
    pub rows: Vec<(AccountId, u128)>,
    pub root: String,
    pub proofs: Vec<Vec<String>>,
}

impl Committed {
    pub fn new(rows: &[(&AccountId, u128)]) -> Self {
        let leaves: Vec<_> = rows
            .iter()
            .enumerate()
            .map(|(i, (a, amt))| commitment::leaf_hash(sha, i as u32, a.as_str(), *amt))
            .collect();
        let (root, proofs) = commitment::root_and_proofs(sha, &leaves);
        Self {
            rows: rows.iter().map(|(a, amt)| ((*a).clone(), *amt)).collect(),
            root: hex(&root),
            proofs: proofs.iter().map(|p| p.iter().map(hex).collect()).collect(),
        }
    }

    pub fn create_args(&self, run_id: &str) -> Value {
        let total: u128 = self.rows.iter().map(|r| r.1).sum();
        json!({
            "run_id": run_id, "row_count": self.rows.len(), "total": total.to_string(),
            "payout_root": self.root, "review_digest": "ab".repeat(32),
        })
    }

    pub fn pay_args(&self, run_id: &str, index: usize) -> Value {
        json!({
            "run_id": run_id, "index": index, "receiver_id": self.rows[index].0,
            "amount": self.rows[index].1.to_string(), "proof": self.proofs[index],
        })
    }
}

#[tokio::test]
async fn committed_payouts_end_to_end() -> R<()> {
    let tusdc_wasm = build("../tusdc/Cargo.toml")?;
    let vault_wasm = build("Cargo.toml")?;
    let env = Env::start().await?;

    let admin = env.account("admin").await?;
    let maker = env.account("maker").await?;
    let approver = env.account("approver1").await?;
    let worker = env.account("worker").await?;
    let recipient = env.account("recipient1").await?;
    let late = env.account("recipient2").await?; // not registered at first
    let tusdc = env.account("tusdc").await?;
    let fake = env.account("faketoken").await?;
    let vault = env.account("vault").await?;

    env.deploy(&tusdc, &tusdc_wasm, json!({ "owner_id": admin }))
        .await?;
    env.deploy(&fake, &tusdc_wasm, json!({ "owner_id": admin }))
        .await?;
    env.deploy(
        &vault,
        &vault_wasm,
        json!({ "admin": admin, "token": tusdc, "maker": maker, "approver": approver, "worker": worker }),
    )
    .await?;

    // Pre-registration with tUSDC (NEP-145) for the vault and the recipient.
    for a in [&vault, &recipient] {
        env.register(&admin, &tusdc, a).await?;
    }
    env.register(&admin, &fake, &vault).await?;

    // Fund: mint 1 tUSDC to admin, transfer it into the vault via ft_transfer_call.
    let mint = json!({ "account_id": admin, "amount": "1000000" });
    env.ok(&admin, &tusdc, "mint", mint).await?;
    let fund = json!({ "receiver_id": vault, "amount": "1000000", "msg": "" });
    let funded = env
        .call(
            &admin,
            &tusdc,
            "ft_transfer_call",
            fund,
            NearToken::from_yoctonear(1),
        )
        .await?;
    assert!(funded.is_ok(), "funding failed: {funded:?}");
    let balances = env.view(&vault, "get_balances", json!({})).await?;
    assert_eq!(u128_of(&balances["total"]), 1_000_000);
    assert_eq!(env.ft_balance(&tusdc, &vault).await?, 1_000_000);

    // Wrong token: the vault rejects it and the fake token refunds the sender.
    let mint = json!({ "account_id": admin, "amount": "500" });
    env.ok(&admin, &fake, "mint", mint).await?;
    let fund = json!({ "receiver_id": vault, "amount": "500", "msg": "" });
    let _ = env
        .call(
            &admin,
            &fake,
            "ft_transfer_call",
            fund,
            NearToken::from_yoctonear(1),
        )
        .await?;
    assert_eq!(env.ft_balance(&fake, &vault).await?, 0, "wrong token kept");
    assert_eq!(env.ft_balance(&fake, &admin).await?, 500, "not refunded");
    let balances = env.view(&vault, "get_balances", json!({})).await?;
    assert_eq!(
        u128_of(&balances["total"]),
        1_000_000,
        "wrong token credited"
    );

    // Maker creates run-1: one payout of 0.05 tUSDC, committed by its Merkle root.
    let run1 = Committed::new(&[(&recipient, 50_000)]);
    let create1 = run1.create_args("run-1");
    env.fails(
        &approver,
        &vault,
        "create_run",
        create1.clone(),
        "Only the maker",
    )
    .await?;
    env.ok(&maker, &vault, "create_run", create1.clone())
        .await?;
    env.fails(&maker, &vault, "create_run", create1, "Run already exists")
        .await?;

    // Premature release: before approval nothing can be reserved or paid.
    let run_1 = json!({ "run_id": "run-1" });
    env.fails(
        &worker,
        &vault,
        "start_release",
        run_1.clone(),
        "not approved",
    )
    .await?;
    env.fails(
        &worker,
        &vault,
        "pay_row",
        run1.pay_args("run-1", 0),
        "not releasing",
    )
    .await?;

    // Approval: the maker cannot approve; the assigned approver can.
    env.fails(
        &maker,
        &vault,
        "approve",
        run_1.clone(),
        "assigned approver",
    )
    .await?;
    env.ok(&approver, &vault, "approve", run_1.clone()).await?;
    env.fails(&approver, &vault, "approve", run_1.clone(), "not waiting")
        .await?;

    // Release: only the worker; the total is reserved first.
    env.fails(
        &maker,
        &vault,
        "start_release",
        run_1.clone(),
        "release worker",
    )
    .await?;
    env.ok(&worker, &vault, "start_release", run_1.clone())
        .await?;
    let balances = env.view(&vault, "get_balances", json!({})).await?;
    assert_eq!(u128_of(&balances["reserved"]), 50_000);

    // Tampered payouts: a changed amount or destination fails the proof check on-chain.
    let mut tampered = run1.pay_args("run-1", 0);
    tampered["amount"] = json!("50001");
    env.fails(&worker, &vault, "pay_row", tampered, "proof does not match")
        .await?;
    let mut tampered = run1.pay_args("run-1", 0);
    tampered["receiver_id"] = json!(late);
    env.fails(&worker, &vault, "pay_row", tampered, "proof does not match")
        .await?;

    // Pay: real async ft_transfer, the callback records the outcome.
    let paid = env
        .ok(&worker, &vault, "pay_row", run1.pay_args("run-1", 0))
        .await?;
    assert_eq!(paid, json!(true));
    assert_eq!(env.ft_balance(&tusdc, &recipient).await?, 50_000);
    let run = env.view(&vault, "get_run", run_1.clone()).await?;
    assert_eq!(run["status"], json!("Paid"));
    let row = json!({ "run_id": "run-1", "index": 0 });
    assert_eq!(
        env.view(&vault, "get_row", row).await?["status"],
        json!("Paid")
    );

    // Duplicate payout: a paid run/row cannot pay again.
    env.fails(
        &worker,
        &vault,
        "pay_row",
        run1.pay_args("run-1", 0),
        "not releasing",
    )
    .await?;
    assert_eq!(env.ft_balance(&tusdc, &recipient).await?, 50_000);

    // run-2: rows 0 and 2 pay the same wallet the same amount (two intended payouts);
    // row 1 goes to an account that is not registered with tUSDC yet.
    let run2 = Committed::new(&[(&recipient, 20_000), (&late, 10_000), (&recipient, 20_000)]);
    let run_2 = json!({ "run_id": "run-2" });
    env.ok(&maker, &vault, "create_run", run2.create_args("run-2"))
        .await?;
    env.ok(&approver, &vault, "approve", run_2.clone()).await?;
    env.ok(&worker, &vault, "start_release", run_2.clone())
        .await?;
    env.ok(&worker, &vault, "pay_row", run2.pay_args("run-2", 0))
        .await?;
    env.fails(
        &worker,
        &vault,
        "pay_row",
        run2.pay_args("run-2", 0),
        "already paid",
    )
    .await?;
    // Row 0's proof cannot be replayed as index 2, although wallet and amount match.
    let mut replay = run2.pay_args("run-2", 0);
    replay["index"] = json!(2);
    env.fails(&worker, &vault, "pay_row", replay, "proof does not match")
        .await?;
    env.ok(&worker, &vault, "pay_row", run2.pay_args("run-2", 2))
        .await?;

    // Real asynchronous failure: the token rejects the transfer to an unregistered account.
    // The transaction succeeds; the callback returns false and marks the row Failed.
    let outcome = env
        .ok(&worker, &vault, "pay_row", run2.pay_args("run-2", 1))
        .await?;
    assert_eq!(outcome, json!(false));
    let row1 = json!({ "run_id": "run-2", "index": 1 });
    assert_eq!(
        env.view(&vault, "get_row", row1.clone()).await?["status"],
        json!("Failed")
    );
    assert_eq!(env.ft_balance(&tusdc, &late).await?, 0);
    let run = env.view(&vault, "get_run", run_2.clone()).await?;
    assert_eq!(run["status"], json!("Releasing"));
    let balances = env.view(&vault, "get_balances", json!({})).await?;
    assert_eq!(
        u128_of(&balances["reserved"]),
        10_000,
        "failed row stays reserved"
    );

    // Recovery: register the account, retry the proven-failed row, the run completes.
    env.register(&admin, &tusdc, &late).await?;
    let retried = env
        .ok(&worker, &vault, "pay_row", run2.pay_args("run-2", 1))
        .await?;
    assert_eq!(retried, json!(true));
    assert_eq!(
        env.view(&vault, "get_row", row1).await?["attempts"],
        json!(2)
    );
    let run = env.view(&vault, "get_run", run_2).await?;
    assert_eq!(run["status"], json!("Paid"));

    // Books reconcile with the token ledger.
    let balances = env.view(&vault, "get_balances", json!({})).await?;
    let expected = 1_000_000 - 50_000 - 20_000 - 10_000 - 20_000;
    assert_eq!(u128_of(&balances["total"]), expected);
    assert_eq!(u128_of(&balances["reserved"]), 0);
    assert_eq!(env.ft_balance(&tusdc, &vault).await?, expected);
    assert_eq!(env.ft_balance(&tusdc, &recipient).await?, 90_000);
    assert_eq!(env.ft_balance(&tusdc, &late).await?, 10_000);
    Ok(())
}
