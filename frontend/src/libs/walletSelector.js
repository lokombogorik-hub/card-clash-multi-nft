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

    console.log("[HOT] module exports:", Object.keys(mod).join(", "));

    var HereWallet = mod.HereWallet || mod.default;

    if (!HereWallet) {
        throw new Error("HereWallet not found in module");
    }

    // v2.x — конструктор принимает объект с keyStore и network
    var nearApi = await import("near-api-js");
    var keyStore = new nearApi.keyStores.BrowserLocalStorageKeyStore(
        window.localStorage,
        "cardclash_ks"
    );

    var nearConfig = {
        networkId: networkId,
        nodeUrl: RPC_URL,
        keyStore: keyStore,
    };

    var near = await nearApi.connect(nearConfig);

    wallet = new HereWallet({
        near: near,
        keyStore: keyStore,
        networkId: networkId,
    });

    console.log("[HOT] wallet created, methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)).join(", "));

    return wallet;
}

async function connectWallet() {
    var w = await getWallet();

    console.log("[HOT] calling signIn...");

    var accountId = await w.signIn({
        contractId: "",
    });

    console.log("[HOT] signIn returned:", accountId, typeof accountId);

    // Обрабатываем разные форматы ответа
    if (!accountId || accountId === "undefined") {
        // Пробуем получить через getAccountId
        try {
            accountId = w.getAccountId ? w.getAccountId() : "";
            if (accountId && typeof accountId.then === "function") {
                accountId = await accountId;
            }
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e.message);
        }
    }

    if (typeof accountId === "object" && accountId !== null) {
        if (accountId.accountId) accountId = accountId.accountId;
        else if (Array.isArray(accountId) && accountId.length > 0) {
            accountId = accountId[0].accountId || String(accountId[0]);
        }
    }

    accountId = String(accountId || "").trim();

    if (!accountId) {
        throw new Error("Wallet did not return account ID");
    }

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    console.log("[HOT] connected:", accountId);

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