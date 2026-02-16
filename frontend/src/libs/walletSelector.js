// frontend/src/libs/walletSelector.js — WORKING VERSION для @here-wallet/core@3.4.0

var networkId = "mainnet";
var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";
var STORAGE_TIMESTAMP = "hot_wallet_ts";

var _wallet = null;
var _initPromise = null;

function isValidAccountId(str) {
    if (!str || typeof str !== "string") return false;
    str = str.trim();
    return str.length > 2 && /^[a-z0-9_\-\.]+$/.test(str);
}

async function initWallet() {
    if (_wallet) return _wallet;
    if (_initPromise) return _initPromise;

    _initPromise = (async function () {
        console.log("[HOT] Init wallet SDK...");

        // ✅ CRITICAL: Dynamic import для избежания ошибок при сборке
        var HereWallet = (await import("@here-wallet/core")).default;

        // ✅ CRITICAL: Правильная инициализация для 3.4.0
        var wallet = new HereWallet({
            networkId: networkId,
        });

        console.log("[HOT] Wallet SDK loaded");
        _wallet = wallet;
        return wallet;
    })();

    _initPromise.catch(function (err) {
        console.error("[HOT] Init error:", err);
        _initPromise = null;
    });

    return _initPromise;
}

export async function connectWallet() {
    console.log("[HOT] connectWallet called");

    var wallet = await initWallet();
    var accountId = "";

    try {
        // ✅ signIn возвращает Promise<string> (accountId)
        var result = await wallet.signIn({
            contractId: "retardo-s.near",
        });

        console.log("[HOT] signIn raw result:", result);

        // Extract accountId from different formats
        if (typeof result === "string") {
            accountId = result;
        } else if (result && typeof result === "object") {
            accountId = result.accountId || result.account_id || "";
        }

    } catch (err) {
        var msg = String(err.message || err);
        console.warn("[HOT] signIn error:", msg);

        // Known bugs — don't throw, try fallback
        var knownErrors = [
            "account_id",
            "undefined",
            "radix",
            "Enum",
            "Load failed",
            "Uint8Array",
            "deserialize"
        ];

        var isKnown = knownErrors.some(function (e) {
            return msg.toLowerCase().includes(e.toLowerCase());
        });

        if (isKnown) {
            console.warn("[HOT] Known bug, waiting 3s for wallet...");
            await new Promise(function (res) { setTimeout(res, 3000); });

            // Try SDK methods
            try {
                accountId = await wallet.getAccountId();
            } catch (e2) {
                console.warn("[HOT] getAccountId failed:", e2.message);
            }
        } else {
            // Unknown error — rethrow
            throw err;
        }
    }

    // Validate
    if (!isValidAccountId(accountId)) {
        // Try localStorage fallback
        var stored = localStorage.getItem(STORAGE_KEY);
        var ts = parseInt(localStorage.getItem(STORAGE_TIMESTAMP) || "0");
        var age = Date.now() - ts;

        if (stored && isValidAccountId(stored) && age < 24 * 60 * 60 * 1000) {
            console.log("[HOT] Using cached session:", stored);
            accountId = stored;
        } else {
            accountId = "";
        }
    }

    // Save to localStorage
    if (isValidAccountId(accountId)) {
        localStorage.setItem(STORAGE_KEY, accountId);
        localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
    }

    console.log("[HOT] Final accountId:", accountId || "(empty)");
    return { accountId: accountId };
}

export async function disconnectWallet() {
    try {
        var wallet = await initWallet();
        await wallet.signOut();
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }

    _wallet = null;
    _initPromise = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TIMESTAMP);
}

export async function getSignedInAccountId() {
    try {
        var wallet = await initWallet();
        var signedIn = await wallet.isSignedIn();

        if (signedIn) {
            var id = await wallet.getAccountId();
            if (isValidAccountId(id)) {
                localStorage.setItem(STORAGE_KEY, id);
                localStorage.setItem(STORAGE_TIMESTAMP, Date.now().toString());
                return id;
            }
        }
    } catch (e) {
        console.warn("[HOT] getSignedInAccountId error:", e.message);
    }

    // Fallback to localStorage
    var stored = localStorage.getItem(STORAGE_KEY);
    var ts = parseInt(localStorage.getItem(STORAGE_TIMESTAMP) || "0");
    var age = Date.now() - ts;

    if (stored && isValidAccountId(stored) && age < 24 * 60 * 60 * 1000) {
        return stored;
    }

    return "";
}

export async function signAndSendTransaction(params) {
    var wallet = await initWallet();
    return await wallet.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export async function sendNear(opts) {
    var wallet = await initWallet();
    var yocto = nearToYocto(opts.amount);

    var result = await wallet.signAndSendTransaction({
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

        return parseFloat(
            nearInt.toString() + "." + nearDec.toString().padStart(24, "0").slice(0, 6)
        );
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