// frontend/src/libs/walletSelector.js
// HOT Wallet через near-api-js WalletConnection + @here-wallet/connect monkey-patch

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

// near-api-js objects (lazy init)
var nearConnection = null;
var walletConnection = null;
var patchCleanup = null;

/**
 * Initialize near-api-js + HERE wallet patch
 * Делаем lazy чтобы избежать circular dep при старте
 */
async function initNear() {
    if (walletConnection) return walletConnection;

    // 1) Import near-api-js
    var NEAR = await import("near-api-js");
    console.log("[NEAR] near-api-js loaded, keys:", Object.keys(NEAR).join(", "));

    // 2) Apply HERE wallet monkey-patch BEFORE creating WalletConnection
    var runHereWallet;
    try {
        var hotModule = await import("@here-wallet/connect");
        runHereWallet = hotModule.default || hotModule;
        console.log("[HOT] @here-wallet/connect loaded");
    } catch (e) {
        console.warn("[HOT] Failed to load @here-wallet/connect:", e.message);
    }

    if (typeof runHereWallet === "function") {
        try {
            patchCleanup = runHereWallet({
                near: NEAR,
                onlyHere: true,
            });
            console.log("[HOT] Monkey-patch applied");
        } catch (e) {
            console.warn("[HOT] Patch failed:", e.message);
        }
    }

    // 3) Create NEAR connection
    var keyStore = new NEAR.keyStores.BrowserLocalStorageKeyStore(
        window.localStorage,
        "cardclash_near_"
    );

    var nearConfig = {
        networkId: networkId,
        keyStore: keyStore,
        nodeUrl: RPC_URL,
        walletUrl:
            networkId === "testnet"
                ? "https://testnet.mynearwallet.com"
                : "https://app.mynearwallet.com",
        helperUrl:
            networkId === "testnet"
                ? "https://helper.testnet.near.org"
                : "https://helper.near.org",
    };

    nearConnection = await NEAR.connect(nearConfig);
    console.log("[NEAR] Connected to", networkId);

    // 4) Create WalletConnection
    // The HERE patch will intercept requestSignIn and redirect to HERE wallet
    walletConnection = new NEAR.WalletConnection(nearConnection, "cardclash");
    console.log("[NEAR] WalletConnection created");

    return walletConnection;
}

/**
 * Connect wallet — opens HERE wallet for sign-in
 */
async function connectWallet() {
    var wc = await initNear();

    // Check if already signed in
    if (wc.isSignedIn()) {
        var id = wc.getAccountId();
        console.log("[NEAR] Already signed in:", id);
        localStorage.setItem(STORAGE_KEY, id);
        return { accountId: id };
    }

    // requestSignIn will be intercepted by HERE wallet patch
    // It redirects to HERE wallet web app which handles auth
    // After auth, user is redirected back with auth data in URL
    console.log("[NEAR] Requesting sign in via HERE wallet...");

    await wc.requestSignIn({
        // contractId is optional — if empty, full access key requested
        // For view-only connection, leave empty
    });

    // This line may not execute if page redirects
    var accountId = wc.getAccountId();
    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
    }

    return { accountId: accountId || "" };
}

/**
 * Disconnect wallet
 */
async function disconnectWallet() {
    try {
        if (walletConnection && walletConnection.isSignedIn()) {
            walletConnection.signOut();
        }
    } catch (e) {
        console.warn("[NEAR] signOut error:", e.message);
    }

    walletConnection = null;
    nearConnection = null;

    if (patchCleanup && typeof patchCleanup === "function") {
        try { patchCleanup(); } catch (e) { }
        patchCleanup = null;
    }

    localStorage.removeItem(STORAGE_KEY);

    // Clean near-api-js keys
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (key.startsWith("cardclash_near_") || key.startsWith("cardclash_wallet_auth_key"))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
}

/**
 * Get signed-in account ID (restore session)
 */
async function getSignedInAccountId() {
    // Quick check localStorage first
    var saved = localStorage.getItem(STORAGE_KEY);

    try {
        var wc = await initNear();
        if (wc.isSignedIn()) {
            var id = wc.getAccountId();
            if (id) {
                localStorage.setItem(STORAGE_KEY, id);
                return id;
            }
        }
    } catch (e) {
        console.warn("[NEAR] restore session error:", e.message);
    }

    // If near-api-js says not signed in but we have saved — clear it
    if (saved) {
        localStorage.removeItem(STORAGE_KEY);
    }

    return "";
}

/**
 * Sign and send transaction
 */
async function signAndSendTransaction(params) {
    var wc = await initNear();

    if (!wc || !wc.isSignedIn()) {
        throw new Error("Wallet not connected");
    }

    var account = wc.account();

    // Convert wallet-selector style actions to near-api-js actions
    var NEAR = await import("near-api-js");
    var nearActions = [];

    if (params.actions && Array.isArray(params.actions)) {
        for (var i = 0; i < params.actions.length; i++) {
            var action = params.actions[i];

            if (action.type === "FunctionCall") {
                var p = action.params || {};
                nearActions.push(
                    NEAR.transactions.functionCall(
                        p.methodName || "",
                        JSON.parse(p.args || "{}"),
                        p.gas || "30000000000000",
                        p.deposit || "0"
                    )
                );
            } else if (action.type === "Transfer") {
                var amt = (action.params && action.params.deposit) || "0";
                nearActions.push(NEAR.transactions.transfer(amt));
            }
        }
    }

    if (nearActions.length === 0) {
        throw new Error("No valid actions provided");
    }

    // Use requestSignTransactions for HERE wallet redirect flow
    // Or signAndSendTransaction for direct
    var result = await account.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: nearActions,
    });

    return result;
}

/**
 * Fetch NEAR balance via RPC
 */
async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "bal",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        var json = await res.json();
        if (json.error) return 0;

        var amount = (json.result && json.result.amount) || "0";
        var yocto = BigInt(amount);
        var ONE_NEAR = 10n ** 24n;
        var whole = yocto / ONE_NEAR;
        var frac = (yocto % ONE_NEAR).toString().padStart(24, "0").slice(0, 6);

        return Number(whole.toString() + "." + frac);
    } catch (e) {
        return 0;
    }
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