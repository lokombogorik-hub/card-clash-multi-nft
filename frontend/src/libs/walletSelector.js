var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var connector = null;
var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";

async function getConnector() {
    if (connector) return connector;

    var mod = await import("@here-wallet/connect");

    console.log("[HOT] @here-wallet/connect keys:", Object.keys(mod).join(", "));

    // Пробуем разные экспорты
    var HereConnect = mod.HereConnect || mod.HereWallet || mod.HereProvider || mod.default || null;

    if (!HereConnect) {
        // Ищем любой класс/функцию
        var keys = Object.keys(mod);
        for (var i = 0; i < keys.length; i++) {
            if (typeof mod[keys[i]] === "function") {
                HereConnect = mod[keys[i]];
                console.log("[HOT] Using export:", keys[i]);
                break;
            }
        }
    }

    if (!HereConnect) {
        throw new Error("No connect class found. Exports: " + Object.keys(mod).join(", "));
    }

    console.log("[HOT] HereConnect type:", typeof HereConnect);
    console.log("[HOT] HereConnect name:", HereConnect.name || "anonymous");

    // Пробуем инициализировать
    // Способ 1: статический connect/create
    if (typeof HereConnect.connect === "function") {
        console.log("[HOT] Using HereConnect.connect()");
        connector = await HereConnect.connect({ networkId: networkId });
        return connector;
    }

    if (typeof HereConnect.create === "function") {
        console.log("[HOT] Using HereConnect.create()");
        connector = await HereConnect.create({ networkId: networkId });
        return connector;
    }

    if (typeof HereConnect.setup === "function") {
        console.log("[HOT] Using HereConnect.setup()");
        connector = await HereConnect.setup({ networkId: networkId });
        return connector;
    }

    // Способ 2: new
    console.log("[HOT] Using new HereConnect()");
    connector = new HereConnect({ networkId: networkId });

    if (connector.init && typeof connector.init === "function") {
        await connector.init();
    }

    console.log("[HOT] Connector created OK");
    console.log("[HOT] Connector methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(connector)).join(", "));

    return connector;
}

async function connectWallet() {
    var c = await getConnector();

    console.log("[HOT] Starting connect...");

    var accountId = "";

    // Пробуем все варианты подключения
    var methods = ["signIn", "requestSignIn", "connect", "login", "authenticate", "authorize"];

    for (var i = 0; i < methods.length; i++) {
        var m = methods[i];
        if (typeof c[m] !== "function") continue;

        console.log("[HOT] Trying c." + m + "()...");
        try {
            var result = await c[m]({});
            console.log("[HOT] " + m + " result:", typeof result, result);

            if (typeof result === "string") accountId = result;
            else if (result && result.accountId) accountId = result.accountId;
            else if (result && result.account_id) accountId = result.account_id;
            else if (Array.isArray(result) && result.length > 0) {
                accountId = result[0].accountId || result[0].account_id || String(result[0]);
            }

            if (accountId) break;
        } catch (e) {
            console.warn("[HOT] " + m + " failed:", e.message);
        }
    }

    // Fallback: getAccountId
    if (!accountId && c.getAccountId) {
        try {
            var gid = c.getAccountId();
            if (gid && typeof gid.then === "function") gid = await gid;
            if (gid) accountId = String(gid);
        } catch (e) { }
    }

    // Fallback: accountId property
    if (!accountId && c.accountId) accountId = String(c.accountId);

    accountId = String(accountId || "").trim();

    if (!accountId) {
        throw new Error("Wallet did not return account. DIAG: connector methods = " +
            Object.getOwnPropertyNames(Object.getPrototypeOf(c)).join(", "));
    }

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    console.log("[HOT] Connected:", accountId);

    return { accountId: accountId };
}

async function disconnectWallet() {
    try {
        if (connector) {
            if (connector.signOut) await connector.signOut();
            else if (connector.disconnect) await connector.disconnect();
            else if (connector.logout) await connector.logout();
        }
    } catch (e) { }
    connector = null;
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

    // Пробуем через connector
    try {
        var c = await getConnector();
        if (c.getAccountId) {
            var id = c.getAccountId();
            if (id && typeof id.then === "function") id = await id;
            if (id) {
                currentAccountId = String(id);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
                return currentAccountId;
            }
        }
        if (c.isSignedIn && (await c.isSignedIn())) {
            if (c.accountId) {
                currentAccountId = String(c.accountId);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
                return currentAccountId;
            }
        }
    } catch (e) { }

    return "";
}

async function signAndSendTransaction(params) {
    var c = await getConnector();
    if (!c) throw new Error("Wallet not initialized");

    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Not connected");

    if (c.signAndSendTransaction) {
        return await c.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions,
        });
    }

    throw new Error("signAndSendTransaction not available");
}

async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "b", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId }
            }),
        });
        var json = await res.json();
        if (json.error) return 0;
        var y = BigInt((json.result && json.result.amount) || "0");
        var b = 10n ** 24n;
        return Number((y / b).toString() + "." + (y % b).toString().padStart(24, "0").slice(0, 6));
    } catch (e) { return 0; }
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
    fetchBalance,
};