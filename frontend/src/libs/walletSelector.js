// frontend/src/libs/walletSelector.js
// HERE (HOT) Wallet — direct Telegram deeplink integration
// NO near-api-js, NO @here-wallet/connect — zero dependency issues

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
var HERE_API = "https://api.herewallet.app/api/v1";

// ─── Helpers ───

function isTelegramWebApp() {
    try {
        return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
    } catch (e) {
        return false;
    }
}

function openUrl(url) {
    try {
        if (isTelegramWebApp() && window.Telegram.WebApp.openLink) {
            window.Telegram.WebApp.openLink(url);
        } else {
            window.open(url, "_blank");
        }
    } catch (e) {
        window.location.href = url;
    }
}

function generateRequestId() {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var id = "";
    for (var i = 0; i < 32; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

// ─── RPC helpers (zero dependencies) ───

async function rpcQuery(method, params) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "q", method: method, params: params }),
    });
    var json = await res.json();
    if (json.error) throw new Error(json.error.data || json.error.message || "RPC error");
    return json.result;
}

async function fetchBalance(accountId) {
    try {
        var result = await rpcQuery("query", {
            request_type: "view_account",
            finality: "final",
            account_id: accountId,
        });
        var amount = result.amount || "0";
        var yocto = BigInt(amount);
        var ONE = 10n ** 24n;
        var whole = yocto / ONE;
        var frac = (yocto % ONE).toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + frac);
    } catch (e) {
        return 0;
    }
}

// ─── HERE Wallet Connect via Web Widget ───
// Uses HERE wallet's web approval flow
// Works in: Telegram WebApp, Desktop browser, Mobile browser

var pendingRequestId = null;
var pollTimer = null;

async function connectWallet() {
    var requestId = generateRequestId();
    pendingRequestId = requestId;

    // Build the approval URL
    // HERE wallet uses a web-based approval flow
    var appName = "Card Clash";

    // Strategy: use HERE wallet's web connect
    // The flow:
    // 1. We create a sign-in request
    // 2. Open HERE wallet app/web with request ID
    // 3. Poll for approval
    // 4. Get account ID back

    var callbackUrl = window.location.origin + window.location.pathname;

    // HERE Wallet web connect URL
    var hereBase = networkId === "testnet"
        ? "https://web.testnet.herewallet.app"
        : "https://web.herewallet.app";

    var connectUrl = hereBase + "/connect?"
        + "request_id=" + encodeURIComponent(requestId)
        + "&app_name=" + encodeURIComponent(appName)
        + "&callback_url=" + encodeURIComponent(callbackUrl)
        + "&network=" + encodeURIComponent(networkId);

    console.log("[HOT] Connect URL:", connectUrl);

    // Try Telegram deeplink first (opens HOT wallet mini app)
    if (isTelegramWebApp()) {
        // Open in HOT wallet bot
        var tgUrl = "https://t.me/herewalletbot/app?startapp=connect_" + requestId;
        console.log("[HOT] Opening TG deeplink:", tgUrl);

        try {
            window.Telegram.WebApp.openTelegramLink(tgUrl);
        } catch (e) {
            console.warn("[HOT] openTelegramLink failed, trying openLink");
            openUrl(connectUrl);
        }
    } else {
        openUrl(connectUrl);
    }

    // Poll HERE API for approval
    var accountId = await pollForApproval(requestId, 120);

    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
        return { accountId: accountId };
    }

    // Check URL params (redirect flow)
    var urlAccountId = getAccountFromUrl();
    if (urlAccountId) {
        localStorage.setItem(STORAGE_KEY, urlAccountId);
        cleanUrl();
        return { accountId: urlAccountId };
    }

    throw new Error("Connection timeout. Please try again.");
}

async function pollForApproval(requestId, timeoutSec) {
    var deadline = Date.now() + timeoutSec * 1000;

    while (Date.now() < deadline) {
        // Check if URL has account (redirect happened)
        var urlAccount = getAccountFromUrl();
        if (urlAccount) {
            cleanUrl();
            return urlAccount;
        }

        // Poll HERE API
        try {
            var res = await fetch(HERE_API + "/connect/status/" + requestId, {
                method: "GET",
                headers: { "content-type": "application/json" },
            });

            if (res.ok) {
                var data = await res.json();
                console.log("[HOT] Poll response:", JSON.stringify(data));

                if (data.account_id) return data.account_id;
                if (data.accountId) return data.accountId;
                if (data.status === "approved" && data.data) {
                    return data.data.account_id || data.data.accountId || "";
                }
            }
        } catch (e) {
            // API might not exist yet, that's ok
            console.log("[HOT] Poll error (normal):", e.message);
        }

        // Wait 2 seconds before next poll
        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }

    return "";
}

function getAccountFromUrl() {
    try {
        var params = new URLSearchParams(window.location.search);
        return params.get("account_id") || params.get("accountId") || "";
    } catch (e) {
        return "";
    }
}

function cleanUrl() {
    try {
        var url = new URL(window.location.href);
        url.searchParams.delete("account_id");
        url.searchParams.delete("accountId");
        url.searchParams.delete("public_key");
        url.searchParams.delete("all_keys");
        window.history.replaceState(null, "", url.toString());
    } catch (e) { }
}

async function disconnectWallet() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    pendingRequestId = null;
    localStorage.removeItem(STORAGE_KEY);

    // Clean any near-related localStorage
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && (
            key.startsWith("cardclash_near_") ||
            key.indexOf("wallet_auth_key") >= 0 ||
            key.indexOf("near-api-js") >= 0
        )) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
}

async function getSignedInAccountId() {
    // Check URL first (returning from wallet redirect)
    var urlAccount = getAccountFromUrl();
    if (urlAccount) {
        localStorage.setItem(STORAGE_KEY, urlAccount);
        cleanUrl();
        return urlAccount;
    }

    // Check localStorage
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        // Verify account still exists
        try {
            await rpcQuery("query", {
                request_type: "view_account",
                finality: "final",
                account_id: saved,
            });
            return saved;
        } catch (e) {
            // Account doesn't exist or RPC error — keep saved for now
            return saved;
        }
    }

    return "";
}

async function signAndSendTransaction(params) {
    // For transactions, we need to redirect to HERE wallet
    // This is a simplified flow — full implementation would use
    // HERE wallet's transaction signing API

    var accountId = localStorage.getItem(STORAGE_KEY);
    if (!accountId) throw new Error("Not connected");

    var requestId = generateRequestId();
    var callbackUrl = window.location.origin + window.location.pathname;

    var hereBase = networkId === "testnet"
        ? "https://web.testnet.herewallet.app"
        : "https://web.herewallet.app";

    // Build transaction URL
    var txUrl = hereBase + "/sign?"
        + "request_id=" + encodeURIComponent(requestId)
        + "&receiver_id=" + encodeURIComponent(params.receiverId || "")
        + "&callback_url=" + encodeURIComponent(callbackUrl)
        + "&network=" + encodeURIComponent(networkId);

    if (params.actions && params.actions.length > 0) {
        txUrl += "&actions=" + encodeURIComponent(JSON.stringify(params.actions));
    }

    if (isTelegramWebApp()) {
        try {
            window.Telegram.WebApp.openTelegramLink(
                "https://t.me/herewalletbot/app?startapp=sign_" + requestId
            );
        } catch (e) {
            openUrl(txUrl);
        }
    } else {
        openUrl(txUrl);
    }

    // Poll for tx result
    var result = await pollForApproval(requestId, 120);
    return result;
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