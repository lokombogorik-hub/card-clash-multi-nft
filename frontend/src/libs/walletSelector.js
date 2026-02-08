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
            selector = await setupWalletSelector({
                network: networkId,
                modules: [setupHereWallet()],
            });
            console.log("[WS] initialized, network:", networkId);
            return selector;
        } catch (e) {
            console.error("[WS] init failed:", e);
            initPromise = null;
            throw e;
        }
    })();

    return initPromise;
}

async function connectWallet() {
    var sel = await initWalletSelector();
    var wallet = await sel.wallet("here-wallet");

    if (!wallet) {
        throw new Error("HERE Wallet module not available");
    }

    var accounts = await wallet.signIn({
        permission: { receiverId: "" },
    });

    var accountId = "";

    if (Array.isArray(accounts) && accounts.length > 0) {
        accountId = accounts[0].accountId || "";
    }

    if (!accountId) {
        var state = sel.store.getState();
        if (state.accounts && state.accounts.length > 0) {
            accountId = state.accounts[0].accountId;
        }
    }

    if (!accountId) {
        throw new Error("No account returned from HERE Wallet");
    }

    console.log("[WS] connected:", accountId);
    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        var sel = await initWalletSelector();
        var wallet = await sel.wallet("here-wallet");
        await wallet.signOut();
    } catch (e) {
        console.warn("[WS] disconnect error:", e);
    }
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

    var result = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: params.receiverId,
        actions: params.actions,
    });

    return result;
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};