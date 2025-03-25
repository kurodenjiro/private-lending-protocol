use near_sdk::{env, near_bindgen, AccountId, NearToken, BorshStorageKey, Promise};
use near_sdk::collections::{UnorderedMap, Vector};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Serialize, Deserialize};
use schemars::JsonSchema;

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    IsVerifiedUser,
    Loans,
    CreditScore,
    RepaymentHistory,
    LenderBalances,
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

    pub fn get_loan_status(&self, account_id: AccountId) -> String {
        match self.loans.get(&account_id) {
            Some(loan) => {
                if loan.amount == NearToken::from_yoctonear(0) {
                    "Repaid".to_string()
                } else {
                    "Active".to_string()
                }
            },
            None => "No Loan".to_string(),
        }
    }

    pub fn view_loan(&self, account_id: AccountId) -> Option<(Loan, String)> {
        match self.loans.get(&account_id) {
            Some(loan) => {
                let status = if env::block_timestamp_ms() > loan.due_timestamp {
                    "Overdue"
                } else {
                    "On Time"
                };
                Some((loan, status.to_string()))
            },
            None => None,
        }
    }

    pub fn estimate_repayment(&self, account_id: AccountId) -> Option<NearToken> {
        let loan = self.loans.get(&account_id)?;
        let duration_days = (env::block_timestamp_ms() - loan.start_timestamp) as f64 / (1000.0 * 60.0 * 60.0 * 24.0);
        let rate = loan.interest_rate as f64 / 10000.0;
        let interest = (loan.amount.as_yoctonear() as f64 * rate * duration_days / 365.0).round() as u128;
        Some(NearToken::from_yoctonear(loan.amount.as_yoctonear() + interest))
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

    pub fn withdraw(&mut self, amount: NearToken) {
        let sender = env::predecessor_account_id();
        let current = self.lender_balances.get(&sender).unwrap_or(NearToken::from_yoctonear(0));
        assert!(amount > NearToken::from_yoctonear(0) && amount <= current, "Invalid withdraw amount");
        assert!(amount <= self.fund_pool, "Insufficient pool liquidity");

        self.fund_pool = self.fund_pool.saturating_sub(amount);
        self.lender_balances.insert(&sender, &current.saturating_sub(amount));
        Promise::new(sender.clone()).transfer(amount);

        env::log_str(&format!("{} withdrew {} yoctoNEAR. Pool remaining: {}", 
            sender, amount.as_yoctonear(), self.fund_pool.as_yoctonear()));
    }

    pub fn create_loan(&mut self, account_id: AccountId, amount: NearToken, interest_rate: u64) {
        assert!(self.is_verified_user.get(&account_id).unwrap_or(false), "Not verified");
        assert!(self.loans.get(&account_id).is_none(), "Loan already exists");

        let max = NearToken::from_near(100); // Temporary fixed max amount
        assert!(amount <= max, "Exceeds max allowed");
        assert!(amount <= self.fund_pool, "Insufficient liquidity in the pool");

        self.fund_pool = self.fund_pool.saturating_sub(amount);

        let loan = Loan {
            due_timestamp: env::block_timestamp_ms() + 30 * 24 * 60 * 60 * 1000, // 30 days
            amount,
            interest_rate,
            start_timestamp: env::block_timestamp_ms(),
        };

        self.loans.insert(&account_id, &loan);
        Promise::new(account_id.clone()).transfer(amount);
        env::log_str(&format!("Loan created and funded for {}: {} yoctoNEAR at {}bps. Pool remaining: {}", 
            account_id, amount.as_yoctonear(), interest_rate, self.fund_pool.as_yoctonear()));
    }

    pub fn repay(&mut self, account_id: AccountId, amount: NearToken) {
        let mut loan = self.loans.get(&account_id).expect("No active loan");
        assert!(amount <= loan.amount, "Repayment exceeds loan amount");

        let now = env::block_timestamp_ms();
        let mut penalty = NearToken::from_yoctonear(0);
        if now > loan.due_timestamp {
            let overdue_days = ((now - loan.due_timestamp) / (1000 * 60 * 60 * 24)) as u128;
            penalty = NearToken::from_yoctonear((loan.amount.as_yoctonear() * overdue_days * 5 / 1000) as u128); // 0.5% per overdue day
            assert!(amount >= penalty, "Amount does not cover penalty");
            self.fund_pool = self.fund_pool.saturating_add(penalty);
        }

        loan.amount = loan.amount.saturating_sub(amount.saturating_sub(penalty));
        if loan.amount > NearToken::from_yoctonear(0) {
            self.loans.insert(&account_id, &loan);
        } else {
            self.loans.remove(&account_id);
        }

        let mut history = self.repayment_history.get(&account_id).unwrap_or_else(|| {
            Vector::new(StorageKey::RepaymentHistory)
        });

        let record = RepaymentRecord {
            timestamp: env::block_timestamp_ms(),
            amount,
        };
        history.push(&record);
        self.repayment_history.insert(&account_id, &history);

        self.fund_pool = self.fund_pool.saturating_add(amount);
        env::log_str(&format!("{} repaid {}. Remaining: {}. Pool balance: {}", 
            account_id, amount.as_yoctonear(), loan.amount.as_yoctonear(), self.fund_pool.as_yoctonear()));
    }

    pub fn verify_user(&mut self, account_id: AccountId, verified: bool) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only the owner can verify users"
        );
        self.is_verified_user.insert(&account_id, &verified);
        env::log_str(&format!("User {} verification status set to {}", account_id, verified));
    }
}