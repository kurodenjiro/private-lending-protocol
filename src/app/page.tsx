'use client';

import { useEffect, useState } from 'react';
import { useWalletSelector } from "@/components/Providers";
import { CallMethod } from '@/lib/near-method';
import toast from 'react-hot-toast';
import { toDecimals } from '@/utils';
import { useSearchParams } from 'next/navigation';

// Conversion rate: 1 NEAR = 0.0776045 ZCASH
const NEAR_TO_ZCASH_RATE = 0.0776045 / 1; // Rate per 1 NEAR

interface LoanInfo {
  due_timestamp: number;
  amount: string;
  interest_rate: number;
  start_timestamp: number;
  loan_status: string;
}

export default function BorrowPage() {
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const { selector, accountId } = useWalletSelector();
  const [isLoading, setIsLoading] = useState(false);
  const [loanInfo, setLoanInfo] = useState<LoanInfo | null>(null);
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [creditScore, setCreditScore] = useState<number | null>(null);
  const [loanableAmount, setLoanableAmount] = useState<number | null>(null);
  const searchParams = useSearchParams();

  const calculateLoanableAmount = (creditScore: number): number => {
    if (creditScore >= 0 && creditScore <= 300) {
      return 10; // Max 10 NEAR for low credit score
    } else if (creditScore >= 301 && creditScore <= 600) {
      return 50; // Max 50 NEAR for medium credit score
    } else if (creditScore >= 601 && creditScore <= 850) {
      return 100; // Max 100 NEAR for high credit score
    }
    return 0; // Invalid credit score
  };

  const fetchCreditScore = async () => {
    try {
      const res = await fetch(`/api/credit-score?accountId=${accountId}`);

      if (!res.ok) {
        throw new Error('Failed to fetch credit score');
      }

      const data = await res.json();
      if (data.status === 'success') {
        setCreditScore(data.data.CreditScore);

        // Calculate loanable amount based on credit score
        const maxLoanable = calculateLoanableAmount(data.data.CreditScore);
        setLoanableAmount(maxLoanable);
      } else {
        setCreditScore(null);
        setLoanableAmount(null);
        toast.error('Failed to fetch credit score');
      }
    } catch (error) {
      console.error('Error fetching credit score:', error);
      toast.error('An error occurred while fetching the credit score');
    }
  };

  useEffect(() => {
    const checkWalletConnection = async () => {
      try {
        const isConnected = await selector.isSignedIn(); // Check if the wallet is connected
        setIsWalletConnected(isConnected);

        if (!isConnected) {
          toast.error('Wallet is not connected. Please connect your wallet.');
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error);
        toast.error('Failed to check wallet connection.');
      }
    };

    checkWalletConnection();
  }, []);

  useEffect(() => {
    const transactionHashes = searchParams.get('transactionHashes');
    if (transactionHashes) {
      // Check if we've already shown toast for this transaction
      const shownTransactions = localStorage.getItem('shown_loan_transactions');
      const shownArray = shownTransactions ? JSON.parse(shownTransactions) : [];
      
      if (!shownArray.includes(transactionHashes)) {
        toast.success('Repayment successfully!');
        // Add this transaction to shown list
        shownArray.push(transactionHashes);
        localStorage.setItem('shown_loan_transactions', JSON.stringify(shownArray));
      }
    }
  }, [searchParams]);

  const fetchLoanInfo = async () => {
    const res = await fetch('/api/view-loan', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId
      })
    })

    const data = await res.json();
    console.log(data);
    if (data.status === 'success') {
      if(data.loan === null) {
        return;
      }
      setLoanInfo(data.loan[0]);
    } else {
      setLoanInfo({
        due_timestamp: 0,
        amount: '0',
        interest_rate: 0,
        start_timestamp: 0,
        loan_status: 'No loan found'
      });
    }
  }

  useEffect(() => {
    if (accountId && isWalletConnected) {
      fetchLoanInfo();
      fetchCreditScore();
    }
  }, [accountId, isWalletConnected]);

  const createLoan = async () => {
    const loadingToast = toast.loading('Transferring loan...');
    const res = await fetch('/api/swap', {
      method: 'POST',
      body: JSON.stringify({
        receiver_address: address,
        amount: amount,
        account_id: accountId
      })
    })

    const data = await res.json();
    console.log(data);
    if (data.status === 'success') {
      toast.success('Loan created successfully!');
      toast.dismiss(loadingToast);
      setAmount('');
      setAddress('');
      setIsLoading(false);
      fetchLoanInfo();
    } else {
      toast.error('Failed to create loan. Please try again.');
      toast.dismiss(loadingToast);
      setIsLoading(false);
    }
  }

  const handleBorrow = async () => {
    try {
      // Validate amount
      if (!amount) {
        toast.error('Please enter an amount');
        return;
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        toast.error('Please enter a valid number');
        return;
      }

      if (amountNum <= 0) {
        toast.error('Amount must be greater than 0');
        return;
      }

      if (loanableAmount !== null && amountNum > loanableAmount) {
        toast.error(`Maximum amount allowed is ${loanableAmount} NEAR`);
        return;
      }

      // Validate address
      if (!address) {
        toast.error('Please enter a Zcash address');
        return;
      }

      if (!accountId) {
        toast.error('Please connect your wallet first');
        return;
      }

      setIsLoading(true);
      const loadingToast = toast.loading('Creating loan...');
      localStorage.setItem('loan_amount', amount);
      const result = await CallMethod({
        accountId,
        selector,
        contractId: 'citadelonchain.near',
        method: 'create_loan',
        args: {
          account_id: accountId,
          amount: toDecimals(amount, 24)
        },
        options: {
          gas: '30000000000000',
          deposit: '0'
        }
      });
      toast.dismiss(loadingToast);
      if (result) {
        createLoan();
      }

      console.log('Loan creation result:', result);
    } catch (error) {
      console.error('Error creating loan:', error);
      toast.error('Failed to create loan. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRepay = async () => {
    try {
      if (!accountId) {
        toast.error('Please connect your wallet first');
        return;
      }

      setIsLoading(true);
      const loadingToast = toast.loading('Processing repayment...');

      // Get loan info first
      if (!loanInfo) {
        toast.error('No active loan found');
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      const result = await CallMethod({
        accountId,
        selector,
        contractId: 'citadelonchain.near',
        method: 'repay',
        args: {
          account_id: accountId,
        },
        options: {
          gas: '100000000000000',  // 100 TGas
          attached_deposit: loanInfo?.amount
        }
      });

      if (result) {
        toast.success('Loan repaid successfully!');
        localStorage.removeItem('loan_amount');
        toast.dismiss(loadingToast);
        fetchLoanInfo(); // Refresh loan info
      }

      toast.dismiss(loadingToast);
      setIsLoading(false);
    } catch (error) {
      console.error('Error repaying loan:', error);
      toast.error('Failed to repay loan. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24">
        <h1 className="text-3xl font-bold mb-8">Borrow</h1>

        {isWalletConnected ? (
          <div className="flex flex-col md:flex-row justify-center items-start">
            
            {/* Borrow Form Card */}
            <div className="w-full md:w-[450px] bg-white rounded-lg shadow-md p-6 border border-gray-300">
              <h2 className="text-xl font-semibold mb-6">Create New Loan</h2>
              
              {/* Credit Score Section */}
              <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Credit Score</h3>
                {creditScore !== null ? (
                  <p className="text-sm">Your Credit Score: <span className="font-bold">{creditScore}</span></p>
                ) : (
                  <p className="text-sm">Fetching your credit score...</p>
                )}
              </div>

              {/* Loanable Amount Section */}
              <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Loanable Amount</h3>
                {loanableAmount !== null ? (
                  <p className="text-sm">You can borrow up to: <span className="font-bold">{loanableAmount} NEAR</span></p>
                ) : (
                  <p className="text-sm">Calculating your loanable amount...</p>
                )}
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Amount Near to Lend
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= (loanableAmount || 100))) {
                      setAmount(value);
                    }
                  }}
                  min="0"
                  max={loanableAmount || 100}
                  step="0.000001"
                  placeholder={`0.0 (max ${loanableAmount || 100} NEAR)`}
                  className="w-full p-2 border rounded-lg bg-white"
                />
              </div>

              {/* Zcash Address Input */}
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Zcash Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter Zcash address (t1... or t3...)"
                  pattern="^[t][1|3][a-zA-Z0-9]{33}$"
                  className="w-full p-2 border rounded-lg bg-white"
                />
              </div>

              {/* Borrow Button */}
              <button
                onClick={handleBorrow}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
              >
                {isLoading ? 'Processing...' : 'Borrow'}
              </button>
            </div>

            {/* Loan Information Card */}
            <div className="w-full md:w-[450px] bg-white rounded-lg shadow-md p-6 border border-gray-300 mt-6 md:mt-0 md:ml-6">
              <h2 className="text-xl font-semibold mb-6">Loan Information</h2>
              
              {loanInfo ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-100 rounded-lg space-y-2">
                    <p className="text-sm">Start Date: {loanInfo?.start_timestamp ? new Date(loanInfo.start_timestamp).toLocaleDateString() : 'N/A'}</p>
                    <p className="text-sm">Due Date: {loanInfo?.due_timestamp ? new Date(loanInfo.due_timestamp).toLocaleDateString() : 'N/A'}</p>
                    <p className="text-sm">Loan Status: <span className="font-medium">{loanInfo?.loan_status}</span></p>
                    <p className="text-sm">Amount Borrowed: <span className="font-medium">≈ {((Number(loanInfo?.amount) / 10 ** 24) * NEAR_TO_ZCASH_RATE).toFixed(8)} ZCASH</span></p>
                  </div>

                  {/* Repay Button - Only show if there's an active loan */}
                  {loanInfo?.loan_status === 'Borrowed' && (
                    <button
                      onClick={handleRepay}
                      disabled={isLoading}
                      className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
                    >
                      {isLoading ? 'Processing...' : 'Repay Loan'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gray-100 rounded-lg">
                  <p className="text-sm text-gray-600">No active loans found</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 border border-gray-300">
            <div className="mb-6 text-center">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Please connect your wallet
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}