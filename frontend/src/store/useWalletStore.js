import { useEffect, useState } from 'react'
import { walletStore } from './walletStore'

export function useWalletStore() {
    const [state, setState] = useState(walletStore.getState())

    useEffect(() => {
        const unsub = walletStore.subscribe(() => {
            setState(walletStore.getState())
        })
        return unsub
    }, [])

    return {
        ...state,
        connectHot: walletStore.connectHot,
        connectMyNear: walletStore.connectMyNear,
        disconnectWallet: walletStore.disconnectWallet,
        restoreSession: walletStore.restoreSession,
        clearStatus: walletStore.clearStatus,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall,
        escrowClaim: walletStore.escrowClaim,
    }
}