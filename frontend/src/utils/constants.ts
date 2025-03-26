const MAX_GAS = '300000000000000';

const SOLVER_BUS_URL = "https://solver-relay-v2.chaindefuser.com/rpc";

const ASSET_MAP = {
    'USDT': {
        token_id: 'eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
        omft: 'eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
        decimals: 6,
    },
    'ZCASH': {
        token_id: 'zec.omft.near',
        omft: 'zec.omft.near',
        decimals: 8,
    },
    'NEAR': {
        token_id: 'wrap.near',
        decimals: 24,
    }
};

export {
    MAX_GAS,
    SOLVER_BUS_URL,
    ASSET_MAP
}