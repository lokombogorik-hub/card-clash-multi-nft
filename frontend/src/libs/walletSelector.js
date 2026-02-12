// frontend/src/libs/walletSelector.js

import { HereWallet } from "@here-wallet/core";

export const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
export const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || "https://rpc.mainnet.near.org";

let _here = null;
let _promise = null;

// ─── Detect Telegram ─────────────────────────────────────
function isTelegram() {
    try {
        return !!(
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData &&
            window.Telegram.WebApp.initData.length > 0
        );
    } catch {
        return false;
    }
}

// ─── Init wallet (singleton) ─────────────────────────────
async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async () => {
        console.log("[HOT] init, network:", networkId, "telegram:", isTelegram());

        try {
            var here = await HereWallet.connect({
                networkId: networkId,
                nodeUrl: RPC_URL,
            });
            _here = here;
            console.log("[HOT] instance ready");
            return here;
        } catch (err) {
            console.error("[HOT] HereWallet.connect error:", err);
            _promise = null;
            throw err;
        }
    })();

    return _promise;
}

// ─── Safe call — catch dt.account_id crash ──────────────
async function safe(fn, fallback) {
    try {
        return await fn();
    } catch (err) {
        var msg = String(err && err.message || err);
        console.warn("[HOT] safe catch:", msg);
        if (typeof fallback !== "undefined") return fallback;
        throw err;
    }
}

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    var here = await getHere();

    console.log("[HOT] signIn...");

    var accountId = "";

    // Try signIn
    accountId = await safe(async function () {
        var res = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });
        // res can be string or object
        if (typeof res === "string") return res;
        if (res && typeof res === "object") {
            return res.accountId || res.account_id || "";
        }
        return "";
    }, "");

    // If signIn returned empty — try getAccountId
    if (!accountId) {
        accountId = await safe(async function () {
            return String(await here.getAccountId());
        }, "");
    }

    console.log("[HOT] connected:", accountId);

    // Save to localStorage for restore
    if (accountId) {
        localStorage.setItem("hot_wallet_account", accountId);
    }

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
    localStorage.removeItem("hot_wallet_account");
}

// ─── Restore session ────────────────────────────────────
export async function getSignedInAccountId() {
    // Method 1: Try HERE SDK
    var sdkAccount = await safe(async function () {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (!ok) return "";
        return String(await here.getAccountId());
    }, "");

    if (sdkAccount) {
        localStorage.setItem("hot_wallet_account", sdkAccount);
        return sdkAccount;
    }

    // Method 2: Fallback to localStorage
    var stored = localStorage.getItem("hot_wallet_account") || "";
    if (stored) {
        // Verify it's a real account via RPC
        var exists = await checkAccountExists(stored);
        if (exists) {
            console.log("[HOT] restored from localStorage:", stored);
            return stored;
        } else {
            localStorage.removeItem("hot_wallet_account");
            return "";
        }
    }

    return "";
}

// ─── Check account on chain ─────────────────────────────
async function checkAccountExists(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "check",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        var json = await res.json();
        return !json.error;
    } catch {
        return true; // on network error, trust local
    }
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

    console.log("[HOT] sendNear:", opts.receiverId, opts.amount);

    var result = await here.signAndSendTransaction({
        receiverId: opts.receiverId,
        actions: [{
            type: "Transfer",
            params: { deposit: yocto },
        }],
    });

    return { txHash: extractTxHash(result), result: result };
}

// ─── Fetch balance ───────────────────────────────────────
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
    } catch {
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