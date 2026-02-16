// frontend/src/libs/walletSelector.js — FINAL FIX для всех ошибок

import HereWallet from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";
var STORAGE_TIMESTAMP = "hot_wallet_ts";

var _here = null;
var _promise = null;

// Helper: detect if response is valid
function isValidAccountId(str) {
    if (!str || typeof str !== "string") return false;
    str = str.trim();
    return str.length > 2 && /^[a-z0-9_\-\.]+$/.test(str);
}

async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    _promise = (async function () {
        console.log("[HOT] Initializing on", networkId);

        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        // ========== CRITICAL: Wrap ALL methods with error handling ==========

        var origSignIn = here.signIn.bind(here);
        var origGetAccountId = here.getAccountId.bind(here);
        var origIsSignedIn = here.isSignedIn.bind(here);

        here.signIn = async function (opts) {
            console.log("[HOT] signIn called");

            try {
                var result = await origSignIn(opts);

                // Try to extract accountId from various response formats
                var accountId = "";

                if (typeof result === "string") {
                    accountId = result;
                } else if (result && typeof result === "object") {
                    accountId = result.accountId || result.account_id || "";
                }

                if (isValidAccountId(accountId)) {
                    localStorage.setItem(STORAGE_KEY, accountId);
                    localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
                    console.log("[HOT] signIn success:", accountId);
                    return accountId;
                }

                // If no valid ID but no error, start polling
                console.warn("[HOT] signIn returned invalid ID, will poll");
                return "";

            } catch (err) {
                var msg = String(err.message || err);
                console.warn("[HOT] signIn error:", msg);

                // ========== CRITICAL: Don't throw on known bugs ==========
                var knownBugs = [
                    "account_id",
                    "undefined",
                    "radix",
                    "Enum can only take",
                    "Load failed",
                    "Uint8Array",
                    "deserialize",
                    "postMessage",
                    "cross-origin"
                ];

                var isKnownBug = knownBugs.some(function (bug) {
                    return msg.toLowerCase().includes(bug.toLowerCase());
                });

                if (isKnownBug) {
                    console.warn("[HOT] Known bug detected, will recover via polling");

                    // Wait for wallet overlay to process (critical!)
                    await new Promise(function (res) { setTimeout(res, 3000); });

                    // Try SDK fallback
                    try {
                        var fallbackId = await origGetAccountId();
                        if (isValidAccountId(fallbackId)) {
                            localStorage.setItem(STORAGE_KEY, fallbackId);
                            localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
                            return fallbackId;
                        }
                    } catch (e2) {
                        console.warn("[HOT] SDK fallback failed:", e2.message);
                    }

                    // Check localStorage (user may have connected before)
                    var stored = localStorage.getItem(STORAGE_KEY);
                    if (stored && isValidAccountId(stored)) {
                        var ts = parseInt(localStorage.getItem(STORAGE_TIMESTAMP) || "0");
                        var age = Date.now() - ts;

                        // If session < 24h old, trust it
                        if (age < 24 * 60 * 60 * 1000) {
                            console.log("[HOT] Using cached session:", stored);
                            return stored;
                        }
                    }

                    // Return empty — polling will catch it
                    return "";
                }

                // Unknown error — rethrow
                throw err;
            }
        };

        here.isSignedIn = async function () {
            try {
                return await origIsSignedIn();
            } catch (e) {
                // Fallback to localStorage
                var stored = localStorage.getItem(STORAGE_KEY);
                var ts = parseInt(localStorage.getItem(STORAGE_TIMESTAMP) || "0");
                var age = Date.now() - ts;

                return !!(stored && isValidAccountId(stored) && age < 24 * 60 * 60 * 1000);
            }
        };

        here.getAccountId = async function () {
            try {
                var id = await origGetAccountId();
                if (isValidAccountId(id)) {
                    localStorage.setItem(STORAGE_KEY, id);
                    localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
                    return id;
                }
            } catch (e) {
                console.warn("[HOT] getAccountId error:", e.message);
            }

            // Fallback
            var stored = localStorage.getItem(STORAGE_KEY);
            return isValidAccountId(stored) ? stored : "";
        };

        _here = here;
        console.log("[HOT] SDK ready");
        return here;
    })();

    _promise.catch(function (err) {
        console.error("[HOT] Init failed:", err);
        _promise = null;
    });

    return _promise;
}

export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] Starting connect flow...");

    var accountId = "";

    try {
        var result = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });

        accountId = String(result || "").trim();
    } catch (err) {
        console.warn("[HOT] connectWallet outer catch:", err.message);
    }

    // Fallbacks
    if (!isValidAccountId(accountId)) {
        try {
            accountId = await here.getAccountId();
        } catch (e) {
            console.warn("[HOT] getAccountId fallback failed");
        }
    }

    if (!isValidAccountId(accountId)) {
        accountId = localStorage.getItem(STORAGE_KEY) || "";
    }

    if (isValidAccountId(accountId)) {
        localStorage.setItem(STORAGE_KEY, accountId);
        localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
    }

    console.log("[HOT] Connect result:", accountId || "(empty, polling needed)");
    return { accountId: accountId };
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
    localStorage.removeItem(STORAGE_TIMESTAMP);
}

export async function getSignedInAccountId() {
    try {
        var here = await getHere();
        var signedIn = await here.isSignedIn();

        if (signedIn) {
            var id = await here.getAccountId();
            if (isValidAccountId(id)) return id;
        }
    } catch (e) {
        console.warn("[HOT] getSignedInAccountId error:", e.message);
    }

    // Fallback
    var stored = localStorage.getItem(STORAGE_KEY);
    var ts = parseInt(localStorage.getItem(STORAGE_TIMESTAMP) || "0");
    var age = Date.now() - ts;

    if (stored && isValidAccountId(stored) && age < 24 * 60 * 60 * 1000) {
        return stored;
    }

    return "";
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

    return {
        txHash: extractTxHash(result),
        result: result,
    };
}

export async function fetchBalance(accountId) {
    if (!isValidAccountId(accountId)) return 0;

    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "balance",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });

        var json = await res.json();

        if (json.error) {
            console.warn("[RPC] Balance error:", json.error.message);
            return 0;
        }

        var yocto = BigInt(json.result.amount || "0");
        var ONE_NEAR = 10n ** 24n;
        var nearInt = yocto / ONE_NEAR;
        var nearDec = yocto % ONE_NEAR;

        return parseFloat(nearInt.toString() + "." + nearDec.toString().padStart(24, "0").slice(0, 6));
    } catch (err) {
        console.warn("[RPC] fetchBalance error:", err.message);
        return 0;
    }
}

function nearToYocto(amount) {
    var parts = String(amount).split(".");
    var int = parts[0] || "0";
    var dec = (parts[1] || "").padEnd(24, "0").slice(0, 24);
    return int + dec;
}

function extractTxHash(result) {
    if (!result) return "";
    if (typeof result === "string") return result;

    return (
        (result.transaction_outcome && result.transaction_outcome.id) ||
        (result.transaction && result.transaction.hash) ||
        result.txHash ||
        ""
    );
}