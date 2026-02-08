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

async function getWallet() {
    if (wallet) return wallet;

    var mod = await import("@here-wallet/core");

    console.log("[HOT] v1.6.6 module keys:", Object.keys(mod).join(", "));

    // v1.6.x экспортирует HereWallet как default или named
    var HereWallet = mod.HereWallet || mod.default || mod.HereProvider || null;

    if (!HereWallet) {
        // Пробуем все экспорты
        var keys = Object.keys(mod);
        for (var i = 0; i < keys.length; i++) {
            var val = mod[keys[i]];
            if (typeof val === "function" && val.prototype) {
                var protoKeys = Object.getOwnPropertyNames(val.prototype);
                if (protoKeys.indexOf("signIn") !== -1 || protoKeys.indexOf("requestSignIn") !== -1) {
                    HereWallet = val;
                    console.log("[HOT] Found wallet class at key:", keys[i]);
                    break;
                }
            }
        }
    }

    if (!HereWallet) {
        throw new Error(
            "HereWallet class not found in v1.6.6. Available exports: " +
            Object.keys(mod).join(", ")
        );
    }

    console.log("[HOT] HereWallet type:", typeof HereWallet);

    // Проверяем доступные методы
    if (typeof HereWallet === "function") {
        if (HereWallet.prototype) {
            console.log("[HOT] prototype methods:", Object.getOwnPropertyNames(HereWallet.prototype).join(", "));
        }
        var staticKeys = [];
        for (var k in HereWallet) {
            if (typeof HereWallet[k] === "function") staticKeys.push(k);
        }
        if (staticKeys.length) {
            console.log("[HOT] static methods:", staticKeys.join(", "));
        }
    }

    // Пробуем инициализировать
    // Способ 1: new HereWallet() — v1.x стиль
    try {
        console.log("[HOT] Trying: new HereWallet()");
        wallet = new HereWallet();
        console.log("[HOT] new HereWallet() OK");
        console.log("[HOT] wallet instance keys:", Object.keys(wallet).join(", "));
        console.log("[HOT] wallet proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)).join(", "));
        return wallet;
    } catch (e) {
        console.warn("[HOT] new HereWallet() failed:", e.message);
    }

    // Способ 2: new HereWallet({ networkId })
    try {
        console.log("[HOT] Trying: new HereWallet({ networkId })");
        wallet = new HereWallet({ networkId: networkId });
        console.log("[HOT] with networkId OK");
        return wallet;
    } catch (e) {
        console.warn("[HOT] with networkId failed:", e.message);
    }

    // Способ 3: HereWallet.connect() если есть
    if (typeof HereWallet.connect === "function") {
        try {
            console.log("[HOT] Trying: HereWallet.connect()");
            wallet = await HereWallet.connect();
            console.log("[HOT] connect() OK");
            return wallet;
        } catch (e) {
            console.warn("[HOT] connect() failed:", e.message);
        }
    }

    // Способ 4: HereWallet.setup() если есть
    if (typeof HereWallet.setup === "function") {
        try {
            console.log("[HOT] Trying: HereWallet.setup()");
            wallet = await HereWallet.setup();
            console.log("[HOT] setup() OK");
            return wallet;
        } catch (e) {
            console.warn("[HOT] setup() failed:", e.message);
        }
    }

    throw new Error("All HereWallet init methods failed for v1.6.6");
}

async function connectWallet() {
    var w = await getWallet();

    console.log("[HOT] Starting connection...");

    var accountId = "";

    // Пробуем все методы подключения по порядку
    var methods = ["signIn", "requestSignIn", "login", "connect", "authenticate"];

    for (var i = 0; i < methods.length; i++) {
        var methodName = methods[i];
        if (typeof w[methodName] !== "function") continue;

        console.log("[HOT] Trying w." + methodName + "()...");

        try {
            var result = await w[methodName]({ contractId: "" });
            console.log("[HOT] " + methodName + " result:", typeof result, JSON.stringify(result).substring(0, 200));

            accountId = extractAccountId(result);
            if (accountId) break;
        } catch (e) {
            console.warn("[HOT] " + methodName + " failed:", e.message);
        }
    }

    // Fallback: getAccountId
    if (!accountId) {
        try {
            var gId = w.getAccountId ? w.getAccountId() : null;
            if (gId && typeof gId.then === "function") gId = await gId;
            if (gId) accountId = String(gId);
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e.message);
        }
    }

    // Fallback: accountId property
    if (!accountId && w.accountId) {
        accountId = String(w.accountId);
    }

    accountId = String(accountId || "").trim();

    if (!accountId) {
        throw new Error("HOT Wallet did not return account ID. Check console for details.");
    }

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    console.log("[HOT] Connected:", accountId);

    return { accountId: accountId };
}

function extractAccountId(result) {
    if (!result) return "";
    if (typeof result === "string") return result;
    if (result.accountId) return result.accountId;
    if (result.account_id) return result.account_id;
    if (Array.isArray(result) && result.length > 0) {
        var first = result[0];
        if (typeof first === "string") return first;
        if (first && first.accountId) return first.accountId;
    }
    return "";
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

    try {
        var w = await getWallet();
        var id = w.getAccountId ? w.getAccountId() : "";
        if (id && typeof id.then === "function") id = await id;
        if (id) {
            currentAccountId = String(id);
            localStorage.setItem(STORAGE_KEY, currentAccountId);
            return currentAccountId;
        }
    } catch (e) { }

    return "";
}

async function signAndSendTransaction(params) {
    var w = await getWallet();
    if (!w) throw new Error("Wallet not initialized");

    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Not connected");

    return await w.signAndSendTransaction({
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