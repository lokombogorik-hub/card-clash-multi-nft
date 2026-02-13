// frontend/src/libs/walletSelector.js

import { HereWallet } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";
var STORAGE_KEY_FULL = "hot_wallet_session";

var _here = null;
var _promise = null;

// === Detect Telegram WebApp ===
function isTelegramWebApp() {
    try {
        return !!(
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData &&
            window.Telegram.WebApp.initData.length > 0
        );
    } catch (e) {
        return false;
    }
}

function getTgPlatform() {
    try {
        return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform) || "unknown";
    } catch (e) {
        return "unknown";
    }
}

// === Safe borsh/encoding wrapper ===
function safeParseResponse(data) {
    if (!data) return null;
    if (typeof data === "string") {
        try {
            return JSON.parse(data);
        } catch (e) {
            // Might be account_id directly
            if (data.includes(".near") || data.includes(".testnet")) {
                return { account_id: data };
            }
            return null;
        }
    }
    if (typeof data === "object") {
        return data;
    }
    return null;
}

function extractAccountId(result) {
    if (!result) return "";
    if (typeof result === "string") {
        if (result.includes(".near") || result.includes(".testnet")) return result;
        // Try parse
        try {
            var parsed = JSON.parse(result);
            return parsed.accountId || parsed.account_id || "";
        } catch (e) {
            return "";
        }
    }
    if (typeof result === "object") {
        return result.accountId || result.account_id || "";
    }
    return "";
}

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        var inTg = isTelegramWebApp();
        var platform = getTgPlatform();
        console.log("[HOT] init | network:", networkId, "| TG:", inTg, "| platform:", platform);

        var connectOpts = {
            networkId: networkId,
            nodeUrl: RPC_URL,
        };

        var here;
        try {
            here = await HereWallet.connect(connectOpts);
        } catch (initErr) {
            console.error("[HOT] HereWallet.connect failed:", initErr.message);
            // If connect itself fails due to borsh — create minimal wrapper
            throw initErr;
        }

        // === Wrap signIn to catch all borsh/scure errors ===
        var origSignIn = here.signIn.bind(here);
        var origGetAccountId = here.getAccountId.bind(here);
        var origIsSignedIn = here.isSignedIn.bind(here);

        here.signIn = async function (opts) {
            try {
                var r = await origSignIn(opts);
                var id = extractAccountId(r);
                if (id) {
                    localStorage.setItem(STORAGE_KEY, id);
                    saveSession(id);
                }
                return id || r;
            } catch (err) {
                var msg = String(err && err.message || err);
                console.warn("[HOT] signIn error:", msg);

                // === KNOWN BUGS — all handled ===
                var isKnownBug =
                    msg.includes("account_id") ||
                    msg.includes("undefined") ||
                    msg.includes("radix") ||
                    msg.includes("Enum") ||
                    msg.includes("Load failed") ||
                    msg.includes("Uint8Array") ||
                    msg.includes("single value") ||
                    msg.includes("Cannot read prop") ||
                    msg.includes("null is not") ||
                    msg.includes("borsh") ||
                    msg.includes("deserialize") ||
                    msg.includes("serialize");

                if (isKnownBug) {
                    console.warn("[HOT] Known SDK bug, attempting recovery...");

                    // Wait for wallet to process
                    await sleep(2500);

                    // Attempt 1: SDK getAccountId
                    try {
                        var fid = await origGetAccountId();
                        if (fid) {
                            localStorage.setItem(STORAGE_KEY, String(fid));
                            saveSession(String(fid));
                            return String(fid);
                        }
                    } catch (e2) {
                        console.warn("[HOT] recovery getAccountId:", e2.message);
                    }

                    // Attempt 2: localStorage
                    var stored = localStorage.getItem(STORAGE_KEY);
                    if (stored) return stored;

                    // Attempt 3: check RPC for known account
                    // Return empty — polling will catch it
                    return "";
                }

                throw err;
            }
        };

        here.isSignedIn = async function () {
            try {
                return await origIsSignedIn();
            } catch (e) {
                // Fallback to localStorage
                return !!localStorage.getItem(STORAGE_KEY);
            }
        };

        here.getAccountId = async function () {
            try {
                var id = await origGetAccountId();
                if (id) {
                    localStorage.setItem(STORAGE_KEY, String(id));
                    return String(id);
                }
            } catch (e) {
                console.warn("[HOT] getAccountId error:", e.message);
            }
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        _here = here;
        console.log("[HOT] SDK ready");
        return here;
    })();

    _promise.catch(function (e) {
        console.error("[HOT] init failed:", e.message);
        _promise = null;
    });

    return _promise;
}

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function saveSession(accountId) {
    try {
        localStorage.setItem(STORAGE_KEY_FULL, JSON.stringify({
            accountId: accountId,
            ts: Date.now(),
            network: networkId,
        }));
    } catch (e) { }
}

function loadSession() {
    try {
        var raw = localStorage.getItem(STORAGE_KEY_FULL);
        if (!raw) return null;
        var s = JSON.parse(raw);
        // Session valid for 7 days
        if (Date.now() - s.ts > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(STORAGE_KEY_FULL);
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        if (s.network !== networkId) return null;
        return s.accountId || null;
    } catch (e) {
        return null;
    }
}

// === PUBLIC API ===

export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] signIn starting...");
    var accountId = "";

    try {
        var res = await here.signIn({ contractId: "retardo-s.near", methodNames: [] });
        accountId = extractAccountId(res);
    } catch (err) {
        console.warn("[HOT] signIn outer catch:", err.message);
        // The wrapper already handles known bugs
    }

    // Fallback chain
    if (!accountId) {
        try {
            accountId = String(await here.getAccountId() || "");
        } catch (e) { }
    }
    if (!accountId) {
        accountId = localStorage.getItem(STORAGE_KEY) || "";
    }
    if (!accountId) {
        accountId = loadSession() || "";
    }

    if (accountId) {
        localStorage.setItem(STORAGE_KEY, accountId);
        saveSession(accountId);
    }

    console.log("[HOT] connectWallet result:", accountId || "(empty, will poll)");
    return { accountId: String(accountId || "") };
}

export async function disconnectWallet() {
    try {
        var here = await getHere();
        await here.signOut();
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_FULL);
}

export async function getSignedInAccountId() {
    // Fast path — check localStorage first (no SDK errors)
    var cached = localStorage.getItem(STORAGE_KEY);

    try {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (ok) {
            var id = await here.getAccountId();
            if (id) return String(id);
        }
    } catch (e) {
        console.warn("[HOT] getSignedInAccountId error:", e.message);
    }

    // Verify cached account still exists via RPC
    if (cached) {
        var exists = await verifyAccountExists(cached);
        if (exists) return cached;
        // Account doesn't exist — clear
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_FULL);
        return "";
    }

    // Check session
    var session = loadSession();
    if (session) return session;

    return "";
}

async function verifyAccountExists(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "verify",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        var j = await res.json();
        return !j.error;
    } catch (e) {
        // Network error — assume exists (don't disconnect on network issues)
        return true;
    }
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
                jsonrpc: "2.0",
                id: "bal",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        var j = await res.json();
        if (j.error) return 0;
        var raw = (j.result && j.result.amount) || "0";
        return yoctoToNear(raw);
    } catch (e) {
        return 0;
    }
}

function nearToYocto(n) {
    var parts = String(n).split(".");
    var whole = parts[0] || "0";
    var frac = (parts[1] || "").padEnd(24, "0").slice(0, 24);
    return whole + frac;
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
    return (
        (r.transaction_outcome && r.transaction_outcome.id) ||
        (r.transaction && r.transaction.hash) ||
        r.txHash ||
        ""
    );
}