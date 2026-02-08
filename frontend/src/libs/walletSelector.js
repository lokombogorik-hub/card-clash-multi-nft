import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";

var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var selector = null;
var initPromise = null;

async function initWalletSelector() {
    if (selector) return selector;
    if (initPromise) return initPromise;

    initPromise = (async function () {
        try {
            console.log("[WS] Initializing wallet selector, network:", networkId);

            selector = await setupWalletSelector({
                network: networkId,
                modules: [
                    setupHereWallet(),
                ],
            });

            console.log("[WS] Wallet selector initialized OK");

            // Проверяем текущее состояние
            var state = selector.store.getState();
            console.log("[WS] Current accounts:", state.accounts);

            return selector;
        } catch (e) {
            console.error("[WS] Init failed:", e);
            initPromise = null;
            selector = null;
            throw e;
        }
    })();

    return initPromise;
}

async function connectWallet() {
    var sel = await initWalletSelector();

    console.log("[WS] Getting here-wallet module...");

    var wallet;
    try {
        wallet = await sel.wallet("here-wallet");
    } catch (e) {
        console.error("[WS] Failed to get here-wallet:", e);
        throw new Error("HERE Wallet not available: " + e.message);
    }

    if (!wallet) {
        throw new Error("HERE Wallet module not found");
    }

    console.log("[WS] HERE Wallet module loaded, calling signIn...");
    console.log("[WS] Wallet type:", wallet.type);
    console.log("[WS] Wallet id:", wallet.id);

    // signIn БЕЗ contractId — просто авторизация
    var accounts;
    try {
        accounts = await wallet.signIn({});
    } catch (e1) {
        console.warn("[WS] signIn({}) failed:", e1.message);
        // Пробуем с пустым permission
        try {
            accounts = await wallet.signIn({ permission: "FullAccess" });
        } catch (e2) {
            console.warn("[WS] signIn(FullAccess) failed:", e2.message);
            // Последняя попытка
            try {
                accounts = await wallet.signIn();
            } catch (e3) {
                console.error("[WS] All signIn attempts failed:", e3.message);
                throw e3;
            }
        }
    }

    console.log("[WS] signIn result:", accounts);

    var accountId = "";

    if (Array.isArray(accounts) && accounts.length > 0) {
        accountId = accounts[0].accountId || String(accounts[0]);
    } else if (accounts && accounts.accountId) {
        accountId = accounts.accountId;
    } else if (typeof accounts === "string") {
        accountId = accounts;
    }

    // Fallback: проверяем store
    if (!accountId) {
        var state = sel.store.getState();
        if (state.accounts && state.accounts.length > 0) {
            accountId = state.accounts[0].accountId;
        }
    }

    console.log("[WS] Final accountId:", accountId);

    if (!accountId) {
        throw new Error("No account returned from wallet");
    }

    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        var sel = await initWalletSelector();
        var wallet = await sel.wallet();
        if (wallet) await wallet.signOut();
    } catch (e) {
        console.warn("[WS] disconnect error:", e);
    }
    selector = null;
    initPromise = null;
}

async function getSignedInAccountId() {
    try {
        var sel = await initWalletSelector();
        var state = sel.store.getState();
        if (state.accounts && state.accounts.length > 0) {
            return state.accounts[0].accountId;
        }
    } catch (e) {
        console.warn("[WS] getSignedInAccountId error:", e);
    }
    return "";
}

async function signAndSendTransaction(params) {
    var sel = await initWalletSelector();
    var wallet = await sel.wallet();
    if (!wallet) throw new Error("No wallet connected");

    var state = sel.store.getState();
    var accountId = state.accounts && state.accounts[0] && state.accounts[0].accountId;
    if (!accountId) throw new Error("No signed-in account");

    return await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};