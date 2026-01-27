import { HereWallet } from '@here-wallet/core'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import '@near-wallet-selector/modal-ui/styles.css'

let hereInstance = null
let connectedAccountId = null
let walletSelector = null
let modal = null

// DEBUG: собираем все ошибки HOT Wallet
if (!window.__HOT_WALLET_ERRORS__) {
    window.__HOT_WALLET_ERRORS__ = []
}

function logError(step, error) {
    const err = {
        step,
        message: error?.message || String(error),
        stack: error?.stack || '',
        name: error?.name || 'Error',
        time: new Date().toISOString(),
    }
    console.error(`[nearWallet] ${step}:`, error)
    window.__HOT_WALLET_ERRORS__.push(err)
    if (window.__HOT_WALLET_ERRORS__.length > 20) {
        window.__HOT_WALLET_ERRORS__.shift()
    }

    // Trigger re-render
    try {
        window.dispatchEvent(new Event('hot-wallet-error'))
    } catch { }
}

const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || 'testnet'
const isTestnet = networkId === 'testnet'

// ============ HOT WALLET (mainnet only) ============

export async function connectHotWallet() {
    if (isTestnet) {
        throw new Error('HOT Wallet не поддерживает testnet. Используйте MyNearWallet.')
    }

    let step = 'init'

    try {
        step = 'read_env'
        const botId = import.meta.env.VITE_TG_BOT_ID || 'Cardclashbot'
        const walletId = import.meta.env.VITE_HOT_WALLET_ID || 'herewalletbot'

        console.log('[nearWallet] connectHotWallet start', { networkId, botId, walletId })
        logError('connect:env', new Error(`ENV: botId=${botId}, walletId=${walletId}, network=${networkId}`))

        step = 'HereWallet.connect'
        console.log('[nearWallet] calling HereWallet.connect...')

        hereInstance = await HereWallet.connect({
            networkId,
            botId,
            walletId,
        })

        console.log('[nearWallet] HereWallet.connect OK:', hereInstance)
        logError('connect:instance', new Error(`Instance created: ${typeof hereInstance}`))

        step = 'authenticate'
        console.log('[nearWallet] calling authenticate...')

        const authResult = await hereInstance.authenticate()

        console.log('[nearWallet] authenticate result:', authResult)
        logError('authenticate:result', new Error(`Auth result: ${JSON.stringify(authResult)}`))

        step = 'extract_accountId'
        connectedAccountId = authResult.accountId || authResult.account_id

        if (!connectedAccountId) {
            throw new Error('No accountId in authenticate result: ' + JSON.stringify(authResult))
        }

        console.log('[nearWallet] connected:', connectedAccountId)
        logError('connect:success', new Error(`Connected: ${connectedAccountId}`))

        return { accountId: connectedAccountId, wallet: 'hot' }
    } catch (err) {
        console.error(`[nearWallet] ERROR at step "${step}":`, err)
        logError(`connect:error:${step}`, err)
        throw err
    }
}

// ============ WALLET SELECTOR (testnet) ============

async function initWalletSelector() {
    if (walletSelector) return

    const contractId = import.meta.env.VITE_NEAR_LOGIN_CONTRACT_ID || 'guest-book.testnet'

    walletSelector = await setupWalletSelector({
        network: networkId,
        modules: [setupMyNearWallet()],
    })

    modal = setupModal(walletSelector, {
        contractId,
    })
}

export async function connectMyNearWallet() {
    if (!isTestnet) {
        throw new Error('MyNearWallet работает только на testnet. Для mainnet используйте HOT Wallet.')
    }

    try {
        logError('mynear:init', new Error('Initializing wallet-selector...'))
        await initWalletSelector()

        logError('mynear:show_modal', new Error('Opening wallet modal...'))
        modal.show()

        // Wait for wallet selection
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                const state = walletSelector.store.getState()
                const accounts = state.accounts

                if (accounts && accounts.length > 0) {
                    clearInterval(checkInterval)
                    const accountId = accounts[0].accountId
                    connectedAccountId = accountId
                    modal.hide()
                    logError('mynear:connected', new Error(`Connected: ${accountId}`))
                    resolve({ accountId, wallet: 'mynear' })
                }
            }, 500)

            // Timeout after 60s
            setTimeout(() => {
                clearInterval(checkInterval)
                reject(new Error('Wallet connection timeout'))
            }, 60000)
        })
    } catch (err) {
        logError('mynear:error', err)
        throw err
    }
}

export async function connectWallet() {
    if (isTestnet) {
        return await connectMyNearWallet()
    } else {
        return await connectHotWallet()
    }
}

// ============ DISCONNECT ============

export async function disconnectWallet() {
    if (hereInstance) {
        hereInstance = null
    }

    if (walletSelector) {
        const wallet = await walletSelector.wallet()
        if (wallet) {
            await wallet.signOut()
        }
    }

    connectedAccountId = null
    console.log('[nearWallet] disconnected')
}

// ============ SIGN & SEND TX ============

export async function signAndSendTransaction({ receiverId, actions }) {
    if (!connectedAccountId) {
        const err = new Error('Wallet not connected')
        logError('tx:not_connected', err)
        throw err
    }

    if (!receiverId) {
        const err = new Error('receiverId is required')
        logError('tx:no_receiver', err)
        throw err
    }

    if (!actions || !actions.length) {
        const err = new Error('actions are required')
        logError('tx:no_actions', err)
        throw err
    }

    try {
        console.log('[nearWallet] signAndSendTransaction', { receiverId, actions })
        logError('tx:start', new Error(`TX to ${receiverId}, actions: ${actions.length}`))

        let result

        // HOT Wallet
        if (hereInstance) {
            result = await hereInstance.signAndSendTransaction({
                receiverId,
                actions,
            })
        }
        // Wallet Selector
        else if (walletSelector) {
            const wallet = await walletSelector.wallet()
            result = await wallet.signAndSendTransaction({
                receiverId,
                actions,
            })
        }
        else {
            throw new Error('No wallet instance available')
        }

        console.log('[nearWallet] tx result:', result)
        logError('tx:success', new Error(`TX OK: ${JSON.stringify(result)}`))

        return result
    } catch (err) {
        logError('tx:error', err)
        throw err
    }
}

export function getConnectedAccountId() {
    return connectedAccountId
}