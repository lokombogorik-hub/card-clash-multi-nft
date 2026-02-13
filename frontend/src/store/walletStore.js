// frontend/src/store/walletStore.js

import {
    connectWallet,
    disconnectWallet as disconnect,
    getSignedInAccountId,
    signAndSendTransaction as signTx,
    sendNear as sendNearTx,
    fetchBalance,
} from "../libs/walletSelector";

var API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL || "").trim();

var state = {
    connected: false,
    walletAddress: "",
    balance: 0,
    status: "",
    lastError: null,
    nfts: [],
};

var listeners = new Set();

function emit() {
    listeners.forEach(function (l) {
        try { l(); } catch (e) { }
    });
}

function setState(patch) {
    var changed = false;
    for (var k in patch) {
        if (state[k] !== patch[k]) { changed = true; break; }
    }
    if (!changed) return;
    state = Object.assign({}, state, patch);
    emit();
}

async function linkToBackend(accountId) {
    if (!accountId || !API_BASE) return;
    var token =
        localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("access_token") || "";
    if (!token) return;
    try {
        await fetch(API_BASE + "/api/near/link", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token,
            },
            body: JSON.stringify({ accountId: accountId }),
        });
        console.log("[Wallet] linked to backend:", accountId);
    } catch (e) {
        console.warn("[Wallet] link failed:", e.message);
    }
}

async function applyAccount(accountId) {
    accountId = String(accountId || "").trim();
    if (!accountId) return;
    setState({
        connected: true,
        walletAddress: accountId,
        status: "",
        lastError: null,
    });
    try {
        var bal = await fetchBalance(accountId);
        setState({ balance: bal });
    } catch (e) {
        console.warn("[Wallet] balance fetch failed:", e.message);
    }
    linkToBackend(accountId);
}

async function connectHot() {
    setState({ status: "Opening HOT Wallet...", lastError: null });

    try {
        var result = await connectWallet();

        if (result && result.accountId) {
            await applyAccount(result.accountId);
            setState({ status: "✅ Connected!" });
            setTimeout(function () { setState({ status: "" }); }, 2500);
        } else {
            // accountId empty — SDK bug, start polling
            setState({ status: "Confirm in HOT Wallet..." });
            startPolling();
        }
    } catch (e) {
        var msg = (e && e.message) || String(e);
        console.error("[Wallet] connect error:", msg);

        // Known SDK bugs — don't show scary error, just poll
        var isKnown =
            msg.includes("account_id") ||
            msg.includes("undefined") ||
            msg.includes("radix") ||
            msg.includes("Enum") ||
            msg.includes("Load failed") ||
            msg.includes("Uint8Array") ||
            msg.includes("borsh") ||
            msg.includes("serialize");

        if (isKnown) {
            console.warn("[Wallet] Known SDK issue, polling...");
            setState({ status: "Confirm in HOT Wallet..." });
            startPolling();
            return;
        }

        setState({
            status: "",
            lastError: { name: "ConnectionError", message: msg },
        });
    }
}

var _pollInterval = null;
var _pollAttempts = 0;
var MAX_POLL = 90; // 90 seconds max

function startPolling() {
    if (_pollInterval) return;
    _pollAttempts = 0;

    _pollInterval = setInterval(async function () {
        _pollAttempts++;

        if (_pollAttempts > MAX_POLL) {
            clearInterval(_pollInterval);
            _pollInterval = null;
            setState({ status: "⏰ Timeout — try again" });
            setTimeout(function () { setState({ status: "" }); }, 3000);
            return;
        }

        try {
            var id = await getSignedInAccountId();
            if (id) {
                clearInterval(_pollInterval);
                _pollInterval = null;
                await applyAccount(id);
                setState({ status: "✅ Connected!" });
                setTimeout(function () { setState({ status: "" }); }, 2500);
            }
        } catch (e) {
            // Keep polling silently
        }
    }, 1000);
}

function stopPolling() {
    if (_pollInterval) {
        clearInterval(_pollInterval);
        _pollInterval = null;
    }
}

async function disconnectWallet() {
    stopPolling();
    try { await disconnect(); } catch (e) { }
    setState({
        connected: false,
        walletAddress: "",
        balance: 0,
        status: "",
        nfts: [],
        lastError: null,
    });
}

var _restoring = false;

async function restoreSession() {
    if (_restoring) return;
    _restoring = true;
    try {
        var id = await getSignedInAccountId();
        if (id) {
            console.log("[Wallet] session restored:", id);
            await applyAccount(id);
        }
    } catch (e) {
        console.warn("[Wallet] restore error:", e.message);
    } finally {
        _restoring = false;
    }
}

async function sendNear(params) {
    if (!state.connected) throw new Error("Wallet not connected");
    var result = await sendNearTx({
        receiverId: params.receiverId,
        amount: params.amount,
    });
    // Refresh balance after send
    if (state.walletAddress) {
        try {
            var bal = await fetchBalance(state.walletAddress);
            setState({ balance: bal });
        } catch (e) { }
    }
    return result;
}

async function refreshBalance() {
    if (!state.walletAddress) return;
    try {
        var bal = await fetchBalance(state.walletAddress);
        setState({ balance: bal });
    } catch (e) { }
}

export var walletStore = {
    getState: function () { return state; },
    subscribe: function (fn) {
        listeners.add(fn);
        return function () { listeners.delete(fn); };
    },
    connectHot: connectHot,
    disconnectWallet: disconnectWallet,
    restoreSession: restoreSession,
    clearStatus: function () { setState({ status: "", lastError: null }); },
    signAndSendTransaction: function (p) { return signTx(p); },
    sendNear: sendNear,
    refreshBalance: refreshBalance,
    getUserNFTs: function () { return []; },
};