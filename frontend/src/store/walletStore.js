// frontend/src/store/walletStore.js — ПОЛНАЯ ЗАМЕНА

import {
    connectWallet,
    disconnectWallet as disconnect,
    getSignedInAccountId,
    signAndSendTransaction as signTx,
    sendNear as sendNearTx,
    fetchBalance,
} from "../libs/walletSelector";

var API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

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
        try { l(); } catch (e) { /* */ }
    });
}

function setState(p) {
    state = Object.assign({}, state, p);
    emit();
}

async function linkToBackend(id) {
    if (!id || !API_BASE) return;
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
                Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ accountId: id }),
        });
    } catch (e) { /* */ }
}

async function applyAccount(id) {
    id = String(id || "").trim();
    if (!id) return;
    setState({ connected: true, walletAddress: id, status: "", lastError: null });
    try {
        var bal = await fetchBalance(id);
        setState({ balance: bal });
    } catch (e) { /* */ }
    linkToBackend(id);
}

async function connectHot() {
    setState({ status: "Opening HOT Wallet...", lastError: null });
    try {
        var result = await connectWallet();
        if (result && result.accountId) {
            await applyAccount(result.accountId);
            setState({ status: "✅ Connected!" });
            setTimeout(function () { setState({ status: "" }); }, 2000);
        } else {
            setState({ status: "Confirm in HOT Wallet and return" });
            // Poll for connection (user might confirm in HOT app and come back)
            pollForConnection();
        }
    } catch (e) {
        var msg = (e && e.message) || String(e);
        console.error("[Wallet] connect error:", msg);
        setState({ status: "", lastError: { name: "Error", message: msg } });
    }
}

// Poll in case user returns from HOT app after confirming
function pollForConnection() {
    var attempts = 0;
    var interval = setInterval(async function () {
        attempts++;
        if (attempts > 30) { // 30 seconds max
            clearInterval(interval);
            setState({ status: "" });
            return;
        }
        try {
            var id = await getSignedInAccountId();
            if (id) {
                clearInterval(interval);
                await applyAccount(id);
                setState({ status: "✅ Connected!" });
                setTimeout(function () { setState({ status: "" }); }, 2000);
            }
        } catch (e) { /* keep polling */ }
    }, 1000);
}

async function disconnectWallet() {
    try { await disconnect(); } catch (e) { /* */ }
    setState({
        connected: false, walletAddress: "", balance: 0,
        status: "", nfts: [], lastError: null,
    });
}

var _restoring = false;
async function restoreSession() {
    if (_restoring) return;
    _restoring = true;
    try {
        var id = await getSignedInAccountId();
        if (id) {
            console.log("[Wallet] restored:", id);
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
    if (state.walletAddress) {
        try {
            var bal = await fetchBalance(state.walletAddress);
            setState({ balance: bal });
        } catch (e) { /* */ }
    }
    return result;
}

async function refreshBalance() {
    if (!state.walletAddress) return;
    try {
        var bal = await fetchBalance(state.walletAddress);
        setState({ balance: bal });
    } catch (e) { /* */ }
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