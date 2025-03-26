#[cfg(test)]
mod tests {
    use near_sdk::json_types::U128;
    use near_sdk::{AccountId, NearToken};
    use near_sdk_sim::{
        deploy, init_simulator, call, to_yocto, view, ContractAccount, UserAccount, DEFAULT_GAS
    };
    use serde_json::json;
    use crate::CreditScoreProofs;

    near_sdk_sim::lazy_static_include::lazy_static_include_bytes! {
        CONTRACT_WASM_BYTES => "target/wasm32-unknown-unknown/release/credit_score_proofs.wasm",
        INTENTS_WASM_BYTES => "res/intents.wasm"  // Mock intents contract
    }

    fn setup() -> (
        UserAccount, 
        ContractAccount<CreditScoreProofs>,
        ContractAccount<CreditScoreProofs>,
        UserAccount
    ) {
        let root = init_simulator(None);

        // Deploy the main contract
        let contract = deploy!(
            contract: CreditScoreProofs,
            contract_id: "credit_score.near",
            bytes: &CONTRACT_WASM_BYTES,
            signer_account: root
        );

        // Deploy mock intents contract
        let intents = deploy!(
            contract: CreditScoreProofs,
            contract_id: "intents.near",
            bytes: &INTENTS_WASM_BYTES,
            signer_account: root
        );

        // Initialize main contract
        call!(
            root,
            contract.new(root.account_id()),
            deposit = 0
        ).assert_success();

        // Create test user with 10 NEAR
        let test_user = root.create_user(
            AccountId::new_unchecked("test_user.near".to_string()),
            to_yocto("10")
        );

        (root, contract, intents, test_user)
    }

    #[test]
    fn test_add_public_key() {
        let (root, contract, intents, test_user) = setup();
        let test_public_key = "ed25519:6rq5TcbeTmwJL6FTy98jPn4zkrrt85VUDQ89sXrCyzML";

        // Test adding public key with correct deposit
        let outcome = call!(
            test_user,
            contract.add_public_key(test_public_key.to_string()),
            deposit = 1
        );
        outcome.assert_success();

        // Verify the key was stored correctly
        let stored_key: Option<String> = view!(
            contract.get_public_key(test_user.account_id())
        ).unwrap_json();
        
        assert!(stored_key.is_some(), "Public key should be stored");
        assert_eq!(stored_key.unwrap(), test_public_key, "Stored key should match test key");

        // Verify cross contract call to intents.near
        let logs = outcome.logs();
        assert!(
            logs.iter().any(|log| log.contains("Making cross-contract call to intents.near")),
            "Should make cross-contract call to intents.near"
        );
    }

    #[test]
    fn test_add_public_key_failures() {
        let (root, contract, intents, test_user) = setup();

        // Test with no deposit
        let outcome = call!(
            test_user,
            contract.add_public_key("ed25519:validkey".to_string()),
            deposit = 0
        );
        assert!(!outcome.is_success(), "Should fail without deposit");
        assert!(
            outcome.logs().iter().any(|log| 
                log.contains("Requires attached deposit of exactly 1 yoctoNEAR")
            ),
            "Should show deposit requirement error"
        );

        // Test with wrong deposit amount
        let outcome = call!(
            test_user,
            contract.add_public_key("ed25519:validkey".to_string()),
            deposit = 2
        );
        assert!(!outcome.is_success(), "Should fail with wrong deposit amount");

        // Test with invalid public key format
        let outcome = call!(
            test_user,
            contract.add_public_key("invalid_key_format".to_string()),
            deposit = 1
        );
        assert!(!outcome.is_success(), "Should fail with invalid key format");

        // Test with insufficient gas
        let outcome = call!(
            test_user,
            contract.add_public_key("ed25519:validkey".to_string()),
            gas = 100_000,
            deposit = 1
        );
        assert!(!outcome.is_success(), "Should fail with insufficient gas");
    }

    #[test]
    fn test_cross_contract_callback() {
        let (root, contract, intents, test_user) = setup();
        let test_public_key = "ed25519:6rq5TcbeTmwJL6FTy98jPn4zkrrt85VUDQ89sXrCyzML";

        // Test successful cross contract call and callback
        let outcome = call!(
            test_user,
            contract.add_public_key(test_public_key.to_string()),
            deposit = 1
        );
        outcome.assert_success();

        // Verify callback was processed
        let logs = outcome.logs();
        assert!(
            logs.iter().any(|log| log.contains("Successfully added public key")),
            "Callback should process successfully"
        );

        // Verify key is still stored after successful callback
        let has_key: bool = view!(
            contract.has_public_key(test_user.account_id())
        ).unwrap_json();
        assert!(has_key, "Key should remain stored after successful callback");
    }
}
