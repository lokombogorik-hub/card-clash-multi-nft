import { useEffect, useState } from "react";
import { walletStore } from "./walletStore";

export function useWalletStore() {
    const [snap, setSnap] = useState(walletStore.getState());

    useEffect(() => {
        return walletStore.subscribe(() => setSnap(walletStore.getState()));
    }, []);

    return {
        ...snap,
        connectHot: walletStore.connectHot,
        disconnectWallet: walletStore.disconnectWallet,
        restoreSession: walletStore.restoreSession,
        clearStatus: walletStore.clearStatus,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall,
        escrowClaim: walletStore.escrowClaim,
    };
}