// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

import { HereWallet, WidgetStrategy } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;

function isTelegram() {
    try {
        var hasTg = !!window.Telegram;
        var hasWebApp = hasTg && !!window.Telegram.WebApp;
        var initData = hasWebApp ? window.Telegram.WebApp.initData : "";
        var platform = hasWebApp ? window.Telegram.WebApp.platform : "none";

        console.log("[HOT] isTelegram check:", {
            hasTg: hasTg,
            hasWebApp: hasWebApp,
            initDataLen: initData ? initData.length : 0,
            platform: platform,
        });

        // Check multiple signals — not just initData
        if (!hasWebApp) return false;

        // platform !== "unknown" means we're in real Telegram app
        if (platform && platform !== "unknown" && platform !== "none") return true;

        // initData present means Telegram launched us
        if (initData && initData.length > 0) return true;

        // Check if Telegram WebView is injecting
        if (window.TelegramWebviewProxy) return true;

        return false;
    } catch (e) {
        return false;
    }
}

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        var tg = isTelegram();
        console.log("[HOT] init, telegram:", tg, "network:", networkId);

        var opts = {
            networkId: networkId,
            nodeUrl: RPC_URL,
        };

        // ALWAYS use WidgetStrategy in both environments
        // In Telegram — it opens HOT wallet widget OVER the game
        // In browser — we'll handle the QR issue separately
        opts.defaultStrategy = new WidgetStrategy();

        var here = await HereWallet.connect(opts);

        // ═══════════════════════════════════════════════════
        // PATCH signIn
        // ═══════════════════════════════════════════════════
        var origSignIn = here.signIn.bind(here);
        here.signIn = async function (signOpts) {
            try {
                var result = await origSignIn(signOpts);
                var id = String(result || "");
                if (id) localStorage.setItem(STORAGE_KEY, id);
                return result;
            } catch (err) {
                var msg = String(err && err.message || err);
                console.warn("[HOT] signIn caught:", msg);

                if (
                    msg.includes("account_id") ||
                    msg.includes("undefined is not") ||
                    msg.includes("Cannot read") ||
                    msg.includes("is failed")
                ) {
                    await new Promise(function (r) { setTimeout(r, 2000); });

                    try {
                        var fid = await origGetAccountId();
                        if (fid) {
                            localStorage.setItem(STORAGE_KEY, String(fid));
                            return String(fid);
                        }
                    } catch (e2) { }

                    var stored = localStorage.getItem(STORAGE_KEY);
                    if (stored) return stored;

                    var found = scanStorage();
                    if (found) {
                        localStorage.setItem(STORAGE_KEY, found);
                        return found;
                    }
                }
                throw err;
            }
        };

        var origIsSignedIn = here.isSignedIn.bind(here);
        here.isSignedIn = async function () {
            try {
                return await origIsSignedIn();
            } catch (err) {
                return !!localStorage.getItem(STORAGE_KEY);
            }
        };

        var origGetAccountId = here.getAccountId.bind(here);
        here.getAccountId = async function () {
            try {
                var id = await origGetAccountId();
                if (id) {
                    localStorage.setItem(STORAGE_KEY, String(id));
                    return id;
                }
            } catch (err) { }
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        _here = here;
        console.log("[HOT] ready, strategy: Widget");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

function scanStorage() {
    try {
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (key.includes("here") || key.includes("near:keystore") || key.includes("hot:")) {
                try {
                    var raw = localStorage.getItem(key);
                    var val = JSON.parse(raw);
                    if (val && val.accountId) return val.accountId;
                    if (val && val.account_id) return val.account_id;
                } catch (e) {
                    var raw2 = localStorage.getItem(key);
                    if (raw2 && (raw2.includes(".near") || raw2.includes(".tg"))) return raw2;
                }
            }
        }
    } catch (e) { }
    return "";
}

export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] signIn...");

    var accountId = "";

    try {
        var res = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });
        if (typeof res === "string") accountId = res;
        else if (res && typeof res === "object") {
            accountId = res.accountId || res.account_id || "";
        }
    } catch (err) {
        console.warn("[HOT] signIn outer:", err.message);
    }

    if (!accountId) {
        try { accountId = String(await here.getAccountId() || ""); } catch (e) { }
    }
    if (!accountId) accountId = localStorage.getItem(STORAGE_KEY) || "";
    if (!accountId) accountId = scanStorage();
    if (accountId) localStorage.setItem(STORAGE_KEY, accountId);

    console.log("[HOT] final:", accountId);
    return { accountId: accountId };
}

export async function disconnectWallet() {
    try {
        var here = await getHere();
        await here.signOut();
    } catch (e) { }
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
}

export async function getSignedInAccountId() {
    try {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (ok) {
            var id = await here.getAccountId();
            if (id) return String(id);
        }
    } catch (e) {
        console.warn("[HOT] restore:", e.message);
    }

    var stored = localStorage.getItem(STORAGE_KEY) || "";
    if (stored) {
        var exists = await checkAccount(stored);
        if (exists) return stored;
        localStorage.removeItem(STORAGE_KEY);
    }
    return "";
}

async function checkAccount(id) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "c", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: id },
            }),
        });
        var j = await res.json();
        return !j.error;
    } catch { return true; }
}

export async function signAndSendTransaction(params) {
    var here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export async function sendNear(opts) {
    var here = await getHere();
    var yocto = nearToYocto(opts.amount);
    var result = await here.signAndSendTransaction({
        receiverId: opts.receiverId,
        actions: [{ type: "Transfer", params: { deposit: yocto } }],
    });
    return { txHash: extractTxHash(result), result: result };
}

export async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "b", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId },
            }),
        });
        var j = await res.json();
        if (j.error) return 0;
        var y = BigInt((j.result && j.result.amount) || "0");
        var ONE = 10n ** 24n;
        return Number((y / ONE).toString() + "." + (y % ONE).toString().padStart(24, "0").slice(0, 6));
    } catch { return 0; }
}

function nearToYocto(n) {
    var s = String(n).split(".");
    return (s[0] || "0") + (s[1] || "").padEnd(24, "0").slice(0, 24);
}

function extractTxHash(r) {
    if (!r) return "";
    if (typeof r === "string") return r;
    return (r.transaction_outcome && r.transaction_outcome.id) ||
        (r.transaction && r.transaction.hash) || r.txHash || "";
}