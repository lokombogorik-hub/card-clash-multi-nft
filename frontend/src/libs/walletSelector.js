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

    console.log("[HOT] module keys:", Object.keys(mod).join(", "));

    // Ищем все возможные экспорты
    var HereWallet = mod.HereWallet || mod.default;
    var HereStrategy = mod.HereStrategy || null;
    var TelegramStrategy = mod.TelegramStrategy || null;

    console.log("[HOT] HereWallet:", typeof HereWallet);
    console.log("[HOT] HereStrategy:", typeof HereStrategy);
    console.log("[HOT] TelegramStrategy:", typeof TelegramStrategy);

    if (!HereWallet) {
        throw new Error("HereWallet class not found");
    }

    // Логируем доступные методы
    if (typeof HereWallet === "function") {
        var staticKeys = Object.getOwnPropertyNames(HereWallet).filter(function (k) {
            return typeof HereWallet[k] === "function" && k !== "constructor";
        });
        console.log("[HOT] static methods:", staticKeys.join(", "));
    }

    // Способ 1: HereWallet.connect() (v3+)
    if (typeof HereWallet.connect === "function") {
        console.log("[HOT] Using HereWallet.connect()...");
        try {
            wallet = await HereWallet.connect({
                networkId: networkId,
                botId: "herewalletbot/app",
            });
            console.log("[HOT] connect() OK");
            return wallet;
        } catch (e) {
            console.warn("[HOT] connect() failed:", e.message);
            // Продолжаем к другим способам
        }
    }

    // Способ 2: new HereWallet() с strategy
    if (TelegramStrategy && typeof TelegramStrategy === "function") {
        console.log("[HOT] Using new HereWallet + TelegramStrategy...");
        try {
            var strategy = new TelegramStrategy({
                botId: "herewalletbot/app",
            });
            wallet = new HereWallet({
                networkId: networkId,
                strategy: strategy,
            });
            console.log("[HOT] TelegramStrategy OK");
            return wallet;
        } catch (e) {
            console.warn("[HOT] TelegramStrategy failed:", e.message);
        }
    }

    // Способ 3: new HereWallet() с HereStrategy
    if (HereStrategy && typeof HereStrategy === "function") {
        console.log("[HOT] Using new HereWallet + HereStrategy...");
        try {
            var hStrategy = new HereStrategy({
                botId: "herewalletbot/app",
                widget: true,
            });
            wallet = new HereWallet({
                networkId: networkId,
                strategy: hStrategy,
            });
            console.log("[HOT] HereStrategy OK");
            return wallet;
        } catch (e) {
            console.warn("[HOT] HereStrategy failed:", e.message);
        }
    }

    // Способ 4: new HereWallet() без параметров
    console.log("[HOT] Using new HereWallet() bare...");
    try {
        wallet = new HereWallet();
        console.log("[HOT] bare OK");
        return wallet;
    } catch (e) {
        console.warn("[HOT] bare failed:", e.message);
    }

    // Способ 5: Пробуем создать через Object.create (обход конструктора)
    console.log("[HOT] Trying Object.create workaround...");
    try {
        wallet = Object.create(HereWallet.prototype);
        if (wallet.signIn) {
            console.log("[HOT] Object.create OK, has signIn");
            return wallet;
        }
    } catch (e) {
        console.warn("[HOT] Object.create failed:", e.message);
    }

    throw new Error("All HereWallet initialization methods failed");
}

async function connectWallet() {
    var w = await getWallet();

    console.log("[HOT] wallet keys:", Object.keys(w).join(", "));
    console.log("[HOT] wallet proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(w)).join(", "));

    var accountId = "";

    // Метод 1: signIn
    if (typeof w.signIn === "function") {
        console.log("[HOT] calling signIn...");
        try {
            var result = await w.signIn({ contractId: "" });
            console.log("[HOT] signIn result:", typeof result, result);
            accountId = extractAccountId(result);
        } catch (e) {
            console.warn("[HOT] signIn failed:", e.message);
        }
    }

    // Метод 2: requestSignIn
    if (!accountId && typeof w.requestSignIn === "function") {
        console.log("[HOT] calling requestSignIn...");
        try {
            var result2 = await w.requestSignIn({ contractId: "" });
            console.log("[HOT] requestSignIn result:", typeof result2, result2);
            accountId = extractAccountId(result2);
        } catch (e) {
            console.warn("[HOT] requestSignIn failed:", e.message);
        }
    }

    // Метод 3: authenticate
    if (!accountId && typeof w.authenticate === "function") {
        console.log("[HOT] calling authenticate...");
        try {
            var result3 = await w.authenticate();
            console.log("[HOT] authenticate result:", typeof result3, result3);
            accountId = extractAccountId(result3);
        } catch (e) {
            console.warn("[HOT] authenticate failed:", e.message);
        }
    }

    // Метод 4: getAccountId
    if (!accountId && w.getAccountId) {
        console.log("[HOT] calling getAccountId...");
        try {
            var gId = w.getAccountId();
            if (gId && typeof gId.then === "function") gId = await gId;
            if (gId) accountId = String(gId);
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e.message);
        }
    }

    accountId = String(accountId || "").trim();

    if (!accountId) {
        throw new Error("HOT Wallet did not return an account ID. Check console for details.");
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
        if (first && first.account_id) return first.account_id;
    }
    return "";
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
    if (currentAccountId) return currentAccountId;

    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
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