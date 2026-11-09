//! GAJIAN toolchain canary.
//!
//! Not part of the payroll product. It exists so that every toolchain bump (Rust,
//! cargo-near, near-sdk, sandbox) is proven by a real Wasm build and a sandbox deploy
//! before any money-handling contract depends on it.

use near_sdk::json_types::U64;
use near_sdk::{AccountId, PanicOnDefault, env, near, require};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Smoke {
    owner: AccountId,
    counter: u64,
}

#[near]
impl Smoke {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self { owner, counter: 0 }
    }

    /// Owner-only state change; proves predecessor checks and checked arithmetic.
    pub fn increment(&mut self) -> U64 {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can increment"
        );
        self.counter = self
            .counter
            .checked_add(1)
            .unwrap_or_else(|| env::panic_str("Counter overflow"));
        U64(self.counter)
    }

    pub fn get_counter(&self) -> U64 {
        U64(self.counter)
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn as_caller(caller: AccountId) {
        let mut ctx = VMContextBuilder::new();
        ctx.current_account_id(accounts(0))
            .predecessor_account_id(caller.clone())
            .signer_account_id(caller);
        testing_env!(ctx.build());
    }

    #[test]
    fn owner_can_increment() {
        as_caller(accounts(1));
        let mut c = Smoke::new(accounts(1));
        assert_eq!(c.increment(), U64(1));
        assert_eq!(c.get_counter(), U64(1));
        assert_eq!(c.get_owner(), accounts(1));
    }

    #[test]
    #[should_panic(expected = "Only the owner can increment")]
    fn non_owner_is_rejected() {
        as_caller(accounts(2));
        let mut c = Smoke::new(accounts(1));
        c.increment();
    }
}
