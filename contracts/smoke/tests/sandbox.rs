//! Sandbox proof for the pinned toolchain: build the Wasm with cargo-near, deploy it to a
//! local nearcore sandbox, call it, and check that an unauthorized call fails on-chain.

use near_api::{AccountId, NearToken};
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;

async fn create_subaccount(
    sandbox: &near_sandbox::Sandbox,
    name: &str,
) -> testresult::TestResult<near_api::Account> {
    let account_id: AccountId = name.parse()?;
    sandbox
        .create_account(account_id.as_str().parse()?)
        .initial_balance(NearToken::from_near(10))
        .send()
        .await?;
    Ok(near_api::Account(account_id))
}

#[tokio::test]
async fn smoke_contract_deploys_and_runs_in_sandbox() -> testresult::TestResult<()> {
    let wasm_path = cargo_near_build::build_with_cli(Default::default())?;
    let wasm = std::fs::read(&wasm_path)?;
    println!("wasm: {wasm_path} ({} bytes)", wasm.len());

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let network = near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
    )?;

    let owner = create_subaccount(&sandbox, "owner.sandbox").await?;
    let stranger = create_subaccount(&sandbox, "stranger.sandbox").await?;
    let contract = create_subaccount(&sandbox, "smoke.sandbox")
        .await?
        .as_contract();

    near_api::Contract::deploy(contract.account_id().clone())
        .use_code(wasm)
        .with_init_call("new", json!({ "owner": owner.account_id() }))?
        .with_signer(signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    contract
        .call_function("increment", ())
        .transaction()
        .with_signer(owner.account_id().clone(), signer.clone())
        .send_to(&network)
        .await?
        .assert_success();

    contract
        .call_function("increment", ())
        .transaction()
        .with_signer(stranger.account_id().clone(), signer.clone())
        .send_to(&network)
        .await?
        .assert_failure();

    let counter: U64 = contract
        .call_function("get_counter", ())
        .read_only()
        .fetch_from(&network)
        .await?
        .data;
    assert_eq!(counter, U64(1));
    Ok(())
}
