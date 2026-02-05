import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

let selector = null;
let modal = null;
let currentAccount = null;

function log(step, message, extra) {
    try {
        window.__WALLET_SELECTOR_LOGS__ = window.__WALLET_SELECTOR_LOGS__ || [];
        window.__WALLET_SELECTOR_LOGS__.push({
            step,
            message,
            extra,
            time: new Date().toISOString(),
        });
        console.log(`[WalletSelector] ${step}:`, message, extra);
    } catch { }
}

export async function initWalletSelector() {
    if (selector) return selector;

    log("init", "Initializing wallet selector", { networkId, RPC_URL });

    selector = await setupWalletSelector({
        network: networkId,
        modules: [
            setupHereWallet({
                iconUrl: "https://github.com/here-wallet/near-snap/blob/main/packages/snap/images/icon.svg",
            }),
        ],
    });

    log("init_ok", "Wallet selector initialized");

    // Восстанавливаем сессию если есть
    const state = selector.store.getState();
    if (state.accounts.length > 0) {
        currentAccount = state.accounts[0];
        log("restore_session", "Session restored", { account: currentAccount });
    }

    return selector;
}

export async function connectWallet() {
    const sel = await initWalletSelector();

    log("connect_start", "Opening wallet modal");

    if (!modal) {
        modal = setupModal(sel, {
            contractId: nftContractId || "near",
            description: "Connect your NEAR wallet to play Card Clash",
        });
    }

    modal.show();

    // Ждём выбора кошелька
    return new Promise((resolve, reject) => {
        const unsubscribe = sel.store.observable.subscribe(async (state) => {
            if (state.accounts.length > 0) {
                currentAccount = state.accounts[0];
                log("connect_ok", "Wallet connected", { account: currentAccount });
                unsubscribe();
                modal.hide();
                resolve({ accountId: currentAccount.accountId });
            }
        });

        // Таймаут 5 минут
        setTimeout(() => {
            unsubscribe();
            reject(new Error("Connection timeout"));
        }, 300000);
    });
}

export async function disconnectWallet() {
    const sel = await initWalletSelector();
    const wallet = await sel.wallet();

    if (wallet) {
        await wallet.signOut();
        log("disconnect_ok", "Wallet disconnected");
    }

    currentAccount = null;
}

export async function getSignedInAccountId() {
    const sel = await initWalletSelector();
    const state = sel.store.getState();

    if (state.accounts.length > 0) {
        const id = state.accounts[0].accountId;
        log("get_account", "Got account", { id, networkId });

        // Проверяем сеть
        if (networkId === "testnet" && !id.includes(".testnet")) {
            log("wrong_network", "Account is not testnet", { id });
            return "";
        }
        if (networkId === "mainnet" && id.includes(".testnet")) {
            log("wrong_network", "Account is testnet, expected mainnet", { id });
            return "";
        }

        return id;
    }

    return "";
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const sel = await initWalletSelector();
    const wallet = await sel.wallet();

    if (!wallet) {
        throw new Error("Wallet not connected");
    }

    const accountId = await getSignedInAccountId();
    if (!accountId) {
        throw new Error("No signed in account");
    }

    log("sign_tx_start", "Signing transaction", { receiverId, accountId, actionsCount: actions.length });

    try {
        const result = await wallet.signAndSendTransaction({
            signerId: accountId,
            receiverId,
            actions,
        });

        log("sign_tx_ok", "Transaction signed", { result });
        return result;
    } catch (e) {
        log("sign_tx_err", e?.message || String(e), { stack: e?.stack });
        throw e;
    }
}

export { networkId, RPC_URL };