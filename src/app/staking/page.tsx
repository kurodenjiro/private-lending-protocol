'use client';

import { CallMethod } from '@/lib/near-method';
import { useWalletSelector } from '@/components/Providers';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import dotenv from 'dotenv';
dotenv.config();

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

export default function StakePage() {
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenType>('NEAR');
  const searchParams = useSearchParams();
  const [stakingStats, setStakingStats] = useState({
    poolBalance: 0,
    yourStaked: 0,
    rewardsEarned: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFetch, setIsLoadingFetch] = useState(false);
  const { selector, accountId } = useWalletSelector();
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [expectedAmount, setExpectedAmount] = useState('');

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

  const swapToken = async (token_in: string, token_out: string) => {
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
    if(data.status === 'success') {
      console.log(data);
    }
  }

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

      if(selectedToken !== 'NEAR') {
        await swapToken(selectedToken, 'NEAR');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      const result = await CallMethod({
        accountId,
        selector,
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || '',
        method: 'deposit',
        args: { },
        options: {
          gas: '30000000000000',
          deposit: selectedToken === 'NEAR' ? amount : expectedAmount
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
  
  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard!');
  };

  const handleChangeAmount = async (amount: string) => {
    setAmount(amount);
    if(selectedToken == 'NEAR') {
      setExpectedAmount(amount);
    }else{
      const expectedAmount = await expectedAmountToken(selectedToken, 'NEAR', amount);
      // console.log(expectedAmount);
      setExpectedAmount(expectedAmount.toString());
    }
  }
  
  const handleChangeToken = (token: TokenType) => {
    setSelectedToken(token);
    setAmount('');
    setExpectedAmount('');
  }

  return (
    <div className="container mx-auto px-4 pt-24">
      <h1 className="text-3xl font-bold mb-8">Staking</h1>
      
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 border border-gray-300">
        
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
            Amount
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => handleChangeAmount(e.target.value)}
            placeholder={`0.0 ${selectedToken}`}
            className="w-full p-2 border rounded-lg bg-white border-gray-300"
          />
          <div className="flex justify-between">
            <p className="text-xs text-gray-600 mt-1">
              Minimum deposit: {TOKEN_INFO[selectedToken].minDeposit}
            </p>
            {selectedToken !== 'NEAR' && (
              isLoadingQuote ? (
                <p className="text-xs text-gray-600 mt-1">
                  Loading...
                </p>
              ) : (
                <p className="text-xs text-gray-600 mt-1">
                  {amount||1} {selectedToken} ≈ {expectedAmount||'-'} NEAR
                </p>
              )
            )}
          </div>
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