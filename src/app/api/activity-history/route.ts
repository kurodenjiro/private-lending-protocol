import { NextResponse } from 'next/server';
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"


async function contract_type(prompt: string) {
    const { text } = await generateText({
        model: openai("o3-mini"),
        system: `You are a smart contract analysis agent. Your task is to analyze and present the results from user input data.
    
    IMPORTANT: 
    1. Return ONLY the JSON string without any additional explanations or text.
    2. If the data is incomplete, null, or undefined, return null values.
    3. Contract types must be precisely identified based on the contract's actual functionality:
       - Can have one or more types from: DeFi, DAO, Identity, NFT, Token, Marketplace, Gaming, Social, Bridge, Oracle, Payment, Vault, LiquidityStaking, ValidatorStaking
       - Each type must be clearly evidenced by specific functions and features
       - Do not assign types unless there is clear evidence in the contract code
    4. Contract Analysis:
       - The contract_type array must be determined by analyzing the contract data from the agent
       - Use the contract schema and functions to identify the contract type
       - Do not assign types without evidence in the contract code
       - Multiple types can be assigned if the contract has multiple functionalities
    
    Return ONLY the following JSON format:
    {
        "description": "Detailed description of the contract's purpose and functionality",
        "contract_type": ["type contract 1", "type contract 2" , "type contract 3"]  // Must be based on contract analysis
    }
    
    Contract Type Definitions and Evidence Requirements:
    - DeFi: Must have clear evidence of financial operations (lending, borrowing, trading, yield generation)
    - DAO: Must have governance mechanisms, proposal management, and voting functionality
    - Identity: Must have user profile management, identity verification, or reputation systems
    - NFT: Must implement non-fungible token standards and unique asset management
    - Token: Must implement fungible token standards and token operations
    - Marketplace: Must have trading, auction, or asset exchange functionality
    - Gaming: Must have game mechanics, player interactions, or reward systems
    - Social: Must have social features, content sharing, or community management
    - Bridge: Must have cross-chain transfer or interoperability functionality
    - Oracle: Must have external data feed integration or price feed functionality
    - Payment: Must have payment processing, subscription, or recurring payment functionality
    - Vault: Must have asset management, deposit/withdraw functionality, and yield generation features
    - Staking: Must have liquidity pool management, staking rewards, and LP token functionality
    
    Example Analysis 1:
    If the contract data contains:
    {
        "contract": {
            "methodNames": [
                "get_proposals", "get_proposal", "add_proposal", "edit_proposal",
                "create_community", "get_community", "get_community_metadata",
                "get_account_community_permissions", "set_social_db_profile_description"
            ]
        }
    }
    Then the contract_type should be ["DAO", "Social", "Identity"] because:
    - DAO: Has proposal management functions (get_proposals, add_proposal, edit_proposal)
    - Social: Has community management functions (create_community, get_community)
    - Identity: Has profile and permission management (get_account_community_permissions, set_social_db_profile_description)
    
    Example Analysis 2:
    If the contract data contains:
    {
        "contract": {
            "methodNames": [
                "storage_deposit", "storage_withdraw", "storage_unregister",
                "get_accounts", "get_account", "get_account_count",
                "get_node_count", "get_nodes", "get_node",
                "get_shared_storage_pool", "shared_storage_pool_deposit",
                "share_storage", "get_account_storage"
            ]
        }
    }
    Then the contract_type should be ["Oracle", "Social", "Identity"] because:
    - Oracle: Has node management and data storage functions (get_nodes, get_node, storage_deposit, storage_withdraw)
    - Social: Has account management and storage sharing functions (get_accounts, share_storage, get_account_storage)
    - Identity: Has account verification and management functions (get_account, get_account_count, storage_deposit, storage_withdraw)
    
    Example Analysis 3:
    If the contract data contains:
    {
        "contract": {
            "methodNames": [
                "new", "ping", "deposit", "deposit_and_stake", "withdraw_all", "withdraw",
                "stake_all", "stake", "unstake_all", "unstake", "get_account_unstaked_balance",
                "get_account_staked_balance", "get_account_total_balance",
                "is_account_unstaked_balance_available", "get_total_staked_balance",
                "get_owner_id", "get_reward_fee_fraction", "get_staking_key",
                "is_staking_paused", "get_account", "get_number_of_accounts", "get_accounts",
                "on_stake_action", "update_staking_key", "update_reward_fee_fraction",
                "vote", "pause_staking", "resume_staking"
            ]
        }
    }
    Then the contract_type should be ["DAO", "Staking", "Vault"] because:
    - DAO: Has governance functions (vote, update_reward_fee_fraction, update_staking_key)
    - Staking: Has staking management functions (stake, unstake, get_account_staked_balance, get_total_staked_balance)
    - Vault: Has asset management functions (deposit, withdraw, get_account_total_balance, get_account_unstaked_balance)
    
    For null or missing data, return ONLY:
    {
        "description": "No contract data available for analysis",
        "contract_type": []
    }
    
    Please provide a NEAR account ID (e.g., devhub.near) to analyze its contract.
    Remember: Return ONLY the JSON string without any additional text or explanations.`
        , prompt
    });
    return text;
}


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
        return NextResponse.json({
            status: 'error',
            message: 'accountId is required',
        }, { status: 400 });
    }

    const apiUrl = `https://pikespeak.ai/api/graph/near-transfer/${accountId}`;

    // Fetch data from the external API
    const response = await fetch(apiUrl);
    if (!response.ok) {
        return NextResponse.json({
            status: 'error',
            message: 'Failed to fetch activity history',
        }, { status: response.status });
    }

    const data = await response.json();

    // Process the data
    const allActivities = [];
    for (const activity of data) {
        const contractCheckUrl = `https://nearblocks.io/_next/data/nearblocks/en/address/${activity.account}.json?id=${activity.account}&tab=contract`;

        // Check if the account is a contract
        const res = await fetch(contractCheckUrl);
        const contractResponse = await res.json();


        const parseDetails = contractResponse?.pageProps?.parseDetails?.contract?.[0];
        const isContract = parseDetails.contract !== null;
        let contractType: string = '{"contract_type":null}';
        // if (isContract) {
        //     contractType = await contract_type(JSON.stringify(parseDetails.contract.methodNames));
        // }

        // Process the activity if it's a contract
        allActivities.push({
            account: activity.account,
            totalIn: activity.totalIn,
            totalOut: activity.totalOut,
         //   contractType: JSON.parse(contractType as any),
        });
    }
    return NextResponse.json({
        status: 'success',
        data: allActivities,
    });

}