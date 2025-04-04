'use client';

import { useEffect, useState } from 'react';
import { useWalletSelector } from "@/components/Providers";
import { CallMethod } from '@/lib/near-method';
import toast from 'react-hot-toast';
import { toDecimals } from '@/utils';
import { useSearchParams } from 'next/navigation';
import dotenv from 'dotenv';
import { registerIntentPublicKey } from '@/lib/api';
import Link from 'next/link';
dotenv.config();

// Conversion rate: 1 NEAR = 0.0736045 ZCASH
const NEAR_TO_ZCASH_RATE = 0.0736045 / 1; // Rate per 1 NEAR

const ZCASH_TO_NEAR_RATE = 1 / 0.0736045; // Rate per 1 ZCASH

interface LoanInfo {
  due_timestamp: number;
  amount: string;
  interest_rate: number;
  start_timestamp: number;
  loan_status: string;
}

type TokenType = 'BTC' | 'ZCASH' | 'NEAR';

interface TokenInfo {
  address?: string;
  warning: string;
  minDeposit: string;
  shortAddress?: string;
}

const TOKEN_INFO: Record<TokenType, TokenInfo> = {
  BTC: {
    address: '1DH1XC1RsNuqtaXbMz1QTLTyuibNJSKnoh',
    shortAddress: '1DH1X...Knoh',
    warning: 'Only deposit BTC from the Bitcoin network. Depositing other assets or using a different network will result in loss of funds.',
    minDeposit: '0.0001 BTC'
  },
  ZCASH: {
    address: 't1f4xLrcfFdHRDtetGdsy171QvwW1kmM53F',
    shortAddress: 't1f4x...M53F',
    warning: 'Only deposit ZEC from the Zcash network. Depositing other assets or using a different network will result in loss of funds.',
    minDeposit: '0.0001 ZCASH'
  },
  NEAR: {
    warning: 'Deposit NEAR using your connected wallet.',
    minDeposit: '0.1 NEAR'
  }
};

export default function BorrowPage() {
  const [amount, setAmount] = useState('');
  const [amountRepay, setAmountRepay] = useState('');
  const [address, setAddress] = useState('');
  const { selector, accountId } = useWalletSelector();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFetch, setIsLoadingFetch] = useState(false);
  const [loanInfo, setLoanInfo] = useState<LoanInfo | null>(null);
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [creditScore, setCreditScore] = useState<number | null>(null);
  const [loanableAmount, setLoanableAmount] = useState<number | null>(null);
  const [intentHash, setIntentHash] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenType>('NEAR');
  const [expectedAmount, setExpectedAmount] = useState<string>('');
  const [amountBorrow, setAmountBorrow] = useState<string>('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
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
      const shownTransactions = localStorage.getItem('shown_transactions');
      const transactionType = localStorage.getItem('transaction_type');
      const shownArray = shownTransactions ? JSON.parse(shownTransactions) : [];
      
      if (!shownArray.includes(transactionHashes)) {
        if(transactionType == "borrow") {
          toast.success('Loan created successfully!');
        } else if(transactionType == "repay") {
          toast.success('Repayment successfully!');
        }else{
          toast.success('Transaction successfully!');
        }
        // Add this transaction to shown list
        shownArray.push(transactionHashes);
        localStorage.setItem('shown_transactions', JSON.stringify(shownArray));
      }
    }
  }, [searchParams]);

  const expectedAmountToken = async (token_in: string, token_out: string, amount: string) => {
    setIsLoadingQuote(true);
    const res = await fetch('/api/quote', {
      method: 'POST',
      body: JSON.stringify({ token_in, token_out, amount })
    })
    const data = await res.json();
    if(data.status === 'success') {
      setIsLoadingQuote(false);
      const amount_out = data?.quote?.amount_out || 0;
      return (Number(amount_out)/10**24).toFixed(3);
    }else{
      setIsLoadingQuote(false);
      return 0;
    }
  }


  const fetchLoanInfo = async () => {
    setIsLoadingFetch(true);
    const res = await fetch('/api/view-loan', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId
      })
    })

    const data = await res.json();
    // console.log(data);
    if (data.status === 'success') {
      if(data.loan === null) {
        setIsLoadingFetch(false);
        setLoanInfo({
          due_timestamp: 0,
          amount: '0',
          interest_rate: 0,
          start_timestamp: 0,
          loan_status: 'No loan found'
        });
        return;
      }
      setLoanInfo(data.loan[0]);
      setIsLoadingFetch(false);
    } else {
      setIsLoadingFetch(false);
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

  // console.log(loanInfo);

  const createLoan = async () => {
    setIsLoading(true);
    const loadingToast = toast.loading('Transferring loan...');
    const res = await fetch('/api/swap', {
      method: 'POST',
      body: JSON.stringify({
        address: address,
        amount: (Number(loanInfo?.amount)/10**24).toFixed(3),
        account_id: accountId,
        token_in: 'NEAR',
        token_out: 'ZCASH',
        swap_type: 'borrow'
      })
    })

    const data = await res.json();
    // console.log(data);

    if (data.status === 'success') {
      toast.success('Withdrawal successfully!');
      localStorage.setItem('intentHash', data.intentHash);
      toast.dismiss(loadingToast);
      setIsLoading(false);
      fetchLoanInfo();
    } else {
      toast.error('Failed to withdraw loan. Please try again.');
      toast.dismiss(loadingToast);
      setIsLoading(false);
    }
  }

  const swapToken = async (token_in: string, token_out: string, amount: string) => {
    const res = await fetch('/api/swap', {
      method: 'POST',
      body: JSON.stringify(
        { 
          token_in, 
          token_out,
          amount,
          account_id: accountId,
          swap_type: 'swap',
          address: accountId
        })
    })
    const data = await res.json();
    console.log(data);
    if(data.status === 'success') {
      return data?.swap?.original_amount;
    }else{
      return 0;
    }
  }

  const handleBorrow = async () => {
    const loadingToast = toast.loading('Creating loan...');
    try {
      // Validate amount
      if (!amount) {
        toast.error('Please enter an amount');
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        toast.error('Please enter a valid number');
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      if (amountNum <= 0) {
        toast.error('Amount must be greater than 0');
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      if (loanableAmount !== null && amountNum > loanableAmount) {
        toast.error(`Maximum amount allowed is ${loanableAmount} NEAR`);
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      if (!accountId) {
        toast.error('Please connect your wallet first');
        toast.dismiss(loadingToast);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      localStorage.setItem('transaction_type', 'borrow');
      const result = await CallMethod({
        accountId,
        selector,
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || '',
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
      setIsLoading(false);
      setAmount('');
      setAddress('');
      fetchLoanInfo();
      console.log('Loan creation result:', result);
    } catch (error) {
      console.error('Error creating loan:', error);
      toast.error('Failed to create loan. Please try again.');
      toast.dismiss(loadingToast);
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

      let amountRepaySwap = 0;

      if(selectedToken !== 'NEAR') {
        amountRepaySwap = await swapToken(selectedToken, 'NEAR', amountRepay);
        console.log(amountRepaySwap);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const amountRepayNum = 
      selectedToken == 'NEAR' ?
      Number((Number(loanInfo?.amount)/10**24).toFixed(3)) == Number(amountRepay) 
      ? loanInfo?.amount 
      : toDecimals(amountRepay, 24)
      : amountRepaySwap >= Number(loanInfo?.amount)
      ? loanInfo?.amount
      : amountRepaySwap;

      console.log(amountRepayNum);

      localStorage.setItem('transaction_type', 'repay');
      const result = await CallMethod({
        accountId,
        selector,
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || '',
        method: 'repay',
        args: {
          account_id: accountId,
        },
        options: {
          gas: '100000000000000',  // 100 TGas
          attached_deposit: amountRepayNum.toString()
        }
      });

      if (result) {
        toast.success('Loan repaid successfully!');
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

  // console.log(amountRepay);

  const handleChangeAmount = async (amount: string) => {
    setAmountRepay(amount);
    if(selectedToken == 'NEAR') {
      setExpectedAmount(amount);
    }else{
      const expectedAmount = await expectedAmountToken(selectedToken, 'NEAR', amount);
      console.log(expectedAmount);
      setExpectedAmount(expectedAmount.toString());
    }
  }
  
  const handleChangeToken = (token: TokenType) => {
    setSelectedToken(token);
    setExpectedAmount('');
    setAmountRepay('');
  }

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard!');
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
                  <p className="text-sm">You can borrow up to: <span className="font-bold">{loanableAmount} NEAR ≈ {(Number(loanableAmount)*NEAR_TO_ZCASH_RATE).toFixed(8)} ZCASH</span></p>
                ) : (
                  <p className="text-sm">Calculating your loanable amount...</p>
                )}
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Amount Near to Lend
                </label>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">0.5 NEAR</span>
                    <span className="text-sm font-medium">{amount || '0.5'} NEAR</span>
                    <span className="text-sm text-gray-600">{loanableAmount || 100} NEAR</span>
                  </div>
                  <input
                    type="range"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="0.5"
                    max={loanableAmount || 100}
                    step="0.5"
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="text-xs text-gray-500 text-right">
                    ≈ {((Number(amount || 0.5) * NEAR_TO_ZCASH_RATE)).toFixed(8)} ZCASH
                  </div>
                </div>
              </div>

              {/* Borrow Button */}
              <button
                onClick={handleBorrow}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
              >
                {isLoading ? 'Processing...' : 'Create Loan'}
              </button>
            </div>

            {/* Loan Information Card */}
            <div className="w-full md:w-[450px] bg-white rounded-lg shadow-md p-6 border border-gray-300 mt-6 md:mt-0 md:ml-6">
              <h2 className="text-xl font-semibold mb-6">Loan Information</h2>
              
              {!isLoadingFetch ? (
                loanInfo?.loan_status != "No loan found" ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-100 rounded-lg space-y-2">
                      <p className="text-sm">Start Date: {loanInfo?.start_timestamp ? new Date(loanInfo.start_timestamp).toLocaleDateString() : 'N/A'}</p>
                      <p className="text-sm">Due Date: {loanInfo?.due_timestamp ? new Date(loanInfo.due_timestamp).toLocaleDateString() : 'N/A'}</p>
                      <p className="text-sm">Loan Status: <span className="font-medium">{loanInfo?.loan_status == "Pending" ? "Ready to Withdraw" : "Borrowed"}</span></p>
                      <p className="text-sm">Amount Borrowed: <span className="font-medium">≈ {((Number(loanInfo?.amount) / 10 ** 24) * NEAR_TO_ZCASH_RATE).toFixed(8)} ZCASH</span></p>
                    </div>

                    {/* Repay Button - Only show if there's an active loan */}
                    {loanInfo?.loan_status === 'Pending' && (
                      <div>
                        {/* Zcash Address Input */}
                        <div className="mb-6">
                          <label className="block text-gray-700 text-sm font-bold mb-2">
                            Zcash Address
                          </label>
                          <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Enter Zcash address"
                            className="w-full p-2 border rounded-lg bg-white"
                          />
                        </div>
                        <button
                          onClick={()=>createLoan()}
                          disabled={isLoading}
                          className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
                        >
                          {isLoading ? 'Processing...' : 'Withdraw Loan'}
                        </button>
                      </div>
                    )}
                    {loanInfo?.loan_status === 'Borrowed' && (
                      <div>
                        <div className="mb-6">
                          <label className="block text-gray-700 text-sm font-bold mb-2">
                            Select Token
                          </label>
                          <select
                            value={selectedToken}
                            onChange={(e) => handleChangeToken(e.target.value as TokenType)}
                            className="w-full p-2 border rounded-lg bg-white border-gray-300 mb-4"
                          >
                            <option value="BTC">BTC</option>
                            <option value="ZCASH">ZCASH</option>
                            <option value="NEAR">NEAR</option>
                          </select>

                          {selectedToken !== 'NEAR' && TOKEN_INFO[selectedToken].address && (
                            <div className="mb-4">
                              <h3 className="text-lg font-semibold mb-2">Use this deposit address</h3>
                              <p className="text-sm text-gray-600 mb-2">
                                Always double-check your deposit address — it may change without notice.
                              </p>
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <span className="font-mono">{TOKEN_INFO[selectedToken].shortAddress}</span>
                                <button
                                  onClick={() => handleCopyAddress(TOKEN_INFO[selectedToken].address!)}
                                  className="p-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors cursor-pointer"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                  </svg>
                                </button>
                              </div>
                              <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                <p className="text-orange-700 text-sm">{TOKEN_INFO[selectedToken].warning}</p>
                              </div>
                            </div>
                          )}
                          <label className="block text-gray-700 text-sm font-bold mb-2">
                            Amount {selectedToken} to Repay
                          </label>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">0.001 {selectedToken}</span>
                              <span className="text-sm font-medium">{amountRepay || '0.001'} {selectedToken}</span>
                              <span className="text-sm text-gray-600">{selectedToken === 'NEAR' ? (Number(loanInfo?.amount) / 10 ** 24).toFixed(3) : ((Number(loanInfo?.amount) / 10 ** 24) * NEAR_TO_ZCASH_RATE).toFixed(8)} {selectedToken}</span>
                            </div>
                            <input
                              type="range"
                              value={amountRepay}
                              onChange={(e) => {
                                handleChangeAmount(e.target.value);
                              }}
                              min="0.001"
                              max={selectedToken === 'NEAR' ? (Number(loanInfo?.amount) / 10 ** 24) : ((Number(loanInfo?.amount) / 10 ** 24) * NEAR_TO_ZCASH_RATE)}
                              step="0.001"
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="text-xs text-gray-500 text-right">
                              {isLoadingQuote ? (
                                <span>Loading...</span>
                              ) : (
                                <span>≈ {selectedToken === 'NEAR' ? (Number(amountRepay)*NEAR_TO_ZCASH_RATE).toFixed(8) : expectedAmount} {selectedToken === 'NEAR' ? 'ZCASH' : 'NEAR'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={handleRepay}
                          disabled={isLoading}
                          className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
                        >
                          {isLoading ? 'Processing...' : 'Repay Loan'}
                        </button>
                      </div>
                    )}

                  </div>
                ):(
                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="text-sm text-gray-600">No active loans found</p>
                  </div>
                )
              ) : (
                <div className="p-4 bg-gray-100 rounded-lg">
                  <p className="text-sm text-gray-600">Fetching loan information...</p>
                </div>
              )}
              {intentHash && (
                <div className="p-4 bg-gray-100 rounded-lg mt-6">
                  <Link target="_blank" href={`https://nearblocks.io/en/transactions/${intentHash}`} className="text-sm text-gray-600">Hash: {intentHash?.slice(0, 5)+"..."+intentHash?.slice(-5)}</Link>
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