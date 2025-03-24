# 🛠️ Decentralized Lending Protocol on NEAR

A private lending smart contract written in Rust for the NEAR blockchain. This contract enables a decentralized lending and staking system with credit scoring, due dates, penalties, and rewards for stakers.

---

## ✨ Features

### ✅ Lending Mechanics
- Borrowers can request loans based on credit scores
- Loans are funded from a shared staking pool
- Funds are transferred to the borrower upon approval
- Due date tracking with penalties for late repayment

### ✅ Staking Pool for Lenders
- Users can stake NEAR using `deposit()`
- Withdraw at any time via `withdraw()`
- Share in fund pool growth from interest + penalties

### ✅ Credit Scoring System
- Admin can assign credit scores with `manually_set_credit_score`
- Score determines borrowing limits
- Basic behavioral scoring system can be expanded

### ✅ Repayment Tracking
- Full history stored on-chain with timestamps
- Estimate total repayment via `estimate_repayment`
- View status (`Active`, `Repaid`, `Overdue`) with `get_loan_status`

### ✅ Rewards for Lenders
- Interest and penalties increase the pool
- `get_staking_rewards(account_id)` estimates your share
- `claim_staking_rewards()` transfers your cut

---

## 📦 Setup Instructions

### ✅ Prerequisites
- [Rust + cargo](https://www.rust-lang.org/tools/install)
- [near-cli](https://github.com/near/near-cli)
- NEAR testnet wallet and account

### 🔨 Build Contract
```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

### 🚀 Deploy Contract
```bash
near deploy --accountId <your-account>.testnet --wasmFile target/wasm32-unknown-unknown/release/<contract_name>.wasm
```

### 🔁 Initialize Contract
```bash
near call <your-account>.testnet new '{"owner": "<your-account>.testnet"}' --accountId <your-account>.testnet
```

---

## 🔍 Useful Commands

### 💸 Lender deposits into pool
```bash
near call <contract> deposit '{}' --accountId lender.testnet --amount 10
```

### 🤝 Set borrower's credit score
```bash
near call <contract> manually_set_credit_score '{"account_id": "alice.testnet", "score": 780}' --accountId owner.testnet
```

### 📥 Borrower creates loan
```bash
near call <contract> create_loan '{"account_id": "alice.testnet", "amount": "5000000000000000000000000", "interest_rate": 500}' --accountId alice.testnet
```

### 💵 Repay a loan
```bash
near call <contract> repay '{"account_id": "alice.testnet", "amount": "5000000000000000000000000"}' --accountId alice.testnet --amount 5
```

### 🎁 Claim staking rewards
```bash
near call <contract> claim_staking_rewards '{}' --accountId lender.testnet
```

---

## 🧠 Developer Notes
- You can customize credit scoring by integrating off-chain verifiers
- Extend `Loan` to include categories, collateral, or NFT backing
- Use logs/events for off-chain indexers and dashboards

---

## 📜 License
MIT License. Use at your own risk. Contributions welcome!

