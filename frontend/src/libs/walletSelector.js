// frontend/src/libs/walletSelector.js
// Hybrid: SDK for opening wallet + message interceptor for response

import { HereWallet } from "@here-wallet/core";

export var networkId = "mainnet";
export var RPC_URL = "https://rpc.mainnet.near.org";
var STORAGE_KEY = "hot_wallet_account";

var _here = null;
var _promise = null;
var _messageResolve = null;

// =============================================
// MESSAGE INTERCEPTOR — catches wallet response
// before SDK's buggy borsh parser
// =============================================
function setupMessageInterceptor() {
    if (window._hotInterceptorSet) return;
    window._hotInterceptorSet = true;

    window.addEventListener("message", function (event) {
        try {
            var data = event.data;
            if (!data) return;

            // Parse if string
            if (typeof data === "string") {
                try { data = JSON.parse(data); } catch (e) { return; }
            }

            // Look for account_id in various formats
            var accountId = null;

            if (data.account_id) {
                accountId = data.account_id;
            } else if (data.accountId) {
                accountId = data.accountId;
            } else if (data.payload && data.payload.account_id) {
                accountId = data.payload.account_id;
            } else if (data.result && data.result.account_id) {
                accountId = data.result.account_id;
            } else if (data.type === "here-wallet-response" || data.type === "near-wallet-result") {
                // Try to extract from nested
                var str = JSON.stringify(data);
                var match = str.match(/["\s]([a-z0-9_-]+\.near)["\s]/);
                if (match) accountId = match[1];
            }

            if (accountId && accountId.endsWith(".near")) {
                console.log("[HOT-INTERCEPT] Got account:", accountId);
                localStorage.setItem(STORAGE_KEY, accountId);
                if (_messageResolve) {
                    _messageResolve(accountId);
                    _messageResolve = null;
                }
            }
        } catch (e) {
            // Silent — don't break other message handlers
        }
    }, true); // useCapture = true — run BEFORE SDK handler

    console.log("[HOT-INTERCEPT] Message interceptor active");
}

// =============================================
// INIT SDK
// =============================================
async function getHere() {
    if (_here) return _here;
    if (_promise) return _promise;

    setupMessageInterceptor();

    _promise = (async function () {
        console.log("[HOT] init | network:", networkId);

        var here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        var origSignIn = here.signIn.bind(here);
        var origGetAccountId = here.getAccountId.bind(here);
        var origIsSignedIn = here.isSignedIn.bind(here);

        // Wrap signIn — catch ALL errors, rely on interceptor
        here.signIn = async function (opts) {
            // Create promise that message interceptor can resolve
            var interceptPromise = new Promise(function (resolve) {
                _messageResolve = resolve;
                // Timeout after 120s
                setTimeout(function () {
                    if (_messageResolve === resolve) {
                        _messageResolve = null;
                        resolve("");
                    }
                }, 120000);
            });

            try {
                var r = await origSignIn(opts);
                var id = extractAccountId(r);
                if (id) {
                    localStorage.setItem(STORAGE_KEY, id);
                    _messageResolve = null;
                    return id;
                }
            } catch (err) {
                var msg = String(err && err.message || err);
                console.warn("[HOT] signIn SDK error:", msg);
                // Don't throw — wait for interceptor or polling
            }

            // SDK failed or returned empty — check interceptor
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                _messageResolve = null;
                return stored;
            }

            // Wait a bit for interceptor
            console.log("[HOT] Waiting for interceptor/polling...");
            var intercepted = await Promise.race([
                interceptPromise,
                sleep(5000).then(function () { return ""; })
            ]);

            if (intercepted) return intercepted;
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        here.isSignedIn = async function () {
            try { return await origIsSignedIn(); }
            catch (e) { return !!localStorage.getItem(STORAGE_KEY); }
        };

        here.getAccountId = async function () {
            try {
                var id = await origGetAccountId();
                if (id) { localStorage.setItem(STORAGE_KEY, String(id)); return String(id); }
            } catch (e) { }
            return localStorage.getItem(STORAGE_KEY) || "";
        };

        _here = here;
        console.log("[HOT] SDK ready");
        return here;
    })();

    _promise.catch(function () { _promise = null; });
    return _promise;
}

// =============================================
// PUBLIC API
// =============================================

export async function connectWallet() {
    var here = await getHere();
    console.log("[HOT] connectWallet...");
    var accountId = "";

    try {
        var res = await here.signIn({ contractId: "retardo-s.near", methodNames: [] });
        accountId = extractAccountId(res);
    } catch (err) {
        console.warn("[HOT] connect outer:", err.message);
    }

    if (!accountId) {
        try { accountId = String(await here.getAccountId() || ""); } catch (e) { }
    }
    if (!accountId) {
        accountId = localStorage.getItem(STORAGE_KEY) || "";
    }
    if (accountId) localStorage.setItem(STORAGE_KEY, accountId);

    console.log("[HOT] result:", accountId || "(polling)");
    return { accountId: String(accountId || "") };
}

export async function disconnectWallet() {
    try { var here = await getHere(); await here.signOut(); } catch (e) { }
    _here = null;
    _promise = null;
    localStorage.removeItem(STORAGE_KEY);
}

export async function getSignedInAccountId() {
    var cached = localStorage.getItem(STORAGE_KEY);
    try {
        var here = await getHere();
        var ok = await here.isSignedIn();
        if (ok) {
            var id = await here.getAccountId();
            if (id) return String(id);
        }
    } catch (e) { }
    if (cached) {
        var exists = await verifyAccount(cached);
        if (exists) return cached;
        localStorage.removeItem(STORAGE_KEY);
    }
    return "";
}

export async function signAndSendTransaction(params) {
    var here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions
    });
}

export async function sendNear(opts) {
    var here = await getHere();
    var yocto = nearToYocto(opts.amount);
    var result = await here.signAndSendTransaction({
        receiverId: opts.receiverId,
        actions: [{ type: "Transfer", params: { deposit: yocto } }]
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
                params: { request_type: "view_account", finality: "final", account_id: accountId }
            })
        });
        var j = await res.json();
        if (j.error) return 0;
        var raw = (j.result && j.result.amount) || "0";
        return yoctoToNear(raw);
    } catch (e) { return 0; }
}

// =============================================
// HELPERS
// =============================================

function extractAccountId(r) {
    if (!r) return "";
    if (typeof r === "string") {
        if (r.includes(".near")) return r;
        try { var p = JSON.parse(r); return p.accountId || p.account_id || ""; } catch (e) { return ""; }
    }
    if (typeof r === "object") return r.accountId || r.account_id || "";
    return "";
}

function sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
}

async function verifyAccount(accountId) {
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "v", method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId }
            })
        });
        var j = await res.json();
        return !j.error;
    } catch (e) { return true; }
}

function nearToYocto(n) {
    var parts = String(n).split(".");
    return (parts[0] || "0") + (parts[1] || "").padEnd(24, "0").slice(0, 24);
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
    return (r.transaction_outcome && r.transaction_outcome.id) ||
        (r.transaction && r.transaction.hash) || r.txHash || "";
}