'use client';

import { useEffect, useState } from 'react';
import { useWalletSelector } from "@/components/Providers";
import { CallMethod } from '@/lib/near-method';
import toast from 'react-hot-toast';
import { toDecimals } from '@/utils';

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
  

  const fetchLoanInfo = async () => {
    const res = await fetch('/api/view-loan', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId
      })
    })

    const data = await res.json();
    if (data.status === 'success') {
      setLoanInfo(data.loan[0]);
    }else{
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
    if (accountId) {
      fetchLoanInfo();
    }
  }, [accountId]);


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
    } else {
      toast.error('Failed to create loan. Please try again.');
      toast.dismiss(loadingToast);
      setIsLoading(false);
    }
  }

  const handleBorrow = async () => {
    try {
      setIsLoading(true);
      const loadingToast = toast.loading('Creating loan...');

      if (!amount) {
        toast.error('Please enter an amount');
        return;
      }

      if (!accountId) {
        toast.error('Please connect your wallet first');
        return;
      }

      
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

  return (
    <div className="container mx-auto px-4 pt-24">  
      <h1 className="text-3xl font-bold mb-8">Borrow</h1>    
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 border border-gray-300">
      
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Amount Near Tokens
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full p-2 border rounded-lg bg-white"
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Zcash Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter address to receive loan"
            className="w-full p-2 border rounded-lg bg-white"
          />
        </div>

        <button
          onClick={handleBorrow}
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer disabled:bg-gray-400"
        >
          {isLoading ? 'Borrowing...' : 'Borrow'}
        </button>

        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Borrowing Stats</h3>
          {loanInfo ? (
            <div className="space-y-2">
              <p className="text-sm">Start Date: {loanInfo?.start_timestamp ? new Date(loanInfo.start_timestamp).toLocaleDateString() : 'N/A'}</p>
              <p className="text-sm">Due Date: {loanInfo?.due_timestamp ? new Date(loanInfo.due_timestamp).toLocaleDateString() : 'N/A'}</p>
              <p className="text-sm">Loan Status: {loanInfo?.loan_status}</p>
              <p className="text-sm">Your Borrowed: ≈ {((Number(loanInfo?.amount) / 10 ** 24) * NEAR_TO_ZCASH_RATE).toFixed(8)} ZCASH</p>
            </div>
          ):(
            <p className="text-sm">No loan found</p>
          )}
        </div>
      </div>
    </div>
  );
} 