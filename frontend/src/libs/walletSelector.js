// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

import { HereWallet } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        console.log("[HOT] init, network:", networkId);

        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        // ══════════════════════════════════════════════════════
        // PATCH: wrap signIn to catch dt.account_id crash
        // The bug is in wallet.js line 213: data.account_id
        // where data can be undefined in Telegram WebApp
        // ══════════════════════════════════════════════════════
        var originalSignIn = here.signIn.bind(here);
        here.signIn = async function (opts) {
            try {
                var result = await originalSignIn(opts);
                var id = String(result || "");
                if (id) localStorage.setItem(STORAGE_KEY, id);
                return result;
            } catch (err) {
                var msg = String(err && err.message || err);
                console.warn("[HOT] signIn caught error:", msg);

                // If it's the known crash, try to get account anyway
                if (
                    msg.includes("account_id") ||
                    msg.includes("undefined is not an object") ||
                    msg.includes("Cannot read") ||
                    msg.includes("null")
                ) {
                    // Wait a moment for storage to be updated by widget
                    await delay(1500);

                    // Try getAccountId
                    try {
                        var fallbackId = await here.getAccountId();
                        if (fallbackId) {
                            localStorage.setItem(STORAGE_KEY, String(fallbackId));
                            return String(fallbackId);
                        }
                    } catch (e2) {
                        console.warn("[HOT] getAccountId also failed:", e2.message);
                    }

                    // Try localStorage
                    var stored = localStorage.getItem(STORAGE_KEY);
                    if (stored) return stored;

                    // Try scanning HERE wallet storage keys
                    var found = scanHereStorage();
                    if (found) {
                        localStorage.setItem(STORAGE_KEY, found);
                        return found;
                    }
                }

                throw err;
            }
        };

        // Also patch isSignedIn and getAccountId
        var originalIsSignedIn = here.isSignedIn.bind(here);
        here.isSignedIn = async function () {
            try {
                return await originalIsSignedIn();
            } catch (err) {
                console.warn("[HOT] isSignedIn error:", err.message);
                // Check localStorage fallback
                var stored = localStorage.getItem(STORAGE_KEY);
                return !!stored;
            }
        };

        var originalGetAccountId = here.getAccountId.bind(here);
        here.getAccountId = async function () {
            try {
                var id = await originalGetAccountId();
                if (id) {
                    localStorage.setItem(STORAGE_KEY, String(id));
                    return id;
                }
            } catch (err) {
                console.warn("[HOT] getAccountId error:", err.message);
            }
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        _here = here;
        console.log("[HOT] ready (patched)");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

// ─── Scan HERE wallet localStorage keys ─────────────────
function scanHereStorage() {
    try {
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (
                key.includes("herewallet") ||
                key.includes("here:") ||
                key.includes("near:keystore") ||
                key.includes("hot:")
            ) {
                try {
                    var raw = localStorage.getItem(key);
                    // Could be JSON with account info
                    var val = JSON.parse(raw);
                    if (val && val.accountId) return val.accountId;
                    if (val && val.account_id) return val.account_id;
                } catch (e) {
                    // Could be plain account ID string
                    if (raw && raw.includes(".near")) return raw;
                    if (raw && raw.includes(".tg")) return raw;
                }
            }
        }
    } catch (e) { }
    return "";
}

function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}

// ─── Connect ─────────────────────────────────────────────
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
        console.warn("[HOT] signIn outer error:", err.message);
    }

    // Final fallback
    if (!accountId) {
        try {
            accountId = String(await here.getAccountId() || "");
        } catch (e) { }
    }

    if (!accountId) {
        accountId = localStorage.getItem(STORAGE_KEY) || "";
    }

    if (!accountId) {
        accountId = scanHereStorage();
    }

    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
    }

    console.log("[HOT] connected:", accountId);
    return { accountId: accountId };
}

// ─── Disconnect ──────────────────────────────────────────
export async function disconnectWallet() {
    try {
        var here = await getHere();
        await here.signOut();
    } catch (e) { }
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
}

// ─── Restore ─────────────────────────────────────────────
export async function getSignedInAccountId() {
    // Try SDK
    try {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (ok) {
            var id = await here.getAccountId();
            if (id) return String(id);
        }
    } catch (e) {
        console.warn("[HOT] restore SDK:", e.message);
    }

    // Fallback localStorage
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

// ─── Transactions ────────────────────────────────────────
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

// ─── Balance ─────────────────────────────────────────────
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