// frontend/src/store/useWalletStore.js
import { useSyncExternalStore, useCallback } from "react";
import { walletStore } from "./walletStore";

export function useWalletStore() {
    var state = useSyncExternalStore(walletStore.subscribe, walletStore.getState);

    return {
        // State
        connected: state.connected,
        walletAddress: state.walletAddress,
        balance: state.balance,
        status: state.status,
        lastError: state.lastError,
        nfts: state.nfts,

        // Actions
        connectHot: walletStore.connectHot,
        disconnectWallet: walletStore.disconnectWallet,
        restoreSession: walletStore.restoreSession,
        clearStatus: walletStore.clearStatus,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        sendNear: walletStore.sendNear,
        refreshBalance: walletStore.refreshBalance,
        getUserNFTs: walletStore.getUserNFTs,
    };
}