/**
 * HOT Wallet через @here-wallet/core
 * 
 * В Telegram WebApp: виджет открывается ПОВЕРХ игры (не закрывает)
 * На десктопе: QR код или redirect
 */

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

function isTelegramWebApp() {
    try {
        return !!(
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData &&
            window.Telegram.WebApp.initData.length > 0
        );
    } catch (e) {
        return false;
    }
}

async function getWallet() {
    if (wallet) return wallet;

    var HereWalletModule = await import("@here-wallet/core");
    var HereWallet = HereWalletModule.HereWallet || HereWalletModule.default;

    if (!HereWallet) {
        throw new Error("HereWallet not found in @here-wallet/core. Keys: " + Object.keys(HereWalletModule).join(", "));
    }

    if (isTelegramWebApp()) {
        console.log("[HOT] Telegram WebApp detected, using widget strategy");

        // В Telegram — кошелёк откроется как виджет ПОВЕРХ приложения
        try {
            wallet = new HereWallet({
                networkId: networkId,
                // defaultStrategy будет TelegramStrategy в Telegram WebApp
            });
        } catch (e) {
            console.warn("[HOT] HereWallet constructor failed:", e);
            wallet = new HereWallet();
        }
    } else {
        console.log("[HOT] Desktop/browser detected");
        wallet = new HereWallet({
            networkId: networkId,
        });
    }

    return wallet;
}

async function connectWallet() {
    var w = await getWallet();

    console.log("[HOT] Starting signIn...");

    // signIn возвращает accountId напрямую
    var accountId = await w.signIn({
        contractId: "",
        allowance: "0",
    });

    // accountId может быть строка или объект
    if (typeof accountId === "object" && accountId !== null) {
        if (accountId.accountId) {
            accountId = accountId.accountId;
        } else if (Array.isArray(accountId) && accountId.length > 0) {
            accountId = accountId[0].accountId || accountId[0];
        }
    }

    // Если пусто — пробуем getAccountId
    if (!accountId) {
        try {
            accountId = w.getAccountId ? w.getAccountId() : "";
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e);
        }
    }

    // Если promise
    if (accountId && typeof accountId.then === "function") {
        accountId = await accountId;
    }

    accountId = String(accountId || "").trim();

    if (!accountId) {
        throw new Error("HOT Wallet did not return an account ID");
    }

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    console.log("[HOT] Connected:", accountId);

    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        if (wallet && wallet.signOut) {
            await wallet.signOut();
        }
    } catch (e) {
        console.warn("[HOT] signOut error:", e);
    }
    wallet = null;
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
}

async function getSignedInAccountId() {
    // Сначала проверяем memory
    if (currentAccountId) return currentAccountId;

    // Потом localStorage
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;

        // Пробуем восстановить wallet instance
        try {
            var w = await getWallet();
            var wId = "";
            try {
                wId = w.getAccountId ? w.getAccountId() : "";
                if (wId && typeof wId.then === "function") wId = await wId;
            } catch (e) {
                // ignore
            }

            if (wId) {
                currentAccountId = String(wId);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
            }
        } catch (e) {
            // Wallet не инициализирован — ок, используем saved
        }

        return currentAccountId;
    }

    return "";
}

async function signAndSendTransaction(params) {
    var w = await getWallet();
    if (!w) throw new Error("Wallet not initialized");

    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Not connected");

    var result = await w.signAndSendTransaction({
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