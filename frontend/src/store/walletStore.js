import { useEffect, useState } from "react";
import {
    connectWallet,
    disconnectWallet as disconnect,
    getSignedInAccountId,
    signAndSendTransaction as signTx,
    fetchBalance,
    networkId,
} from "../libs/walletSelector";

var API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

var state = {
    connected: false, walletAddress: "", balance: 0,
    status: "", lastError: null, nfts: [],
};

var listeners = new Set();
function emit() { listeners.forEach(function (l) { l(); }); }
function setState(p) { state = Object.assign({}, state, p); emit(); }

async function linkToBackend(id) {
    if (!id || !API_BASE) return;
    var token = localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    if (!token) return;
    try {
        await fetch(API_BASE + "/api/near/link", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ accountId: id }),
        });
    } catch (e) { }
}

async function applyAccount(id) {
    id = String(id || "").trim();
    if (!id) return;
    setState({ connected: true, walletAddress: id, status: "", lastError: null });
    var bal = await fetchBalance(id);
    setState({ balance: bal });
    linkToBackend(id);
}

async function connectHot() {
    setState({ status: "Connecting…", lastError: null });
    try {
        var result = await connectWallet();
        if (result.accountId) {
            await applyAccount(result.accountId);
            setState({ status: "✅ Connected!" });
            setTimeout(function () { setState({ status: "" }); }, 2000);
        } else {
            setState({ status: "Confirm in wallet and return" });
        }
    } catch (e) {
        var msg = (e && e.message) || String(e);
        setState({ status: "", lastError: { name: "Error", message: msg } });
    }
}

async function disconnectWallet() {
    await disconnect();
    setState({ connected: false, walletAddress: "", balance: 0, status: "", nfts: [], lastError: null });
}

async function restoreSession() {
    var id = await getSignedInAccountId();
    if (id) await applyAccount(id);
}

export var walletStore = {
    getState: function () { return state; },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    connectHot: connectHot,
    disconnectWallet: disconnectWallet,
    restoreSession: restoreSession,
    clearStatus: function () { setState({ status: "", lastError: null }); },
    signAndSendTransaction: function (p) { return signTx(p); },
    getUserNFTs: function () { return []; },
};

export function useWalletStore() {
    var ss = useState(walletStore.getState()), snap = ss[0], setSnap = ss[1];
    useEffect(function () {
        var unsub = walletStore.subscribe(function () { setSnap(walletStore.getState()); });
        walletStore.restoreSession();
        return unsub;
    }, []);
    return {
        connected: snap.connected, accountId: snap.walletAddress, walletAddress: snap.walletAddress,
        balance: snap.balance, status: snap.status, lastError: snap.lastError, nfts: snap.nfts,
        connectHot: walletStore.connectHot, disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus, restoreSession: walletStore.restoreSession,
        getUserNFTs: walletStore.getUserNFTs, signAndSendTransaction: walletStore.signAndSendTransaction,
    };
}