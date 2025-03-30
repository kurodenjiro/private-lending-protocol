'use client';

import { CallMethod } from '@/lib/near-method';
import { useWalletSelector } from '@/components/Providers';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import dotenv from 'dotenv';
dotenv.config();

export default function StakePage() {
  const [amount, setAmount] = useState('');
  const searchParams = useSearchParams();
  const [stakingStats, setStakingStats] = useState({
    poolBalance: 0,
    yourStaked: 0,
    rewardsEarned: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFetch, setIsLoadingFetch] = useState(false);
  const { selector, accountId } = useWalletSelector();
  
  useEffect(() => {
    const transactionHashes = searchParams.get('transactionHashes');
    if (transactionHashes) {
      // Check if we've already shown toast for this transaction
      const shownTransactions = localStorage.getItem('shown_stake_transactions');
      const shownArray = shownTransactions ? JSON.parse(shownTransactions) : [];
      const transactionType = localStorage.getItem('transaction_type');
      if (!shownArray.includes(transactionHashes)) {
        if(transactionType == "stake") {
          toast.success('Staking successfully!');
        }else if(transactionType == "claim") {
          toast.success('Claiming rewards successfully!');
        }else{
          toast.success('Transaction successfully!');
        }
        // Add this transaction to shown list
        shownArray.push(transactionHashes);
        localStorage.setItem('shown_stake_transactions', JSON.stringify(shownArray));
      }
    }
  }, [searchParams]);

  const fetchStakingStats =  async () => {
    setIsLoadingFetch(true);
    const response = await fetch('/api/pool-balance');
    const res = await response.json();
    const lenderBalance = await fetch('/api/lender-balance', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId })
    });
    const lenderBalanceRes = await lenderBalance.json();
    const stakingRewards = await fetch('/api/get-staking-reward', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId })
    });
    const stakingRewardsRes = await stakingRewards.json();
    if(res.status === 'success' && lenderBalanceRes.status === 'success' && stakingRewardsRes.status === 'success') {
      setStakingStats({
        poolBalance: Number((Number(res?.poolBalance)/10**24).toFixed(3)),
        yourStaked: Number((Number(lenderBalanceRes?.balance)/10**24).toFixed(3)),
        rewardsEarned: Number((Number(stakingRewardsRes?.balance)/10**24).toFixed(3))
      });
    }else{
      toast.error('Failed to fetch staking stats');
    }
    setIsLoadingFetch(false);
  }

  useEffect(() => {
    fetchStakingStats();
  }, []);

  const handleStake = async () => {
    setIsLoading(true);
    const loadingToast = toast.loading('Staking...');
    localStorage.setItem('transaction_type', "stake");
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
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || '',
        method: 'deposit',
        args: { },
        options: {
          gas: '30000000000000',
          deposit: amount
        }
      });
      toast.dismiss(loadingToast);

      console.log('Staking result:', result);
      setIsLoading(false);
    } catch (error) {
      console.error('Error staking:', error);
      setIsLoading(false);
      toast.error('Failed to stake. Please try again.');
    }
    setIsLoading(false);
  };


  const handleClaimRewards = async () => {
    setIsLoading(true);
    const loadingToast = toast.loading('Claiming rewards...');
    localStorage.setItem('transaction_type', "claim");
    if(!accountId) {
      toast.error('Please connect your wallet first');
      return;
    }
    try {
      const result = await CallMethod({
        accountId,
        selector,
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || '',
        method: 'claim_staking_rewards',
        args: { },
        options: {
          gas: '30000000000000'
        }
      });
      toast.dismiss(loadingToast);
      console.log('Claiming rewards result:', result);
      fetchStakingStats();
      setIsLoading(false);
    } catch (error) {
      console.error('Error claiming rewards:', error);
      setIsLoading(false);
      toast.error('Failed to claim rewards. Please try again.');
    }
    setIsLoading(false);
  };
  

  return (
    <div className="container mx-auto px-4 pt-24">
      <h1 className="text-3xl font-bold mb-8">Staking</h1>
      
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 border border-gray-300">
  
        
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
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 cursor-pointer"
        >
          {isLoading ? 'Staking...' : 'Stake'}
        </button>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Staking Stats</h3>
          {
            isLoadingFetch ? (
              <div className="space-y-2">
                <p className="text-sm">Fetching staking stats...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">APY: 10%</p>
                <p className="text-sm">Total Staked: {stakingStats?.poolBalance} NEAR</p>
                <p className="text-sm">Your Staked: {stakingStats?.yourStaked} NEAR</p>
                <p className="text-sm">Rewards Earned: {stakingStats?.rewardsEarned} NEAR</p>
              </div>
            )
          }
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Claim Staking Rewards</h3>
          <button
            onClick={handleClaimRewards}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 cursor-pointer"
          >
            {isLoading ? 'Claiming...' : 'Claim'}
          </button>
        </div>

      </div>
    </div>
  );
} 