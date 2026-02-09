// frontend/src/libs/walletSelector.js
// NEAR Wallet Selector + HERE Wallet (HOT) — official integration
// Works in Telegram WebApp via TelegramAppStrategy

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

var STORAGE_KEY = "cardclash_near_account";

// Singleton selector
var _selector = null;
var _initPromise = null;

function getSelector() {
    if (_initPromise) return _initPromise;

    _initPromise = setupWalletSelector({
        network: networkId,
        modules: [
            setupHereWallet({
                walletOptions: {
                    botId: import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app",
                    walletId: import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app",
                },
            }),
        ],
    }).then(function (selector) {
        _selector = selector;
        console.log("[WS] Wallet Selector initialized on", networkId);
        return selector;
    }).catch(function (err) {
        console.error("[WS] Selector init failed:", err);
        _initPromise = null;
        throw err;
    });

    return _initPromise;
}

async function connectWallet() {
    var selector = await getSelector();
    var wallet = await selector.wallet("here-wallet");

    console.log("[WS] Signing in with HERE wallet...");

    var accounts = await wallet.signIn({
        contractId: "",
    });

    console.log("[WS] signIn result:", accounts);

    var accountId = "";
    if (accounts && accounts.length > 0) {
        accountId = accounts[0].accountId;
    }

    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
        console.log("[WS] Connected:", accountId);
    }

    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        var selector = await getSelector();
        var wallet = await selector.wallet("here-wallet");
        await wallet.signOut();
    } catch (e) {
        console.warn("[WS] signOut error:", e.message);
    }

    localStorage.removeItem(STORAGE_KEY);

    // Clean related storage
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (
            key.startsWith("cardclash_near_") ||
            key.startsWith("near-wallet-selector") ||
            key.startsWith("here-") ||
            key.indexOf("wallet_auth_key") >= 0 ||
            key.indexOf("__telegramPendings") >= 0
        )) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
}

async function getSignedInAccountId() {
    try {
        var selector = await getSelector();
        var state = selector.store.getState();

        if (state && state.accounts && state.accounts.length > 0) {
            var activeAccount = state.accounts.find(function (a) { return a.active; });
            var accountId = activeAccount
                ? activeAccount.accountId
                : state.accounts[0].accountId;

            if (accountId) {
                localStorage.setItem(STORAGE_KEY, accountId);
                return accountId;
            }
        }
    } catch (e) {
        console.warn("[WS] getSignedInAccountId error:", e.message);
    }

    // Fallback to localStorage
    return localStorage.getItem(STORAGE_KEY) || "";
}

async function signAndSendTransaction(params) {
    var selector = await getSelector();
    var wallet = await selector.wallet("here-wallet");

    var result = await wallet.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });

    return result;
}

async function signAndSendTransactions(params) {
    var selector = await getSelector();
    var wallet = await selector.wallet("here-wallet");

    var result = await wallet.signAndSendTransactions({
        transactions: params.transactions,
    });

    return result;
}

async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "b", method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        var json = await res.json();
        if (json.error) return 0;
        var y = BigInt((json.result && json.result.amount) || "0");
        var ONE = 10n ** 24n;
        return Number((y / ONE).toString() + "." + (y % ONE).toString().padStart(24, "0").slice(0, 6));
    } catch (e) { return 0; }
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
    signAndSendTransactions,
    fetchBalance,
};