import { useEffect, useState } from 'react';
import { walletStore } from './walletStore';

export function useWalletStore() {
    const [state, setState] = useState(walletStore.getState());
    const [nfts, setNfts] = useState([]);

    useEffect(() => {
        const unsubscribe = walletStore.subscribe(() => {
            setState(walletStore.getState());
        });

        // Восстанавливаем сессию при загрузке
        walletStore.restoreSession();

        return unsubscribe;
    }, []);

    // Загружаем NFT при подключении
    useEffect(() => {
        if (state.connected && state.walletAddress) {
            getUserNFTs();
        }
    }, [state.connected, state.walletAddress]);

    const getUserNFTs = async () => {
        try {
            const tokens = await walletStore.getUserNFTs();
            setNfts(tokens);
            return tokens;
        } catch (error) {
            console.error('Failed to get NFTs:', error);
            setNfts([]);
            return [];
        }
    };

    const mintCard = async () => {
        try {
            const result = await walletStore.mintCard();
            await getUserNFTs(); // Обновляем список NFT
            return result;
        } catch (error) {
            console.error('Failed to mint card:', error);
            throw error;
        }
    };

    const mintPack = async () => {
        try {
            const result = await walletStore.mintPack();
            await getUserNFTs(); // Обновляем список NFT
            return result;
        } catch (error) {
            console.error('Failed to mint pack:', error);
            throw error;
        }
    };

    return {
        // State
        isAuthenticated: state.connected,
        accountId: state.walletAddress,
        balance: state.balance,
        nfts,

        // Wallet methods
        connect: walletStore.connectHot, // Используем HOT wallet по умолчанию
        connectHot: walletStore.connectHot,
        connectMyNear: walletStore.connectMyNear,
        disconnect: walletStore.disconnectWallet,

        // NFT methods
        mintCard,
        mintPack,
        getUserNFTs,

        // Transfer methods
        sendNear: walletStore.sendNear,
        nft_transfer_call: walletStore.nftTransferCall,
        claim: walletStore.escrowClaim,

        // Raw state for debugging
        walletState: state,
    };
}