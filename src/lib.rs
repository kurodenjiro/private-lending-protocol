use near_sdk::{env, near_bindgen, AccountId, NearToken, BorshStorageKey, Promise, Gas};
use near_sdk::collections::{UnorderedMap, Vector};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Serialize, Deserialize};
use schemars::JsonSchema;
use near_sdk::serde_json::json;

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    IsVerifiedUser,
    Loans,
    CreditScore,
    RepaymentHistory,
    LenderBalances,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, JsonSchema, Clone, PartialEq, Debug, Copy)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum LoanStatus {
    Pending,
    Borrowed,
    NoLoan
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, JsonSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Loan {
    pub due_timestamp: u64,
    #[schemars(with = "String")]
    pub amount: NearToken,
    pub interest_rate: u64,
    pub start_timestamp: u64,
    pub loan_status: LoanStatus,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, JsonSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct RepaymentRecord {
    pub timestamp: u64,
    #[schemars(with = "String")]
    pub amount: NearToken,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub struct CreditScoreProofs {
    pub lender_balances: UnorderedMap<AccountId, NearToken>,
    pub fund_pool: NearToken,
    pub is_verified_user: UnorderedMap<AccountId, bool>,
    pub loans: UnorderedMap<AccountId, Loan>,
    pub score_threshold: UnorderedMap<AccountId, u64>,
    pub repayment_history: UnorderedMap<AccountId, Vector<RepaymentRecord>>,
    pub owner: AccountId,
}

impl Default for CreditScoreProofs {
    fn default() -> Self {
        panic!("Contract must be initialized with an owner")
    }
}

#[near_bindgen]
impl CreditScoreProofs {
    pub fn claim_staking_rewards(&mut self) {
        let sender = env::predecessor_account_id();
        let rewards = self.get_staking_rewards(sender.clone());
        assert!(rewards > NearToken::from_yoctonear(0), "No rewards available");

        self.fund_pool = self.fund_pool.saturating_sub(rewards);
        Promise::new(sender.clone()).transfer(rewards);

        env::log_str(&format!("{} claimed {} yoctoNEAR in rewards", sender, rewards.as_yoctonear()));
    }

    pub fn get_staking_rewards(&self, account_id: AccountId) -> NearToken {
        let user_stake = self.lender_balances.get(&account_id).unwrap_or(NearToken::from_yoctonear(0));
        if self.fund_pool == NearToken::from_yoctonear(0) || user_stake == NearToken::from_yoctonear(0) {
            return NearToken::from_yoctonear(0);
        }
        let total_staked = self.lender_balances.iter().fold(NearToken::from_yoctonear(0), |acc, (_, amount)| acc.saturating_add(amount));
        let user_share = user_stake.as_yoctonear() as f64 / total_staked.as_yoctonear() as f64;
        let rewards = (self.fund_pool.as_yoctonear() as f64 * user_share).round() as u128;
        NearToken::from_yoctonear(rewards)
    }

    pub fn get_loan_status(&self, account_id: AccountId) -> LoanStatus {
        match self.loans.get(&account_id) {
            Some(loan) => loan.loan_status,
            None => LoanStatus::NoLoan,
        }
    }

    pub fn view_loan(&self, account_id: AccountId) -> Option<(Loan, String)> {
        match self.loans.get(&account_id) {
            Some(loan) => {
                let status = if env::block_timestamp_ms() > loan.due_timestamp {
                    "Overdue"
                } else {
                    match loan.loan_status {
                        LoanStatus::Pending => "Pending",
                        LoanStatus::Borrowed => "Borrowed",
                        LoanStatus::NoLoan => "No Loan",
                    }
                };
                Some((loan, status.to_string()))
            },
            None => None,
        }
    }

    pub fn estimate_repayment(&self, account_id: AccountId) -> Option<u128> {
        let loan = self.loans.get(&account_id)?;
        let duration_days = (env::block_timestamp_ms() - loan.start_timestamp) as f64 / (1000.0 * 60.0 * 60.0 * 24.0);
        let rate = loan.interest_rate as f64 / 10000.0;
        let interest = (loan.amount.as_yoctonear() as f64 * rate * duration_days / 365.0).round() as u128;
        Some(loan.amount.as_yoctonear() + interest)
    }

    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            lender_balances: UnorderedMap::new(StorageKey::LenderBalances),
            fund_pool: NearToken::from_yoctonear(0),
            is_verified_user: UnorderedMap::new(StorageKey::IsVerifiedUser),
            loans: UnorderedMap::new(StorageKey::Loans),
            score_threshold: UnorderedMap::new(StorageKey::CreditScore),
            repayment_history: UnorderedMap::new(StorageKey::RepaymentHistory),
            owner,
        }
    }

    pub fn set_credit_score(&mut self, account_id: AccountId, score: u64) {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only owner can set credit scores");
        self.is_verified_user.insert(&account_id, &true);
        self.score_threshold.insert(&account_id, &score);
        env::log_str(&format!("Credit score for {} set to {}", account_id, score));
    }

    #[payable]
    pub fn deposit(&mut self) {
        let amount = env::attached_deposit();
        let sender = env::predecessor_account_id();
        assert!(amount > NearToken::from_yoctonear(0), "Must attach some NEAR to deposit");

        self.fund_pool = self.fund_pool.saturating_add(amount);
        let current = self.lender_balances.get(&sender).unwrap_or(NearToken::from_yoctonear(0));
        self.lender_balances.insert(&sender, &current.saturating_add(amount));

        env::log_str(&format!("{} deposited {} yoctoNEAR into the pool. New balance: {}", 
            sender, amount.as_yoctonear(), self.fund_pool.as_yoctonear()));
    }

    #[payable]
    pub fn create_loan(&mut self, account_id: AccountId, amount: NearToken) {
        assert!(self.is_verified_user.get(&account_id).unwrap_or(false), "Not verified");
        assert!(self.loans.get(&account_id).is_none(), "Loan already exists");

        let max_amount = NearToken::from_near(100); // Temporary fixed max amount
        assert!(amount <= max_amount, "Exceeds max allowed");
        assert!(amount <= self.fund_pool, "Insufficient liquidity in the pool");

        // Transfer loan amount from pool to borrower
        self.fund_pool = self.fund_pool.saturating_sub(amount);

        let loan = Loan {
            due_timestamp: env::block_timestamp_ms() + 30 * 24 * 60 * 60 * 1000, // 30 days
            amount,
            interest_rate: 1000, // 10% in basis points
            start_timestamp: env::block_timestamp_ms(),
            loan_status: LoanStatus::Pending,
        };

        self.loans.insert(&account_id, &loan);

        env::log_str(&format!(
            "Loan created and transferred to {}: {} yoctoNEAR. Pool remaining: {}", 
            account_id, amount.as_yoctonear(), self.fund_pool.as_yoctonear()
        ));
    }

    pub fn set_loan_status(&mut self, account_id: AccountId, status: LoanStatus) {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only owner can update loan status");
        let mut loan = self.loans.get(&account_id).expect("No borrowed loan found");
        assert!(loan.loan_status == LoanStatus::Pending, "Can only update status from Pending state");

        loan.loan_status = status;
        self.loans.insert(&account_id, &loan);

        env::log_str(&format!(
            "Loan status updated for account {}: {:?}", 
            account_id, status
        ));
    }

    #[payable]
    pub fn repay(&mut self, account_id: AccountId) {
        let loan = self.loans.get(&account_id).expect("No borrowed loan");
        let repayment_amount = env::attached_deposit();
        assert!(repayment_amount <= loan.amount, "Repayment exceeds loan amount");

        let now = env::block_timestamp_ms();
        
        // Handle penalty if overdue
        if now > loan.due_timestamp {
            let overdue_days = ((now - loan.due_timestamp) / (1000 * 60 * 60 * 24)) as u128;
            let penalty = loan.amount.as_yoctonear() * overdue_days * 5 / 1000; // 0.5% per overdue day
            assert!(repayment_amount.as_yoctonear() >= penalty, "Amount does not cover penalty");
            self.fund_pool = self.fund_pool.saturating_add(NearToken::from_yoctonear(penalty));
        }

        let remaining_amount = loan.amount.saturating_sub(repayment_amount);
        
        if remaining_amount == NearToken::from_yoctonear(0) {
            self.loans.remove(&account_id);
        } else {
            let updated_loan = Loan {
                amount: remaining_amount,
                ..loan
            };
            self.loans.insert(&account_id, &updated_loan);
        }

        // Record repayment history
        let mut history = self.repayment_history.get(&account_id).unwrap_or_else(|| {
            Vector::new(StorageKey::RepaymentHistory)
        });

        let record = RepaymentRecord {
            timestamp: env::block_timestamp_ms(),
            amount: repayment_amount,
        };
        history.push(&record);
        self.repayment_history.insert(&account_id, &history);

        // Add repayment to pool
        self.fund_pool = self.fund_pool.saturating_add(repayment_amount);

        env::log_str(&format!(
            "{} repaid {} yoctoNEAR. Remaining: {}. Pool balance: {}", 
            account_id, repayment_amount.as_yoctonear(), remaining_amount.as_yoctonear(), self.fund_pool.as_yoctonear()
        ));
    }

    pub fn get_pool_balance(&self) -> NearToken {
        self.fund_pool
    }

    pub fn get_lender_balance(&self, account_id: AccountId) -> NearToken {
        self.lender_balances.get(&account_id).unwrap_or(NearToken::from_yoctonear(0))
    }

}
