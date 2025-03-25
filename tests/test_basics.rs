use near_sdk::NearToken;
use serde_json::json;
use serde_json::Value;

#[tokio::test]
async fn test_contract_operations() -> Result<(), Box<dyn std::error::Error>> {
    let contract_wasm = near_workspaces::compile_project("./").await?;
    test_basics_on(&contract_wasm).await?;
    Ok(())
}

async fn test_basics_on(contract_wasm: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    let sandbox = near_workspaces::sandbox().await?;
    
    // Deploy contract
    let contract = sandbox.dev_deploy(contract_wasm).await?;
    
    // Initialize contract with owner
    let outcome = contract
        .call("new")
        .args_json(json!({
            "owner": contract.id()
        }))
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Create test accounts
    let lender = sandbox.dev_create_account().await?;
    let borrower = sandbox.dev_create_account().await?;

    // Test deposit
    let deposit_amount = NearToken::from_near(10);
    let outcome = lender
        .call(contract.id(), "deposit")
        .deposit(deposit_amount)
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Verify deposit
    let lender_balance = contract
        .view("get_staking_rewards")
        .args_json(json!({
            "account_id": lender.id()
        }))
        .await?
        .json::<String>()?;
    assert!(lender_balance.parse::<u128>()? > 0);

    // Test loan creation (first verify the borrower)
    let outcome = contract
        .call("verify_user")
        .args_json(json!({
            "account_id": borrower.id(),
            "verified": true
        }))
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Create loan
    let loan_amount = NearToken::from_near(5);
    let outcome = contract
        .call("create_loan")
        .args_json(json!({
            "account_id": borrower.id(),
            "amount": loan_amount.to_string(),
            "interest_rate": 1000 // 10% in basis points
        }))
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Verify loan status
    let loan_status = contract
        .view("get_loan_status")
        .args_json(json!({
            "account_id": borrower.id()
        }))
        .await?
        .json::<String>()?;
    assert_eq!(loan_status, "Active");

    // Test loan repayment
    let repayment_amount = NearToken::from_near(1);
    let outcome = borrower
        .call(contract.id(), "repay")
        .args_json(json!({
            "account_id": borrower.id(),
            "amount": repayment_amount.to_string()
        }))
        .deposit(repayment_amount)
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Test withdrawal
    let withdraw_amount = NearToken::from_near(1);
    let outcome = lender
        .call(contract.id(), "withdraw")
        .args_json(json!({
            "amount": withdraw_amount.to_string()
        }))
        .transact()
        .await?;
    assert!(outcome.is_success());

    // Test view functions
    let loan_details = contract
        .view("view_loan")
        .args_json(json!({
            "account_id": borrower.id()
        }))
        .await?;
    
    let loan_result = loan_details.json::<Option<(Value, String)>>()?;
    assert!(loan_result.is_some());
    let (loan, status) = loan_result.unwrap();
    assert!(loan.get("amount").is_some());
    assert!(loan.get("interest_rate").is_some());
    assert_eq!(status, "Active");

    let estimated_repayment = contract
        .view("estimate_repayment")
        .args_json(json!({
            "account_id": borrower.id()
        }))
        .await?;
    let repayment = estimated_repayment.json::<Option<String>>()?;
    assert!(repayment.is_some());

    Ok(())
}

#[tokio::test]
async fn test_error_conditions() -> Result<(), Box<dyn std::error::Error>> {
    let contract_wasm = near_workspaces::compile_project("./").await?;
    let sandbox = near_workspaces::sandbox().await?;
    let contract = sandbox.dev_deploy(&contract_wasm).await?;

    // Initialize contract
    let outcome = contract
        .call("new")
        .args_json(json!({
            "owner": contract.id()
        }))
        .transact()
        .await?;
    assert!(outcome.is_success());

    let user = sandbox.dev_create_account().await?;

    // Test deposit with zero amount
    let outcome = user
        .call(contract.id(), "deposit")
        .deposit(NearToken::from_near(0))
        .transact()
        .await;
    assert!(outcome.is_err());

    // Test withdrawal without deposit
    let outcome = user
        .call(contract.id(), "withdraw")
        .args_json(json!({
            "amount": NearToken::from_near(1).to_string()
        }))
        .transact()
        .await;
    assert!(outcome.is_err());

    // Test loan creation without verification
    let outcome = contract
        .call("create_loan")
        .args_json(json!({
            "account_id": user.id(),
            "amount": NearToken::from_near(1).to_string(),
            "interest_rate": 1000
        }))
        .transact()
        .await;
    assert!(outcome.is_err());

    // Test repayment without active loan
    let outcome = user
        .call(contract.id(), "repay")
        .args_json(json!({
            "account_id": user.id(),
            "amount": NearToken::from_near(1).to_string()
        }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await;
    assert!(outcome.is_err());

    Ok(())
}


