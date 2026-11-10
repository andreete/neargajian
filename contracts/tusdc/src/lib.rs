//! tUSDC: a zero-value NEP-141 test token for the SentFund payroll prototype (NEAR testnet only).
//!
//! - NEP-141 (fungible token), NEP-145 (storage management) and NEP-148 (metadata) from
//!   `near-contract-standards`.
//! - 6 decimals, like USDC. Amounts are integer base units (1 tUSDC = 1_000_000).
//! - Only the owner can mint. There is no initial supply: tokens exist only after `mint`.
//! - The receiver of a mint must already be registered (storage deposit), like any transfer.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, env, log, near, require,
};

pub const DECIMALS: u8 = 6;
pub const SYMBOL: &str = "tUSDC";

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    FungibleToken,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    token: FungibleToken,
}

#[near]
impl Contract {
    /// Creates the token with zero supply. The owner registers itself so it can hold tokens.
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let mut this = Self {
            owner_id: owner_id.clone(),
            token: FungibleToken::new(StorageKey::FungibleToken),
        };
        this.token.internal_register_account(&owner_id);
        this
    }

    /// Owner-only: create `amount` base units for an already registered account.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can mint"
        );
        require!(amount.0 > 0, "Amount must be positive");
        require!(
            self.token.accounts.contains_key(&account_id),
            "Receiver is not registered with tUSDC (call storage_deposit first)"
        );
        // internal_deposit panics on total-supply overflow.
        self.token.internal_deposit(&account_id, amount.0);
        FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("tUSDC test mint"),
        }
        .emit();
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            log!("Account @{} burned {}", sender_id, burned);
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "SentFund test USDC (zero value, testnet only)".to_string(),
            symbol: SYMBOL.to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn owner_mints_to_registered_account() {
        testing_env!(context(accounts(0)).build());
        let mut contract = Contract::new(accounts(0));
        contract.mint(accounts(0), U128(1_500_000));
        assert_eq!(contract.ft_balance_of(accounts(0)), U128(1_500_000));
        assert_eq!(contract.ft_total_supply(), U128(1_500_000));
        assert_eq!(contract.ft_metadata().decimals, 6);
        assert_eq!(contract.ft_metadata().symbol, "tUSDC");
    }

    #[test]
    #[should_panic(expected = "Only the owner can mint")]
    fn non_owner_cannot_mint() {
        testing_env!(context(accounts(0)).build());
        let mut contract = Contract::new(accounts(0));
        testing_env!(context(accounts(1)).build());
        contract.mint(accounts(1), U128(1));
    }

    #[test]
    #[should_panic(expected = "not registered")]
    fn mint_requires_registration() {
        testing_env!(context(accounts(0)).build());
        let mut contract = Contract::new(accounts(0));
        contract.mint(accounts(2), U128(1));
    }
}
