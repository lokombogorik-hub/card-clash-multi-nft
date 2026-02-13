// frontend/src/libs/walletSelector.js — ФИНАЛЬНАЯ ВЕРСИЯ

import { HereWallet } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;

function isTelegram() {
    try {
        return !!(window.TelegramWebviewProxy) ||
            !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0);
    } catch (e) {
        return false;
    }
}

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        var tg = isTelegram();
        console.log("[HOT] init, isTelegram:", tg, "network:", networkId);

        // DO NOT pass defaultStrategy
        // Library auto-detects Telegram via TelegramWebviewProxy
        // and uses TelegramAppStrategy automatically
        // This opens HOT wallet bot overlay, NOT QR code
        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        // Runtime patch for dt.account_id crash
        var origSignIn = here.signIn.bind(here);
        here.signIn = async function (opts) {
            try {
                var r = await origSignIn(opts);
                var id = typeof r === "string" ? r : (r && (r.accountId || r.account_id)) || "";
                if (id) localStorage.setItem(STORAGE_KEY, String(id));
                return r;
            } catch (err) {
                var msg = String(err && err.message || err);
                console.warn("[HOT] signIn caught:", msg);

                // Known bug — data is null/undefined
                await new Promise(function (res) { setTimeout(res, 2000); });

                // Try getAccountId
                try {
                    var fid = await origGetAccountId();
                    if (fid) {
                        localStorage.setItem(STORAGE_KEY, String(fid));
                        return String(fid);
                    }
                } catch (e2) { }

                // Try localStorage
                var stored = localStorage.getItem(STORAGE_KEY);
                if (stored) return stored;

                throw err;
            }
        };

        var origIsSignedIn = here.isSignedIn.bind(here);
        here.isSignedIn = async function () {
            try { return await origIsSignedIn(); }
            catch (e) { return !!localStorage.getItem(STORAGE_KEY); }
        };

        var origGetAccountId = here.getAccountId.bind(here);
        here.getAccountId = async function () {
            try {
                var id = await origGetAccountId();
                if (id) { localStorage.setItem(STORAGE_KEY, String(id)); return id; }
            } catch (e) { }
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        _here = here;
        console.log("[HOT] ready (auto-strategy)");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] signIn...");
    var accountId = "";

    try {
        var res = await here.signIn({ contractId: "retardo-s.near", methodNames: [] });
        if (typeof res === "string") accountId = res;
        else if (res && typeof res === "object") accountId = res.accountId || res.account_id || "";
    } catch (err) {
        console.warn("[HOT] signIn outer:", err.message);
    }

    if (!accountId) {
        try { accountId = String(await here.getAccountId() || ""); } catch (e) { }
    }
    if (!accountId) accountId = localStorage.getItem(STORAGE_KEY) || "";
    if (accountId) localStorage.setItem(STORAGE_KEY, accountId);

    console.log("[HOT] final:", accountId);
    return { accountId: String(accountId || "") };
}

export async function disconnectWallet() {
    try { var here = await getHere(); await here.signOut(); } catch (e) { }
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
    } catch (e) { }
    return localStorage.getItem(STORAGE_KEY) || "";
}

export async function signAndSendTransaction(params) {
    var here = await getHere();
    return await here.signAndSendTransaction({ receiverId: params.receiverId, actions: params.actions });
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