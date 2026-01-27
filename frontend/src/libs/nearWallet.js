import { HereWallet } from '@here-wallet/core'

let hereInstance = null
let connectedAccountId = null

// DEBUG: собираем все ошибки HOT Wallet
if (!window.__HOT_WALLET_ERRORS__) {
    window.__HOT_WALLET_ERRORS__ = []
}

function logError(step, error) {
    const err = {
        step,
        message: error?.message || String(error),
        stack: error?.stack || '',
        time: new Date().toISOString(),
    }
    console.error(`[nearWallet] ${step}:`, error)
    window.__HOT_WALLET_ERRORS__.push(err)
    if (window.__HOT_WALLET_ERRORS__.length > 10) {
        window.__HOT_WALLET_ERRORS__.shift()
    }
}

export async function connectWallet() {
    try {
        const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || 'testnet'
        const botId = import.meta.env.VITE_TG_BOT_ID || 'Cardclashbot/app'
        const walletId = import.meta.env.VITE_HOT_WALLET_ID || 'herewalletbot/app'

        console.log('[nearWallet] connectWallet start', { networkId, botId, walletId })

        logError('connect:start', new Error(`Starting connect with botId=${botId}, walletId=${walletId}, network=${networkId}`))

        hereInstance = await HereWallet.connect({
            networkId,
            botId,
            walletId,
        })

        console.log('[nearWallet] HereWallet.connect OK, calling authenticate...')
        logError('connect:instance_created', new Error('HereWallet instance created, calling authenticate...'))

        const authResult = await hereInstance.authenticate()

        console.log('[nearWallet] authenticate result:', authResult)
        logError('authenticate:success', new Error(`Auth OK: ${JSON.stringify(authResult)}`))

        connectedAccountId = authResult.accountId || authResult.account_id

        if (!connectedAccountId) {
            throw new Error('No accountId returned from authenticate')
        }

        console.log('[nearWallet] connected:', connectedAccountId)

        return { accountId: connectedAccountId }
    } catch (err) {
        logError('connect:error', err)
        throw err
    }
}

export async function disconnectWallet() {
    hereInstance = null
    connectedAccountId = null
    console.log('[nearWallet] disconnected')
}

export async function signAndSendTransaction({ receiverId, actions }) {
    if (!hereInstance) {
        const err = new Error('Wallet not connected (hereInstance is null)')
        logError('signAndSendTransaction:not_connected', err)
        throw err
    }

    if (!receiverId) {
        const err = new Error('receiverId is required')
        logError('signAndSendTransaction:no_receiver', err)
        throw err
    }

    if (!actions || !actions.length) {
        const err = new Error('actions are required')
        logError('signAndSendTransaction:no_actions', err)
        throw err
    }

    try {
        console.log('[nearWallet] signAndSendTransaction', { receiverId, actions })
        logError('signAndSendTransaction:start', new Error(`Signing tx to ${receiverId}, actions: ${actions.length}`))

        const result = await hereInstance.signAndSendTransaction({
            receiverId,
            actions,
        })

        console.log('[nearWallet] tx result:', result)
        logError('signAndSendTransaction:success', new Error(`TX OK: ${JSON.stringify(result)}`))

        return result
    } catch (err) {
        logError('signAndSendTransaction:error', err)
        throw err
    }
}

export function getConnectedAccountId() {
    return connectedAccountId
}