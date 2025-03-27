import { ASSET_MAP } from './constants';

const getAssetId = (token: string) => {
    return `nep141:${ASSET_MAP[token as keyof typeof ASSET_MAP].token_id}`;
}

const toDecimals = (amount: string, decimals: number) => {
    // Convert to string and split by decimal point
    const [whole, fraction = ''] = amount.toString().split('.');
    
    // Convert to smallest unit
    const base = whole + fraction.padEnd(decimals, '0');
    
    // Remove leading zeros
    return base.replace(/^0+/, '') || '0';
}

export {
    getAssetId,
    toDecimals
}