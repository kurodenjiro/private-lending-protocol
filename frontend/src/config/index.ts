import { connect, keyStores, KeyPair, Contract } from 'near-api-js';


const getAccount = async () => {
    const RPC_NODE_URL = 'https://rpc.mainnet.near.org';
    
    const keyStore = new keyStores.InMemoryKeyStore();
    const keyPair = KeyPair.fromString(process.env.PRIVATE_KEY || '' as any);
    await keyStore.setKey('mainnet', process.env.ACCOUNT_ID || '', keyPair);

    const config = {
        networkId: 'mainnet',
        keyStore,
        nodeUrl: RPC_NODE_URL,
    };

    const near = await connect(config);
    return await near.account(process.env.ACCOUNT_ID || '');
}

export {
    getAccount
}