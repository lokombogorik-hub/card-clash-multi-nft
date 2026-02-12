// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

import { HereWallet } from "@here-wallet/core";

export var networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
export var RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || "https://rpc.mainnet.near.org";

var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;

// ─── Init ────────────────────────────────────────────────
async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        console.log("[HOT] init v2, network:", networkId);

        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        _here = here;
        console.log("[HOT] ready");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

// ─── Safe wrapper ────────────────────────────────────────
async function safe(fn, fallback) {
    try {
        return await fn();
    } catch (err) {
        console.warn("[HOT] safe:", String(err && err.message || err));
        return fallback !== undefined ? fallback : null;
    }
}

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    var here = await getHere();

    console.log("[HOT] signIn...");

    var accountId = "";

    var res = await safe(async function () {
        return await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });
    }, null);

    if (typeof res === "string" && res) {
        accountId = res;
    } else if (res && typeof res === "object") {
        accountId = res.accountId || res.account_id || "";
    }

    if (!accountId) {
        accountId = await safe(async function () {
            return String(await here.getAccountId() || "");
        }, "");
    }

    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
    }

    console.log("[HOT] connected:", accountId);
    return { accountId: accountId };
}

// ─── Disconnect ──────────────────────────────────────────
export async function disconnectWallet() {
    await safe(async function () {
        var here = await getHere();
        await here.signOut();
    });
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
}

// ─── Restore ─────────────────────────────────────────────
export async function getSignedInAccountId() {
    // Try SDK first
    var sdkId = await safe(async function () {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (!ok) return "";
        return String(await here.getAccountId() || "");
    }, "");

    if (sdkId) {
        localStorage.setItem(STORAGE_KEY, sdkId);
        return sdkId;
    }

    // Fallback: localStorage
    var stored = localStorage.getItem(STORAGE_KEY) || "";
    if (stored) {
        var exists = await checkAccount(stored);
        if (exists) return stored;
        localStorage.removeItem(STORAGE_KEY);
    }

    return "";
}

// ─── Check account on chain ─────────────────────────────
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
        return yoctoToNear(j.result.amount || "0");
    } catch { return 0; }
}

// ─── Helpers ─────────────────────────────────────────────
function nearToYocto(n) {
    var s = String(n).split(".");
    return (s[0] || "0") + (s[1] || "").padEnd(24, "0").slice(0, 24);
}

function yoctoToNear(y) {
    var ONE = 10n ** 24n;
    var v = BigInt(y || "0");
    return Number((v / ONE).toString() + "." + (v % ONE).toString().padStart(24, "0").slice(0, 6));
}

function extractTxHash(r) {
    if (!r) return "";
    if (typeof r === "string") return r;
    return (r.transaction_outcome && r.transaction_outcome.id) ||
        (r.transaction && r.transaction.hash) || r.txHash || "";
}