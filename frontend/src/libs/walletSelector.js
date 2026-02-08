import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

/* ───── network ───── */
const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

/* ───── singleton state ───── */
let selector = null;
let modal = null;
let currentWallet = null;

/* ───── init ───── */
export async function initWalletSelector() {
    if (selector) return selector;

    try {
        selector = await setupWalletSelector({
            network: networkId,
            modules: [setupHereWallet()],
        });

        const state = selector.store.getState();
        if (state.accounts && state.accounts.length > 0) {
            try {
                currentWallet = await selector.wallet();
            } catch (e) {
                console.warn("[WalletSelector] restore wallet instance failed:", e);
                currentWallet = null;
            }
        }
    } catch (e) {
        console.error("[WalletSelector] init failed:", e);
        selector = null;
        throw e;
    }

    return selector;
}

/* ───── connect (opens modal) ───── */
export async function connectWallet() {
    const sel = await initWalletSelector();

    if (!modal) {
        /*
         * contractId — для modal UI.
         * Пустая строка или placeholder — OK, это только для отображения.
         * Если есть NFT контракт — подставляем.
         */
        const contractForModal =
            (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim() || undefined;

        modal = setupModal(sel, {
            contractId: contractForModal,
        });
    }

    modal.show();

    return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;

        const unsubscribe = sel.store.observable.subscribe(async (state) => {
            if (settled) return;
            if (state.accounts && state.accounts.length > 0) {
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);

                try {
                    currentWallet = await sel.wallet();
                } catch (e) {
                    currentWallet = null;
                }

                try { unsubscribe(); } catch { }
                try { modal.hide(); } catch { }

                resolve({ accountId: state.accounts[0].accountId });
            }
        });

        /* Таймаут 120 сек — если пользователь закрыл модалку */
        timeoutId = setTimeout(() => {
            if (!settled) {
                settled = true;
                try { unsubscribe(); } catch { }
                reject(new Error("Connection timeout — modal was closed or no response"));
            }
        }, 120_000);
    });
}

/* ───── disconnect ───── */
export async function disconnectWallet() {
    try {
        const sel = await initWalletSelector();
        const wallet = await sel.wallet();
        if (wallet) await wallet.signOut();
    } catch (e) {
        console.warn("[WalletSelector] disconnect error:", e);
    }
    currentWallet = null;
}

/* ───── getSignedInAccountId ───── */
export async function getSignedInAccountId() {
    try {
        const sel = await initWalletSelector();
        const state = sel.store.getState();
        return (state.accounts && state.accounts.length > 0)
            ? state.accounts[0].accountId
            : "";
    } catch {
        return "";
    }
}

/* ───── signAndSendTransaction ───── */
export async function signAndSendTransaction({ receiverId, actions }) {
    if (!currentWallet) {
        try {
            const sel = await initWalletSelector();
            currentWallet = await sel.wallet();
        } catch { }
    }

    if (!currentWallet) throw new Error("Wallet not connected");

    const accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("No signed-in account");

    return await currentWallet.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}

export { networkId, RPC_URL };