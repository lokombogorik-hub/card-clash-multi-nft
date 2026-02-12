// frontend/src/store/walletStore.js — ПОЛНАЯ ЗАМЕНА

import {
    connectWallet,
    disconnectWallet as disconnect,
    getSignedInAccountId,
    signAndSendTransaction as signTx,
    sendNear as sendNearTx,
    fetchBalance,
    networkId,
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
        try { l(); } catch (e) { /* ignore */ }
    });
}
function setState(p) {
    state = Object.assign({}, state, p);
    emit();
}

// ─── Link to backend ────────────────────────────────────
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
    } catch (e) { /* ignore */ }
}

// ─── Apply connected account ────────────────────────────
async function applyAccount(id) {
    id = String(id || "").trim();
    if (!id) return;
    setState({ connected: true, walletAddress: id, status: "", lastError: null });
    var bal = await fetchBalance(id);
    setState({ balance: bal });
    linkToBackend(id);
}

// ─── Connect ─────────────────────────────────────────────
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
        }
    } catch (e) {
        var msg = (e && e.message) || String(e);
        console.error("[Wallet] connect error:", msg);
        setState({ status: "", lastError: { name: "Error", message: msg } });
    }
}

// ─── Disconnect ──────────────────────────────────────────
async function disconnectWallet() {
    await disconnect();
    setState({
        connected: false, walletAddress: "", balance: 0,
        status: "", nfts: [], lastError: null,
    });
}

// ─── Restore ─────────────────────────────────────────────
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

// ─── Send NEAR ───────────────────────────────────────────
async function sendNear(params) {
    if (!state.connected) throw new Error("Wallet not connected");
    var result = await sendNearTx({
        receiverId: params.receiverId,
        amount: params.amount,
    });
    // Refresh balance
    if (state.walletAddress) {
        var bal = await fetchBalance(state.walletAddress);
        setState({ balance: bal });
    }
    return result;
}

// ─── Refresh balance ─────────────────────────────────────
async function refreshBalance() {
    if (!state.walletAddress) return;
    var bal = await fetchBalance(state.walletAddress);
    setState({ balance: bal });
}

// ─── Public store ────────────────────────────────────────
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