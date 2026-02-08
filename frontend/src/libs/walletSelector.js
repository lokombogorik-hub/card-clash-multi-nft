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

async function verifyAccount(accountId) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: "v", method: "query",
            params: { request_type: "view_account", finality: "final", account_id: accountId },
        }),
    });
    var json = await res.json();
    return !json.error;
}

async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "b", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId },
            }),
        });
        var json = await res.json();
        if (json.error) return 0;
        var amount = (json.result && json.result.amount) || "0";
        var yocto = BigInt(amount);
        var base = 10n ** 24n;
        var whole = yocto / base;
        var frac = (yocto % base).toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + frac);
    } catch (e) {
        return 0;
    }
}

function scanLocalStorageForHereWallet() {
    // HOT Wallet / HERE Wallet пишет данные в localStorage
    // Ищем ключи содержащие account info
    var found = "";
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key) continue;
            var kl = key.toLowerCase();

            // HERE Wallet хранит аккаунт в разных ключах
            if (kl.indexOf("herewallet") !== -1 ||
                kl.indexOf("here_wallet") !== -1 ||
                kl.indexOf("hot_wallet") !== -1 ||
                kl.indexOf("near_app_wallet_auth_key") !== -1 ||
                kl.indexOf("wallet_auth_key") !== -1) {

                try {
                    var val = localStorage.getItem(key);
                    if (!val) continue;

                    // Пробуем распарсить JSON
                    var parsed = JSON.parse(val);

                    // Ищем accountId в разных форматах
                    var accId = parsed.accountId || parsed.account_id || parsed.nearAccountId || "";

                    if (!accId && Array.isArray(parsed)) {
                        for (var j = 0; j < parsed.length; j++) {
                            if (parsed[j] && parsed[j].accountId) {
                                accId = parsed[j].accountId;
                                break;
                            }
                        }
                    }

                    if (!accId && typeof parsed === "string" && parsed.indexOf(".") !== -1) {
                        accId = parsed;
                    }

                    if (accId && accId.length >= 2 && accId.length <= 64) {
                        console.log("[Wallet] Found account in localStorage key:", key, "->", accId);
                        found = accId;
                        break;
                    }
                } catch (e) {
                    // Не JSON — пробуем как строку
                    var raw = localStorage.getItem(key);
                    if (raw && raw.indexOf(".near") !== -1) {
                        found = raw.trim();
                        break;
                    }
                    if (raw && raw.indexOf(".tg") !== -1) {
                        found = raw.trim();
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[Wallet] localStorage scan error:", e);
    }
    return found;
}

async function connectWithAccountId(accountId) {
    accountId = String(accountId || "").trim().toLowerCase();
    if (!accountId) throw new Error("Enter your account ID");
    if (accountId.length < 2 || accountId.length > 64) throw new Error("Invalid account ID");

    var exists = await verifyAccount(accountId);
    if (!exists) throw new Error("Account '" + accountId + "' not found on NEAR " + networkId);

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    return { accountId: accountId };
}

async function tryAutoConnect() {
    // 1. Проверяем наш собственный storage
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
    }

    // 2. Сканируем localStorage на данные от HERE Wallet
    var scanned = scanLocalStorageForHereWallet();
    if (scanned) {
        var valid = await verifyAccount(scanned);
        if (valid) {
            currentAccountId = scanned;
            localStorage.setItem(STORAGE_KEY, scanned);
            console.log("[Wallet] Auto-connected from HERE Wallet data:", scanned);
            return scanned;
        }
    }

    return "";
}

async function disconnectWallet() {
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
}

async function getSignedInAccountId() {
    if (currentAccountId) return currentAccountId;
    return await tryAutoConnect();
}

async function signAndSendTransaction() {
    throw new Error("Transaction signing coming in Stage 2");
}

export {
    networkId,
    RPC_URL,
    connectWithAccountId,
    tryAutoConnect,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
    verifyAccount,
    fetchBalance,
};