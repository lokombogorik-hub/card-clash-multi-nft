import { connect, WalletConnection } from 'near-api-js';

const connectNearWallet = async () => {
    // Настройка подключения к NEAR
    const nearConfig = {
        networkId: 'testnet',
        nodeUrl: 'https://rpc.testnet.near.org',
        walletUrl: 'https://wallet.testnet.near.org',
    };

    const near = await connect(nearConfig);
    const wallet = new WalletConnection(near);

    if (!wallet.isSignedIn()) {
        wallet.requestSignIn();
    }

    return wallet;
};

export { connectNearWallet };