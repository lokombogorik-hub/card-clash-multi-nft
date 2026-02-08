var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";

async function connectWallet() {
    // Шаг 1: Собираем диагностику
    var diag = {
        hasTelegram: !!(window.Telegram),
        hasWebApp: !!(window.Telegram && window.Telegram.WebApp),
        hasInitData: !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData),
        initDataLength: 0,
        hasWindowNear: !!(window.near),
        hasWindowHere: !!(window.here),
        hasWindowHereWallet: !!(window.hereWallet),
        windowNearType: typeof window.near,
        windowHereType: typeof window.here,
        userAgent: navigator.userAgent.substring(0, 100),
    };

    try {
        diag.initDataLength = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
            ? window.Telegram.WebApp.initData.length
            : 0;
    } catch (e) { /* ignore */ }

    // Проверяем все window свойства связанные с wallet
    var walletKeys = [];
    try {
        for (var key in window) {
            var k = key.toLowerCase();
            if (k.indexOf("near") !== -1 || k.indexOf("here") !== -1 || k.indexOf("wallet") !== -1 || k.indexOf("hot") !== -1) {
                walletKeys.push(key + ":" + typeof window[key]);
            }
        }
    } catch (e) { /* ignore */ }
    diag.walletWindowKeys = walletKeys.join(", ") || "none";

    console.log("[DIAG] Full diagnostics:", JSON.stringify(diag, null, 2));

    // Шаг 2: Пробуем window.near (injected)
    if (window.near && typeof window.near.requestSignIn === "function") {
        console.log("[DIAG] Found window.near with requestSignIn");
        try {
            var result = await window.near.requestSignIn({ contractId: "" });
            var accountId = "";
            if (typeof result === "string") accountId = result;
            else if (result && result.accountId) accountId = result.accountId;

            if (accountId) {
                currentAccountId = accountId;
                localStorage.setItem(STORAGE_KEY, accountId);
                return { accountId: accountId };
            }
        } catch (e) {
            console.warn("[DIAG] window.near.requestSignIn failed:", e.message);
        }
    }

    // Шаг 3: Пробуем window.here
    if (window.here) {
        console.log("[DIAG] Found window.here:", typeof window.here);
        console.log("[DIAG] window.here keys:", Object.keys(window.here).join(", "));
    }

    // Шаг 4: Пробуем @here-wallet/core
    console.log("[DIAG] Trying @here-wallet/core import...");
    try {
        var mod = await import("@here-wallet/core");
        console.log("[DIAG] @here-wallet/core keys:", Object.keys(mod).join(", "));

        var HW = mod.HereWallet || mod.default;
        console.log("[DIAG] HereWallet type:", typeof HW);

        if (HW) {
            var hwMethods = [];
            for (var m in HW) { hwMethods.push(m); }
            console.log("[DIAG] HereWallet static methods:", hwMethods.join(", "));

            if (HW.prototype) {
                var protoMethods = Object.getOwnPropertyNames(HW.prototype);
                console.log("[DIAG] HereWallet prototype:", protoMethods.join(", "));
            }
        }
    } catch (e) {
        console.error("[DIAG] @here-wallet/core import failed:", e.message);
    }

    // Бросаем ошибку с диагностикой чтобы увидеть на экране
    throw new Error(
        "DIAGNOSTICS (не ошибка, это инфо):\n" +
        JSON.stringify(diag, null, 2)
    );
}

async function disconnectWallet() {
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
}

async function getSignedInAccountId() {
    if (currentAccountId) return currentAccountId;
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
    }
    return "";
}

async function signAndSendTransaction(params) {
    throw new Error("signAndSendTransaction not yet implemented in diagnostic mode");
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};