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

    var mod = await import("@here-wallet/core");

    console.log("[HOT] Module keys:", Object.keys(mod));

    var HereWallet = mod.HereWallet || mod.default;

    if (!HereWallet) {
        throw new Error("HereWallet not found. Module keys: " + Object.keys(mod).join(", "));
    }

    console.log("[HOT] HereWallet type:", typeof HereWallet);
    console.log("[HOT] HereWallet.connect:", typeof HereWallet.connect);
    console.log("[HOT] Is Telegram:", isTelegramWebApp());

    // v3 использует HereWallet.connect() — статический async метод
    if (typeof HereWallet.connect === "function") {
        console.log("[HOT] Using HereWallet.connect()");
        wallet = await HereWallet.connect({
            networkId: networkId,
            botId: "herewalletbot/app",
        });
    }
    // v2 fallback — new HereWallet()
    else if (typeof HereWallet === "function") {
        console.log("[HOT] Using new HereWallet()");
        wallet = new HereWallet({
            networkId: networkId,
        });
    }
    else {
        throw new Error("Cannot initialize HereWallet. Type: " + typeof HereWallet);
    }

    console.log("[HOT] Wallet initialized:", wallet);
    console.log("[HOT] Wallet methods:", Object.keys(wallet));

    return wallet;
}

async function connectWallet() {
    var w = await getWallet();

    console.log("[HOT] Starting signIn...");

    var result;

    // Пробуем разные варианты signIn
    try {
        result = await w.signIn({
            contractId: "",
            allowance: "0",
        });
    } catch (e1) {
        console.warn("[HOT] signIn with contractId failed:", e1.message);
        try {
            result = await w.signIn({});
        } catch (e2) {
            console.warn("[HOT] signIn empty failed:", e2.message);
            try {
                result = await w.signIn();
            } catch (e3) {
                throw new Error("All signIn attempts failed: " + e3.message);
            }
        }
    }

    console.log("[HOT] signIn result:", result, typeof result);

    var accountId = "";

    // result может быть: строка, объект, массив
    if (typeof result === "string") {
        accountId = result;
    } else if (result && typeof result === "object") {
        if (result.accountId) {
            accountId = result.accountId;
        } else if (Array.isArray(result) && result.length > 0) {
            accountId = result[0].accountId || String(result[0]);
        }
    }

    // Если пусто — пробуем getAccountId
    if (!accountId && w.getAccountId) {
        try {
            var wId = w.getAccountId();
            if (wId && typeof wId.then === "function") wId = await wId;
            accountId = String(wId || "");
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e);
        }
    }

    // Ещё попытка — account()
    if (!accountId && w.account) {
        try {
            var acc = w.account();
            if (acc && typeof acc.then === "function") acc = await acc;
            if (acc && acc.accountId) accountId = acc.accountId;
        } catch (e) {
            console.warn("[HOT] account() failed:", e);
        }
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
    if (currentAccountId) return currentAccountId;

    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;

        // Пробуем восстановить wallet
        try {
            await getWallet();
        } catch (e) {
            console.warn("[HOT] restore wallet failed:", e);
        }

        return currentAccountId;
    }

    // Пробуем через wallet
    try {
        var w = await getWallet();
        var wId = "";

        if (w.getAccountId) {
            wId = w.getAccountId();
            if (wId && typeof wId.then === "function") wId = await wId;
        }

        if (wId) {
            currentAccountId = String(wId);
            localStorage.setItem(STORAGE_KEY, currentAccountId);
            return currentAccountId;
        }
    } catch (e) {
        // ignore
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