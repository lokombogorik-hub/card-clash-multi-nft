// frontend/src/libs/walletSelector.js — КАК У FATESPARK

import { HereWallet, WidgetStrategy } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        console.log("[HOT] init WidgetStrategy, network:", networkId);

        // WidgetStrategy = opens wallet OVER the game (iframe)
        // This is what FateSpark uses
        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
            defaultStrategy: new WidgetStrategy(),
        });

        _here = here;
        console.log("[HOT] ready");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] signIn (widget overlay)...");

    var accountId = "";

    try {
        var result = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });

        if (typeof result === "string") {
            accountId = result;
        } else if (result && typeof result === "object") {
            accountId = result.accountId || result.account_id || "";
        }

        console.log("[HOT] signIn result:", accountId);
    } catch (err) {
        var msg = String(err && err.message || err);
        console.warn("[HOT] signIn error:", msg);

        // The dt.account_id bug — wallet connected but response parsing failed
        // Try to get account anyway
        if (msg.includes("account_id") || msg.includes("undefined") || msg.includes("is failed")) {
            console.log("[HOT] Known bug, trying fallbacks...");

            // Wait for wallet to finish
            await new Promise(function (r) { setTimeout(r, 2000); });

            // Try getAccountId
            try {
                accountId = String(await here.getAccountId() || "");
                console.log("[HOT] getAccountId after error:", accountId);
            } catch (e2) {
                console.warn("[HOT] getAccountId also failed:", e2.message);
            }
        }
    }

    // Fallback: try getAccountId if still empty
    if (!accountId) {
        try {
            accountId = String(await here.getAccountId() || "");
        } catch (e) { }
    }

    // Fallback: scan localStorage for HERE wallet data
    if (!accountId) {
        accountId = findAccountInStorage();
    }

    // Save for restore
    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
    }

    console.log("[HOT] final accountId:", accountId);
    return { accountId: String(accountId || "") };
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

// ─── Restore session ────────────────────────────────────
export async function getSignedInAccountId() {
    // Method 1: SDK
    try {
        var here = await getHere();
        var ok = false;
        try { ok = await here.isSignedIn(); } catch (e) { }

        if (ok) {
            try {
                var id = await here.getAccountId();
                if (id) {
                    localStorage.setItem(STORAGE_KEY, String(id));
                    return String(id);
                }
            } catch (e) { }
        }
    } catch (e) {
        console.warn("[HOT] restore SDK error:", e.message);
    }

    // Method 2: localStorage
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        console.log("[HOT] restored from localStorage:", stored);
        return stored;
    }

    // Method 3: scan storage
    var found = findAccountInStorage();
    if (found) {
        localStorage.setItem(STORAGE_KEY, found);
        return found;
    }

    return "";
}

// ─── Find account in HERE wallet storage ────────────────
function findAccountInStorage() {
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key) continue;

            // HERE wallet stores data with these prefixes
            if (key.indexOf("here") !== -1 || key.indexOf("near") !== -1 || key.indexOf("hot") !== -1) {
                var val = localStorage.getItem(key);
                if (!val) continue;

                // Direct account ID
                if (val.indexOf(".near") !== -1 || val.indexOf(".tg") !== -1) {
                    // Could be JSON or plain string
                    try {
                        var obj = JSON.parse(val);
                        if (obj.accountId) return obj.accountId;
                        if (obj.account_id) return obj.account_id;
                    } catch (e) {
                        // Plain string like "key_k1.tg"
                        if (val.length < 100 && (val.indexOf(".tg") !== -1 || val.indexOf(".near") !== -1)) {
                            return val;
                        }
                    }
                }
            }
        }
    } catch (e) { }
    return "";
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