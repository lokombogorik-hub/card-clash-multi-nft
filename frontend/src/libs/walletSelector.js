var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
var HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

var wallet = null;
var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";

// Диагностика на экран
var diagLog = [];
function diag(msg) {
    diagLog.push("[" + new Date().toISOString().substr(11, 8) + "] " + msg);
    console.log("[HOT]", msg);
}

function getDiagLog() {
    return diagLog.slice(-20).join("\n");
}

async function connectWallet() {
    diagLog = [];
    diag("Starting connect...");
    diag("networkId: " + networkId);
    diag("HOT_WALLET_ID: " + HOT_WALLET_ID);
    diag("TG_BOT_ID: " + TG_BOT_ID);

    var isTg = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
    diag("isTelegram: " + isTg);
    diag("platform: " + (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform || "unknown"));

    // Шаг 1: Импорт модуля
    diag("Step 1: importing @here-wallet/core...");
    var mod;
    try {
        mod = await import("@here-wallet/core");
        diag("Import OK. Keys: " + Object.keys(mod).join(", "));
    } catch (e) {
        diag("Import FAILED: " + e.message);
        throw new Error("Import failed: " + e.message + "\n\nDIAG:\n" + getDiagLog());
    }

    var HereWallet = mod.HereWallet || mod.default;
    diag("HereWallet: " + typeof HereWallet);

    if (!HereWallet) {
        throw new Error("HereWallet not found\n\nDIAG:\n" + getDiagLog());
    }

    // Шаг 2: connect
    diag("Step 2: HereWallet.connect()...");
    try {
        wallet = await HereWallet.connect({
            networkId: networkId,
            walletId: HOT_WALLET_ID,
            telegramBotId: TG_BOT_ID,
            rpcUrl: RPC_URL,
            openUrl: function (url) {
                diag("openUrl called: " + url.substring(0, 80) + "...");
                try {
                    if (isTg && window.Telegram.WebApp.openTelegramLink) {
                        window.Telegram.WebApp.openTelegramLink(url);
                        diag("openTelegramLink OK");
                    } else if (isTg && window.Telegram.WebApp.openLink) {
                        window.Telegram.WebApp.openLink(url);
                        diag("openLink OK");
                    } else {
                        window.open(url, "_blank");
                        diag("window.open OK");
                    }
                } catch (e2) {
                    diag("openUrl error: " + e2.message);
                    window.open(url, "_blank");
                }
            },
        });
        diag("connect() OK");
    } catch (e) {
        diag("connect() FAILED: " + e.message);
        throw new Error("connect() failed: " + e.message + "\n\nDIAG:\n" + getDiagLog());
    }

    // Шаг 3: Проверяем уже авторизован
    diag("Step 3: checking existing session...");
    var existingId = "";
    try {
        if (wallet.getAccountId) {
            existingId = await wallet.getAccountId();
            diag("getAccountId: " + existingId);
        }
    } catch (e) {
        diag("getAccountId error: " + e.message);
    }

    if (existingId) {
        currentAccountId = String(existingId);
        localStorage.setItem(STORAGE_KEY, currentAccountId);
        return { accountId: currentAccountId };
    }

    // Шаг 4: signIn
    diag("Step 4: calling signIn...");
    var signInResult = null;
    try {
        signInResult = await wallet.signIn({
            contractId: (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim() || undefined,
        });
        diag("signIn result: " + typeof signInResult + " = " + JSON.stringify(signInResult).substring(0, 100));
    } catch (e) {
        diag("signIn error: " + e.message);
        // Не бросаем — может юзер ещё не подтвердил
    }

    // Шаг 5: Извлекаем accountId
    var accountId = "";
    if (typeof signInResult === "string") {
        accountId = signInResult;
    } else if (signInResult && typeof signInResult === "object") {
        accountId = signInResult.accountId || signInResult.account_id || "";
    }

    if (!accountId) {
        try {
            if (wallet.getAccountId) {
                accountId = await wallet.getAccountId();
                diag("post-signIn getAccountId: " + accountId);
            }
        } catch (e) {
            diag("post-signIn getAccountId error: " + e.message);
        }
    }

    accountId = String(accountId || "").trim();
    diag("Final accountId: " + (accountId || "(empty)"));

    if (accountId) {
        currentAccountId = accountId;
        localStorage.setItem(STORAGE_KEY, accountId);
    }

    // Возвращаем что есть — polling в walletStore доберёт
    return { accountId: accountId, _diag: getDiagLog() };
}

async function disconnectWallet() {
    try {
        if (wallet && wallet.signOut) await wallet.signOut();
    } catch (e) { }
    wallet = null;
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

    if (wallet && wallet.getAccountId) {
        try {
            var id = await wallet.getAccountId();
            if (id) {
                currentAccountId = String(id);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
                return currentAccountId;
            }
        } catch (e) { }
    }

    return "";
}

async function signAndSendTransaction(params) {
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
    getDiagLog,
};