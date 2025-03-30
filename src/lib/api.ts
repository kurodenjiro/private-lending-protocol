import { connect, keyStores, KeyPair, Contract } from 'near-api-js';
import { BN } from 'bn.js';
import bs58 from 'bs58';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';
import { getAccount } from '@/config';
import { getAssetId, toDecimals } from '@/utils';
import { MAX_GAS, SOLVER_BUS_URL, ASSET_MAP } from '@/utils/constants';
dotenv.config();

const TYPED_ASSET_MAP: AssetMap = ASSET_MAP;

const signQuote = async (quote: any) => {
    const quoteData = Buffer.from(quote, 'utf-8');
    const account = await getAccount();
    // @ts-ignore
    const keyPair = await account.connection.signer.keyStore.getKey(
        account.connection.networkId,
        account.accountId
    );
    
    const signature = keyPair.sign(quoteData);
    const signatureBase58 = 'ed25519:' + bs58.encode(signature.signature);
    const publicKeyBase58 = 'ed25519:' + bs58.encode(keyPair.getPublicKey().data);
    
    return {
        standard: "raw_ed25519",
        payload: quote,
        signature: signatureBase58,
        public_key: publicKeyBase58,
    };
}

const createTokenDiffQuote = async (tokenIn: string, amountIn: string, tokenOut: string, amountOut: string) => {
    const tokenInFmt = getAssetId(tokenIn);
    const tokenOutFmt = getAssetId(tokenOut);
    const nonce = crypto.randomBytes(32).toString('base64');
    
    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const deadlineStr = deadline.toISOString();

    const account = await getAccount();

    const quote = JSON.stringify({
        signer_id: account.accountId,
        nonce,
        verifying_contract: "intents.near",
        deadline: deadlineStr,
        intents: [
            {
                intent: 'token_diff',
                diff: {
                    [tokenInFmt]: "-" + amountIn,
                    [tokenOutFmt]: amountOut
                },
                referral: "near-intents.intents-referral.near"
            }
        ]
    });
    
    return signQuote(quote);
}

const registerIntentPublicKey = async () => {
    const account = await getAccount();
    // @ts-ignore
    const keyPair = await account.connection.signer.keyStore.getKey(
        account.connection.networkId,
        account.accountId
    );
    
    await account.functionCall({
        contractId: "intents.near",
        methodName: 'add_public_key',
        args: {
            public_key: 'ed25519:' + bs58.encode(keyPair.getPublicKey().data),
        },
        gas: BigInt(MAX_GAS),
        attachedDeposit: BigInt(1), // exactly 1 yoctoNEAR (10^-24 NEAR)
    });
}

interface AssetInfo {
    token_id: string;
    omft?: string;
    decimals: number;
}

interface AssetMap {
    [key: string]: AssetInfo;
}

interface Asset {
    asset: string;
    amount: string | null;
}

interface SerializedMessage {
    defuse_asset_identifier_in: string;
    defuse_asset_identifier_out: string;
    exact_amount_in?: string | null;
    exact_amount_out?: string | null;
    min_deadline_ms: number;
}

class IntentRequest {
    private request: any | null;
    private thread: any | null;
    private min_deadline_ms: number;
    private asset_in: Asset | null;
    private asset_out: Asset | null;

    constructor(request: any | null = null, thread: any | null = null, minDeadlineMs: number = 60000) {
        this.request = request;
        this.thread = thread;
        this.min_deadline_ms = minDeadlineMs;
        this.asset_in = null;
        this.asset_out = null;
    }

    setAssetIn(assetName: string, amount: string) {
        this.asset_in = {
            asset: getAssetId(assetName),
            amount: toDecimals(amount, TYPED_ASSET_MAP[assetName].decimals)
        };
        return this;
    }

    setAssetOut(assetName: string, amount: string | null = null) {
        this.asset_out = {
            asset: getAssetId(assetName),
            amount: amount ? toDecimals(amount, TYPED_ASSET_MAP[assetName].decimals) : null
        };
        return this;
    }

    serialize() {
        if (!this.asset_in || !this.asset_out) {
            throw new Error('Asset in and out must be set before serializing');
        }

        const message: SerializedMessage = {
            defuse_asset_identifier_in: this.asset_in.asset,
            defuse_asset_identifier_out: this.asset_out.asset,
            exact_amount_in: this.asset_in.amount,
            exact_amount_out: this.asset_out.amount,
            min_deadline_ms: this.min_deadline_ms,
        };

        if (this.asset_in.amount === null) message.exact_amount_in = null;
        if (this.asset_out.amount === null) message.exact_amount_out = null;

        return message;
    }
}

const fetchOptions = async (request: IntentRequest) => {
    const rpcRequest = {
        "id": "dontcare",
        "jsonrpc": "2.0",
        "method": "quote",
        "params": [
            request.serialize()
        ]
    };

    console.log(rpcRequest)
    const response = await axios.post(SOLVER_BUS_URL, rpcRequest);
    // The API returns quotes array in the result
    // console.log(response.data)
    return response.data.result || [];
}

const publishIntent = async (signedIntent: any) => {
    const rpcRequest = {
        "id": "dontcare",
        "jsonrpc": "2.0",
        "method": "publish_intent",
        "params": [signedIntent]
    };

    const response = await axios.post(SOLVER_BUS_URL, rpcRequest);
    return response.data;
}

interface SwapOption {
    amount_out: string;
    quote_hash: string;
}

interface SwapSuccessResponse {
    status: 'OK';
    intent_hash: string;
    amount_out: string;
}

interface SwapFailureResponse {
    status: 'FAILED';
    error: string;
}

type SwapResponse = SwapSuccessResponse | SwapFailureResponse;

const selectBestOption = (options: SwapOption[]) => {
    return options.reduce((best: SwapOption | null, current: SwapOption) => {
        // For exact_amount_in, we want the highest amount_out
        const currentAmount = BigInt(current.amount_out);
        const bestAmount = best ? BigInt(best.amount_out) : BigInt(0);
        
        if (!best || currentAmount > bestAmount) {
            return current;
        }
        return best;
    }, null);
}

const intentSwap = async (tokenIn: string, amountIn: string, tokenOut: string): Promise<SwapResponse> => {
    console.log('Swapping:', {tokenIn, amountIn, tokenOut});
    // Create and send the swap request
    const request = new IntentRequest();
    request.setAssetIn(tokenIn, amountIn);
    request.setAssetOut(tokenOut);
    
    const options = await fetchOptions(request);
    
    if (!options || options.length === 0) {
        console.log('No options available for swap');
        return {
            status: 'FAILED',
            error: 'No options available for swap',
        };
    }
    
    const bestOption = selectBestOption(options);
    console.log('Best option:', bestOption);
    
    if (!bestOption) {
        console.log('No valid options found');
        return {
            status: 'FAILED',
            error: 'No valid options found',
        };
    }

    // Create and sign the quote
    const amountInDecimals = toDecimals(amountIn, TYPED_ASSET_MAP[tokenIn].decimals);
    const quote = await createTokenDiffQuote(tokenIn, amountInDecimals, tokenOut, bestOption.amount_out);
    console.log('Quote:', quote);
    const signedIntent = {
        signed_data: quote,
        quote_hashes: [bestOption.quote_hash]
    };

    // Publish the intent
    const publishResult = await publishIntent(signedIntent);
    console.log('Publish result:', publishResult);

    if (publishResult.result?.status === 'OK') {
        return {
            status: 'OK',
            intent_hash: publishResult.result.intent_hash,
            amount_out: bestOption.amount_out,
        };
    }
    return {
        status: 'FAILED',
        error: publishResult.result?.status || 'Unknown error',
    };
}

const registerTokenStorage = async (token: string, otherAccount: string | null = null) => {
    const account = await getAccount();
    const accountId = otherAccount || account.accountId;
    // const contract = new Contract(account, ASSET_MAP[token].token_id, {
    //     changeMethods: ['near_deposit', 'ft_transfer_call'],
    // });
    console.log(`Register ${accountId} for ${token} storage`);
    
    // For NEAR token, we need to use near_deposit with attached deposit
    if (token === 'NEAR') {
        await account.functionCall({
            contractId: TYPED_ASSET_MAP[token].token_id,
            methodName: 'near_deposit',
            args: {},
            gas: BigInt(MAX_GAS),
            attachedDeposit: BigInt(1000000000000000000000000) // 1 NEAR
        });
    }
}

const intentDeposit = async (token: string, amount: string) => {
    const account = await getAccount();
    await registerTokenStorage(token, "intents.near");
    
    const contract = new Contract(
        account, 
        TYPED_ASSET_MAP[token].token_id,
        {
            changeMethods: ['ft_transfer_call'],
            viewMethods: [],
            useLocalViewExecution: false
        }
    );
    
    console.log('Transferring to intents.near:', {
        receiver_id: "intents.near",
        amount: toDecimals(amount, TYPED_ASSET_MAP[token].decimals),
        msg: "",
    });

    // @ts-ignore
    await contract.ft_transfer_call({
        args: {
            receiver_id: "intents.near",
            amount: toDecimals(amount, TYPED_ASSET_MAP[token].decimals),
            msg: "",
        },
        gas: MAX_GAS,
        amount: '1',
    });
}

interface WithdrawIntent {
    intent: string;
    token: string;
    receiver_id: string;
    amount: string;
    memo?: string;
}

interface WithdrawQuote {
    signer_id: string;
    nonce: string;
    verifying_contract: string;
    deadline: string;
    intents: WithdrawIntent[];
}

const intentWithdraw = async (destinationAddress: string, token: string, amount: string) => {
    const nonce = crypto.randomBytes(32).toString('base64');

    const deadline = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const deadlineStr = deadline.toISOString();

    const account = await getAccount();

    const quote: WithdrawQuote = {
        signer_id: account.accountId,
        nonce,
        verifying_contract: "intents.near",
        deadline: deadlineStr,
        intents: [
            {
                intent: "ft_withdraw",
                token: TYPED_ASSET_MAP[token].token_id,
                receiver_id: destinationAddress,
                amount: amount
            }
        ]
    };

    quote.intents[0].token = TYPED_ASSET_MAP[token].omft || '';
    quote.intents[0].receiver_id = TYPED_ASSET_MAP[token].omft || '';
    quote.intents[0].memo = `WITHDRAW_TO:${destinationAddress}`;

    const signedQuote = await signQuote(JSON.stringify(quote));
    const signedIntent = {
        signed_data: signedQuote,
        quote_hashes: []
    };
    return await publishIntent(signedIntent);
}

const setScore = async (account_id: string, score: number) => {
    const account = await getAccount();
    await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'set_credit_score',
        args: { account_id, score }
    });
}

const getLoanStatus = async (account_id: string) => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'get_loan_status',
        args: { account_id }
    });
}

const getPoolBalance = async () => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'get_pool_balance',
        args: {}
    });
}

const getLenderBalance = async (account_id: string) => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'get_lender_balance',
        args: { account_id }
    });
}

const viewLoan = async (account_id: string) => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'view_loan',
        args: { account_id }
    });
}

const getStakingRewards = async (account_id: string) => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'get_staking_rewards',
        args: {account_id}
    });
}

const setLoanStatus = async (account_id: string, status: string) => {
    const account = await getAccount();
    return await account.functionCall({
        contractId: process.env.NEXT_PUBLIC_SMART_CONTRACT || "",
        methodName: 'set_loan_status',
        args: { account_id, status }
    });
}

export {
    intentSwap,
    intentWithdraw,
    intentDeposit,
    setScore,
    getLoanStatus,
    getPoolBalance,
    getLenderBalance,
    viewLoan,
    getStakingRewards,
    setLoanStatus,
    registerIntentPublicKey,
}