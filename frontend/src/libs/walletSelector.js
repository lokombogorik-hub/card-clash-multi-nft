import { HereWallet } from "@here-wallet/core";

var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var wallet = null;
var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";
var CONNECTING_KEY = "cardclash_connecting";

async function getWallet() {
    if (wallet) return wallet;

    wallet = await HereWallet.connect({
        networkId: networkId,
        walletId: (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim(),
        telegramBotId: (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim(),
        rpcUrl: RPC_URL,
    });

    return wallet;
}

async function connectWallet() {
    var w = await getWallet();

    // Проверяем уже авторизован (после возврата из кошелька)
    var existingId = "";
    try {
        if (w.getAccountId) {
            existingId = await w.getAccountId();
        }
    } catch (e) { }

    if (existingId) {
        currentAccountId = String(existingId);
        localStorage.setItem(STORAGE_KEY, currentAccountId);
        localStorage.removeItem(CONNECTING_KEY);
        return { accountId: currentAccountId };
    }

    // Запоминаем что начали подключение
    localStorage.setItem(CONNECTING_KEY, Date.now().toString());

    // signIn — откроет HOT Wallet (игра закроется на время)
    // Когда пользователь вернётся — restoreSession подхватит
    var result = await w.signIn({
        contractId: (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim() || undefined,
    });

    var accountId = "";
    if (typeof result === "string") accountId = result;
    else if (result && result.accountId) accountId = result.accountId;

    if (!accountId && w.getAccountId) {
        try { accountId = await w.getAccountId(); } catch (e) { }
    }

    accountId = String(accountId || "").trim();

    if (accountId) {
        currentAccountId = accountId;
        localStorage.setItem(STORAGE_KEY, accountId);
        localStorage.removeItem(CONNECTING_KEY);
    }

    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        if (wallet && wallet.signOut) await wallet.signOut();
    } catch (e) { }
    wallet = null;
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CONNECTING_KEY);
}

async function getSignedInAccountId() {
    if (currentAccountId) return currentAccountId;

    // Проверяем localStorage
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
    }

    // Пробуем через SDK (после возврата из кошелька)
    try {
        var w = await getWallet();
        if (w.getAccountId) {
            var id = await w.getAccountId();
            if (id) {
                currentAccountId = String(id);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
                localStorage.removeItem(CONNECTING_KEY);
                return currentAccountId;
            }
        }
    } catch (e) { }

    return "";
}

async function signAndSendTransaction(params) {
    if (!wallet) await getWallet();
    if (!wallet) throw new Error("Wallet not initialized");
    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Not connected");

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
    CONNECTING_KEY,
};