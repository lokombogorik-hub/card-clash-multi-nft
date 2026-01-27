import { HereWallet } from '@here-wallet/core'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import '@near-wallet-selector/modal-ui/styles.css'

let hereInstance = null
let connectedAccountId = null
let walletSelector = null
let modal = null
let currentWalletType = null // 'hot' | 'mynear'

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

// Check if running in Telegram WebApp
function isTelegramWebApp() {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
}

// ============ HOT WALLET ============

export async function connectHotWallet() {
    let step = 'init'

    try {
        // Check Telegram
        if (!isTelegramWebApp()) {
            throw new Error('HOT Wallet работает только в Telegram WebApp. Откройте игру через бота в Telegram или используйте MyNearWallet.')
        }

        step = 'read_env'
        const botId = import.meta.env.VITE_TG_BOT_ID || 'Cardclashbot'
        const walletId = import.meta.env.VITE_HOT_WALLET_ID || 'herewalletbot'

        console.log('[nearWallet] connectHotWallet start', { networkId, botId, walletId })
        logError('hot:env', new Error(`ENV: botId=${botId}, walletId=${walletId}, network=${networkId}`))

        step = 'HereWallet.connect'
        console.log('[nearWallet] calling HereWallet.connect...')

        hereInstance = await HereWallet.connect({
            networkId,
            botId,
            walletId,
        })

        console.log('[nearWallet] HereWallet.connect OK:', hereInstance)
        logError('hot:instance', new Error(`Instance created: ${typeof hereInstance}`))

        step = 'authenticate'
        console.log('[nearWallet] calling authenticate...')

        const authResult = await hereInstance.authenticate()

        console.log('[nearWallet] authenticate result:', authResult)
        logError('hot:auth_result', new Error(`Auth result: ${JSON.stringify(authResult)}`))

        step = 'extract_accountId'
        connectedAccountId = authResult.accountId || authResult.account_id

        if (!connectedAccountId) {
            throw new Error('No accountId in authenticate result: ' + JSON.stringify(authResult))
        }

        currentWalletType = 'hot'
        console.log('[nearWallet] HOT wallet connected:', connectedAccountId)
        logError('hot:success', new Error(`Connected: ${connectedAccountId}`))

        return { accountId: connectedAccountId, wallet: 'hot' }
    } catch (err) {
        console.error(`[nearWallet] HOT ERROR at step "${step}":`, err)
        logError(`hot:error:${step}`, err)
        throw err
    }
}

// ============ WALLET SELECTOR (MyNearWallet) ============

async function initWalletSelector() {
    if (walletSelector) {
        console.log('[nearWallet] walletSelector already initialized')
        return walletSelector
    }

    try {
        console.log('[nearWallet] Initializing wallet-selector...')
        logError('mynear:init_start', new Error(`Initializing for network: ${networkId}`))

        walletSelector = await setupWalletSelector({
            network: networkId,
            modules: [setupMyNearWallet()],
        })

        console.log('[nearWallet] walletSelector initialized:', walletSelector)
        logError('mynear:init_success', new Error('WalletSelector initialized'))

        return walletSelector
    } catch (err) {
        console.error('[nearWallet] walletSelector init error:', err)
        logError('mynear:init_error', err)
        throw err
    }
}

export async function connectMyNearWallet() {
    try {
        logError('mynear:start', new Error('Starting MyNearWallet connection...'))

        const selector = await initWalletSelector()

        // Create modal if not exists
        if (!modal) {
            console.log('[nearWallet] Creating modal...')
            modal = setupModal(selector, {
                contractId: import.meta.env.VITE_NEAR_LOGIN_CONTRACT_ID || 'guest-book.testnet',
            })
            logError('mynear:modal_created', new Error('Modal created'))
        }

        logError('mynear:show_modal', new Error('Showing wallet modal...'))

        // Show modal
        modal.show()

        console.log('[nearWallet] Modal shown, waiting for wallet selection...')

        // Wait for wallet selection
        return new Promise((resolve, reject) => {
            let resolved = false

            // Subscribe to state changes
            const unsubscribe = selector.store.observable.subscribe((state) => {
                console.log('[nearWallet] walletSelector state change:', state)

                if (resolved) return

                const accounts = state.accounts

                if (accounts && accounts.length > 0) {
                    resolved = true
                    unsubscribe()

                    const accountId = accounts[0].accountId
                    connectedAccountId = accountId
                    currentWalletType = 'mynear'

                    // Hide modal
                    try {
                        modal.hide()
                    } catch (e) {
                        console.warn('[nearWallet] modal.hide() error:', e)
                    }

                    console.log('[nearWallet] MyNearWallet connected:', accountId)
                    logError('mynear:success', new Error(`Connected: ${accountId}`))

                    resolve({ accountId, wallet: 'mynear' })
                }
            })

            // Also check immediately (in case already connected)
            setTimeout(() => {
                const state = selector.store.getState()
                if (state.accounts && state.accounts.length > 0 && !resolved) {
                    resolved = true
                    unsubscribe()

                    const accountId = state.accounts[0].accountId
                    connectedAccountId = accountId
                    currentWalletType = 'mynear'

                    try {
                        modal.hide()
                    } catch (e) {
                        console.warn('[nearWallet] modal.hide() error:', e)
                    }

                    console.log('[nearWallet] MyNearWallet already connected:', accountId)
                    logError('mynear:already_connected', new Error(`Already connected: ${accountId}`))

                    resolve({ accountId, wallet: 'mynear' })
                }
            }, 500)

            // Timeout after 3 minutes
            setTimeout(() => {
                if (!resolved) {
                    resolved = true
                    unsubscribe()

                    try {
                        modal.hide()
                    } catch (e) {
                        console.warn('[nearWallet] modal.hide() error:', e)
                    }

                    const err = new Error('MyNearWallet connection timeout (180s)')
                    logError('mynear:timeout', err)
                    reject(err)
                }
            }, 180000)
        })
    } catch (err) {
        console.error('[nearWallet] MyNearWallet error:', err)
        logError('mynear:error', err)
        throw err
    }
}

// ============ GENERIC CONNECT (default to HOT if mainnet, MyNear if testnet) ============

export async function connectWallet() {
    if (networkId === 'testnet') {
        return await connectMyNearWallet()
    } else {
        return await connectHotWallet()
    }
}

// ============ DISCONNECT ============

export async function disconnectWallet() {
    try {
        if (hereInstance) {
            hereInstance = null
            console.log('[nearWallet] HOT wallet disconnected')
        }

        if (walletSelector) {
            const wallet = await walletSelector.wallet()
            if (wallet) {
                await wallet.signOut()
                console.log('[nearWallet] MyNearWallet disconnected')
            }
        }

        connectedAccountId = null
        currentWalletType = null
        console.log('[nearWallet] all wallets disconnected')
    } catch (err) {
        console.error('[nearWallet] disconnect error:', err)
    }
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
        console.log('[nearWallet] signAndSendTransaction', { receiverId, actions, walletType: currentWalletType })
        logError('tx:start', new Error(`TX to ${receiverId}, actions: ${actions.length}, wallet: ${currentWalletType}`))

        let result

        // HOT Wallet
        if (currentWalletType === 'hot' && hereInstance) {
            console.log('[nearWallet] Using HOT wallet for tx...')
            result = await hereInstance.signAndSendTransaction({
                receiverId,
                actions,
            })
        }
        // MyNearWallet
        else if (currentWalletType === 'mynear' && walletSelector) {
            console.log('[nearWallet] Using MyNearWallet for tx...')
            const wallet = await walletSelector.wallet()
            result = await wallet.signAndSendTransaction({
                receiverId,
                actions,
            })
        }
        else {
            throw new Error(`No wallet instance available (type: ${currentWalletType})`)
        }

        console.log('[nearWallet] tx result:', result)
        logError('tx:success', new Error(`TX OK: ${JSON.stringify(result)}`))

        return result
    } catch (err) {
        console.error('[nearWallet] tx error:', err)
        logError('tx:error', err)
        throw err
    }
}

export function getConnectedAccountId() {
    return connectedAccountId
}

export function getWalletType() {
    return currentWalletType
}

export function isTelegram() {
    return isTelegramWebApp()
}