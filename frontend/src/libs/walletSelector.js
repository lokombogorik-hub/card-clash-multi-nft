// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

import { HereWallet } from "@here-wallet/core";

export const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
export const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || "https://rpc.mainnet.near.org";

let _here = null;
let _promise = null;

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async () => {
        console.log("[HOT] init, network:", networkId);

        try {
            const here = await HereWallet.connect({
                networkId: networkId,
                nodeUrl: RPC_URL,
            });
            _here = here;
            console.log("[HOT] instance ready");
            return here;
        } catch (err) {
            console.error("[HOT] connect failed:", err);
            _promise = null;
            throw err;
        }
    })();

    return _promise;
}

// ─── Safe wrapper — prevents dt.account_id crash ────────
async function safeCall(fn) {
    try {
        return await fn();
    } catch (err) {
        var msg = String(err && err.message || err || "");
        // This is the known crash — account_id on undefined
        if (msg.includes("account_id") || msg.includes("undefined is not an object")) {
            console.warn("[HOT] No active session (safe catch)");
            return null;
        }
        throw err;
    }
}

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    var here = await getHere();

    console.log("[HOT] signIn...");

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
    } catch (err) {
        console.warn("[HOT] signIn threw:", err.message);
        // Maybe already signed in — try to get account
    }

    // Fallback: try getAccountId
    if (!accountId) {
        accountId = await safeCall(async function () {
            return await here.getAccountId();
        }) || "";
    }

    console.log("[HOT] final accountId:", accountId);
    return { accountId: String(accountId) };
}

// ─── Disconnect ──────────────────────────────────────────
export async function disconnectWallet() {
    try {
        var here = await getHere();
        await here.signOut();
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }
    _here = null;
    _promise = null;
}

// ─── Restore session (SAFE — no crash) ──────────────────
export async function getSignedInAccountId() {
    var here;
    try {
        here = await getHere();
    } catch (e) {
        console.warn("[HOT] getHere failed in restore:", e.message);
        return "";
    }

    // This is where dt.account_id crash happens
    // Wrap BOTH isSignedIn and getAccountId
    var isOk = await safeCall(async function () {
        return await here.isSignedIn();
    });

    if (!isOk) return "";

    var accountId = await safeCall(async function () {
        return await here.getAccountId();
    });

    return String(accountId || "");
}

// ─── Sign and Send Transaction ──────────────────────────
export async function signAndSendTransaction(params) {
    var here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

// ─── Send NEAR ───────────────────────────────────────────
export async function sendNear(opts) {
    var here = await getHere();
    var yocto = nearToYocto(opts.amount);

    console.log("[HOT] sendNear:", opts.receiverId, opts.amount, "->", yocto);

    var result = await here.signAndSendTransaction({
        receiverId: opts.receiverId,
        actions: [{
            type: "Transfer",
            params: { deposit: yocto },
        }],
    });

    return { txHash: extractTxHash(result), result: result };
}

// ─── Balance via RPC ─────────────────────────────────────
export async function fetchBalance(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "b",
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
        return yoctoToNear(json.result.amount || "0");
    } catch (e) {
        return 0;
    }
}

// ─── Helpers ─────────────────────────────────────────────
function nearToYocto(near) {
    var s = String(near).split(".");
    var whole = s[0] || "0";
    var frac = (s[1] || "").padEnd(24, "0").slice(0, 24);
    return whole + frac;
}

function yoctoToNear(yocto) {
    var ONE = 10n ** 24n;
    var y = BigInt(yocto || "0");
    var w = y / ONE;
    var f = (y % ONE).toString().padStart(24, "0").slice(0, 6);
    return Number(w.toString() + "." + f);
}

function extractTxHash(result) {
    if (!result) return "";
    if (typeof result === "string") return result;
    if (result.transaction_outcome && result.transaction_outcome.id) return result.transaction_outcome.id;
    if (result.transaction && result.transaction.hash) return result.transaction.hash;
    if (result.txHash) return result.txHash;
    return "";
}