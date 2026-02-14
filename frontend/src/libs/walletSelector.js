// frontend/src/libs/walletSelector.js
import { HereWallet, WidgetStrategy } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

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
// BASE58 ENCODE (same as baseEncode from near-api-js)
// =============================================
var BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(str) {
    // Convert string to bytes
    var bytes = new TextEncoder().encode(str);

    // Convert to base58
    var digits = [0];
    for (var i = 0; i < bytes.length; i++) {
        var carry = bytes[i];
        for (var j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }

    // Handle leading zeros
    var result = "";
    for (var k = 0; k < bytes.length && bytes[k] === 0; k++) {
        result += BASE58_ALPHABET[0];
    }
    for (var l = digits.length - 1; l >= 0; l--) {
        result += BASE58_ALPHABET[digits[l]];
    }

    return result;
}

// =============================================
// CUSTOM TELEGRAM STRATEGY
// =============================================
function TelegramStrategy() {
    this._reject = null;
}

TelegramStrategy.prototype.onInitialized = function () {
    console.log("[TG-Strategy] Initialized");
};

TelegramStrategy.prototype.onRequested = function (id, request, reject) {
    // id = request ID from h4n.app (e.g., "abc123xyz")
    // Must be base58 encoded for HOT Wallet
    var encodedId = base58Encode(id);
    var hotUrl = "https://t.me/herewalletbot/app?startapp=h4n-" + encodedId;

    console.log("[TG-Strategy] onRequested | raw ID:", id, "| encoded:", encodedId);
    console.log("[TG-Strategy] Opening:", hotUrl);

    this._reject = reject;

    try {
        window.Telegram.WebApp.openTelegramLink(hotUrl);
        // НЕ вызываем close() — остаёмся в WebApp
    } catch (e) {
        console.warn("[TG-Strategy] openTelegramLink failed:", e.message);
        window.open(hotUrl, "_blank");
    }
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

TelegramStrategy.prototype.close = function () {
    console.log("[TG-Strategy] Close called");
};

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