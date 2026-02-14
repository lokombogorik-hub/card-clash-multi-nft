// frontend/src/libs/walletSelector.js
import { HereWallet, WidgetStrategy } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";
var PROXY_API = "https://h4n.app";

var _here = null;
var _promise = null;

// =============================================
// DETECT TELEGRAM
// =============================================
function isTelegram() {
    try {
        return !!(window.Telegram && window.Telegram.WebApp &&
            window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0);
    } catch (e) { return false; }
}

// =============================================
// CUSTOM TELEGRAM STRATEGY
// Opens HOT Wallet via Telegram deep-link
// Does NOT close WebApp
// =============================================
function TelegramStrategy() {
    this._resolveReject = null;
}

TelegramStrategy.prototype.onInitialized = function () { };

TelegramStrategy.prototype.onRequested = function (id, request, reject) {
    // id = the h4n.app request ID
    // Open HOT Wallet with this request ID
    var hotUrl = "https://t.me/herewalletbot/app?startapp=h4n-" + encodeURIComponent(id);

    console.log("[TG-Strategy] Opening HOT:", hotUrl);

    try {
        window.Telegram.WebApp.openTelegramLink(hotUrl);
    } catch (e) {
        console.warn("[TG-Strategy] openTelegramLink failed:", e.message);
        // Fallback — open as URL
        window.open(hotUrl, "_blank");
    }

    this._reject = reject;
};

TelegramStrategy.prototype.onApproving = function () {
    console.log("[TG-Strategy] Approving...");
};

TelegramStrategy.prototype.onSuccess = function (result) {
    console.log("[TG-Strategy] Success:", result);
};

TelegramStrategy.prototype.onFailed = function (result) {
    console.log("[TG-Strategy] Failed:", result);
};

TelegramStrategy.prototype.close = function () { };

// =============================================
// GET HERE WALLET INSTANCE
// =============================================
async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        var inTg = isTelegram();
        console.log("[HOT] init v1.6.6 | TG:", inTg, "| network:", networkId);

        var here = new HereWallet({
            networkId: networkId,
            nodeUrl: RPC_URL,
            defaultStrategy: function () {
                if (inTg) {
                    return new TelegramStrategy();
                }
                return new WidgetStrategy({
                    widget: "https://my.herewallet.app/connector/index.html",
                    lazy: false
                });
            }
        });

        _here = here;
        console.log("[HOT] SDK ready");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

// =============================================
// CONNECT
// =============================================
export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] signIn...");
    var accountId = "";

    try {
        accountId = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: []
        });
        if (accountId) {
            localStorage.setItem(STORAGE_KEY, String(accountId));
        }
    } catch (err) {
        var msg = String(err && err.message || err);
        console.warn("[HOT] signIn error:", msg);

        // Try getAccountId
        try {
            accountId = await here.getAccountId();
            if (accountId) localStorage.setItem(STORAGE_KEY, String(accountId));
        } catch (e2) { }

        if (!accountId) accountId = localStorage.getItem(STORAGE_KEY) || "";
    }

    console.log("[HOT] result:", accountId || "(polling)");
    return { accountId: String(accountId || "") };
}

// =============================================
// DISCONNECT
// =============================================
export async function disconnectWallet() {
    try {
        var here = await getHere();
        await here.signOut();
    } catch (e) {
        console.warn("[HOT] signOut:", e.message);
    }
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
}

// =============================================
// GET SIGNED IN
// =============================================
export async function getSignedInAccountId() {
    try {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (ok) {
            var id = await here.getAccountId();
            if (id) {
                localStorage.setItem(STORAGE_KEY, String(id));
                return String(id);
            }
        }
    } catch (e) { }
    return localStorage.getItem(STORAGE_KEY) || "";
}

// =============================================
// TRANSACTIONS
// =============================================
export async function signAndSendTransaction(params) {
    var here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions
    });
}

export async function sendNear(opts) {
    var here = await getHere();
    var yocto = nearToYocto(opts.amount);
    var result = await here.signAndSendTransaction({
        receiverId: opts.receiverId,
        actions: [{ type: "Transfer", params: { deposit: yocto } }]
    });
    return { txHash: extractTxHash(result), result: result };
}

// =============================================
// BALANCE
// =============================================
export async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "b", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId }
            })
        });
        var j = await res.json();
        if (j.error) return 0;
        var raw = (j.result && j.result.amount) || "0";
        return yoctoToNear(raw);
    } catch (e) { return 0; }
}

// =============================================
// HELPERS
// =============================================
function nearToYocto(n) {
    var parts = String(n).split(".");
    return (parts[0] || "0") + (parts[1] || "").padEnd(24, "0").slice(0, 24);
}

function yoctoToNear(yoctoStr) {
    var s = String(yoctoStr).padStart(25, "0");
    var whole = s.slice(0, s.length - 24) || "0";
    var frac = s.slice(s.length - 24, s.length - 24 + 6);
    return parseFloat(whole + "." + frac);
}

function extractTxHash(r) {
    if (!r) return "";
    if (typeof r === "string") return r;
    return (r.transaction_outcome && r.transaction_outcome.id) ||
        (r.transaction && r.transaction.hash) || r.txHash || "";
}