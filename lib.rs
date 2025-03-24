use near_sdk::{env, near_bindgen, AccountId, Balance, BorshStorageKey, Promise};
use sha2::{Digest, Sha256};
use near_sdk::collections::{UnorderedMap, Vector};
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshStorageKey, BorshSerialize)]
pub enum StorageKey {
    IsVerifiedUser,
    Loans,
    CreditScore,
    RepaymentHistory,
    LenderBalances,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Loan {
    pub due_timestamp: u64,
    pub amount: Balance,
    pub interest_rate: u64,
    pub start_timestamp: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct RepaymentRecord {
    pub timestamp: u64,
    pub amount: Balance,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct CreditScoreProofs {
    pub lender_balances: UnorderedMap<AccountId, Balance>,
    pub fund_pool: Balance,
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
        assert!(rewards > 0, "No rewards available");

        self.fund_pool -= rewards;
        Promise::new(sender.clone()).transfer(rewards);

        env::log_str(&format!("{} claimed {} yoctoNEAR in rewards", sender, rewards));
    }
    pub fn get_staking_rewards(&self, account_id: AccountId) -> Balance {
        let user_stake = self.lender_balances.get(&account_id).unwrap_or(0);
        if self.fund_pool == 0 || user_stake == 0 {
            return 0;
        }
        let total_staked: Balance = self.lender_balances.iter().map(|(_, b)| b).sum();
        let user_share = user_stake as f64 / total_staked as f64;
        let rewards = (self.fund_pool as f64 * user_share).round() as Balance;
        rewards
    }
    pub fn get_loan_status(&self, account_id: AccountId) -> String {
        match self.loans.get(&account_id) {
            Some(loan) => {
                if loan.amount == 0 {
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
        self.loans.get(&account_id)
    }

    pub fn estimate_repayment(&self, account_id: AccountId) -> Option<Balance> {
        let loan = self.loans.get(&account_id)?;
        let duration_days = (env::block_timestamp_ms() - loan.start_timestamp) as f64 / (1000.0 * 60.0 * 60.0 * 24.0);
        let rate = loan.interest_rate as f64 / 10000.0;
        let interest = (loan.amount as f64 * rate * duration_days / 365.0).round() as Balance;
        Some(loan.amount + interest)
    }
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            lender_balances: UnorderedMap::new(StorageKey::LenderBalances),
            fund_pool: 0,
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
        assert!(amount > 0, "Must attach some NEAR to deposit");

        // Only principal (after penalty) goes back to the pool
        self.fund_pool += amount - penalty;
        let current = self.lender_balances.get(&sender).unwrap_or(0);
        self.lender_balances.insert(&sender, &(current + amount));

        env::log_str(&format!("{} deposited {} yoctoNEAR into the pool. New balance: {}", sender, amount, self.fund_pool));
    }

    pub fn withdraw(&mut self, amount: Balance) {
        let sender = env::predecessor_account_id();
        let current = self.lender_balances.get(&sender).unwrap_or(0);
        assert!(amount > 0 && amount <= current, "Invalid withdraw amount");
        assert!(amount <= self.fund_pool, "Insufficient pool liquidity");

        self.fund_pool -= amount;
        self.lender_balances.insert(&sender, &(current - amount));
        Promise::new(sender.clone()).transfer(amount);

        env::log_str(&format!("{} withdrew {} yoctoNEAR. Pool remaining: {}", sender, amount, self.fund_pool));
    }

        pub fn create_loan(&mut self, account_id: AccountId, amount: Balance, interest_rate: u64) {
        assert!(self.is_verified_user.get(&account_id).unwrap_or(false), "Not verified");
        assert!(self.loans.get(&account_id).is_none(), "Loan already exists");

        let max = self.get_max_allowed(account_id.clone()).unwrap_or(0);
        assert!(amount <= max, "Exceeds max allowed");
        assert!(amount <= self.fund_pool, "Insufficient liquidity in the pool");

        self.fund_pool -= amount;

        let loan = Loan {
            due_timestamp: env::block_timestamp_ms() + 30 * 24 * 60 * 60 * 1000, // 30 days
            interest_rate,
            start_timestamp: env::block_timestamp_ms(),
        };

        self.loans.insert(&account_id, &loan);
        Promise::new(account_id.clone()).transfer(amount);
        env::log_str(&format!("Loan created and funded for {}: {} yoctoNEAR at {}bps. Pool remaining: {}", account_id, amount, interest_rate, self.fund_pool));
    }

    pub fn repay(&mut self, account_id: AccountId, amount: Balance) {
        let mut loan = self.loans.get(&account_id).expect("No active loan");
        assert!(amount <= loan.amount, "Repayment exceeds loan amount");

        let now = env::block_timestamp_ms();
        let mut penalty = 0;
        if now > loan.due_timestamp {
            let overdue_days = ((now - loan.due_timestamp) / (1000 * 60 * 60 * 24)) as u64;
            penalty = loan.amount * overdue_days * 5 / 1000; // 0.5% per overdue day
            assert!(amount >= penalty, "Amount does not cover penalty");
            self.fund_pool += penalty;
        }

        loan.amount = loan.amount.saturating_sub(amount - penalty);
        if loan.amount > 0 {
            self.loans.insert(&account_id, &loan);
        } else {
            self.loans.remove(&account_id);
        }

        let mut history = self.repayment_history.get(&account_id).unwrap_or_else(|| {
            Vector::new(StorageKey::RepaymentHistory.try_to_vec().unwrap())
        });

        let record = RepaymentRecord {
            timestamp: env::block_timestamp_ms(),
            amount,
        };
        history.push(&record);
        self.repayment_history.insert(&account_id, &history);

        self.fund_pool += amount;
        env::log_str(&format!("{} repaid {}. Remaining: {}. Pool balance: {}", account_id, amount, loan.amount, self.fund_pool));
    }
}
