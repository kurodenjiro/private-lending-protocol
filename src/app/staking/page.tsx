'use client';

import { CallMethod } from '@/lib/near-method';
import { useWalletSelector } from '@/components/Providers';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

export default function StakePage() {
  const [amount, setAmount] = useState('');
  const searchParams = useSearchParams();

  const { selector, accountId } = useWalletSelector();

  useEffect(() => {
    const transactionHashes = searchParams.get('transactionHashes');
    if (transactionHashes) {
      // Check if we've already shown toast for this transaction
      const shownTransactions = localStorage.getItem('shown_stake_transactions');
      const shownArray = shownTransactions ? JSON.parse(shownTransactions) : [];
      
      if (!shownArray.includes(transactionHashes)) {
        toast.success('Staking successfully!');
        // Add this transaction to shown list
        shownArray.push(transactionHashes);
        localStorage.setItem('shown_stake_transactions', JSON.stringify(shownArray));
      }
    }
  }, [searchParams]);

  const handleStake = async () => {
    const loadingToast = toast.loading('Staking...');
    try {
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
        method: 'deposit',
        args: { },
        options: {
          gas: '30000000000000',
          deposit: amount
        }
      });
      toast.dismiss(loadingToast);

      console.log('Staking result:', result);
    } catch (error) {
      console.error('Error staking:', error);
      toast.error('Failed to stake. Please try again.');
    }
  };

  return (
    <div className="container mx-auto px-4 pt-24">
      <h1 className="text-3xl font-bold mb-8">Staking</h1>
      
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 border border-gray-300">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Select Token
          </label>
          <input
            type="text"
            value="NEAR"
            disabled={true}
            className="w-full p-2 border rounded-lg bg-white border-gray-300"
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Amount
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="w-full p-2 border rounded-lg bg-white border-gray-300"
          />
        </div>
        <button
          onClick={handleStake}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Stake
        </button>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Staking Stats</h3>
          <div className="space-y-2">
            <p className="text-sm">APY: 10%</p>
            <p className="text-sm">Total Staked: $2.5M</p>
            <p className="text-sm">Your Staked: 0 NEAR</p>
            <p className="text-sm">Rewards Earned: 0 NEAR</p>
          </div>
        </div>
      </div>
    </div>
  );
} 