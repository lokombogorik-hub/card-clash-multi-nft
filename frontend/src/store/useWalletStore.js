// frontend/src/store/useWalletStore.js — ПОЛНАЯ ЗАМЕНА

import { useEffect, useState } from "react";
import { walletStore } from "./walletStore";

export function useWalletStore() {
    var ss = useState(walletStore.getState());
    var snap = ss[0];
    var setSnap = ss[1];

    useEffect(function () {
        var unsub = walletStore.subscribe(function () {
            setSnap(walletStore.getState());
        });
        walletStore.restoreSession();
        return unsub;
    }, []);

    return {
        connected: snap.connected,
        accountId: snap.walletAddress,
        walletAddress: snap.walletAddress,
        balance: snap.balance,
        status: snap.status,
        lastError: snap.lastError,
        nfts: snap.nfts,

        connectHot: walletStore.connectHot,
        disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus,
        restoreSession: walletStore.restoreSession,
        refreshBalance: walletStore.refreshBalance,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        sendNear: walletStore.sendNear,
        getUserNFTs: walletStore.getUserNFTs,
    };
}